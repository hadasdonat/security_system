#!/usr/bin/env python3
"""Minimal dev server with CORS headers for Ollama API access and Twilio integration."""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import base64
import os

PORT = 8000

# Load .env file
if os.path.exists('.env'):
    with open('.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                key, val = line.split('=', 1)
                os.environ[key] = val.strip('\"\'')

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/alert':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            message = data.get('message', 'SENTRY OS: Unknown Threat Detected!')
            
            # Send WhatsApp message
            success, err = send_whatsapp_alert(message)
            
            if success:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "sent"}).encode())
            else:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": err}).encode())
        else:
            self.send_error(404, "Endpoint not found")

def send_whatsapp_alert(message):
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_num = os.environ.get("TWILIO_FROM_NUMBER")
    to_num = os.environ.get("TWILIO_TO_NUMBER")

    if not all([account_sid, auth_token, from_num, to_num]) or account_sid == "your_account_sid_here":
        return False, "Twilio credentials not configured in .env file"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    
    data = urllib.parse.urlencode({
        "From": from_num,
        "To": to_num,
        "Body": message
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data)
    
    # Add Basic Auth Header
    auth_str = f"{account_sid}:{auth_token}"
    auth_b64 = base64.b64encode(auth_str.encode('ascii')).decode('ascii')
    req.add_header("Authorization", f"Basic {auth_b64}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    try:
        with urllib.request.urlopen(req) as response:
            response.read()
            print("SUCCESS: WhatsApp message sent via Twilio!")
            return True, None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"TWILIO ERROR ({e.code}): {error_body}")
        return False, f"Twilio API Error: {error_body}"
    except Exception as e:
        print(f"TWILIO ERROR: {str(e)}")
        return False, str(e)

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), CORSHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
