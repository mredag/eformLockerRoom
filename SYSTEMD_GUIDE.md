# eForm Locker Systemd Service Guide

This guide explains how to check the status and logs of the eForm Locker application services, which are managed by `systemd`.

## Checking Service Status

To check the real-time status of the main application service, use the following command:

```bash
sudo systemctl status eform-locker.service
```

**Example Output (Running Correctly):**
```
● eform-locker.service - eForm Locker - Main Application Service
     Loaded: loaded (/etc/systemd/system/eform-locker.service; enabled; vendor preset: enabled)
     Active: active (running) since Tue 2025-09-11 13:00:00 UTC; 5min ago
   Main PID: 1234 (bash)
      Tasks: 15 (limit: 4915)
     Memory: 150.0M
     CGroup: /system.slice/eform-locker.service
             ├─1234 /bin/bash /home/pi/eform-locker/scripts/deployment/startup-services-systemd.sh
             ├─1235 node /home/pi/eform-locker/app/gateway/dist/index.js
             ├─1236 node /home/pi/eform-locker/app/kiosk/dist/index.js
             └─1237 node /home/pi/eform-locker/app/panel/dist/index.js
```
- `Active: active (running)` means the service is currently running.
- `loaded (...; enabled; ...)` means the service is configured to start automatically on boot.

**Example Output (Failed):**
```
● eform-locker.service - eForm Locker - Main Application Service
     Loaded: loaded (/etc/systemd/system/eform-locker.service; enabled; vendor preset: enabled)
     Active: failed (Result: exit-code) since Tue 2025-09-11 13:05:00 UTC; 1s ago
    Process: 1234 ExecStart=/bin/bash ... (code=exited, status=1/FAILURE)
   Main PID: 1234 (code=exited, status=1/FAILURE)
```
- `Active: failed` means the service tried to start but could not. See the "Viewing Logs" section below to diagnose the problem.

## Checking if a Service Starts on Boot

To quickly check if the service is enabled to start automatically when the Raspberry Pi boots up, use:

```bash
sudo systemctl is-enabled eform-locker.service
```

**Example Output:**
```
enabled
```
- If it returns `enabled`, it will start on boot.
- If it returns `disabled`, it will not start on boot.

## Viewing Logs

`systemd` captures all console output from the service, which is very useful for debugging. To view the logs for the eForm Locker application, use `journalctl`.

**View the latest logs:**
```bash
sudo journalctl -u eform-locker.service
```

**Follow the logs in real-time (like `tail -f`):**
```bash
sudo journalctl -u eform-locker.service -f
```

**View the last 100 lines of logs:**
```bash
sudo journalctl -u eform-locker.service -n 100
```

---

You can use these same commands for the other services (`eform-hardware-init.service` and `eform-monitor.service`) by replacing `eform-locker.service` with the service name you wish to inspect.
