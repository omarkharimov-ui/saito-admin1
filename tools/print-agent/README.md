# Saito LAN Print Agent (pr v1)

Zero-dependency Node.js agent that prints Saito's **Network (ESC/POS)**
print jobs from a machine on the restaurant LAN.

- Claims jobs **only for its own device** (one-time 48-hex agent key).
- Heartbeats the device (`online` / `last seen` in Settings → Print Devices).
- Raw TCP ESC/POS (default port 9100) — 80mm (42 col) / 58mm (32 col).
- Prints receipt, kitchen ticket and label jobs with the configured copies.
- Failure → job marked `failed` + device `last_error` shown in Settings.

## Run

```bash
export SAITO_BASE_URL="http://<admin-server-host>:3000"
export SAITO_DEVICE_KEY="<agent key — shown ONCE at device creation>"
node print-agent.mjs
```

Optional: `POLL_INTERVAL_MS` (default 4000).

### autostart (macOS launchd / Linux systemd / Windows Task Scheduler)

Run it on the kitchen PC / any always-on box that can reach the printer IP.

## Key rotation

Settings → Print Devices → rotate key on the device → re-export the new key
and restart the agent. The old key stops working immediately.
