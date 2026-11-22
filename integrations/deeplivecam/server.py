"""Run Deep-Live-Cam locally against explicitly provided model files."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading
from http.server import ThreadingHTTPServer

from dlc_engine import Animator, offline

PORT = 8766
SIBLING = Path(__file__).resolve().parents[1] / 'deepfacelive'


def sibling(name):
    spec = importlib.util.spec_from_file_location('studio_' + name, SIBLING / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sys.path.insert(0, str(SIBLING))  # Shared transport imports its local prepare module.
transport = sibling('server')


class Service(transport.Service):
    engine = 'Deep-Live-Cam'

    def __init__(self, repo, models):
        self.lock = threading.Lock()
        self.sessions = {}
        self.animator = None
        self.reason = None
        try:
            self.animator = Animator(repo, models, lambda: sibling('runtime').portrait())
        except Exception as error:
            self.reason = str(error) or type(error).__name__


    def health(self):
        state = super().health()
        state["provider"] = self.animator.provider if self.animator else None
        state["swappedFrames"] = self.animator.swapped_frames if self.animator else 0
        state["freshFaces"] = self.animator.fresh_faces if self.animator else 0
        state["detectorSize"] = self.animator.detector_size if self.animator else None
        return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=os.environ.get('DLC_REPO'))
    parser.add_argument('--models', default=os.environ.get('DLC_MODELS'))
    args = parser.parse_args()
    sys.addaudithook(offline)
    service = Service(args.repo, args.models)
    with ThreadingHTTPServer(('127.0.0.1', PORT), transport.Api) as server:
        server.service = service
        print(f'http://127.0.0.1:{PORT} {json.dumps(service.health())}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
