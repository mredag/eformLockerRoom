# Portable Kiosk Launcher

This folder packages a self-contained launcher that installs and configures the kiosk in one run. The launcher stores the kiosk zone, discovers or prompts for the server address, and launches Chromium in kiosk mode once the Raspberry Pi backend responds to a single ping.

## Contents

- `portable_launcher.py` – Runtime entry point. Pings the server once, launches Chromium with touch support enabled, and provides a built-in (Turkish) manual setup page if discovery fails.
- `install.sh` – Root installer that copies the folder to `/opt/portable-kiosk`, creates a virtual environment, installs system dependencies, applies Raspberry Pi 5 performance tuning, and provisions the `portable-kiosk.service` unit.
- `portable-kiosk.service.template` – Template used by the installer to create the systemd service file.
- `requirements.txt` – Placeholder for future Python dependencies.

## Installation

Run the installer on the kiosk computer as `root`:

```bash
sudo bash install.sh
```

Optional environment variables:

- `KIOSK_USER` – Unix account that should own the kiosk files and run the service (defaults to `pi`).

The installer additionally hardens the Raspberry Pi kiosk profile by:

- Enabling Chromium's touchscreen mode for kiosk launches.
- Installing the windowing and touch stack required for the Raspberry Pi 5 touchscreen experience (`matchbox-window-manager`, `xserver-xorg`, `xinit`, `x11-xserver-utils`, `libinput-bin`, `qml-module-qtquick-virtualkeyboard`, `fonts-dejavu`).
- Optimising Raspberry Pi 5 graphics by enabling the KMS overlay driver, increasing GPU memory to 256MB, and disabling overscan on first run.
- Disabling unused background services (`bluetooth.service`, `hciuart.service`, `triggerhappy.service`, `avahi-daemon.service`) so the device can run for years with minimal interruptions.
- Enforcing the requested SSH policy (`PasswordAuthentication yes`, `PubkeyAuthentication no`, `UsePAM yes`).

The installer will:

1. Install system dependencies (`python3`, `python3-venv`, `chromium-browser`, `unclutter`, `matchbox-window-manager`, `xserver-xorg`, `xinit`, `x11-xserver-utils`, `libinput-bin`, `qml-module-qtquick-virtualkeyboard`, `fonts-dejavu`).
2. Copy this folder to `/opt/portable-kiosk`.
3. Create a Python virtual environment and install the listed requirements.
4. Create `/var/lib/portable-kiosk` to hold the persisted configuration.
5. Generate and enable the `portable-kiosk.service` systemd unit.

## First Run & Manual Setup

When the service starts, it loads the saved configuration. If the kiosk zone or server URL is missing—or if the server does not respond to the initial ping—the launcher starts a local setup server at `http://localhost:8137/setup` and opens it in Chromium.

The setup page collects:

- **Sunucu Adresi** – e.g. `http://192.168.1.15:3002`
- **Bölge** – e.g. `mens`

Once saved, these values are written to `/var/lib/portable-kiosk/config.json`. On subsequent launches the service pings the stored server once, appends the zone to the kiosk URL, and launches Chromium in kiosk mode without additional prompts.

Touchscreen kiosks launch Chromium with touch gestures enabled, the on-screen Turkish keyboard module (`QT_IM_MODULE=qtvirtualkeyboard`), and Wayland/GL acceleration flags so staff can complete configuration without external peripherals.

## Managing the Service

```bash
sudo systemctl status portable-kiosk.service
sudo journalctl -u portable-kiosk.service -f
```

To remove the service:

```bash
sudo systemctl disable --now portable-kiosk.service
sudo rm -rf /opt/portable-kiosk /var/lib/portable-kiosk
sudo rm /etc/systemd/system/portable-kiosk.service
sudo systemctl daemon-reload
```
