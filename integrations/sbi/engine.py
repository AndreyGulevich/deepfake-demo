"""CPU inference with the authors' FF-c23 EfficientNet-B4 checkpoint."""
import hashlib
import math
import os
from pathlib import Path

import cv2
from efficientnet_pytorch import EfficientNet
import numpy as np
import torch

FRAMES, SIDE = 1, 320
WEIGHTS_SHA256 = '2b05c2ba36ccb9e9f4f9e1aae9acd443ae2e6400ce725f56104fdb175d3c3267'
YUNET_SHA256 = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'


def checked_file(directory, name, digest):
    path = directory / name
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
            raise ValueError(f'Неверная контрольная сумма файла {path}')
    return path


class Detector:
    def __init__(self):
        directory = Path(os.environ.get('SBI_MODEL_DIR', Path.home() / '.cache/deepfake-demo/sbi'))
        weights = checked_file(directory, 'FFc23.tar', WEIGHTS_SHA256)
        face_weights = checked_file(directory, 'yunet.onnx', YUNET_SHA256)
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        state = torch.load(weights, map_location='cpu', weights_only=True)['model']
        self.model = EfficientNet.from_name('efficientnet-b4', num_classes=2)
        self.model.load_state_dict({k.removeprefix('net.'): v for k, v in state.items()}, strict=True)
        self.model.eval()
        self.faces = cv2.FaceDetectorYN.create(str(face_weights), '', (SIDE, SIDE), 0.8)
        self.faces.detect(np.zeros((SIDE, SIDE, 3), np.uint8))
        self.predict(np.zeros((380, 380, 3), np.uint8))

    @torch.inference_mode()
    def predict(self, rgb):
        pixels = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0).float().div_(255)
        score = self.model(pixels).softmax(1)[0, 1].item()
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError('SBI вернул недопустимую оценку')
        return score

    def analyze(self, data):
        rgba = np.frombuffer(data, np.uint8).reshape(SIDE, SIDE, 4)
        _, faces = self.faces.detect(cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR))
        if faces is None or len(faces) != 1:
            return {'status': 'no_track'}

        x, y, w, h = faces[0, :4]
        left, top = max(0, int(x - w / 8)), max(0, int(y - h / 8))
        right, bottom = min(SIDE, int(x + 9 * w / 8) + 1), min(SIDE, int(y + 9 * h / 8) + 1)
        crop = rgba[top:bottom, left:right, :3]
        if not crop.size:
            return {'status': 'no_track'}
        return {'status': 'ok', 'score': self.predict(cv2.resize(crop, (380, 380)))}
