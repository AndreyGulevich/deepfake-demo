"""Run with the installed FF-c23 checkpoint and the project's face fixture."""
from pathlib import Path
import unittest

from engine import Detector, SIDE
import cv2


class SbiInferenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detector = Detector()

    def test_face(self):
        photo = Path(__file__).resolve().parents[2] / 'diagnostics/deeplivecam/driver.jpg'
        image = cv2.resize(cv2.imread(str(photo)), (SIDE, SIDE))
        frame = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA).tobytes()
        result = self.detector.analyze(frame)
        self.assertEqual(result['status'], 'ok')
        self.assertTrue(0 <= result['score'] <= 1)
        print('SBI fixture:', result)

    def test_blank(self):
        self.assertEqual(self.detector.analyze(bytes(SIDE * SIDE * 4)), {'status': 'no_track'})

    def test_invalid_frame(self):
        with self.assertRaises(ValueError):
            self.detector.analyze(b'x')


if __name__ == '__main__':
    unittest.main()
