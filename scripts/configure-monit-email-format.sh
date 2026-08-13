#!/usr/bin/env bash
# Install a Chinese, action-oriented template for Monit alert emails.
# Run with: sudo bash scripts/configure-monit-email-format.sh
set -Eeuo pipefail

readonly CONFIG_FILE=/etc/monit/conf-available/15-mail-format
readonly ENABLED_FILE=/etc/monit/conf-enabled/15-mail-format

usage() {
  cat <<'USAGE'
Usage: sudo bash scripts/configure-monit-email-format.sh [--dry-run]

Installs a Chinese Monit mail template without reading or changing the SMTP,
sender, or alert-recipient configuration. --dry-run prints the configuration
that would be installed and makes no system changes.
USAGE
}

render_config() {
  cat <<'MONIT_CONFIG'
# Chinese, action-oriented Monit alert email template.
# Managed by scripts/configure-monit-email-format.sh.
set mail-format {
    subject: 【系統監控通知】$HOST｜$SERVICE｜$EVENT
    message: Monit 系統監控通知

監控項目：$SERVICE
事件狀態：$EVENT
發生時間：$DATE
主機名稱：$HOST
已採取動作：$ACTION

事件詳情：
$DESCRIPTION

建議處理方式：
1. 先確認服務或主機目前是否已恢復。
2. 若問題仍存在，查看 Monit 與系統日誌以確認原因。
3. 處理完成後保留事件紀錄，供後續追蹤。

這是 Monit 自動通知，請勿直接回覆。
}
MONIT_CONFIG
}

dry_run=false
case "${1:-}" in
  "") ;;
  --dry-run) dry_run=true ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if "$dry_run"; then
  render_config
  exit 0
fi

if (( EUID != 0 )); then
  exec sudo -- "$0"
fi

if ! command -v monit >/dev/null 2>&1; then
  echo "找不到 monit 指令，未做任何變更。" >&2
  exit 1
fi

if [[ ! -d /etc/monit/conf-available || ! -d /etc/monit/conf-enabled ]]; then
  echo "找不到 Debian/Ubuntu 預期的 Monit 設定目錄，未做任何變更。" >&2
  exit 1
fi

if [[ -e "$ENABLED_FILE" && ! -L "$ENABLED_FILE" ]]; then
  echo "$ENABLED_FILE 已存在但不是符號連結，為避免覆寫而中止。" >&2
  exit 1
fi

backup_file=""
previous_link_target=""
created_link=false

restore_previous_configuration() {
  if [[ -n "$backup_file" ]]; then
    install -m 0600 "$backup_file" "$CONFIG_FILE"
  else
    rm -f -- "$CONFIG_FILE"
  fi

  if [[ -n "$previous_link_target" ]]; then
    ln -sfn -- "$previous_link_target" "$ENABLED_FILE"
  elif "$created_link"; then
    rm -f -- "$ENABLED_FILE"
  fi
}

if [[ -e "$CONFIG_FILE" ]]; then
  backup_file="${CONFIG_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  install -m 0600 "$CONFIG_FILE" "$backup_file"
fi

if [[ -L "$ENABLED_FILE" ]]; then
  previous_link_target=$(readlink -- "$ENABLED_FILE")
else
  created_link=true
fi

render_config | install -m 0600 /dev/stdin "$CONFIG_FILE"
ln -sfn /etc/monit/conf-available/15-mail-format "$ENABLED_FILE"

if ! monit -t; then
  restore_previous_configuration
  echo "Monit 語法驗證失敗；已還原原本的郵件格式設定，服務未重啟。" >&2
  exit 1
fi

if ! systemctl restart monit; then
  restore_previous_configuration
  monit -t >&2 || true
  systemctl restart monit >&2 || true
  echo "Monit 無法重新啟動；已還原原本的郵件格式設定。" >&2
  exit 1
fi

echo "已套用中文 Monit 郵件格式並重新啟動服務。"
echo "SMTP、寄件者與收件人設定均未變更。"
if [[ -n "$backup_file" ]]; then
  echo "舊格式備份：$backup_file"
fi
