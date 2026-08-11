#!/usr/bin/env bash
# Install the daily maintenance job and its systemd timer.
# Run with: sudo bash scripts/install-daily-server-maintenance.sh
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo 'Please run this installer with sudo.' >&2
  exit 1
fi

install -d -m 0755 /var/lib/daily-server-maintenance

install -m 0750 /dev/stdin /usr/local/sbin/daily-server-maintenance <<'MAINTENANCE_SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

readonly LOG_FILE=/var/log/daily-server-maintenance.log
readonly STATE_DIR=/var/lib/daily-server-maintenance
readonly LOCK_FILE=/run/lock/daily-server-maintenance.lock

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date --iso-8601=seconds) maintenance already running; skipped"
  exit 0
fi

exec >>"$LOG_FILE" 2>&1
echo "$(date --iso-8601=seconds) daily maintenance started"

for unit in monit docker xrdp; do
  if systemctl is-active --quiet "$unit"; then
    echo "service $unit: active"
  else
    echo "WARNING: service $unit is not active"
  fi
done

df -h /
free -h
swapon --show

apt-get -o Dpkg::Lock::Timeout=900 update
apt-get -o Dpkg::Lock::Timeout=900 -y \
  -o Dpkg::Options::=--force-confold \
  upgrade

date --iso-8601=seconds >"$STATE_DIR/last-success.txt"
echo "$(date --iso-8601=seconds) package update completed"

if [[ -f /var/run/reboot-required ]]; then
  now_epoch=$(date +%s)
  four_am_epoch=$(date -d 'today 04:00' +%s)

  if (( now_epoch < four_am_epoch )); then
    reboot_at=04:00
  else
    reboot_at=+5
  fi

  echo "$(date --iso-8601=seconds) reboot required; scheduling reboot at $reboot_at"
  /usr/sbin/shutdown -r "$reboot_at" 'Daily maintenance installed updates that require a reboot.'
else
  echo "$(date --iso-8601=seconds) no reboot required"
fi

echo "$(date --iso-8601=seconds) daily maintenance finished"
MAINTENANCE_SCRIPT

install -m 0644 /dev/stdin /etc/systemd/system/daily-server-maintenance.service <<'SERVICE_UNIT'
[Unit]
Description=Daily server maintenance and package updates
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/daily-server-maintenance
SERVICE_UNIT

install -m 0644 /dev/stdin /etc/systemd/system/daily-server-maintenance.timer <<'TIMER_UNIT'
[Unit]
Description=Run daily server maintenance at 03:30

[Timer]
OnCalendar=*-*-* 03:30:00
AccuracySec=1min
Persistent=false
Unit=daily-server-maintenance.service

[Install]
WantedBy=timers.target
TIMER_UNIT

systemctl daemon-reload
systemctl enable --now daily-server-maintenance.timer
systemctl status daily-server-maintenance.timer --no-pager
systemctl list-timers daily-server-maintenance.timer --all --no-pager
