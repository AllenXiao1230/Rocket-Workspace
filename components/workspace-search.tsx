"use client";

import { useEffect, useRef, useState } from "react";

type Result = {
  id: string;
  title: string;
  type: "document" | "database";
  updatedAt: string;
};

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error";

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.type === "document" || candidate.type === "database")
  );
}

export function WorkspaceSearch({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (result: Result) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setStatus("idle");
      return;
    }

    let current = true;
    const controller = new AbortController();
    setResults([]);
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search request failed");
        const payload: unknown = await response.json();
        if (!Array.isArray(payload) || !payload.every(isResult)) {
          throw new Error("Search response is invalid");
        }
        if (!current) return;
        setResults(payload);
        setStatus(payload.length > 0 ? "results" : "empty");
      } catch (error) {
        if (!current || (error instanceof DOMException && error.name === "AbortError"))
          return;
        setResults([]);
        setStatus("error");
      }
    }, 180);

    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, retry, trimmedQuery]);

  const closeResults = () => {
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const selectResult = (result: Result) => {
    onSelect(result);
    setQuery("");
    setResults([]);
    setStatus("idle");
    setIsOpen(false);
  };

  const focusResult = (index: number) => {
    resultRefs.current[index]?.focus();
  };

  const moveFromInput = (direction: "next" | "previous") => {
    if (results.length === 0 || status !== "results") return;
    focusResult(direction === "next" ? 0 : results.length - 1);
  };

  const showResults = isOpen && Boolean(trimmedQuery) && status !== "idle";

  return (
    <div
      className="workspace-search"
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (trimmedQuery) setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeResults();
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFromInput("next");
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveFromInput("previous");
          }
        }}
        placeholder="搜尋工作空間…"
        aria-label="搜尋工作空間"
        aria-busy={status === "loading"}
        autoComplete="off"
      />
      {showResults && (
        <div id="workspace-search-results" aria-label="搜尋結果">
          {status === "loading" && (
            <p
              className="workspace-search-message"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              正在搜尋「{trimmedQuery}」…
            </p>
          )}
          {status === "empty" && (
            <p
              className="workspace-search-message"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              找不到符合「{trimmedQuery}」的項目。
            </p>
          )}
          {status === "error" && (
            <>
              <p className="workspace-search-message" role="alert">
                無法完成搜尋，請再試一次。
              </p>
              <button
                className="workspace-search-retry"
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                再試一次
              </button>
            </>
          )}
          {status === "results" && (
            <>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                找到 {results.length} 筆結果。
              </p>
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  ref={(element) => {
                    resultRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => selectResult(result)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeResults();
                    }
                    if (event.key === "ArrowDown" && index < results.length - 1) {
                      event.preventDefault();
                      focusResult(index + 1);
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (index === 0) inputRef.current?.focus();
                      else focusResult(index - 1);
                    }
                  }}
                >
                  <span aria-hidden="true">{result.type === "database" ? "▦" : "◇"}</span>
                  <strong>{result.title}</strong>
                  <small>{result.type === "database" ? "資料庫" : "文件"}</small>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
