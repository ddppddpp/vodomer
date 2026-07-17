#!/bin/bash
# Sofiyskavoda Automation - Linux Box Setup
# Usage: bash install.sh
# Target: Linux (Ubuntu/Debian/Raspbian)

set -euo pipefail

APP_DIR="/opt/sofiyskavoda"
LOG_FILE="/var/log/sofiyskavoda.log"
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo " Sofiyskavoda Automation Setup"
echo " Target: $APP_DIR"
echo "========================================"
echo ""

# --- Architecture detection ---
ARCH=$(uname -m)
echo "Architecture: $ARCH"

# --- Node.js ---
install_nodejs_armv7l() {
  local NODE_VERSION="22.14.0"
  local NODE_DIR="node-v${NODE_VERSION}-linux-armv7l"
  local NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.tar.xz"
  echo "Downloading Node.js v${NODE_VERSION} for 32-bit ARM..."
  curl -fsSL "$NODE_URL" -o /tmp/node.tar.xz || {
    echo "ERROR: Failed to download Node.js from $NODE_URL"
    exit 1
  }
  echo "Extracting to /opt/${NODE_DIR}..."
  sudo tar -xJf /tmp/node.tar.xz -C /opt/
  echo "Installing symlinks..."
  sudo ln -sf "/opt/${NODE_DIR}/bin/node" /usr/local/bin/node
  sudo ln -sf "/opt/${NODE_DIR}/bin/npm" /usr/local/bin/npm
  sudo ln -sf "/opt/${NODE_DIR}/bin/npx" /usr/local/bin/npx
  rm /tmp/node.tar.xz
  echo "[OK] Node.js $(node -v) installed"
}

if ! command -v node &>/dev/null; then
  case "$ARCH" in
    armv7l|armhf)
      install_nodejs_armv7l
      ;;
    *)
      echo "ERROR: node is not installed."
      echo "Install Node.js first:"
      echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -"
      echo "  sudo apt install -y nodejs"
      exit 1
      ;;
  esac
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
echo "Node.js $(node -v)"

if [ "$NODE_MAJOR" -lt 16 ]; then
  case "$ARCH" in
    armv7l|armhf)
      install_nodejs_armv7l
      NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
      ;;
    *)
      echo "ERROR: Node.js >= 16 required, found v$(node -v)."
      echo ""
      echo "Upgrade Node.js:"
      echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -"
      echo "  sudo apt install -y nodejs"
      exit 1
      ;;
  esac
fi

if [ "$NODE_MAJOR" -lt 16 ]; then
  echo "ERROR: Node.js $(node -v) still < 16 after upgrade attempt."
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "ERROR: npm is not installed."
  exit 1
fi
echo "[OK] npm $(npm -v)"

# Playwright distributes Chromium only for x86_64 and aarch64 (64-bit ARM)
# On 32-bit ARM (armv7l) Chromium is not available.
BROWSER="chromium"
BROWSER_ARGS=""
BROWSER_EXECUTABLE=""

case "$ARCH" in
  x86_64|amd64)
    # Full support — no changes needed
    ;;
  aarch64|arm64)
    # 64-bit ARM — Chromium available
    ;;
  armv7l|armhf)
    echo ""
    echo "WARNING: 32-bit ARM detected. Playwright has no browser binaries"
    echo "for this architecture. The script will install system chromium-browser"
    echo "via apt and configure Playwright to use it via executablePath."
    echo ""
    BROWSER="chromium"
    BROWSER_EXECUTABLE="/usr/bin/chromium-browser"
    ;;
  *)
    echo ""
    echo "WARNING: Unsupported architecture '$ARCH'."
    echo "Playwright browsers may not be available."
    BROWSER=""
    ;;
esac

# --- Create app directory ---
echo ""
echo "--- Directory ---"
if [ ! -d "$APP_DIR" ]; then
  echo "Creating $APP_DIR..."
  if ! mkdir -p "$APP_DIR" 2>/dev/null; then
    echo "--> Need sudo to create $APP_DIR"
    sudo mkdir -p "$APP_DIR"
    sudo chown "$(whoami):$(id -gn)" "$APP_DIR"
  fi
  echo "[OK] Directory created"
else
  echo "[OK] $APP_DIR already exists"
fi

# --- Copy files ---
echo ""
echo "--- Copying files ---"

if [ -f "$SCRIPT_SRC/submit-readings.js" ]; then
  cp "$SCRIPT_SRC/submit-readings.js" "$APP_DIR/"
  chmod +x "$APP_DIR/submit-readings.js"
  echo "[OK] submit-readings.js"
else
  echo "WARNING: submit-readings.js not found next to install.sh"
fi

if [ -f "$SCRIPT_SRC/.env" ]; then
  cp "$SCRIPT_SRC/.env" "$APP_DIR/"
  chmod 600 "$APP_DIR/.env"
  echo "[OK] .env (permissions set to 600)"
  echo "     IMPORTANT: .env contains credentials — keep it secure!"
else
  echo "WARNING: .env not found next to install.sh"
  echo "         See .env-example for a template."
  echo "         Create $APP_DIR/.env manually or set env vars on the HA side."
fi

# --- Install Playwright ---
echo ""
echo "--- Installing Playwright ---"

cd "$APP_DIR"

if [ -d "node_modules/playwright" ]; then
  echo "[OK] Playwright already installed"
else
  echo "Installing playwright (npm install)..."
  npm install playwright
  echo "[OK] Playwright installed"
fi

if [ -n "$BROWSER_EXECUTABLE" ]; then
  echo ""
  echo "Installing system browser at $BROWSER_EXECUTABLE..."
  if command -v apt &>/dev/null; then
    sudo apt install -y chromium-browser
    echo "[OK] system chromium-browser installed"
  else
    echo "WARNING: apt not found. Install chromium-browser manually:"
    echo "  sudo apt install -y chromium-browser"
  fi
elif [ -n "$BROWSER" ]; then
  echo ""
  echo "Installing $BROWSER browser..."

  # Retry logic for browser install: try normal, fall back with sudo
  if npx playwright install "$BROWSER" 2>/dev/null; then
    echo "[OK] $BROWSER installed"
  else
    echo "--> Normal install failed. Retrying with system dependencies..."
    echo "    (may prompt for sudo)"
    cd "$APP_DIR" && sudo -E npx playwright install "$BROWSER" --with-deps
    echo "[OK] $BROWSER installed with system dependencies"
  fi
else
  echo ""
  echo "SKIPPING browser install — unsupported architecture $ARCH."
  echo "Install a browser manually and update submit-readings.js"
fi

# --- Create wrapper script ---
echo ""
echo "--- Creating wrapper script ---"

cat > "$APP_DIR/ha-submit.sh" << WRAPPER
#!/bin/bash
# Sofiyskavoda submission wrapper
# Usage: ./ha-submit.sh <reading1> <reading2>

cd /opt/sofiyskavoda
LOG="/var/log/sofiyskavoda.log"

export PLAYWRIGHT_BROWSER="${BROWSER}"
export PLAYWRIGHT_EXECUTABLE_PATH="${BROWSER_EXECUTABLE}"

echo "[\$(date)] Starting: meter1=\$1 meter2=\$2" >> "\$LOG"
node submit-readings.js "\$1" "\$2" >> "\$LOG" 2>&1
EXIT_CODE=\$?
echo "[\$(date)] Complete (exit: \$EXIT_CODE)" >> "\$LOG"

if [ \$EXIT_CODE -eq 0 ]; then
  printf '{"status":"success","meter1":"%s","meter2":"%s"}\n' "\$1" "\$2"
else
  LAST_LOG=\$(tail -1 "\$LOG" 2>/dev/null || echo "")
  printf '{"status":"failed","exit_code":%s,"last_log_entry":"%s"}\n' "\$EXIT_CODE" "\$LAST_LOG"
fi
exit \$EXIT_CODE
WRAPPER

chmod +x "$APP_DIR/ha-submit.sh"
echo "[OK] $APP_DIR/ha-submit.sh"

# --- Set up log file ---
echo ""
echo "--- Log file ---"

if [ ! -f "$LOG_FILE" ]; then
  if touch "$LOG_FILE" 2>/dev/null; then
    echo "[OK] $LOG_FILE created"
  else
    echo "--> Need sudo to create $LOG_FILE"
    sudo touch "$LOG_FILE"
    sudo chmod 644 "$LOG_FILE"
    echo "[OK] $LOG_FILE created with sudo"
  fi
else
  echo "[OK] $LOG_FILE already exists"
fi

# --- Verify ---
echo ""
echo "--- Verification ---"

MISSING=""
[ -f "$APP_DIR/submit-readings.js" ] || MISSING="$MISSING submit-readings.js"
[ -f "$APP_DIR/ha-submit.sh" ]        || MISSING="$MISSING ha-submit.sh"
[ -d "$APP_DIR/node_modules/playwright" ] || echo "[WARN] playwright not in node_modules (run npm install)"

if [ -z "$MISSING" ]; then
  echo "[OK] Core files in place"
else
  echo "WARNING: Missing files:$MISSING"
fi

echo ""
echo "========================================"
echo " Setup complete!"
echo "========================================"
echo ""
echo "  App directory: $APP_DIR"
echo "  Log file:      $LOG_FILE"
echo "  Browser:       ${BROWSER:-none (manual)}${BROWSER_EXECUTABLE:+ ($BROWSER_EXECUTABLE)}"
echo ""
echo "  Test with:"
echo "    $APP_DIR/ha-submit.sh 123 456"
echo ""
echo "  Then check the log:"
echo "    tail -f $LOG_FILE"
echo ""
echo "  Next steps (manual):"
echo "    1. Set up SSH key on Home Assistant"
echo "    2. Copy public key to this box"
echo "    3. Configure HA automation (see AUTOMATION.md)"
echo ""
if [ -n "$BROWSER_EXECUTABLE" ]; then
  echo "  NOTE: System $BROWSER at $BROWSER_EXECUTABLE was installed instead of"
  echo "        Playwright's bundled browser. submit-readings.js will use it"
  echo "        via PLAYWRIGHT_EXECUTABLE_PATH env var."
  echo ""
fi
