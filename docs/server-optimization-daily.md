# 每日伺服器維護排程

本檔是每日檢查與處理順序。每日維護工作會自動安裝一般套件更新，但不會刪除資料；只有系統建立 `/var/run/reboot-required` 時才會安排重開機。其他修正動作都必須先確認影響與備份。

## 已在背景執行的工作

| 工作 | 頻率 | 目前狀態 |
| --- | --- | --- |
| Monit 主機與服務健康監控、Gmail 告警 | 持續 | 啟用 |
| Ubuntu 安全更新 | 每日 | `unattended-upgrades` 啟用 |
| Docker 未使用映像與建置快取清理 | 每週日 04:30 | 使用者 systemd timer 啟用 |
| systemd journal 容量與保留期限制 | 持續 | 上限 500 MiB、保留 14 天 |
| 系統套件檢查與安全常規更新 | 每日 03:30 | `daily-server-maintenance.timer`；必要時於 04:00 重開機 |

## 每日檢查（建議 09:00）

```bash
systemctl is-active monit docker xrdp
df -h /
free -h
swapon --show
sudo journalctl -p warning..alert --since yesterday --no-pager
```

判讀與處理原則：

- `monit`、`docker` 或 `xrdp` 未為 `active`：先查看服務日誌；不要直接重啟。
- 根目錄使用率超過 70%：盤點 Docker 映像、快取、日誌與備份；刪除前逐項確認。
- swap 超過 90% 或 Monit 來信：記錄當下的記憶體排行與 `vmstat`；不要直接執行 `swapoff`。
- 出現新的 warning 或 alert：先判斷是否為舊事件、已知設定訊息或真正故障。

## 每週檢查（週一）

```bash
systemctl --user list-timers docker-prune.timer --all
docker system df
sudo du -sh /var/log/journal /var/lib/docker 2>/dev/null
```

- 確認 Docker 清理排程上次執行成功。
- 只清理已確認未使用的 Docker 資源；匿名 volume 一律先盤點內容。
- 檢查 Rocket、Immich 等服務的備份是否在預期時間更新。

## 每月檢查（每月第一個週一）

```bash
sudo smartctl -H /dev/sda
sudo smartctl -H /dev/sdb
apt list --upgradable
```

- 確認 SMART 健康狀態；若 SATA CRC 錯誤計數增加，檢查線材與接頭。
- 檢查更新與是否需要安排維護時段重開機。
- 抽查至少一份備份是否可讀取；每季進行一次實際還原演練。
- 檢查公開埠、Tailscale 限制與 Caddy 路由是否仍符合目前服務。

## 尚待處理的優化項目

1. 盤點並驗證所有應用程式與資料庫備份。
2. 為主機建立 DHCP 保留位址後，將 Immich 與 Jellyfin 僅綁定 LAN IP。
3. 為 Rocket 建立網域與 Caddy HTTPS 路由，再關閉直接對外的 3000 埠。
4. 將實體記憶體升級至至少 8 GiB，建議 16 GiB。
5. 決定重新部署 Nextcloud 或暫時移除失效的 Caddy 路由。
