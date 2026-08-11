"use client";

import { useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  icon: string;
  markdown: string | null;
  properties: Record<string, string>;
};

export function DocumentTemplatePicker({
  projectId,
  open,
  onClose,
  onCreate,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreate: (templateId: string, title: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setTitle("");
    setNotice("");
    void fetch(`/api/projects/${projectId}/document-templates`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setTemplates);
  }, [open, projectId]);
  if (!open) return null;
  return (
    <div className="template-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="template-picker"
        role="dialog"
        aria-modal="true"
        aria-label="選擇文件模板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">文件模板</p>
            <h2>由模板建立頁面</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        {templates.length ? (
          <div className="template-picker-grid">
            {templates.map((template) => (
              <button
                type="button"
                key={template.id}
                className={selected?.id === template.id ? "active" : ""}
                onClick={() => {
                  setSelected(template);
                  setTitle(template.name);
                }}
              >
                <i>{template.icon}</i>
                <strong>{template.name}</strong>
                <small>
                  {Object.keys(template.properties || {}).length
                    ? `${Object.keys(template.properties).length} 個預設屬性`
                    : template.markdown
                      ? "包含內容"
                      : "空白內容"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">尚未建立文件模板。可使用 API 建立後在此選擇。</p>
        )}
        {selected && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return setNotice("請輸入頁面名稱");
              onCreate(selected.id, title.trim());
            }}
          >
            <label>
              頁面名稱
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
                required
                maxLength={180}
              />
            </label>
            <button className="primary" type="submit">
              使用「{selected.name}」建立
            </button>
          </form>
        )}
        {notice && <p className="error">{notice}</p>}
      </section>
    </div>
  );
}
