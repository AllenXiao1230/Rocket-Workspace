"use client";

import { useEffect, useState } from "react";

type Result = { id: string; title: string; type: "document" | "database"; updatedAt: string };
export function WorkspaceSearch({ projectId, onSelect }: { projectId: string; onSelect: (result: Result) => void }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Result[]>([]);
  useEffect(() => { const q = query.trim(); if (!q) return setResults([]); const timer = window.setTimeout(() => fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(q)}`).then((response) => response.ok ? response.json() : []).then(setResults), 180); return () => window.clearTimeout(timer); }, [query, projectId]);
  return <div className="workspace-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋工作空間…" aria-label="搜尋工作空間" />{results.length > 0 && <div>{results.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { onSelect(result); setQuery(""); }}><span>{result.type === "database" ? "▦" : "◇"}</span><strong>{result.title}</strong><small>{result.type === "database" ? "資料庫" : "文件"}</small></button>)}</div>}</div>;
}
