# Issue tracker：GitHub

本專案的工作項目與規格使用 GitHub Issues 管理；所有操作使用 `gh` CLI。

## 慣例

- 建立 Issue：`gh issue create --title "..." --body "..."`；多行內容使用 heredoc。
- 讀取 Issue：`gh issue view <number> --comments`，並一併取得 labels。
- 列出 Issue：使用 `gh issue list`，依需要加上 `--label` 與 `--state` 篩選。
- 留言：`gh issue comment <number> --body "..."`。
- 套用或移除標籤：`gh issue edit <number> --add-label "..."` 或 `--remove-label "..."`。
- 關閉：`gh issue close <number> --comment "..."`。

在此 clone 內執行時，`gh` 會由 `git remote -v` 自動辨識 `AllenXiao1230/Rocket-Workspace`。

## Pull request 作為 triage 來源

**否。**外部 PR 不作為功能請求或 triage 佇列來源；需要時可將此設定改為「是」。

## 技能用語對應

- 技能要求「發佈到 issue tracker」時，建立 GitHub Issue。
- 技能要求「取得相關 ticket」時，執行 `gh issue view <number> --comments`。
- `/wayfinder` 的地圖使用一個 GitHub Issue，子工作項目使用 GitHub sub-issues；阻擋關係優先使用 GitHub 原生 issue dependencies，無法使用時才在 issue 內容標註 `Blocked by: #<number>`。
