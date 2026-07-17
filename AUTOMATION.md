# AUTOMATION.md - Home Assistant Integration

## Overview
Execute `submit-readings.js` from Home Assistant via SSH to a Linux box. "Set and forget" approach with simple restart recovery.

## Architecture
```
Home Assistant (sensors: meter_1, meter_2)
    ↓ (monthly automation, 1st-7th, weekdays)
    ↓ (reads entity values)
    ↓ (shell_command via SSH)
Linux Box (user@box)
    ↓ (ha-submit.sh → PLAYWRIGHT_BROWSER + PLAYWRIGHT_EXECUTABLE_PATH)
    ↓ (node submit-readings.js <v1> <v2>)
    ↓ (Playwright headless: bundled Chromium on x86_64/arm64,
    ↓            system chromium-browser on armv7l via executablePath)
sofiyskavoda.bg (form submission)
```

## Step 1: Linux Box Setup

Follow the installation instructions in [README.md](README.md).

## Step 2: SSH Key Setup (Passwordless Auth)

### 2.1 Generate key on Home Assistant
```bash
# From HA terminal add-on:
ssh-keygen -t ed25519 -f /config/.ssh/sofiyskavoda_key -N ""
```

### 2.2 Copy public key to Linux box
```bash
ssh-copy-id -i /config/.ssh/sofiyskavoda_key.pub user@linux-box-ip
```

### 2.3 Test SSH from HA
```bash
ssh -i /config/.ssh/sofiyskavoda_key -o StrictHostKeyChecking=no user@linux-box-ip \
  "/opt/sofiyskavoda/ha-submit.sh 123 456"
```

## Step 3: Home Assistant Configuration

### 3.1 Add to `configuration.yaml`
```yaml
shell_command:
  submit_water_readings: >
    ssh -i /config/.ssh/sofiyskavoda_key
    -o StrictHostKeyChecking=no
    -o ConnectTimeout=30
    -o UserKnownHostsFile=/dev/null
    user@LINUX_BOX_IP
    "/opt/sofiyskavoda/ha-submit.sh {{ meter1 }} {{ meter2 }}"
```

### 3.2 Create helper for tracking submission state
```yaml
# In configuration.yaml
input_boolean:
  water_readings_submitted:
    name: "Water Readings Submitted"
    initial: off
```

### 3.3 Create automation in `automations.yaml` or via GUI
Use the [yaml example](example_ha_automation.yaml). 

## Step 4: Maintenance (Set and Forget)

### 4.1 Log rotation on Linux box
```bash
# Add to crontab
0 0 1 * * echo "" > /var/log/sofiyskavoda.log
```
### 4.2 Monitor logs
```bash
tail -f /var/log/sofiyskavoda.log
```
