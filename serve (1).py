#!/usr/bin/env python3
"""Minimal dev server with CORS headers for Ollama API access."""

import http.server
import socketserver

PORT = 8000


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), CORSHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
