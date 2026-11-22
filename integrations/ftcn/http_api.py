from http.server import ThreadingHTTPServer
from pathlib import Path
import importlib.util
import sys
from threading import Lock

sibling = Path(__file__).resolve().parents[1] / 'deepfacelive'
sys.path.insert(0, str(sibling))
spec = importlib.util.spec_from_file_location('studio_transport', sibling / 'server.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class Api(transport.Api):
    def do_GET(self):
        if self.allowed():
            self.respond(200, self.server.health) if self.path == '/health' else self.respond(404)

    def do_DELETE(self):
        self.respond(405)

    def do_POST(self):
        if not self.allowed():
            return
        length = self.server.frame_bytes
        if self.path != '/clip':
            return self.respond(404)
        if self.headers.get('Content-Type') != 'application/octet-stream':
            return self.respond(415)
        if self.headers.get('Content-Length') != str(length):
            return self.respond(400)
        if not self.server.health['ready']:
            return self.respond(503)
        if not self.server.lock.acquire(blocking=False):
            return self.respond(429)
        try:
            data = self.rfile.read(length)
            if len(data) != length:
                return self.respond(400)
            self.respond(200, self.server.detector.analyze(data))
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            print(self.server.health['engine'], error, file=sys.stderr, flush=True)
            self.respond(500, {'reason':'Ошибка обработки клипа ' + self.server.health['engine']})
        finally:
            self.server.lock.release()


def serve(name, port, frame_count, side, make_detector):
    with ThreadingHTTPServer(('127.0.0.1', port), Api) as server:
        server.lock = Lock()
        server.frame_bytes = frame_count * side * side * 4
        server.health = {'engine': name, 'ready': False}
        try:
            server.detector = make_detector()
            server.health['ready'] = True
        except Exception as error:
            server.health['reason'] = str(error) or type(error).__name__
        print(server.health, flush=True)
        server.serve_forever()
