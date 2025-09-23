#!/bin/bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This installer must be run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/portable-kiosk"
KIOSK_USER="${KIOSK_USER:-pi}"
SERVICE_NAME="portable-kiosk.service"
CONFIG_DIR="/var/lib/portable-kiosk"

APT_PACKAGES=(
  python3
  python3-venv
  chromium-browser
  unclutter
  matchbox-window-manager
  xserver-xorg
  xinit
  x11-xserver-utils
  libinput-bin
  qml-module-qtquick-virtualkeyboard
  fonts-dejavu
)

apt-get update
apt-get install -y "${APT_PACKAGES[@]}"

optimize_for_pi5() {
  if [[ -r /proc/device-tree/model ]] && grep -q "Raspberry Pi 5" /proc/device-tree/model; then
    echo "Raspberry Pi 5 detected. Applying kiosk optimisations."
    if command -v raspi-config >/dev/null 2>&1; then
      raspi-config nonint do_memory_split 256 || true
    fi

    local config_file="/boot/firmware/config.txt"
    [[ -f /boot/config.txt ]] && config_file="/boot/config.txt"

    if [[ -f "${config_file}" ]]; then
      if grep -qE "^[#[:space:]]*dtoverlay=vc4-kms-v3d" "${config_file}"; then
        sed -i -E "s/^[#[:space:]]*dtoverlay=vc4-kms-v3d.*/dtoverlay=vc4-kms-v3d/" "${config_file}"
      else
        echo "dtoverlay=vc4-kms-v3d" >> "${config_file}"
      fi
      if grep -qE "^[#[:space:]]*gpu_mem=" "${config_file}"; then
        sed -i -E "s/^[#[:space:]]*gpu_mem=.*/gpu_mem=256/" "${config_file}"
      else
        echo "gpu_mem=256" >> "${config_file}"
      fi
      if ! grep -q "# Portable kiosk touch tuning" "${config_file}"; then
        cat >> "${config_file}" <<'EOF'
# Portable kiosk touch tuning
disable_overscan=1
EOF
      fi
    fi
  fi
}

optimize_for_pi5

disable_service() {
  local service="$1"
  if systemctl list-unit-files | grep -Fq "${service}"; then
    systemctl disable --now "${service}" >/dev/null 2>&1 || true
    echo "Disabled service: ${service}"
  else
    echo "Service ${service} not present; skipping."
  fi
}

configure_sshd() {
  local sshd_config="/etc/ssh/sshd_config"
  [[ -f "${sshd_config}" ]] || return

  declare -A options=(
    ["PasswordAuthentication"]="yes"
    ["PubkeyAuthentication"]="no"
    ["UsePAM"]="yes"
  )

  for key in "${!options[@]}"; do
    local value="${options[${key}]}"
    if grep -qiE "^[#[:space:]]*${key}" "${sshd_config}"; then
      sed -i -E "s/^[#[:space:]]*${key}.*/${key} ${value}/I" "${sshd_config}"
    else
      echo "${key} ${value}" >> "${sshd_config}"
    fi
  done

  systemctl restart ssh || true
}

for svc in \
  bluetooth.service \
  hciuart.service \
  triggerhappy.service \
  avahi-daemon.service
do
  disable_service "${svc}"
done

configure_sshd

mkdir -p "${INSTALL_DIR}"
rsync -a --delete "${SCRIPT_DIR}/" "${INSTALL_DIR}/"

python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
if [[ -f "${INSTALL_DIR}/requirements.txt" ]]; then
  "${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt"
fi

mkdir -p "${CONFIG_DIR}"
chown -R "${KIOSK_USER}:${KIOSK_USER}" "${CONFIG_DIR}" "${INSTALL_DIR}"

SERVICE_TEMPLATE="${INSTALL_DIR}/portable-kiosk.service.template"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
sed -e "s#@INSTALL_DIR@#${INSTALL_DIR}#g" \
    -e "s#@KIOSK_USER@#${KIOSK_USER}#g" \
    "${SERVICE_TEMPLATE}" > "${SERVICE_PATH}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "Installation complete. The kiosk launcher service is active."
echo "Use 'journalctl -u ${SERVICE_NAME} -f' to monitor logs."
