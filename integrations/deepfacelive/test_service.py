import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock

from server import Api, Service, ThreadingHTTPServer


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.svc = Service(Path(tempfile.gettempdir()) / 'nonexistent-deepfacelive-test.onnx')

    def test_missing_model_is_unavailable(self):
        self.assertFalse(self.svc.health()['ready'])
        self.assertIn('missing', self.svc.health()['reason'])
        self.assertEqual(self.svc.create()[0], 503)

    def test_stop_forgets_motion(self):
        self.svc.animator = Mock()
        self.svc.animator.frame.side_effect = [(b'one', 'baseline'), (b'two', 'baseline')]
        status, session = self.svc.create()
        self.assertEqual(status, 201)
        token = session['id']
        self.assertEqual(self.svc.frame(token, b'input'), (200, b'one'))
        self.assertEqual(self.svc.frame(token, b'next'), (200, b'two'))
        self.svc.animator.frame.assert_called_with(b'next', 'baseline', None)
        self.svc.stop(token)
        self.assertEqual(self.svc.frame(token, b'next')[0], 404)

    def test_photo_is_scoped_to_session(self):
        self.svc.animator = Mock()
        self.svc.animator.prepare_source.return_value = 'portrait'
        self.svc.animator.frame.return_value = (b'output', None)
        _, custom = self.svc.create(b'photo')
        _, default = self.svc.create()
        self.svc.frame(custom['id'], b'frame')
        self.svc.animator.frame.assert_called_with(b'frame', None, 'portrait')
        self.svc.frame(default['id'], b'frame')
        self.svc.animator.frame.assert_called_with(b'frame', None, None)

    def test_http_origin_host_and_frame_size(self):
        with ThreadingHTTPServer(('127.0.0.1', 0), Api) as server:
            server.service = self.svc
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for method, path, host, origin, expected in [
                    ('GET', '/health', 'attacker.invalid', 'http://localhost:3003', 403),
                    ('GET', '/health', f'127.0.0.1:{server.server_port}', 'http://other.invalid', 403),
                    ('OPTIONS', '/frame', f'127.0.0.1:{server.server_port}', 'studio://app', 204),
                    ('POST', '/frame', f'127.0.0.1:{server.server_port}', 'http://localhost:3003', 400),
                    ('GET', '/health', f'127.0.0.1:{server.server_port}', 'http://127.0.0.1:3003', 200),
                ]:
                    with self.subTest(method=method, host=host, origin=origin):
                        conn = http.client.HTTPConnection(*server.server_address, timeout=3)
                        conn.request(method, path, headers={'Host': host, 'Origin': origin,
                                     'Content-Type': 'application/octet-stream'})
                        res = conn.getresponse()
                        self.assertEqual(res.status, expected)
                        if expected in (200, 204):
                            self.assertEqual(res.getheader('Access-Control-Allow-Origin'), origin)
                        if expected == 200:
                            self.assertEqual(json.loads(res.read()), self.svc.health())
                        conn.close()
            finally:
                server.shutdown()
                thread.join()


if __name__ == '__main__':
    unittest.main()
