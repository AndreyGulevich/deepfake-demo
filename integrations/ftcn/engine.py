"""FTCN+TT inference for a single continuous clip with one tracked face."""
import hashlib
from pathlib import Path
import subprocess
import sys

FRAMES, SIDE = 32, 320
CHECKOUT = '853256a888bd5c4879955c06a4c5a666740f91a4'


class Detector:
    def __init__(self, repo):
        import cv2
        import numpy as np
        import torch

        if subprocess.check_output(['git', '-C', repo, 'rev-parse', 'HEAD'], text=True).strip() != CHECKOUT:
            raise ValueError('Требуется закреплённая ревизия FTCN (см. инструкцию).')
        folder = Path(repo) / 'checkpoints'
        weights = folder / 'ftcn_tt.pth'
        for path, checksum in (
            (weights, '3d08fc78174bbfdb3fbede317b95dcac9095202ed7113649eecf6e2ef5ee77d8'),
            (folder / 'yunet.onnx', '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'),
        ):
            with path.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != checksum:
                    raise ValueError(f'Контрольная сумма {path.name} не совпадает.')
        sys.path.insert(0, str(repo))
        from config import config
        config.init_with_yaml()
        config.update_with_yaml('ftcn_tt.yaml')
        config.freeze()
        from model.classifier import i3d_temporal_var_fix_dropout_tt_cfg as architecture
        from test_tools.warp_for_xray import estimiate_batch_transform, std_points_256

        # Upstream copies Conv3d attributes by their constructor names (torch 1.4).
        architecture.parameters = [name for name in architecture.parameters if name not in ('device', 'dtype')]
        torch.set_num_threads(4)
        self.model = architecture.I3D8x8().eval()
        weights_dict = torch.load(weights, map_location='cpu', weights_only=True)
        self.model.load_state_dict({name.removeprefix('module.'): value for name, value in weights_dict.items()}, strict=True)
        self.torch, self.np, self.cv2 = torch, np, cv2
        self.align, self.target = estimiate_batch_transform, std_points_256 * (224 / 256)
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(1,3,1,1,1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(1,3,1,1,1)
        self.faces = cv2.FaceDetectorYN.create(str(folder / 'yunet.onnx'), '', (SIDE, SIDE), 0.8)
        self.faces.detect(np.zeros((SIDE, SIDE, 3), np.uint8))
        self.predict(np.zeros((FRAMES,224,224,3), np.uint8))

    def predict(self, rgb):
        torch = self.torch
        with torch.inference_mode():
            x = torch.from_numpy(rgb).permute(3,0,1,2).unsqueeze(0).float().div_(255)
            score = self.model((x - self.mean) / self.std)['final_output'].item()
        if not 0 <= score <= 1:
            raise ValueError('FTCN вернул некорректную оценку')
        return score

    def analyze(self, data):
        cv2, np = self.cv2, self.np
        frames = np.frombuffer(data, np.uint8).reshape(FRAMES, SIDE, SIDE, 4)
        landmarks = []
        for frame in frames:
            _, faces = self.faces.detect(cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR))
            if faces is None or len(faces) != 1:
                return {'status':'no_track'}
            points = faces[0, 4:14].reshape(5, 2)
            if landmarks and np.linalg.norm(points.mean(0) - landmarks[-1].mean(0)) > faces[0,2] * 0.6:
                return {'status':'no_track'}
            landmarks.append(points)
        transform, _ = self.align(landmarks, tgt_pts=self.target)
        rgb = np.stack([cv2.warpAffine(frame[:,:,:3], transform, (224,224)) for frame in frames])
        return {'status':'ok', 'score':self.predict(rgb)}
