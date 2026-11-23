"""Animate a source portrait using relative motion from the camera."""
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Lock

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / 'integrations/deepfacelive'))
from server import Api, Service
from prepare import sha256_file

CACHE = Path.home() / '.cache/deepfake-demo'
HASHES = {
    'feature_extractor': '980d26afc9af6d1b6c946329df08b89a4a8582c9bb668d9475f5254e69434d15',
    'motion_extractor': 'ef4a00ff50d5d864994eeecb226dc3b298e62afacec8fa4fc8b912835ec4b0ab',
}


class PortraitAnimator:
    def __init__(self):
        import cv2
        import numpy as np
        import onnxruntime as ort
        from scipy.spatial.transform import Rotation
        self.cv, self.np, self.rotation = cv2, np, Rotation
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        self.graphs = {}
        for name, digest in HASHES.items():
            path = CACHE / 'liveportrait' / f'live_portrait_{name}.onnx'
            if sha256_file(path) != digest:
                raise ValueError(f'Неверная контрольная сумма {path.name}')
            providers = ['CPUExecutionProvider']
            if sys.platform == 'darwin' and 'CoreMLExecutionProvider' in ort.get_available_providers():
                providers.insert(0, ('CoreMLExecutionProvider', {
                    'ModelFormat': 'MLProgram', 'MLComputeUnits': 'CPUAndGPU',
                }))
            self.graphs[name] = ort.InferenceSession(str(path), options, providers=providers)
        import torch
        import yaml
        self.torch = torch
        torch.set_num_threads(4)
        root = CACHE / 'liveportrait'
        upstream = root / 'upstream'
        sys.path.insert(0, str(upstream))
        from src.modules.warping_network import WarpingNetwork
        from src.modules.spade_generator import SPADEDecoder
        with (upstream / 'src/config/models.yaml').open() as file:
            config = yaml.safe_load(file)['model_params']
        self.device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        def load(cls, name, digest):
            model = cls(**config[name + '_params'])
            path = root / (name + '.pth')
            if sha256_file(path) != digest:
                raise ValueError(f'Неверная контрольная сумма {path.name}')
            weights = torch.load(path, map_location='cpu', weights_only=True)
            model.load_state_dict(weights)
            return model.to(self.device).eval()
        self.warp = load(WarpingNetwork, 'warping_module', '2f61a6f265fe344f14132364859a78bdbbc2068577170693da57fb96d636e282')
        self.decode = load(SPADEDecoder, 'spade_generator', '4780afc7909a9f84e24c01d73b31a555ef651521a1fe3b2429bd04534d992aee')
        yunet = CACHE / 'FTCN/checkpoints/yunet.onnx'
        self.detector = cv2.FaceDetectorYN.create(str(yunet), '', (256, 256), 0.8)
        image = cv2.imread(str(PROJECT / 'diagnostics/deeplivecam/driver.jpg'))
        data = cv2.cvtColor(cv2.resize(image, (256, 256)), cv2.COLOR_BGR2RGBA).tobytes()
        self.default = self.prepare_source(data)
        self.frames = 0
        _, baseline = self.frame(data, None, self.default)
        self.frame(data, baseline, self.default)
        if self.frames != 2:
            raise ValueError('Не удалось проверить анимацию LivePortrait')
        self.frames = 0

    def crop(self, data):
        cv, np = self.cv, self.np
        rgb = np.frombuffer(data, np.uint8).reshape(256, 256, 4)[:, :, :3]
        _, faces = self.detector.detect(cv.cvtColor(rgb, cv.COLOR_RGB2BGR))
        if faces is None or len(faces) != 1:
            return None
        x, y, w, h = faces[0, :4]
        side = max(w, h) * 1.65
        cx, cy = x + w / 2, y + h * .45
        zoom = 256 / side
        transform = np.float32([[zoom, 0, 128 - cx * zoom], [0, zoom, 128 - cy * zoom]])
        crop = cv.warpAffine(rgb, transform, (256, 256), borderMode=cv.BORDER_REPLICATE)
        return np.ascontiguousarray(crop.transpose(2, 0, 1)[None], dtype=np.float32) / 255

    def motion(self, tensor):
        pitch, yaw, roll, scale, translation, expression, points = self.graphs['motion_extractor'].run(None, {'input': tensor})
        angles = [float(a.item()) for a in (pitch, yaw, roll)]
        rotation = self.rotation.from_euler('xyz', angles, degrees=True).as_matrix().T.astype('float32')
        return rotation, scale, translation, expression, points

    def prepare_source(self, data):
        tensor = self.crop(data)
        if tensor is None:
            raise ValueError('На фото должно быть видно одно лицо')
        feature = self.graphs['feature_extractor'].run(None, {'input': tensor})[0]
        pose = self.motion(tensor)
        rotation, scale, shift, expression, points = pose
        shift[..., 2] = 0
        keypoints = scale * (points @ rotation + expression) + shift
        still = (tensor[0].transpose(1, 2, 0) * 255).astype('uint8')
        return self.torch.from_numpy(feature).to(self.device), pose, keypoints, self.cv.cvtColor(still, self.cv.COLOR_RGB2RGBA).tobytes()

    def frame(self, data, baseline, source):
        feature, pose, source_points, still = source if source is not None else self.default
        tensor = self.crop(data)
        if tensor is None:
            return still, None
        current = self.motion(tensor)
        if baseline is None:
            baseline = current
        r, scale, shift, exp, points = pose
        rotation = current[0] @ baseline[0].T @ r
        displacement = shift + current[2] - baseline[2]
        displacement[..., 2] = 0
        driven = scale * (current[1] / baseline[1]) * (points @ rotation + exp + current[3] - baseline[3]) + displacement
        with self.torch.inference_mode():
            source_tensor = self.torch.from_numpy(source_points).to(self.device)
            driven_tensor = self.torch.from_numpy(driven).to(self.device)
            warped = self.warp(feature, driven_tensor, source_tensor)
            rgb = self.decode(warped['out'])[0].permute(1, 2, 0).cpu().numpy()
        rgb = self.cv.resize(rgb, (256, 256), interpolation=self.cv.INTER_AREA)
        result = self.cv.cvtColor((rgb.clip(0, 1) * 255).astype('uint8'), self.cv.COLOR_RGB2RGBA)
        self.frames += 1
        return result.tobytes(), baseline


class PortraitService(Service):
    engine = 'LivePortrait'

    def __init__(self):
        self.lock = Lock()
        self.sessions = {}
        self.reason = self.animator = None
        try:
            self.animator = PortraitAnimator()
        except Exception as error:
            self.reason = str(error)

    def health(self):
        return {**super().health(), 'animatedFrames': self.animator.frames if self.animator else 0}


if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1', 8773), Api) as http:
        http.service = PortraitService()
        print(http.service.health(), flush=True)
        http.serve_forever()
