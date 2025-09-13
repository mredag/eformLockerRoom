import logging
import os
import subprocess
import time
import requests
import threading
from zeroconf import ServiceBrowser, Zeroconf

# Logging configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Constants
KIOSK_CONF_PATH = "/etc/kiosk.conf"
CACHE_PATH = "/var/cache/kiosk_server.json"
OFFLINE_URL = "file:///usr/share/kiosk-offline/index.html"
SERVICE_TYPE = "_eform._tcp.local."
HEALTH_CHECK_TIMEOUT = 5
DISCOVERY_TIMEOUT_MS = 8000 # 8 seconds global cap
BACKOFF_BASE_MS = 1000
BACKOFF_MAX_MS = 30000

class ServerListener:
    def __init__(self):
        self.server_info = None
        self.lock = threading.Lock()
        self.event = threading.Event()

    def remove_service(self, zeroconf, type, name):
        logging.info(f"Service {name} removed")
        with self.lock:
            self.server_info = None

    def add_service(self, zeroconf, type, name):
        info = zeroconf.get_service_info(type, name)
        if info:
            with self.lock:
                # Check for the correct role in the TXT records
                if info.properties.get(b'role') == b'main-server':
                    self.server_info = info
                    logging.info(f"Service {name} added, service info: {info}")
                    self.event.set()

def get_zone():
    """
    Gets the kiosk zone from the environment variable or a config file.
    """
    zone = os.environ.get("KIOSK_ZONE")
    if zone:
        logging.info(f"Got zone from environment variable: {zone}")
        return zone

    try:
        with open(KIOSK_CONF_PATH, "r") as f:
            for line in f:
                if line.strip().startswith("ZONE="):
                    zone = line.strip().split("=")[1]
                    logging.info(f"Got zone from config file: {zone}")
                    return zone
    except FileNotFoundError:
        logging.warning(f"Config file not found at {KIOSK_CONF_PATH}")
    except Exception as e:
        logging.error(f"Error reading config file: {e}")

    logging.error("Zone not configured. Please set KIOSK_ZONE environment variable or create /etc/kiosk.conf")
    return None

def discover_server_mdns():
    """
    Discovers the server using mDNS.
    """
    zeroconf = Zeroconf()
    listener = ServerListener()
    browser = ServiceBrowser(zeroconf, SERVICE_TYPE, listener)

    # Wait for the service to be discovered, with a timeout
    listener.event.wait(timeout=2) # 2 seconds per query

    with listener.lock:
        if listener.server_info:
            info = listener.server_info
            ip_address = ".".join(str(c) for c in info.addresses[0])
            port = info.port
            token = info.properties.get(b'token', b'').decode('utf-8')
            kiosk_port = int(info.properties.get(b'kioskPort', b'3002').decode('utf-8'))

            logging.info(f"kiosk-discovery: Discovered server via mDNS: ip={ip_address}, port={port}")
            zeroconf.close()
            return ip_address, port, kiosk_port, token
        else:
            logging.warning("kiosk-discovery: Could not discover server via mDNS.")
            zeroconf.close()
            return None, None, None, None

import socket

def get_local_ip():
    """
    Gets the local IP address of the kiosk.
    """
    try:
        # This is a bit of a hack, but it works in most cases
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception as e:
        logging.error(f"Could not get local IP: {e}")
        return None

def discover_server_http_scan():
    """
    Discovers the server by scanning the local subnet.
    """
    local_ip = get_local_ip()
    if not local_ip:
        return None, None

    subnet = os.environ.get("DISCOVERY_SUBNET")
    if subnet:
        # TODO: Implement parsing of CIDR notation
        logging.warning("DISCOVERY_SUBNET environment variable is not yet supported.")
        # For now, we'll just use the local IP's subnet
        ip_parts = local_ip.split(".")
        subnet_base = ".".join(ip_parts[:3])
    else:
        ip_parts = local_ip.split(".")
        subnet_base = ".".join(ip_parts[:3])

    logging.info(f"Scanning subnet {subnet_base}.0/24 for e-form server...")

    for i in range(1, 255):
        ip_to_check = f"{subnet_base}.{i}"
        discover_url = f"http://{ip_to_check}:3000/discover"
        try:
            response = requests.get(discover_url, timeout=0.1) # Short timeout for scanning
            if response.status_code == 200:
                data = response.json()
                if data.get("role") == "main-server":
                    logging.info(f"Discovered server via HTTP scan: {ip_to_check}")
                    return ip_to_check, data.get("gatewayPort", 3000)
        except requests.RequestException:
            # This is expected for most IPs, so we don't log it
            pass

    logging.warning("Could not discover server via HTTP scan.")
    return None, None

import json

def get_server_ip():
    """
    Gets the server IP by trying mDNS first, then falling back to other methods.
    """
    # Try mDNS first
    ip, gateway_port, kiosk_port, token = discover_server_mdns()
    if ip:
        return ip, gateway_port, kiosk_port, token

    # Fallback to resolving mainserver.local
    try:
        ip = socket.gethostbyname('mainserver.local')
        # If resolved, we need to get other details via /discover
        discover_url = f"http://{ip}:3000/discover"
        response = requests.get(discover_url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            if data.get("role") == "main-server":
                logging.info(f"kiosk-discovery: Discovered server via mainserver.local: ip={ip}")
                return ip, data.get("gatewayPort", 3000), data.get("kioskPort", 3002), data.get("token")
    except socket.gaierror:
        logging.warning("kiosk-discovery: Could not resolve mainserver.local.")
    except requests.RequestException:
        logging.warning(f"kiosk-discovery: Found mainserver.local at {ip} but could not connect to /discover endpoint.")


    # Fallback to HTTP scan
    ip, gateway_port = discover_server_http_scan()
    if ip:
        # If found via scan, we need to get other details via /discover
        discover_url = f"http://{ip}:{gateway_port}/discover"
        response = requests.get(discover_url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            if data.get("role") == "main-server":
                return ip, gateway_port, data.get("kioskPort", 3002), data.get("token")

    # Read from cache if discovery fails
    try:
        with open(CACHE_PATH, "r") as f:
            cached_data = json.load(f)
            logging.info(f"kiosk-discovery: Using cached server info: {cached_data}")
            return cached_data.get("ip"), 3000, cached_data.get("kioskPort"), None # No token from cache
    except (FileNotFoundError, json.JSONDecodeError):
        logging.warning("kiosk-discovery: No valid cached server info found.")

    return None, None, None, None

def check_server_health(ip, port):
    """
    Checks the health of the server.
    """
    if not ip or not port:
        return False

    health_url = f"http://{ip}:{port}/health"
    try:
        response = requests.get(health_url, timeout=HEALTH_CHECK_TIMEOUT)
        if response.status_code == 200:
            logging.info(f"Server at {ip}:{port} is healthy.")
            return True
        else:
            logging.warning(f"Server at {ip}:{port} is unhealthy (status code: {response.status_code}).")
            return False
    except requests.RequestException as e:
        logging.error(f"Error checking server health at {ip}:{port}: {e}")
        return False

def launch_chromium(url):
    """
    Launches Chromium in kiosk mode.
    """
    logging.info(f"Launching Chromium with URL: {url}")
    # Kill any existing chromium processes
    subprocess.run(["pkill", "-f", "chromium-browser"])
    time.sleep(1)

    command = [
        "chromium-browser",
        "--kiosk",
        "--no-sandbox",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-restore-session-state",
        "--start-fullscreen",
        url,
    ]

    env = os.environ.copy()
    env["DISPLAY"] = ":0"

    subprocess.Popen(command, env=env)

def main():
    """
    Main function for the kiosk launcher.
    """
    zone = get_zone()
    if not zone:
        # Show offline screen and exit if zone is not configured
        logging.error("kiosk-launch: No zone configured. Displaying offline screen.")
        launch_chromium(OFFLINE_URL)
        return

    logging.info(f"kiosk-launch: Starting with zone={zone}")

    current_ip = None
    backoff_delay = 1 # Start with 1 second

    while True:
        ip, gateway_port, kiosk_port, token = get_server_ip()

        if ip and kiosk_port:
            # Validate token if we got one
            if token:
                discover_url = f"http://{ip}:{gateway_port}/discover"
                try:
                    response = requests.get(discover_url, timeout=2)
                    if response.status_code == 200 and response.json().get("token") == token:
                        logging.info(f"kiosk-discovery: Token validated for ip={ip}")
                    else:
                        logging.warning(f"kiosk-discovery: Token validation failed for ip={ip}. Ignoring.")
                        ip = None # Invalidate discovery
                except requests.RequestException:
                    logging.warning(f"kiosk-discovery: Could not connect to /discover to validate token for ip={ip}")
                    ip = None

            if ip and check_server_health(ip, kiosk_port):
                if ip != current_ip:
                    logging.info(f"kiosk-launch: Server IP changed to {ip}, port={kiosk_port}. Relaunching kiosk.")
                    current_ip = ip
                    # Cache the new IP and port
                    with open(CACHE_PATH, "w") as f:
                        json.dump({"ip": ip, "kioskPort": kiosk_port, "ts": time.time()}, f)

                    url = f"http://{ip}:{kiosk_port}/?zone={zone}"
                    launch_chromium(url)

                backoff_delay = 1 # Reset backoff on success
            else:
                # Server found but unhealthy
                if current_ip:
                    logging.warning(f"kiosk-health: Server at ip={ip} is unhealthy. Displaying offline screen.")
                    launch_chromium(OFFLINE_URL)
                current_ip = None
        else:
            # Server not found
            if current_ip:
                logging.warning("kiosk-discovery: Server lost. Displaying offline screen.")
                launch_chromium(OFFLINE_URL)
            current_ip = None

        if not current_ip:
            # If server is not found or unhealthy, sleep with exponential backoff
            logging.info(f"kiosk-discovery: Waiting for {backoff_delay} seconds before retrying.")
            time.sleep(backoff_delay)
            backoff_delay = min(backoff_delay * 2, 30)
        else:
            # If server is healthy, poll every 30 seconds
            time.sleep(30)

if __name__ == "__main__":
    main()
