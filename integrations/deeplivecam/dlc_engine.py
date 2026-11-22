"""Headless adapter for a separately installed, pinned Deep-Live-Cam checkout."""
import os
import platform
import tempfile
from pathlib import Path
import subprocess
import sys
from types import ModuleType

REVISION = '08896a51c9a6198f50dc9f7508acf39fc460c8f1'


def local_files(repo, models):
    if not repo or not (Path(repo) / 'modules/processors/frame/face_swapper.py').is_file():
        raise ValueError('Set DLC_REPO to the pinned Deep-Live-Cam checkout. See integrations/deeplivecam/README.md.')
    repo = Path(repo).expanduser().resolve()
    revision = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'],
                              capture_output=True, text=True, check=False)
    if revision.returncode or revision.stdout.strip() != REVISION:
        raise ValueError(f'Deep-Live-Cam checkout must be at {REVISION}.')
    if not models:
        raise ValueError('Set DLC_MODELS to a directory of locally supplied and authorized InsightFace weights.')
    models = Path(models).expanduser().resolve()
    swaps = [models / name for name in ('inswapper_128.onnx', 'inswapper_128_fp16.onnx')]
    swap = next((path for path in swaps if path.is_file() and path.stat().st_size), None)
    det = models / 'buffalo_l/det_10g.onnx'
    rec = models / 'buffalo_l/w600k_r50.onnx'
    missing = [str(p.relative_to(models)) for p in (det, rec) if not p.is_file() or not p.stat().st_size]
    if swap is None:
        missing.append('inswapper_128.onnx or inswapper_128_fp16.onnx')
    if missing:
        raise ValueError('Missing local weights: ' + ', '.join(missing) + '. Downloads are disabled.')
    return repo, swap, det, rec


def offline(event, args):
    # The HTTP listener only accepts connections. No Python client is needed by inference.
    if event in ('socket.connect', 'urllib.Request'):
        raise PermissionError('Outbound requests are disabled in the Deep-Live-Cam service.')


def coreml_model(path, *, is_swapper, detector_size=640):
    """Prepare a private, atomically published cache of the local ONNX graph."""
    import numpy as np
    import onnx
    from onnx import TensorProto, numpy_helper
    from modules.onnx_optimize import optimize_for_coreml

    stamp = path.stat()
    cache = path.parent / '.studio-coreml-v1'
    cache.mkdir(mode=0o700, exist_ok=True)
    shape = '' if is_swapper or detector_size == 640 else f'-{detector_size}'
    target = cache / f'{path.stem}{shape}-{stamp.st_mtime_ns}-{stamp.st_size}.onnx'
    if target.is_file():
        return str(target)
    with tempfile.TemporaryDirectory(dir=cache) as work:
        local = Path(work) / path.name
        local.symlink_to(path)
        optimized = optimize_for_coreml(str(local), None if is_swapper else (1, 3, detector_size, detector_size))
        graph = onnx.load(optimized)
        if is_swapper:
            # The FP16 conversion inserted casts around individual layers. Widening
            # the stored values exactly lets Core ML compile across those boundaries.
            for weight in graph.graph.initializer:
                if weight.data_type == TensorProto.FLOAT16:
                    value = numpy_helper.to_array(weight).astype(np.float32)
                    weight.CopyFrom(numpy_helper.from_array(value, weight.name))
            for info in [*graph.graph.input, *graph.graph.output, *graph.graph.value_info]:
                if info.type.tensor_type.elem_type == TensorProto.FLOAT16:
                    info.type.tensor_type.elem_type = TensorProto.FLOAT
            for node in graph.graph.node:
                if node.op_type == 'Cast':
                    for attr in node.attribute:
                        if attr.name == 'to' and attr.i == TensorProto.FLOAT16:
                            attr.i = TensorProto.FLOAT
        staged = Path(work) / 'ready.onnx'
        onnx.save(graph, str(staged))
        staged.chmod(0o600)
        staged.replace(target)
    return str(target)


class Animator:
    def __init__(self, repo, models, portrait_factory):
        repo, swap, det, rec = local_files(repo, models)
        sys.path.insert(0, str(repo))
        os.environ['NO_ALBUMENTATIONS_UPDATE'] = '1'
        import cv2
        import numpy as np
        import onnxruntime as ort
        from insightface import model_zoo
        from insightface.app.common import Face
        from modules import globals as settings
        # core imports its Qt interface even in headless mode. Its status callback is the
        # only UI entry used by the frame processor, and headless core logs to stdout.
        settings.headless = True
        headless_ui = ModuleType('modules.ui')
        headless_ui.update_status = print
        sys.modules.setdefault('modules.ui', headless_ui)
        from modules import core
        from modules.processors.frame import face_swapper

        providers = ['CPUExecutionProvider']
        if providers[0] not in ort.get_available_providers():
            raise RuntimeError('Install ONNX Runtime with CPUExecutionProvider in the Deep-Live-Cam environment.')
        settings.execution_providers = providers
        settings.frame_processors = ['face_swapper']
        settings.enable_interpolation = False
        self.swapped_frames = 0
        self.fresh_faces = 0
        self.detector_size = 640
        self.cv2, self.np, self.Face = cv2, np, Face
        recognition = model_zoo.get_model(str(rec), providers=providers, download=False)
        if recognition is None:
            raise ValueError('InsightFace could not identify the recognition graph.')
        recognition.prepare(ctx_id=0)
        self.recognition = recognition
        self.process = face_swapper.process_frame
        self.portrait = cv2.cvtColor(portrait_factory(), cv2.COLOR_RGB2BGR)
        # Fixed points are coordinates of eyes, nose and mouth in our procedural portrait.
        self.source = Face(kps=np.array([(101, 121), (155, 121), (128, 145),
                                          (112, 165), (144, 165)], np.float32),
                           bbox=np.array([63, 50, 193, 205], np.float32))
        recognition.get(self.portrait, self.source)
        embedding = self.source.normed_embedding
        if embedding is None or not np.isfinite(embedding).all():
            raise ValueError('Could not encode the fixed synthetic portrait.')
        # Exercise all three graphs before advertising readiness, even on a cartoony fixture.
        def load_pair(detector, swapper):
            self.detector = detector
            face_swapper.FACE_SWAPPER = swapper
            self.detector.prepare(ctx_id=0, input_size=(self.detector_size, self.detector_size))
            self.detect(self.portrait)
            self.swapped(self.portrait, self.source)

        self.provider = 'CPUExecutionProvider'
        if (sys.platform == 'darwin' and platform.machine() == 'arm64'
                and 'CoreMLExecutionProvider' in ort.get_available_providers()):
            from insightface.model_zoo.model_zoo import ModelRouter
            options = ort.SessionOptions()
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
            options.intra_op_num_threads = 2
            apple = [('CoreMLExecutionProvider', {'ModelFormat': 'MLProgram',
                      'MLComputeUnits': 'ALL', 'SpecializationStrategy': 'FastPrediction'}), self.provider]
            try:
                detector, swapper = (
                    ModelRouter(coreml_model(path, is_swapper=is_swapper, detector_size=self.detector_size)).get_model(
                        providers=apple, sess_options=options)
                    for path, is_swapper in ((det, False), (swap, True)))
                if any('CoreMLExecutionProvider' not in model.session.get_providers()
                       for model in (detector, swapper)):
                    raise RuntimeError('Core ML did not initialize.')
                load_pair(detector, swapper)
                self.provider = 'CoreMLExecutionProvider'
                return
            except Exception as error:
                print(f'Core ML unavailable, retrying on CPU: {error}', file=sys.stderr, flush=True)
        load_pair(model_zoo.get_model(str(det), providers=providers, download=False),
                  model_zoo.get_model(str(swap), providers=providers, download=False))

    def detect(self, frame):
        boxes, points = self.detector.detect(frame, max_num=1)
        if len(boxes) == 0:
            return None
        return self.Face(bbox=boxes[0, :4], kps=points[0])

    def prepare_source(self, data):
        rgba = self.np.frombuffer(data, self.np.uint8).reshape(256, 256, 4)
        frame = self.cv2.cvtColor(rgba, self.cv2.COLOR_RGBA2BGR)
        boxes, points = self.detector.detect(frame, max_num=2)
        if len(boxes) != 1:
            raise ValueError('Нужен портрет с одним хорошо видимым лицом в центре.')
        source = self.Face(bbox=boxes[0, :4], kps=points[0])
        self.recognition.get(frame, source)
        if not self.np.isfinite(source.normed_embedding).all():
            raise ValueError('Не удалось распознать лицо на фотографии.')
        return source

    def swapped(self, frame, target, source=None):
        # The pinned processor sometimes returns its input on inference errors and may mutate it.
        result = self.process(self.source if source is None else source, frame.copy(), target_face=target)
        if result is None or result.shape != frame.shape or self.np.array_equal(result, frame):
            raise RuntimeError('Deep-Live-Cam returned an unchanged or invalid face-swap result.')
        return result

    def frame(self, data, motion, source=None):
        rgba = self.np.frombuffer(data, self.np.uint8).reshape(256, 256, 4)
        frame = self.cv2.cvtColor(rgba, self.cv2.COLOR_RGBA2BGR)
        target = self.detect(frame)
        if target is None:
            result = self.np.zeros_like(frame)
        else:
            result = self.swapped(frame, target, source)
            self.fresh_faces += 1
            self.swapped_frames += 1
        return self.cv2.cvtColor(result, self.cv2.COLOR_BGR2RGBA).tobytes(), None
