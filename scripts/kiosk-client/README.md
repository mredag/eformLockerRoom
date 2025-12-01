# Kiosk Client

Touchscreen kiosk client for Raspberry Pi. Auto-connects to eForm Locker server with offline detection and USB touchscreen recovery.

## Quick Install

```bash
# On Raspberry Pi (as root)
curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/kiosk-client/install.sh | sudo bash
```

Or manually:

```bash
# Copy folder to Pi
scp -r scripts/kiosk-client pi@<PI_IP>:/home/pi/

# SSH to Pi and install
ssh pi@<PI_IP>
cd /home/pi/kiosk-client
sudo bash install.sh
```

## Features

- 🖥️ **Setup Wizard** - Turkish UI for first-time configuration
- 📡 **Offline Detection** - Shows "Sunucu Çevrimdışı" when server is down
- 🔄 **Auto-Reconnect** - Automatically reconnects when server comes back
- 👆 **Touch Recovery** - Monitors USB touchscreen and auto-resets on failure
- 🚀 **Auto-Start** - Launches on boot via systemd

## After Install

1. Pi reboots and shows setup wizard
2. Enter server URL (e.g., `http://192.168.1.15:3002/?zone=mens`)
3. Click "Kurulumu Tamamla"
4. Pi reboots and opens kiosk automatically

## Management

```bash
# Service status
sudo systemctl status portable-kiosk

# View logs
sudo journalctl -u portable-kiosk -f

# Restart
sudo systemctl restart portable-kiosk

# Reset config (re-run setup)
sudo rm /var/lib/portable-kiosk/config.json
sudo systemctl restart portable-kiosk
```
