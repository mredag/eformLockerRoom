#!/usr/bin/env python3
import html
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

CONFIG_DIR = "/var/lib/portable-kiosk"
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
SETUP_PORT = 8137
SETUP_URL = f"http://localhost:{SETUP_PORT}/setup"
LAUNCH_COMMAND = [
    "chromium-browser",
    "--kiosk",
    "--no-sandbox",
    "--disable-infobars",
    "--disable-session-crashed-bubble",
    "--disable-restore-session-state",
    "--start-fullscreen",
    "--touch-events=enabled",
    "--enable-touch-drag-drop",
    "--enable-pinch",
    "--ozone-platform=wayland",
    "--enable-features=OverlayScrollbar,UseOzonePlatform",
    "--use-gl=egl",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def load_config() -> Dict[str, str]:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except FileNotFoundError:
        logging.info("No existing configuration found.")
    except json.JSONDecodeError:
        logging.warning("Configuration file is corrupted. Starting fresh.")
    return {}


def save_config(config: Dict[str, str]) -> None:
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, sort_keys=True)
    logging.info("Configuration saved to %s", CONFIG_PATH)


def normalize_server_url(raw_url: str) -> Optional[str]:
    candidate = raw_url.strip()
    if not candidate:
        return None
    if "://" not in candidate:
        candidate = f"http://{candidate}"
    parsed = urlparse(candidate)
    if not parsed.scheme or not parsed.netloc:
        return None
    normalized = parsed._replace(query="", fragment="", params="")
    # Remove trailing slash only if path is not root
    path = normalized.path or ""
    if path.endswith("/") and len(path) > 1:
        normalized = normalized._replace(path=path.rstrip("/"))
    return urlunparse(normalized)


def append_zone(base_url: str, zone: str) -> str:
    parsed = urlparse(base_url)
    existing_query = parse_qs(parsed.query, keep_blank_values=True)
    existing_query["zone"] = [zone]
    new_query = urlencode(existing_query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def kill_browser() -> None:
    subprocess.run(["pkill", "-f", "chromium-browser"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)


def launch_browser(url: str) -> None:
    logging.info("Launching Chromium at %s", url)
    kill_browser()
    env = os.environ.copy()
    env.setdefault("DISPLAY", ":0")
    env.setdefault("QT_IM_MODULE", "qtvirtualkeyboard")
    env.setdefault("GTK_IM_MODULE", "qtvirtualkeyboard")
    env.setdefault("MOZ_USE_XINPUT2", "1")
    env.setdefault("XKB_DEFAULT_LAYOUT", "tr")
    env.setdefault("QT_QPA_PLATFORM", "wayland")
    subprocess.Popen(LAUNCH_COMMAND + [url], env=env)


def ping_server(server_url: str) -> bool:
    host = urlparse(server_url).hostname
    if not host:
        logging.warning("Could not determine host from %s", server_url)
        return False
    logging.info("Pinging %s once to confirm availability...", host)
    result = subprocess.run([
        "ping",
        "-c",
        "1",
        "-W",
        "1",
        host,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode == 0:
        logging.info("Ping succeeded for %s", host)
        return True
    logging.warning("Ping failed for %s", host)
    return False


class ManualSetupServer:
    def __init__(self, existing_zone: Optional[str], existing_url: Optional[str], message: Optional[str] = None):
        self.existing_zone = existing_zone or ""
        self.existing_url = existing_url or ""
        self.message = message or ""
        self._result: Dict[str, str] = {}
        self._event = threading.Event()
        self._server: Optional[ThreadingHTTPServer] = None

    def start(self) -> Dict[str, str]:
        handler = self._build_handler()
        self._server = ThreadingHTTPServer(("0.0.0.0", SETUP_PORT), handler)

        thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        thread.start()
        logging.info("Manual setup server started on port %s", SETUP_PORT)
        launch_browser(SETUP_URL)
        self._event.wait()
        assert self._server is not None
        self._server.shutdown()
        logging.info("Manual setup completed.")
        return self._result

    def _build_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path not in ("/", "/setup"):
                    self.send_response(HTTPStatus.SEE_OTHER)
                    self.send_header("Location", "/setup")
                    self.end_headers()
                    return
                self._render_form(outer.message)

            def do_POST(self):
                if self.path != "/submit":
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length).decode("utf-8")
                form = parse_qs(body)
                zone = form.get("zone", [""])[0].strip()
                server_url = form.get("server_url", [""])[0].strip()
                if not zone or not server_url:
                    self._render_form("Her iki alan da zorunludur.", zone, server_url)
                    return
                normalized_url = normalize_server_url(server_url)
                if not normalized_url:
                    self._render_form("Geçerli bir http(s) adresi girin.", zone, server_url)
                    return
                outer._result = {"zone": zone, "server_url": normalized_url}
                save_config(outer._result)
                outer._event.set()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                success_html = """
                    <!DOCTYPE html>
                    <html lang='tr'>
                    <head>
                        <meta charset='utf-8'>
                        <title>Kurulum Tamamlandı</title>
                        <style>
                            body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f6f6f8; }
                            .card { background:white; padding:2rem; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.1); max-width:420px; text-align:center; }
                            h1 { margin-top:0; font-size:2rem; }
                            p { color:#444; line-height:1.5; }
                        </style>
                    </head>
                    <body>
                        <div class='card'>
                            <h1>Ayarlar Kaydedildi</h1>
                            <p>Bu pencereyi kapatabilirsiniz. Kiosk otomatik olarak başlayacaktır.</p>
                        </div>
                    </body>
                    </html>
                """
                self.wfile.write(success_html.encode("utf-8"))

            def log_message(self, format, *args):
                logging.debug("ManualSetupServer: " + format, *args)

            def _render_form(self, message: Optional[str], zone_value: Optional[str] = None, url_value: Optional[str] = None):
                zone_prefill = html.escape(zone_value if zone_value is not None else outer.existing_zone)
                url_prefill = html.escape(url_value if url_value is not None else outer.existing_url)
                banner = ""
                if message:
                    banner = f"<div class='banner'>{html.escape(message)}</div>"
                html_body = f"""
                <!DOCTYPE html>
                <html lang='tr'>
                <head>
                    <meta charset='utf-8'>
                    <title>Kiosk Manuel Kurulum</title>
                    <style>
                        body {{ font-family: sans-serif; background: linear-gradient(135deg,#2c3e50,#4ca1af); margin:0; display:flex; align-items:center; justify-content:center; height:100vh; color:#1f2933; }}
                        .card {{ background:white; padding:2.5rem; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.25); width:90%; max-width:460px; }}
                        h1 {{ margin-top:0; font-size:2.2rem; color:#1a1a1a; }}
                        label {{ display:block; margin-top:1.5rem; font-weight:600; }}
                        input {{ width:100%; padding:0.75rem 1rem; margin-top:0.5rem; border-radius:8px; border:1px solid #d1d5db; font-size:1rem; }}
                        button {{ margin-top:2rem; width:100%; padding:0.85rem; border:none; border-radius:999px; background:#2563eb; color:white; font-size:1.1rem; font-weight:600; cursor:pointer; box-shadow:0 10px 25px rgba(37,99,235,0.35); }}
                        button:hover {{ background:#1d4ed8; }}
                        .hint {{ margin-top:1rem; font-size:0.9rem; color:#4b5563; }}
                        .banner {{ background:#fee2e2; border:1px solid #f87171; color:#b91c1c; padding:0.75rem 1rem; border-radius:8px; margin-bottom:1rem; text-align:center; font-weight:600; }}
                    </style>
                </head>
                <body>
                    <div class='card'>
                        <h1>Kiosk Ayarları</h1>
                        {banner}
                        <form method='post' action='/submit'>
                            <label for='server_url'>Sunucu Adresi</label>
                            <input id='server_url' name='server_url' value='{url_prefill}' placeholder='http://192.168.1.15:3002' required autofocus />
                            <label for='zone'>Bölge</label>
                            <input id='zone' name='zone' value='{zone_prefill}' placeholder='mens' required />
                            <button type='submit'>Kaydet ve Başlat</button>
                            <div class='hint'>Raspberry Pi sunucu adresini ve kiosk için kullanılacak bölgeyi girin. Kiosk bu değerleri hatırlayacaktır.</div>
                        </form>
                    </div>
                </body>
                </html>
                """
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html_body.encode("utf-8"))

        return Handler


def wait_forever():
    logging.info("Kiosk launcher will remain active. Press Ctrl+C to exit (service will restart automatically).")
    while True:
        time.sleep(3600)


def main():
    config = load_config()

    if not config.get("zone") or not config.get("server_url"):
        logging.info("Launching manual setup because configuration is incomplete.")
        setup = ManualSetupServer(config.get("zone"), config.get("server_url"))
        config = setup.start()

    while True:
        server_url = config.get("server_url")
        zone = config.get("zone")
        if not server_url or not zone:
            setup = ManualSetupServer(
                config.get("zone"),
                config.get("server_url"),
                "Ayar bilgileri eksik. Lütfen tekrar deneyin.",
            )
            config = setup.start()
            continue

        if ping_server(server_url):
            kiosk_url = append_zone(server_url, zone)
            launch_browser(kiosk_url)
            wait_forever()
        else:
            logging.warning("Server could not be reached. Opening manual setup for verification.")
            setup = ManualSetupServer(
                zone,
                server_url,
                "Sunucu ping isteğine yanıt vermedi. Gerekirse adresi güncelleyin.",
            )
            config = setup.start()


def _handle_signal(signum, frame):
    logging.info("Received signal %s. Exiting.", signum)
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    main()
