"""Run the locally supplied FakeFace Test Camera 1.0 engine on loopback."""
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / 'integrations/deepfacelive'))
from server import Api, Service


class Animator:
    def __init__(self, kit):
        import cv2
        import numpy as np
        sys.path.insert(0, str(kit / 'opt/fakeface-test-camera/app'))
        from swap_engine import SwapEngine, ROOT
        self.cv = cv2
        self.np = np
        self.engine = SwapEngine(PROJECT / 'diagnostics/deeplivecam/driver.jpg')
        self.default = self.engine.identity_array
        self.encoder = None
        self.encoder_path = ROOT / 'models/encoder.onnx'
        self.swapped = 0

    def bgr(self, data):
        rgba = self.np.frombuffer(data, self.np.uint8).reshape(256, 256, 4)
        return self.cv.cvtColor(rgba, self.cv.COLOR_RGBA2BGR)

    def prepare_source(self, data):
        import openvino as ov
        aligned, _ = self.engine.align(self.bgr(data))
        if self.encoder is None:
            self.encoder = ov.Core().compile_model(str(self.encoder_path), 'CPU', {
                'INFERENCE_NUM_THREADS': 6, 'INFERENCE_PRECISION_HINT': 'f32'})
        result = self.encoder({'source': self.engine.numpy_tensor(aligned)})
        return self.np.array(result[self.encoder.output(0)], copy=True)

    def frame(self, data, motion, source):
        self.engine.identity_array = self.default if source is None else source
        try:
            result, _ = self.engine.process(self.bgr(data))
        except ValueError as error:
            if str(error) not in {'Нужно ровно одно видимое лицо', 'Не удалось выровнять лицо',
                                  'Лицо за границей изображения'}:
                raise
            # YuNet rejects missing, ambiguous and out-of-frame faces.
            return data, None
        self.swapped += 1
        return self.cv.cvtColor(result, self.cv.COLOR_BGR2RGBA).tobytes(), None


class GhostService(Service):
    engine = 'GhostV2/CVLFace'

    def __init__(self, kit):
        self.lock = threading.Lock()
        self.sessions = {}
        self.animator = self.reason = None
        try:
            self.animator = Animator(kit)
        except Exception as error:
            self.reason = str(error)

    def health(self):
        return {**super().health(), 'swappedFrames': self.animator.swapped if self.animator else 0}


if __name__ == '__main__':
    service = GhostService(Path(sys.argv[1]))
    with ThreadingHTTPServer(('127.0.0.1', 8768), Api) as http:
        http.service = service
        print(service.health(), flush=True)
        http.serve_forever()
