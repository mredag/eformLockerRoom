#!/usr/bin/env python3
"""
Portable Kiosk Launcher - Simple touchscreen kiosk setup and launcher.
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
import socket
import html
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Configuration
CONFIG_DIR = "/var/lib/portable-kiosk"
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
SETUP_PORT = 8080

# Default suggestion
DEFAULT_SUGGESTION = "http://192.168.1.15:3002/?zone=mens"

def load_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except:
        return {}

def save_config(config):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

def get_display_env():
    env = os.environ.copy()
    env["DISPLAY"] = ":0"
    env["XAUTHORITY"] = f"/home/pi/.Xauthority"
    return env

def kill_browser():
    subprocess.run(["pkill", "-f", "chromium"], capture_output=True)
    time.sleep(1)

def launch_browser(url):
    kill_browser()
    env = get_display_env()
    cmd = [
        "chromium",
        "--kiosk",
        "--no-sandbox",
        "--disable-infobars",
        "--noerrdialogs",
        "--disable-session-crashed-bubble",
        "--disable-restore-session-state",
        "--start-fullscreen",
        "--touch-events=enabled",
        "--disable-translate",
        "--disable-features=TranslateUI",
        url
    ]
    subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def check_server(url):
    """Check if server is reachable."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 80
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except:
        return False

def auto_discover_server():
    """Try to find server on common IPs."""
    common_ips = [
        "192.168.1.15:3002",
        "192.168.1.11:3002",
        "192.168.1.10:3002",
        "192.168.1.1:3002",
    ]
    for ip in common_ips:
        url = f"http://{ip}"
        if check_server(url):
            return url
    return None

class OfflineScreen:
    """Shows offline screen when server is unreachable."""
    
    def __init__(self, kiosk_url):
        self.kiosk_url = kiosk_url
        self.server = None
        self.should_stop = False
    
    def start(self):
        handler = self._create_handler()
        self.server = ThreadingHTTPServer(("0.0.0.0", SETUP_PORT), handler)
        self.server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        launch_browser(f"http://localhost:{SETUP_PORT}/offline")
    
    def stop(self):
        self.should_stop = True
        if self.server:
            self.server.shutdown()
    
    def _create_handler(self):
        screen = self
        
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass
            
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                
                server_addr = screen.kiosk_url
                
                html_content = f"""
                <!DOCTYPE html>
                <html lang="tr">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta http-equiv="refresh" content="10">
                    <title>Çevrimdışı</title>
                    <style>
                        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
                        body {{
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                            color: white;
                        }}
                        .card {{
                            background: rgba(255,255,255,0.1);
                            border-radius: 24px;
                            padding: 50px;
                            max-width: 500px;
                            width: 100%;
                            text-align: center;
                            backdrop-filter: blur(10px);
                        }}
                        .icon {{ font-size: 80px; margin-bottom: 30px; }}
                        h1 {{ font-size: 32px; margin-bottom: 15px; }}
                        p {{ color: #a0aec0; font-size: 18px; line-height: 1.6; margin-bottom: 20px; }}
                        .server {{ 
                            background: rgba(0,0,0,0.3); 
                            padding: 15px; 
                            border-radius: 12px; 
                            font-family: monospace;
                            margin: 20px 0;
                            color: #fc8181;
                        }}
                        .spinner {{
                            width: 40px;
                            height: 40px;
                            border: 3px solid rgba(255,255,255,0.2);
                            border-top-color: #68d391;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin: 20px auto;
                        }}
                        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
                        .status {{ color: #68d391; font-size: 16px; }}
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">📡</div>
                        <h1>Sunucu Çevrimdışı</h1>
                        <p>Kiosk sunucusuna bağlanılamıyor.</p>
                        <div class="server">{html.escape(server_addr)}</div>
                        <div class="spinner"></div>
                        <p class="status">Yeniden bağlanmaya çalışılıyor...</p>
                        <p style="font-size: 14px; color: #718096;">Sayfa her 10 saniyede otomatik yenilenir</p>
                    </div>
                </body>
                </html>
                """
                self.wfile.write(html_content.encode())
        
        return Handler


class SetupWizard:
    """Setup wizard HTTP server."""
    
    def __init__(self):
        self.step = 1  # 1=welcome, 2=searching, 3=manual, 4=success
        self.kiosk_url = ""
        self.error_message = ""
        self.server = None
        self.result_url = None
        self.done_event = threading.Event()
    
    def start(self):
        handler = self._create_handler()
        self.server = ThreadingHTTPServer(("0.0.0.0", SETUP_PORT), handler)
        self.server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        
        # Launch browser to setup page
        time.sleep(1)
        launch_browser(f"http://localhost:{SETUP_PORT}/")
        
        # Wait for setup to complete
        self.done_event.wait()
        self.server.shutdown()
        
        return self.result_url
    
    def _create_handler(self):
        wizard = self
        
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass
            
            def do_GET(self):
                if self.path == "/" or self.path.startswith("/step"):
                    self._render_page()
                elif self.path == "/auto-search":
                    self._do_auto_search()
                elif self.path == "/manual":
                    wizard.step = 3
                    wizard.error_message = ""
                    self.send_response(302)
                    self.send_header("Location", "/")
                    self.end_headers()
                else:
                    self.send_response(302)
                    self.send_header("Location", "/")
                    self.end_headers()
            
            def do_POST(self):
                if self.path == "/manual-submit":
                    self._handle_manual_submit()
                elif self.path == "/test-url":
                    self._handle_test_url()
                elif self.path == "/finish":
                    self._handle_finish()
                else:
                    self.send_response(302)
                    self.send_header("Location", "/")
                    self.end_headers()
            
            def _do_auto_search(self):
                """Auto search for server."""
                found = auto_discover_server()
                if found:
                    wizard.kiosk_url = found + "/?zone=mens"
                    wizard.step = 4
                else:
                    wizard.step = 3
                    wizard.error_message = "Sunucu otomatik olarak bulunamadı. Lütfen manuel girin."
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
            
            def _handle_manual_submit(self):
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode()
                form = parse_qs(body)
                url = form.get("url", [""])[0].strip()
                
                if not url:
                    wizard.error_message = "URL boş olamaz!"
                    wizard.step = 3
                else:
                    # Accept manual entry without checking
                    wizard.kiosk_url = url
                    wizard.step = 4
                    wizard.error_message = ""
                
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
            
            def _handle_test_url(self):
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode()
                form = parse_qs(body)
                url = form.get("url", [""])[0].strip()
                
                result = {"success": check_server(url) if url else False}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            
            def _handle_finish(self):
                if wizard.kiosk_url:
                    save_config({"kiosk_url": wizard.kiosk_url})
                    wizard.result_url = wizard.kiosk_url
                    wizard.done_event.set()
                
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"<html><body><h1>Yeniden baslatiliyor...</h1></body></html>")

            def _render_page(self):
                if wizard.step == 1:
                    content = self._page_welcome()
                elif wizard.step == 2:
                    content = self._page_searching()
                elif wizard.step == 3:
                    content = self._page_manual()
                elif wizard.step == 4:
                    content = self._page_success()
                else:
                    content = self._page_welcome()
                
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(content.encode())
            
            def _base_style(self):
                return """
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        background: linear-gradient(135deg, #1a365d 0%, #2d5a87 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .card {
                        background: white;
                        border-radius: 24px;
                        padding: 40px;
                        max-width: 500px;
                        width: 100%;
                        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
                        text-align: center;
                    }
                    h1 { color: #1a365d; margin-bottom: 10px; font-size: 28px; }
                    h2 { color: #2d5a87; margin-bottom: 20px; font-size: 20px; font-weight: normal; }
                    p { color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
                    .btn {
                        display: inline-block;
                        padding: 16px 40px;
                        border: none;
                        border-radius: 12px;
                        font-size: 18px;
                        font-weight: 600;
                        cursor: pointer;
                        margin: 10px;
                        text-decoration: none;
                        transition: transform 0.2s, box-shadow 0.2s;
                    }
                    .btn:hover { transform: translateY(-2px); }
                    .btn-primary {
                        background: linear-gradient(135deg, #3182ce, #2c5282);
                        color: white;
                        box-shadow: 0 10px 30px rgba(49,130,206,0.4);
                    }
                    .btn-secondary {
                        background: #e2e8f0;
                        color: #2d3748;
                    }
                    .btn-success {
                        background: linear-gradient(135deg, #38a169, #276749);
                        color: white;
                        box-shadow: 0 10px 30px rgba(56,161,105,0.4);
                    }
                    input[type="text"] {
                        width: 100%;
                        padding: 16px;
                        border: 2px solid #e2e8f0;
                        border-radius: 12px;
                        font-size: 16px;
                        margin-bottom: 15px;
                    }
                    input[type="text"]:focus {
                        outline: none;
                        border-color: #3182ce;
                    }
                    .error {
                        background: #fed7d7;
                        color: #c53030;
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 20px;
                    }
                    .success-url {
                        background: #c6f6d5;
                        color: #276749;
                        padding: 16px;
                        border-radius: 12px;
                        margin: 20px 0;
                        word-break: break-all;
                        font-family: monospace;
                    }
                    .hint {
                        background: #ebf8ff;
                        color: #2b6cb0;
                        padding: 12px;
                        border-radius: 8px;
                        margin-top: 15px;
                        font-size: 14px;
                    }
                    .spinner {
                        width: 60px;
                        height: 60px;
                        border: 4px solid #e2e8f0;
                        border-top-color: #3182ce;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .icon { font-size: 60px; margin-bottom: 20px; }
                </style>
                """

            def _page_welcome(self):
                return f"""
                <!DOCTYPE html>
                <html lang="tr">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Kiosk Kurulumu</title>
                    {self._base_style()}
                </head>
                <body>
                    <div class="card">
                        <div class="icon">🖥️</div>
                        <h1>Kiosk Ekranı Kurulumu</h1>
                        <h2>Sunucu bağlantısı yapılandırması</h2>
                        <p>Kiosk ekranınızı sunucuya bağlamak için aşağıdaki seçeneklerden birini kullanın:</p>
                        <a href="/auto-search" class="btn btn-primary">🔍 Sunucuyu Otomatik Bul</a>
                        <a href="/manual" class="btn btn-secondary">✏️ Manuel Gir</a>
                    </div>
                </body>
                </html>
                """
            
            def _page_searching(self):
                return f"""
                <!DOCTYPE html>
                <html lang="tr">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta http-equiv="refresh" content="3;url=/auto-search">
                    <title>Aranıyor...</title>
                    {self._base_style()}
                </head>
                <body>
                    <div class="card">
                        <div class="spinner"></div>
                        <h1>Sunucu Aranıyor</h1>
                        <p>Ağda kiosk sunucusu aranıyor, lütfen bekleyin...</p>
                    </div>
                </body>
                </html>
                """
            
            def _page_manual(self):
                error_html = ""
                if wizard.error_message:
                    error_html = f'<div class="error">{html.escape(wizard.error_message)}</div>'
                
                return f"""
                <!DOCTYPE html>
                <html lang="tr">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Manuel Giriş</title>
                    {self._base_style()}
                </head>
                <body>
                    <div class="card">
                        <div class="icon">✏️</div>
                        <h1>Manuel Sunucu Girişi</h1>
                        <p>Kiosk sunucusunun tam adresini girin:</p>
                        {error_html}
                        <form method="post" action="/manual-submit">
                            <input type="text" name="url" placeholder="http://192.168.1.15:3002/?zone=mens" 
                                   value="{html.escape(wizard.kiosk_url or '')}" autofocus>
                            <button type="submit" class="btn btn-primary">🔗 Bağlan</button>
                        </form>
                        <div class="hint">
                            💡 Öneri: <strong>{DEFAULT_SUGGESTION}</strong>
                            <br><br>
                            <button onclick="document.querySelector('input[name=url]').value='{DEFAULT_SUGGESTION}'" 
                                    class="btn btn-secondary" type="button" style="padding: 10px 20px; font-size: 14px;">
                                Öneriyi Kullan
                            </button>
                        </div>
                    </div>
                </body>
                </html>
                """

            def _page_success(self):
                return f"""
                <!DOCTYPE html>
                <html lang="tr">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Kurulum Tamamlandı</title>
                    {self._base_style()}
                </head>
                <body>
                    <div class="card">
                        <div class="icon">✅</div>
                        <h1>Bağlantı Başarılı!</h1>
                        <p>Sunucuya başarıyla bağlanıldı.</p>
                        <div class="success-url">{html.escape(wizard.kiosk_url)}</div>
                        <p>Kurulumu tamamlamak ve kiosk modunu başlatmak için aşağıdaki butona tıklayın.</p>
                        <form method="post" action="/finish">
                            <button type="submit" class="btn btn-success">🚀 Kurulumu Tamamla ve Başlat</button>
                        </form>
                        <div class="hint">
                            Cihaz yeniden başlatılacak ve kiosk modu otomatik olarak açılacaktır.
                        </div>
                    </div>
                </body>
                </html>
                """
        
        return Handler


def is_touch_working():
    """Check if USB touchscreen is working."""
    try:
        # Check xinput for touch devices
        result = subprocess.run(
            ["xinput", "list"],
            capture_output=True,
            text=True,
            timeout=5,
            env=get_display_env()
        )
        if result.returncode == 0:
            output = result.stdout.lower()
            if "touch" in output or "finger" in output:
                return True
        
        # Check libinput
        result = subprocess.run(
            ["libinput", "list-devices"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and "touch" in result.stdout.lower():
            return True
        
        return False
    except:
        return False


def reset_usb_touch():
    """Try to reset USB touchscreen."""
    print("Attempting USB touchscreen reset...")
    try:
        # Reload HID modules
        subprocess.run(["sudo", "modprobe", "-r", "usbhid"], timeout=10, capture_output=True)
        time.sleep(1)
        subprocess.run(["sudo", "modprobe", "usbhid"], timeout=10, capture_output=True)
        time.sleep(1)
        
        # Trigger udev
        subprocess.run(["sudo", "udevadm", "trigger"], timeout=10, capture_output=True)
        subprocess.run(["sudo", "udevadm", "settle"], timeout=30, capture_output=True)
        
        print("USB reset completed")
        return True
    except Exception as e:
        print(f"USB reset failed: {e}")
        return False


def touch_monitor_loop():
    """Background thread to monitor touchscreen health."""
    failure_count = 0
    last_reset_time = 0
    
    while True:
        time.sleep(15)  # Check every 15 seconds
        
        if is_touch_working():
            if failure_count > 0:
                print("Touchscreen recovered")
            failure_count = 0
        else:
            failure_count += 1
            print(f"Touchscreen not detected (failure {failure_count}/3)")
            
            # After 3 consecutive failures, try reset
            if failure_count >= 3:
                current_time = time.time()
                # Only reset once per 60 seconds
                if current_time - last_reset_time > 60:
                    last_reset_time = current_time
                    reset_usb_touch()
                    failure_count = 0


def main():
    print("Portable Kiosk Launcher starting...")
    
    # Start touchscreen monitor in background
    touch_thread = threading.Thread(target=touch_monitor_loop, daemon=True)
    touch_thread.start()
    print("Touchscreen monitor started")
    
    # Load existing config
    config = load_config()
    kiosk_url = config.get("kiosk_url", "")
    
    # If we have a saved URL, manage connection with offline screen
    if kiosk_url:
        print(f"Found saved URL: {kiosk_url}")
        offline_screen = None
        was_offline = False
        
        while True:
            if check_server(kiosk_url):
                # Server is online
                if was_offline or offline_screen:
                    print("Server is back online!")
                    if offline_screen:
                        offline_screen.stop()
                        offline_screen = None
                    was_offline = False
                    launch_browser(kiosk_url)
                elif not was_offline:
                    # First run, launch browser
                    print("Server is online, launching kiosk...")
                    launch_browser(kiosk_url)
                
                # Check every 30 seconds while online
                time.sleep(30)
            else:
                # Server is offline
                if not was_offline:
                    print("Server is offline, showing offline screen...")
                    was_offline = True
                    if offline_screen:
                        offline_screen.stop()
                    offline_screen = OfflineScreen(kiosk_url)
                    offline_screen.start()
                
                # Check every 10 seconds while offline
                time.sleep(10)
    
    # No saved URL - run setup wizard
    print("Starting setup wizard...")
    wizard = SetupWizard()
    result_url = wizard.start()
    
    if result_url:
        print(f"Setup complete! URL: {result_url}")
        print("Rebooting in 3 seconds...")
        time.sleep(3)
        subprocess.run(["sudo", "reboot"])
    else:
        print("Setup cancelled or failed")


def signal_handler(signum, frame):
    print(f"Received signal {signum}, exiting...")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    main()
