# Domain docs

工程技能探索程式碼前，依下列規則讀取專案的領域文件。

## 探索前讀取

- 根目錄 `CONTEXT.md`；或
- 根目錄 `CONTEXT-MAP.md`（若存在），並讀取其指向且與工作相關的各個 `CONTEXT.md`；以及
- `docs/adr/` 下與目前工作範圍相關的 ADR。

若上述檔案不存在，靜默繼續；不需主動建立。`/domain-modeling`（可由 `/grill-with-docs` 或 `/improve-codebase-architecture` 使用）會在釐清術語或決策時建立它們。

## 文件結構

本專案採單一 context：

```text
/
├── CONTEXT.md
└── docs/
    └── adr/
        └── 0001-<decision>.md
```

## 使用共同詞彙

Issue 標題、重構提案、假設與測試名稱應使用 `CONTEXT.md` 定義的術語，避免以它明確排除的同義詞取代。需要而尚未定義的概念，應先確認是否是誤用；若確有缺口，交由 `/domain-modeling` 補充。

## ADR 衝突

若輸出與既有 ADR 衝突，必須明確指出衝突與重新檢討的理由，不可靜默覆寫決策。
