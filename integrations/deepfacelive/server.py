"""Loopback-only API for the fixed-portrait DeepFaceLive/LIA demo."""
import argparse
import json
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from prepare import DEFAULT_MODEL, MODEL_SHA256, sha256_file

PORT = 8765
ORIGINS = {'http://localhost:3003', 'http://127.0.0.1:3003', 'studio://app'}
FRAME_BYTES = 256 * 256 * 4


class Service:
    engine = 'DeepFaceLive/LIA'

    def __init__(self, path):
        self.lock = threading.Lock()
        self.sessions = {}
        self.reason = None
        self.animator = None
        try:
            if not path.is_file():
                raise ValueError('Model missing. Run prepare.py and restart the service.')
            if sha256_file(path) != MODEL_SHA256:
                raise ValueError('Model checksum mismatch. Run prepare.py and restart.')
            from runtime import Animator
            self.animator = Animator(path)
        except ImportError as error:
            self.reason = f'Runtime unavailable ({error}). Run yarn setup:deepfacelive and restart.'
        except (OSError, ValueError) as error:
            self.reason = str(error)
        except Exception as error:
            # ONNX Runtime defines its own native exception classes.
            self.reason = 'Could not initialize ONNX Runtime: ' + str(error)

    def health(self):
        state = {'engine': self.engine, 'ready': self.animator is not None}
        if self.engine == 'DeepFaceLive/LIA' and self.animator is not None:
            state['provider'] = self.animator.provider
        if self.reason:
            state['reason'] = self.reason
        return state

    def create(self, photo=None, *, motion=None):
        if self.animator is None:
            return 503, {'reason': self.reason}
        with self.lock:
            now = time.monotonic()
            self.sessions = {key: record for key, record in self.sessions.items()
                             if now - record[0] < 60}
            if len(self.sessions) >= 4:
                return 429, {'reason': 'Too many active sessions.'}
            token = secrets.token_urlsafe(32)
            try:
                source = self.animator.prepare_source(photo) if photo is not None else None
            except ValueError as error:
                return 422, {'reason': str(error)}
            self.sessions[token] = (now, motion, source)
        return 201, {'id': token}

    def frame(self, token, data):
        with self.lock:
            if token not in self.sessions:
                return 404, {'reason': 'Session expired. Restart the maker.'}
            _, motion, source = self.sessions[token]
            try:
                result, updated_motion = self.animator.frame(data, motion, source)
            except Exception as error:
                print(self.engine, 'inference error:', error, file=sys.stderr, flush=True)
                return 500, {'reason': f'{self.engine} inference failed. See the service log.'}
            self.sessions[token] = (time.monotonic(), updated_motion, source)
            return 200, result

    def stop(self, token):
        with self.lock:
            self.sessions.pop(token, None)


class Api(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_request(self, code='-', size='-'):
        if self.path != '/frame' or code != 200:
            super().log_request(code, size)

    def respond(self, status, body=None):
        binary = isinstance(body, bytes)
        data = body if binary else (json.dumps(body).encode() if body is not None else b'')
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            if self.command == 'OPTIONS':
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Session')
                if self.headers.get('Access-Control-Request-Private-Network') == 'true':
                    self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Type', 'application/octet-stream' if binary else 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)

    def allowed(self):
        hosts = {'127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port)}
        origin = self.headers.get('Origin')
        if self.headers.get('Host') not in hosts or (origin is not None and origin not in ORIGINS):
            self.respond(403, {'reason': 'Untrusted host or origin.'})
            return False
        return True

    def do_OPTIONS(self):
        if self.allowed():
            self.respond(204)

    def do_GET(self):
        if self.allowed():
            if self.path == '/health':
                self.respond(200, self.server.service.health())
            else:
                self.respond(404)

    def create_session(self, photo=None):
        return self.server.service.create(photo)

    def do_POST(self):
        if not self.allowed():
            return
        if self.path == '/session':
            self.respond(*self.create_session())
        elif self.path in ('/session/photo', '/frame'):
            if self.headers.get('Content-Type') != 'application/octet-stream':
                self.respond(415)
                return
            if self.headers.get('Content-Length') != str(FRAME_BYTES):
                self.respond(400, {'reason': 'Expected one 256x256 RGBA frame.'})
                return
            data = self.rfile.read(FRAME_BYTES)
            if len(data) != FRAME_BYTES:
                self.respond(400)
                return
            if self.path == '/session/photo':
                self.respond(*self.create_session(data))
            else:
                self.respond(*self.server.service.frame(self.headers.get('X-Session'), data))
        else:
            self.respond(404)

    def do_DELETE(self):
        if self.allowed():
            if self.path == '/session':
                self.server.service.stop(self.headers.get('X-Session'))
                self.respond(204)
            else:
                self.respond(404)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=DEFAULT_MODEL)
    service = Service(parser.parse_args().model)
    with ThreadingHTTPServer(('127.0.0.1', PORT), Api) as server:
        server.service = service
        print(f'http://127.0.0.1:{PORT} {json.dumps(service.health())}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
