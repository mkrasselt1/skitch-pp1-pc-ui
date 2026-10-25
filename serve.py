#!/usr/bin/env python3
"""Lokaler Webserver für die PP1-Steuerung.

Wie `python3 -m http.server`, aber mit `Cache-Control: no-cache`, damit der Browser nach
Änderungen nie eine alte Fassung der Skripte weiterverwendet.
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'PP1-Steuerung: http://localhost:{PORT}')
        httpd.serve_forever()
