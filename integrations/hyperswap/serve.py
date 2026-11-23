"""Local HyperSwap 1c inference using the shared 256px frame pipeline."""
from pathlib import Path
import sys
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hififace'))
from serve import Animator, Api, CACHE, HifiService


class HyperSwap(Animator):
    def load_swap(self, session):
        import onnxruntime as ort

        providers = ['CPUExecutionProvider']
        if sys.platform == 'darwin' and 'CoreMLExecutionProvider' in ort.get_available_providers():
            providers.insert(0, ('CoreMLExecutionProvider', {
                'ModelFormat': 'MLProgram',
                'MLComputeUnits': 'CPUAndGPU',
            }))
        self.swap = session(
            CACHE / 'hyperswap/hyperswap_1c_256.onnx',
            '5528c2d76fe9986c99d829278987ef9f3a630cb606db7628d02b57b330f406a5',
            providers,
        )
        self.target_points = 256 * self.np.float32([
            [.36167656, .40387734], [.63696719, .40235469], [.50019687, .56044219],
            [.38710391, .72160547], [.61507734, .72034453],
        ])

    def source_identity(self, embedding):
        return embedding


class HyperSwapService(HifiService):
    engine = 'HyperSwap 1c 256'
    animator_class = HyperSwap


if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1', 8772), Api) as http:
        http.service = HyperSwapService()
        print(http.service.health(), flush=True)
        http.serve_forever()
