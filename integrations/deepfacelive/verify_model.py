"""Verify real predictions through the running HTTP service using original drawn fixtures."""
import hashlib
import json
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
from runtime import portrait


def call(path, method='GET', data=None, token=None):
    headers = {'Origin': 'http://localhost:3003'}
    if token:
        headers.update({'X-Session': token, 'Content-Type': 'application/octet-stream'})
    request = Request('http://127.0.0.1:8765' + path, data=data, headers=headers, method=method)
    with urlopen(request, timeout=60) as response:
        return response.read()


def main():
    health = json.loads(call('/health'))
    if not health['ready']:
        raise RuntimeError(health)
    token = json.loads(call('/session', 'POST'))['id']
    image = np.empty((256, 256, 4), np.uint8)
    image[:, :, :3] = portrait()
    image[:, :, 3] = 255
    try:
        predictions = []
        for driver in (image, np.roll(image, (17, 21), axis=(0, 1))):
            started = time.monotonic()
            data = call('/frame', 'POST', driver.tobytes(), token)
            output = np.frombuffer(data, np.uint8).reshape(image.shape)
            portrait_area = output[:230, :, :3]
            if not np.all(output[:, :, 3] == 255) or portrait_area.std() < 3:
                raise ValueError('Missing opaque portrait in inference output')
            if np.array_equal(portrait_area, driver[:230, :, :3]):
                raise ValueError('Service returned the unprocessed driver image')
            predictions.append(output)
            print(f'{time.monotonic() - started:.3f}s output SHA256 {hashlib.sha256(data).hexdigest()}')
        delta = np.abs(predictions[1].astype(float) - predictions[0].astype(float))[:, :, :3].mean()
        if delta < 0.1:
            raise ValueError(f'Insufficient movement between predictions: {delta}')
        print(f'Mean RGB difference between driver poses: {delta:.3f}')
    finally:
        call('/session', 'DELETE', token=token)
    try:
        call('/frame', 'POST', image.tobytes(), token)
    except HTTPError as error:
        if error.code != 404:
            raise
    else:
        raise AssertionError('Stopped session still accepts frames')


if __name__ == '__main__':
    main()
