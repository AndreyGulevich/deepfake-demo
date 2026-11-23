"""Local ONNX pipeline for the GuijiAI unofficial HifiFace 256 model."""
import hashlib
import os
from pathlib import Path
import sys
import threading
from http.server import ThreadingHTTPServer

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / 'integrations/deepfacelive'))
from server import Api, Service

CACHE = Path.home() / '.cache/deepfake-demo'
MODELS = Path(os.environ.get('HIFIFACE_MODELS', CACHE / 'hififace'))
ARC = Path(os.environ.get('HIFIFACE_ARCFACE', CACHE / 'deeplivecam-models/buffalo_l/w600k_r50.onnx'))
YUNET = Path(os.environ.get('HIFIFACE_YUNET', CACHE / 'FTCN/checkpoints/yunet.onnx')).resolve()


def checked(path, digest):
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
            raise ValueError(f'Неверная контрольная сумма {path.name}')
    return str(path)


class Animator:
    def __init__(self):
        import cv2
        import numpy as np
        import onnxruntime as ort
        self.cv = cv2
        self.np = np
        opt = ort.SessionOptions()
        opt.intra_op_num_threads = 4
        def session(path, digest, providers=None):
            return ort.InferenceSession(checked(path, digest), opt, providers=providers or ['CPUExecutionProvider'])
        self.load_swap(session)
        self.encoder = session(ARC, '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43')
        self.detector = cv2.FaceDetectorYN.create(checked(YUNET, '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'), '', (256,256), 0.8)
        self.arc_points = np.float32([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]])
        mask = np.zeros((256,256), np.float32)
        cv2.ellipse(mask,(128,149),(95,102),0,0,360,1,-1)
        self.mask = cv2.GaussianBlur(mask,(25,25),0)
        demo = cv2.imread(str(PROJECT/'diagnostics/deeplivecam/driver.jpg'))
        photo = cv2.cvtColor(cv2.resize(demo,(256,256)),cv2.COLOR_BGR2RGBA).tobytes()
        self.default = self.prepare_source(photo)
        self.swapped = 0
        self.frame(photo,None,None)
        if self.swapped != 1: raise ValueError('Генератор не прошёл проверку кадра')
        self.swapped = 0

    def load_swap(self, session):
        self.swap = session(MODELS/'hififace_unofficial_256.onnx', '9de9751617976195114d7f067b9b6cf933748363355cf473cab2da57a739c2ef')
        self.convert = session(MODELS/'crossface_hififace.onnx', 'dfb75f960cb8ef1967a82838e64963b9ff621c4af3e22f9fda48ad958dddec9a')
        self.target_points = 256 * self.np.float32([[.36562865,.46733799],[.63305391,.46585885],[.50019127,.61942959],[.39032951,.77598822],[.61178945,.77476328]])

    def source_identity(self, embedding):
        return self.convert.run(None, {'input': embedding})[0]

    def face(self, data):
        cv, np = self.cv, self.np
        rgb = np.ascontiguousarray(np.frombuffer(data,np.uint8).reshape(256,256,4)[:,:,:3])
        _, faces = self.detector.detect(cv.cvtColor(rgb,cv.COLOR_RGB2BGR))
        if faces is None or len(faces) != 1: return rgb, None
        return rgb, faces[0,4:14].reshape(5,2)

    def aligned(self, rgb, points, template, size):
        cv = self.cv
        transform, _ = cv.estimateAffinePartial2D(points,template,method=cv.LMEDS)
        if transform is None: raise ValueError('Не удалось выровнять лицо')
        crop = cv.warpAffine(rgb,transform,(size,size),borderMode=cv.BORDER_REPLICATE)
        tensor = self.np.ascontiguousarray(crop.transpose(2,0,1)[None], dtype=self.np.float32) / 127.5 - 1
        return tensor, transform

    def prepare_source(self, data):
        rgb, points = self.face(data)
        if points is None: raise ValueError('На фотографии должно быть видно одно лицо')
        tensor, _ = self.aligned(rgb,points,self.arc_points,112)
        embedding = self.encoder.run(None,{self.encoder.get_inputs()[0].name:tensor})[0]
        identity = self.source_identity(embedding).reshape(1,-1)
        norm = self.np.linalg.norm(identity)
        if not self.np.isfinite(norm) or norm == 0: raise ValueError('Не удалось обработать фотографию')
        return identity / norm

    def frame(self, data, motion, source):
        cv,np = self.cv,self.np
        rgb, points = self.face(data)
        if points is None: return data,None
        target, matrix = self.aligned(rgb,points,self.target_points,256)
        face = self.swap.run(None,{'source':self.default if source is None else source,'target':target})[0][0]
        face = ((face.transpose(1,2,0)+1)*127.5).clip(0,255)
        inverse = cv.invertAffineTransform(matrix)
        alpha = cv.warpAffine(self.mask,inverse,(256,256))[:,:,None]
        result = (rgb*(1-alpha)+cv.warpAffine(face,inverse,(256,256))*alpha).clip(0,255).astype(np.uint8)
        self.swapped += 1
        return cv.cvtColor(result,cv.COLOR_RGB2RGBA).tobytes(),None


class HifiService(Service):
    engine = 'HifiFace Unofficial 256'
    animator_class = Animator

    def __init__(self):
        self.lock = threading.Lock()
        self.sessions = {}
        self.reason = self.animator = None
        try:
            self.animator = self.animator_class()
        except Exception as error:
            self.reason = str(error)

    def health(self):
        return {**super().health(), 'swappedFrames': self.animator.swapped if self.animator else 0}


if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1',8771),Api) as http:
        http.service = HifiService()
        print(http.service.health(),flush=True)
        http.serve_forever()
