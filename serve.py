#!/usr/bin/env python3
"""Serve the repo like `python3 -m http.server`, but tell the browser never to cache a file.

Plain http.server sends no cache headers, so after an edit the browser may run a fresh JS module next to
a stale one it kept, and the site stops on its loader. Usage: python3 serve.py [port]  (default 8000)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(Path(__file__).resolve().parent))
    print(f"Serving on http://localhost:{port}/ without caching (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer(("", port), handler).serve_forever()
    except KeyboardInterrupt:
        pass
