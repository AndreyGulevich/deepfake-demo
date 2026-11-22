"""Install the official DeepFaceLive Face Animator model for local evaluation."""

import argparse
import hashlib
import os
from pathlib import Path
import sys
import tempfile
from urllib.request import urlopen

COMMIT = "fc7b787bda2b8c186e142c52857458eea3a935ed"
BASE = f"https://raw.githubusercontent.com/iperov/DeepFaceLive/{COMMIT}/modelhub/onnx/LIA"
DEFAULT_MODEL = Path.home() / ".cache" / "deepfake-demo" / "deepfacelive" / "generator.onnx"
MODEL_SHA256 = "a4b316e832bc781093d15bb2e87493008430cd8973ec19e67d48906fa2248003"
PARTS = (
    (50331648, "f55aea4cd26c543cc58ca6c2840ebfbf26c72c40"),
    (50331648, "ae9a2531400a6507c99b1f49fc9e8060bf0e62f6"),
    (50331648, "d3adc9022cd908282a5f02b13644bac0f515104c"),
    (41560533, "1f8acbc698aec8a35c35871fde78e4967291c160"),
)
CHUNK = 1024 * 1024


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare(model, parts_dir=None):
    if model.is_file() and sha256_file(model) == MODEL_SHA256:
        return
    model.parent.mkdir(parents=True, exist_ok=True)
    whole = hashlib.sha256()
    with tempfile.TemporaryDirectory(dir=model.parent) as temp:
        staging = Path(temp) / "generator.onnx"
        with staging.open("wb") as out:
            for index, (size, blob_id) in enumerate(PARTS):
                name = f"generator.onnx.part{index}"
                print(f"Checking {name} ({size:,} bytes)", flush=True)
                source = (parts_dir / name).open("rb") if parts_dir else urlopen(f"{BASE}/{name}", timeout=90)
                with source:
                    blob = hashlib.sha1(f"blob {size}\0".encode("ascii"))
                    count = 0
                    for block in iter(lambda: source.read(CHUNK), b""):
                        count += len(block)
                        if count > size:
                            raise ValueError(f"Unexpected size for {name}")
                        blob.update(block)
                        whole.update(block)
                        out.write(block)
                    if count != size or blob.hexdigest() != blob_id:
                        raise ValueError(f"Size or Git blob ID mismatch for {name}")
        if whole.hexdigest() != MODEL_SHA256:
            raise ValueError("SHA-256 mismatch for assembled generator.onnx")
        os.replace(staging, model)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, epilog="Read MODEL.md for source and noncommercial usage terms.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="destination (default: %(default)s)")
    parser.add_argument("--parts-dir", type=Path, help="read the four original parts from disk for offline preparation")
    args = parser.parse_args()
    try:
        prepare(args.model.expanduser(), args.parts_dir)
    except (OSError, ValueError) as exc:
        sys.exit(f"Model preparation failed: {exc}")
    print(f"Verified {args.model} (SHA-256 {MODEL_SHA256})")
