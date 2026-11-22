"""Run real inference on the first continuous single-face clip of a local video."""
import argparse
from collections import deque
import json

import cv2

from engine import Detector, FRAMES, SIDE


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video')
    args = parser.parse_args()
    detector = Detector()
    if detector.analyze(bytes(FRAMES * SIDE * SIDE * 4)) != {'status': 'no_track'}:
        raise RuntimeError('Пустой клип должен вернуть no_track.')
    stream = cv2.VideoCapture(args.video)
    if not stream.isOpened():
        raise ValueError('Не удалось открыть файл видео.')
    try:
        pending = deque(maxlen=FRAMES)
        for index in range(400):
            ok, frame = stream.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            side = min(w, h)
            y, x = (h - side) // 2, (w - side) // 2
            tile = cv2.resize(frame[y:y + side, x:x + side], (SIDE, SIDE))
            _, faces = detector.faces.detect(tile)
            if faces is None or len(faces) != 1:
                pending.clear()
                continue
            pending.append(cv2.cvtColor(tile, cv2.COLOR_BGR2RGBA).tobytes())
            if len(pending) == FRAMES:
                result = detector.analyze(b''.join(pending))
                if result['status'] == 'ok':
                    print(json.dumps({'startFrame': index + 1 - FRAMES, 'endFrame': index, **result}))
                    return
        raise ValueError('Не найден непрерывный клип с одним лицом.')
    finally:
        stream.release()


if __name__ == '__main__':
    main()
