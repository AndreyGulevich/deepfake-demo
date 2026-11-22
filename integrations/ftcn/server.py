from pathlib import Path
import os
from engine import Detector, FRAMES, SIDE
from http_api import serve

if __name__ == '__main__':
    repo = Path(os.environ.get('FTCN_REPO', Path.home()/'.cache/deepfake-demo/FTCN')).resolve()
    serve('FTCN+TT', 8767, FRAMES, SIDE, lambda: Detector(repo))
