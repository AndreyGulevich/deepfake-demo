"""Prepare known Deep-Live-Cam weights for a non-commercial academic study."""

import argparse
import hashlib
from http.client import HTTPException
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from urllib.request import urlopen


SWAPPER = "https://huggingface.co/hacksider/deep-live-cam/resolve/b7332ca6798d47fe7e4e69b80c8030a43583901c/"
BUFFALO = "https://huggingface.co/immich-app/buffalo_l/resolve/90852f0f71a1d31c01db30347ba314a4e88358d2/"
MODELS = (
    ("inswapper_128_fp16.onnx", SWAPPER + "inswapper_128_fp16.onnx", 277680638,
     "6d51a9278a1f650cffefc18ba53f38bf2769bf4bbff89267822cf72945f8a38b"),
    ("buffalo_l/det_10g.onnx", BUFFALO + "detection/model.onnx", 16923827,
     "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91"),
    ("buffalo_l/w600k_r50.onnx", BUFFALO + "recognition/model.onnx", 174383860,
     "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43"),
)
DEFAULT_DIR = Path.home() / ".cache" / "deepfake-demo" / "deeplivecam-models"


def verify(path, size, expected_digest):
    if not path.is_file() or path.stat().st_size != size:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == expected_digest


def download(path, url, size, digest):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with NamedTemporaryFile(dir=path.parent, suffix=".partial", delete=False) as out:
            temp = Path(out.name)
            with urlopen(url, timeout=90) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    if out.tell() + len(chunk) > size:
                        raise ValueError("Unexpected file size")
                    out.write(chunk)
        if not verify(temp, size, digest):
            raise ValueError("Unexpected size or SHA-256")
        os.replace(temp, path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--download", action="store_true",
                        help="Fetch missing or damaged research weights. Default: offline verification.")
    args = parser.parse_args()
    success = True
    for filename, url, size, digest in MODELS:
        path = args.dir.expanduser() / filename
        try:
            if not verify(path, size, digest):
                if not args.download:
                    raise ValueError("Missing or failed integrity check")
                print(f"Downloading {filename} ({size} bytes)", flush=True)
                download(path, url, size, digest)
            print(f"{digest}  {path}")
        except (OSError, ValueError, HTTPException) as error:
            print(f"{path}: {error}", file=sys.stderr)
            success = False
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
