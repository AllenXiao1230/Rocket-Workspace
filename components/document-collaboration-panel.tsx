"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Comment = { id: string; body: string; resolvedAt: string | null; createdAt: string; isAuthor: boolean; canManage: boolean; author: { name: string }; replies: Comment[] };
type Revision = { id: string; title: string; createdAt: string; author: { name: string } | null };

export function DocumentCollaborationPanel({ documentId, canWrite }: { documentId: string; canWrite: boolean }) {
  const [mode, setMode] = useState<"comments" | "history" | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState("");
  const [diff, setDiff] = useState<Array<{ type: "same" | "added" | "removed"; text: string }> | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: "delete-comment"; commentId: string } | { type: "restore-revision"; revisionId: string } | null>(null);

  const load = useCallback(async () => {
    const endpoint = mode === "comments" ? "comments" : "revisions";
    const response = await fetch(`/api/documents/${documentId}/${endpoint}`);
    if (!response.ok) return setMessage("無法讀取協作資料");
    const data = await response.json();
    if (mode === "comments") setComments(data); else setRevisions(data);
  }, [documentId, mode]);
  useEffect(() => { if (mode) void load(); }, [mode, load]);
  async function addComment(parentId?: string) {
    const value = parentId ? replyBody : body;
    if (!value.trim()) return;
    const response = await fetch(`/api/documents/${documentId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: value, parentId }) });
    if (!response.ok) return setMessage("留言尚未儲存");
    setBody(""); setReplyBody(""); setReplyTo(null); setMessage(parentId ? "已新增回覆，對方會收到通知" : "已留言");
    await load();
  }
  async function updateComment(commentId: string, resolved: boolean) {
    const response = await fetch(`/api/documents/${documentId}/comments/${commentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved }) });
    if (!response.ok) return setMessage("無法更新留言狀態");
    await load();
  }
  async function deleteComment(commentId: string) {
    const response = await fetch(`/api/documents/${documentId}/comments/${commentId}`, { method: "DELETE" });
    if (!response.ok) return setMessage("無法刪除留言");
    setMessage("已刪除留言"); await load();
  }
  async function restore(revisionId: string) {
    const response = await fetch(`/api/documents/${documentId}/revisions/${revisionId}/restore`, { method: "POST" });
    if (!response.ok) return setMessage("無法還原版本");
    window.location.reload();
  }
  async function compare(revisionId: string) { const response = await fetch(`/api/documents/${documentId}/revisions/${revisionId}/diff`); const result = await response.json(); if (!response.ok) return setMessage(result.error || "無法比較版本"); setDiff(result.lines); }
  function commentItem(comment: Comment, reply = false) {
    return <article key={comment.id} className={comment.resolvedAt ? "resolved" : ""}><div className="comment-meta"><strong>{comment.author.name}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time>{comment.resolvedAt && <span>已解決</span>}</div><p>{comment.body}</p>{canWrite && <div className="comment-actions">{!reply && <button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>回覆</button>}<button onClick={() => void updateComment(comment.id, !comment.resolvedAt)}>{comment.resolvedAt ? "重新開啟" : "標記解決"}</button>{comment.canManage && <button className="danger" onClick={() => setPendingAction({ type: "delete-comment", commentId: comment.id })}>刪除</button>}</div>}{!reply && replyTo === comment.id && <div className="comment-reply"><textarea autoFocus value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={`回覆 ${comment.author.name}…`} /><div><button className="collab-primary" onClick={() => void addComment(comment.id)}>送出回覆</button><button onClick={() => { setReplyTo(null); setReplyBody(""); }}>取消</button></div></div>}{!reply && comment.replies.length > 0 && <div className="comment-replies">{comment.replies.map((item) => commentItem(item, true))}</div>}</article>;
  }
  return <section className="document-collab"><div><button className={mode === "comments" ? "active" : ""} onClick={() => setMode(mode === "comments" ? null : "comments")}>💬 留言</button><button className={mode === "history" ? "active" : ""} onClick={() => setMode(mode === "history" ? null : "history")}>◷ 歷史版本</button></div>{mode === "comments" && <div className="collab-panel"><div className="comment-list">{comments.length ? comments.map((comment) => commentItem(comment)) : <p className="hint">尚無留言。用留言保留工程決策與待確認事項。</p>}</div>{canWrite ? <><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="留下留言；回覆會通知原留言者" /><button className="collab-primary" onClick={() => void addComment()}>新增留言</button></> : <p className="hint">你目前為檢視者，只能閱讀留言。</p>}</div>}{mode === "history" && <div className="collab-panel revision-list">{revisions.length ? revisions.map((revision) => <article key={revision.id}><div><strong>{revision.title}</strong><span>{revision.author?.name || "未知使用者"} · {new Date(revision.createdAt).toLocaleString()}</span></div><button onClick={() => void compare(revision.id)}>比較</button>{canWrite && <button onClick={() => setPendingAction({ type: "restore-revision", revisionId: revision.id })}>還原</button>}</article>) : <p className="hint">第一次儲存後，版本歷史會自動建立。</p>}{diff && <pre className="revision-diff">{diff.map((line, index) => <span key={index} className={line.type}>{line.type === "added" ? "+ " : line.type === "removed" ? "− " : "  "}{line.text}{"\n"}</span>)}</pre>}</div>}{message && <span className="collab-notice">{message}</span>}{pendingAction && <ConfirmDialog title={pendingAction.type === "delete-comment" ? "刪除留言？" : "還原此版本？"} description={pendingAction.type === "delete-comment" ? "其回覆也會一併移除。" : "目前內容會保留在版本紀錄中。"} confirmLabel={pendingAction.type === "delete-comment" ? "刪除留言" : "還原版本"} destructive={pendingAction.type === "delete-comment"} onCancel={() => setPendingAction(null)} onConfirm={() => { const action = pendingAction; setPendingAction(null); if (action.type === "delete-comment") void deleteComment(action.commentId); else void restore(action.revisionId); }} />}</section>;
}
