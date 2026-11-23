"""Run against a locally started LivePortrait service with its model weights."""
import json
from pathlib import Path
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import cv2


def request(path, data=None, token=None, method=None):
    headers = {'Content-Type': 'application/octet-stream'}
    if token:
        headers['X-Session'] = token
    req = Request('http://127.0.0.1:8773/' + path, data, headers, method=method)
    with urlopen(req, timeout=30) as response:
        return response.read()


class LivePortraitTest(unittest.TestCase):
    def test_uploaded_portrait_moves_and_session_stops(self):
        path = Path(__file__).resolve().parents[2] / 'diagnostics/deeplivecam/driver.jpg'
        image = cv2.resize(cv2.imread(str(path)), (256, 256))
        driver = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
        with self.assertRaises(HTTPError) as error:
            request('session/photo', bytes(driver.nbytes))
        self.assertEqual(error.exception.code, 422)
        token = json.loads(request('session/photo', cv2.flip(driver, 1).tobytes()))['id']
        try:
            first = request('frame', driver.tobytes(), token)
            rotated = cv2.warpAffine(driver, cv2.getRotationMatrix2D((128, 128), 12, 1),
                                     (256, 256), borderMode=cv2.BORDER_REPLICATE)
            second = request('frame', rotated.tobytes(), token)
            self.assertEqual(len(second), driver.nbytes)
            self.assertNotEqual(second, first)
            self.assertNotEqual(second, rotated.tobytes())
        finally:
            request('session', token=token, method='DELETE')
        with self.assertRaises(HTTPError) as error:
            request('frame', driver.tobytes(), token)
        self.assertEqual(error.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
