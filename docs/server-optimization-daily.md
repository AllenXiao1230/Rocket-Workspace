# 每日伺服器維護排程

本檔是每日檢查與處理順序。每日維護工作會自動安裝一般套件更新，但不會刪除資料；只有系統建立 `/var/run/reboot-required` 時才會安排重開機。其他修正動作都必須先確認影響與備份。

## 已在背景執行的工作

| 工作                                 | 頻率         | 目前狀態                                                |
| ------------------------------------ | ------------ | ------------------------------------------------------- |
| Monit 主機與服務健康監控、Gmail 告警 | 持續         | 啟用                                                    |
| Ubuntu 安全更新                      | 每日         | `unattended-upgrades` 啟用                              |
| Docker 未使用映像與建置快取清理      | 每週日 04:30 | 使用者 systemd timer 啟用                               |
| systemd journal 容量與保留期限制     | 持續         | 上限 500 MiB、保留 14 天                                |
| 系統套件檢查與安全常規更新           | 每日 03:30   | `daily-server-maintenance.timer`；必要時於 04:00 重開機 |

## Monit 告警郵件格式

Monit 的 SMTP、寄件者與收件人設定由既有的 `/etc/monit/conf-available/10-gmail` 管理。若要將告警信改為含繁體中文欄位、清楚事件摘要與處理建議的格式，執行：

```bash
sudo bash scripts/configure-monit-email-format.sh
```

此腳本只寫入 `/etc/monit/conf-available/15-mail-format`，並建立對應啟用連結；不會讀取或改寫 Gmail 密碼、SMTP、寄件者或收件人。它會先備份舊格式、執行 `monit -t`，驗證通過後才重新啟動 Monit。可先用下列指令查看將套用的內容：

```bash
bash scripts/configure-monit-email-format.sh --dry-run
```

`$EVENT` 與 `$DESCRIPTION` 是 Monit 內建產生的事件字串，仍可能是英文；若需要連這兩個動態值都翻成中文，須改用事件處理腳本自行轉譯後寄信。

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

## GitHub Actions 部署恢復

部署 workflow 只會部署 `main`。若 production checkout 意外停在其他分支，workflow 會先從 `origin/main` 取回 bootstrap，並且只在已追蹤檔案乾淨時切回 `main`；這不會觸碰未納入 Git 的 `.env` 或資料目錄。若部署仍因 checkout 中止，先在主機確認：

```bash
cd /srv/rocket-workspace
git branch --show-current
git status --short
```

不要在有已追蹤變更時強制切換分支；先確認、提交、stash 或還原該變更，再重新執行 GitHub Actions deployment。

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
3. 將實體記憶體升級至至少 8 GiB，建議 16 GiB。
4. 決定重新部署 Nextcloud 或暫時移除失效的 Caddy 路由。
