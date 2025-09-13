# Kiosk Discovery and Thin Client Setup

This document describes how to set up the automatic server discovery and kiosk launch system. This allows kiosk thin clients to automatically discover the main server and launch Chromium in kiosk mode with the correct zone.

## Main Server Setup

The main server needs to have the `/discover` endpoint and mDNS advertising enabled on the gateway service.

### 1. Update the Gateway Service

The `GET /discover` endpoint and mDNS advertising have been added to the gateway service. To deploy the change, simply pull the latest code on your main server, install the new dependencies, and restart the gateway service.

```bash
cd /path/to/eform-locker
git pull
cd app/gateway
npm install
# Restart your gateway service (e.g., using pm2 or systemd)
pm2 restart gateway
```

The gateway service will now advertise itself on the network via mDNS (Bonjour/Zeroconf) as a service of type `_eform._tcp`.

### 2. Verify the Discovery Endpoint

You can verify that the endpoint is working by making a `GET` request to `http://<main-server-ip>:3000/discover`. You should see a response like this, including a unique token:

```json
{
  "role": "main-server",
  "kioskPort": 3002,
  "gatewayPort": 3000,
  "name": "eform",
  "ts": "2025-09-12T15:14:00.000Z",
  "token": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

## Kiosk Thin Client Setup

Each kiosk thin client needs to be configured with the discovery script and systemd service.

### 1. Install the Kiosk Launcher

On each kiosk, run the installer script. This will install the necessary dependencies, set up the offline screen, and install the systemd service.

```bash
cd /path/to/eform-locker
sudo bash scripts/kiosk-launch/install.sh
```

The installer will:
- Install `python3-pip`, `python3-venv`, `chromium-browser`, `unclutter`, `avahi-daemon`, `libnss-mdns`, and `procps`.
- Create a Python virtual environment at `/home/pi/eform-locker/scripts/kiosk-launch/venv`.
- Install the Python dependencies `requests` and `zeroconf` into the virtual environment.
- Enable and start the `avahi-daemon` service.
- Copy the offline screen to `/usr/share/kiosk-offline/`.
- Create a default `/etc/kiosk.conf` if one doesn't exist.
- Install the `kiosk-launch.service` to `/etc/systemd/system/`.
- Enable and start the service.

### 2. Configure the Kiosk Zone

After running the installer, you need to set the correct zone for each kiosk. Edit the `/etc/kiosk.conf` file:

```bash
sudo nano /etc/kiosk.conf
```

Change the `ZONE` value to the desired zone for that kiosk, for example:

```
ZONE=womens
```

Save the file and exit. The kiosk launcher will automatically pick up the new zone.

### 3. Verify the Kiosk

After installation and configuration, the kiosk should automatically launch Chromium in kiosk mode.

- If the server is found, it will open `http://<main-server-ip>:<kioskPort>/?zone=<ZONE>`.
- If the server is not found, it will display the "Waiting for Server" offline screen.

You can check the logs of the kiosk launcher service to see the discovery process:

```bash
journalctl -u kiosk-launch.service -f
```

## Subnet Scanning

The kiosk discovery script uses mDNS (Zeroconf/Bonjour) as its primary discovery method. If mDNS fails, it will fall back to scanning the local network.

- The script assumes a `/24` subnet (e.g., `192.168.1.0/24`).
- Scanning a `/24` subnet is fast, but scanning larger subnets (e.g., `/16`) can be very slow.
- If your network uses a different subnet structure, you can set the `DISCOVERY_SUBNET` environment variable for the `kiosk-launch.service`. However, this feature is not fully implemented yet.
- For best results, ensure that mDNS is enabled on your network and that the main server and kiosks are on the same VLAN.

## Troubleshooting

- **Chromium doesn't launch:**
  - Check the logs: `journalctl -u kiosk-launch.service -f`
  - Make sure the `pi` user can run Chromium.
  - Ensure `unclutter` is installed to hide the mouse cursor.

- **Kiosk shows offline screen:**
  - Verify that the main server is running and accessible from the kiosk.
  - Check that the `/discover` endpoint is working correctly.
  - Use `avahi-browse -rt _eform._tcp` on the kiosk to see if it can discover the server via mDNS.
  - Make sure the kiosk and the main server are on the same subnet.
  - Check the kiosk launcher logs for any errors.

- **Wrong zone is displayed:**
  - Double-check the `ZONE` value in `/etc/kiosk.conf`.
  - Restart the `kiosk-launch` service after changing the config: `sudo systemctl restart kiosk-launch.service`.
