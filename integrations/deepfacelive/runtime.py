"""Run the DeepFaceLive FaceAnimator LIA graph with an original, fixed source."""
import platform
import sys

import numpy as np
import onnxruntime as ort


def portrait():
    y, x = np.mgrid[:256, :256]
    image = np.empty((256, 256, 3), np.uint8)
    image[:] = (48, 83, 108)

    def oval(cx, cy, rx, ry, color):
        image[((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1] = color

    oval(128, 272, 105, 73, (236, 151, 55))
    oval(128, 192, 25, 34, (188, 116, 99))
    oval(128, 115, 75, 95, (48, 35, 65))
    for cx in (63, 193):
        oval(cx, 133, 11, 19, (232, 160, 131))
    oval(128, 127, 64, 77, (245, 186, 153))
    oval(105, 61, 43, 26, (48, 35, 65))
    oval(152, 57, 42, 24, (48, 35, 65))
    for cx in (101, 155):
        oval(cx, 108, 17, 3, (83, 53, 73))
        oval(cx, 121, 15, 8, (255, 246, 222))
        oval(cx, 121, 6, 7, (53, 99, 95))
        oval(cx, 121, 3, 5, (47, 42, 59))
        oval(cx - 2, 119, 2, 2, (255, 250, 231))
    oval(128, 145, 7, 4, (202, 127, 111))
    oval(128, 166, 19, 6, (165, 85, 94))
    oval(128, 163, 15, 3, (255, 223, 197))
    return image


def rgb_tensor(rgb):
    return np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], np.float32) / 127.5 - 1


class Animator:
    def __init__(self, model):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        self.source = rgb_tensor(portrait())
        self.zero_motion = np.zeros((1, 20), np.float32)
        self.zero_image = np.zeros_like(self.source)
        self.fetch = ort.RunOptions()
        self.fetch.only_execute_path_to_fetches = True
        cpu = 'CPUExecutionProvider'
        apple = 'CoreMLExecutionProvider'
        self.provider = cpu
        if (sys.platform == 'darwin' and platform.machine() == 'arm64'
                and ort.__version__ == '1.27.0' and apple in ort.get_available_providers()):
            try:
                self.graph = ort.InferenceSession(str(model), sess_options=options, providers=[
                    (apple, {'ModelFormat': 'MLProgram', 'MLComputeUnits': 'ALL'}), cpu])
                if apple not in self.graph.get_providers():
                    raise RuntimeError('Core ML unavailable')
                probe = np.empty((256, 256, 4), np.uint8)
                probe[:, :, :3] = portrait()
                probe[:, :, 3] = 255
                self.frame(probe.tobytes(), None)
                self.provider = apple
                return
            except Exception as error:
                print(f'LIA Core ML initialization failed: {error}. Using CPU.', file=sys.stderr, flush=True)
        self.graph = ort.InferenceSession(str(model), sess_options=options, providers=[cpu])

    def prepare_source(self, data):
        return rgb_tensor(np.frombuffer(data, np.uint8).reshape(256, 256, 4)[:, :, :3])

    def frame(self, data, motion, source=None):
        rgba = np.frombuffer(data, np.uint8).reshape(256, 256, 4)
        driver = rgb_tensor(rgba[:, :, :3])
        if motion is None:
            motion, = self.graph.run(['out_drv_motion'], {
                'in_src': self.zero_image, 'in_drv': driver,
                'in_drv_start_motion': self.zero_motion, 'in_power': np.zeros(1, np.float32)}, self.fetch)
        prediction, = self.graph.run(['out'], {
            'in_src': self.source if source is None else source, 'in_drv': driver,
            'in_drv_start_motion': motion, 'in_power': np.ones(1, np.float32)}, self.fetch)
        if not np.isfinite(prediction).all():
            raise ValueError('LIA returned invalid pixels')
        result = np.empty((256, 256, 4), np.uint8)
        result[:, :, :3] = np.clip((prediction[0].transpose(1, 2, 0) + 1) * 127.5, 0, 255)
        result[:, :, 3] = 255
        return result.tobytes(), motion
