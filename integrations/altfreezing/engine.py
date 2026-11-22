"""AltFreezing CPU inference on a continuous, single-face RGBA clip."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from types import ModuleType

FRAMES, SIDE = 32, 320
REVISION = 'f76b061717f534dd9b21dd932e6ec53540925a8d'
WEIGHTS_SHA = 'e93a6f7c0e0477db226c9063f94b0af86f0f4dffcf73ab0d87e17e4868db9197'
YUNET_SHA = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'


def verify(path, expected):
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
            raise ValueError(f'Некорректная контрольная сумма {path.name}')


class Detector:
    def __init__(self):
        import cv2
        import numpy as np
        import torch

        cache = Path.home() / '.cache' / 'deepfake-demo'
        repo = Path(os.environ.get('ALTFREEZING_REPO', cache / 'altfreezing')).resolve()
        weights = repo / 'checkpoints' / 'model.pth'
        yunet = repo / 'checkpoints' / 'yunet.onnx'
        if not weights.is_file():
            raise FileNotFoundError('Установите официальный checkpoint AltFreezing в ' + str(weights))
        if subprocess.check_output(['git', '-C', repo, 'rev-parse', 'HEAD'], text=True).strip() != REVISION:
            raise ValueError('Требуется закреплённая ревизия AltFreezing.')
        verify(weights, WEIGHTS_SHA)
        verify(yunet, YUNET_SHA)
        sys.path.insert(0, str(repo))
        # Upstream utils.__init__ loads the training stack. Inference only imports its logger.
        upstream_utils = ModuleType('utils')
        upstream_utils.__path__ = [str(repo / 'utils')]
        sys.modules['utils'] = upstream_utils
        from config import config
        config.init_with_yaml()
        config.update_with_yaml('i3d_ori.yaml')
        config.freeze()
        from model.classifier.i3d_ori import I3D8x8
        from test_tools.warp_for_xray import estimiate_batch_transform, std_points_256

        torch.set_num_threads(4)
        self.model = I3D8x8().eval()
        state = torch.load(weights, map_location='cpu', weights_only=True)
        self.model.load_state_dict(state, strict=True)
        self.torch, self.np, self.cv2 = torch, np, cv2
        self.align, self.target = estimiate_batch_transform, std_points_256 * (224 / 256)
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1, 1)
        self.faces = cv2.FaceDetectorYN.create(str(yunet), '', (SIDE, SIDE), 0.8)
        self.faces.detect(np.zeros((SIDE, SIDE, 3), np.uint8))
        self.predict(np.zeros((FRAMES, 224, 224, 3), np.uint8))

    def predict(self, rgb):
        with self.torch.inference_mode():
            clip = self.torch.from_numpy(rgb).permute(3, 0, 1, 2).unsqueeze(0).float() / 255
            logit = self.model((clip - self.mean) / self.std)['final_output']
            score = logit.sigmoid().item()
        if not 0 <= score <= 1:
            raise ValueError('Некорректная оценка AltFreezing')
        return score

    def analyze(self, data):
        cv2, np = self.cv2, self.np
        frames = np.frombuffer(data, np.uint8).reshape(FRAMES, SIDE, SIDE, 4)
        landmarks = []
        for frame in frames:
            _, faces = self.faces.detect(cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR))
            if faces is None or len(faces) != 1:
                return {'status': 'no_track'}
            points = faces[0, 4:14].reshape(5, 2)
            if landmarks and np.linalg.norm(points.mean(0) - landmarks[-1].mean(0)) > faces[0, 2] * 0.6:
                return {'status': 'no_track'}
            landmarks.append(points)
        transform, _ = self.align(landmarks, tgt_pts=self.target)
        rgb = np.stack([cv2.warpAffine(frame[:, :, :3], transform, (224, 224)) for frame in frames])
        return {'status': 'ok', 'score': self.predict(rgb)}
