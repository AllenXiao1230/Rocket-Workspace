"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusMessage } from "@/components/status-message";

export type TeamMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  nickname: string | null;
  teamGroup: string | null;
  jobTitle: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatarEmoji?: string | null;
    avatarUrl?: string | null;
  };
};
const roleNames = {
  OWNER: "擁有者",
  ADMIN: "管理員",
  EDITOR: "編輯者",
  VIEWER: "檢視者",
};
const displayName = (member: TeamMember) => member.nickname || member.user.name;
const pageSize = 50;

type MembersPage = { members: TeamMember[]; nextCursor: string | null };

export function TeamManagement({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ take: String(pageSize) });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/workspaces/${workspaceId}/members?${params}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as Partial<MembersPage> & {
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.members))
          throw new Error(result.error || "無法讀取成員名單");
        setMembers((current) =>
          cursor ? [...current, ...result.members!] : result.members!,
        );
        setNextCursor(result.nextCursor || null);
        setNotice("");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "無法讀取成員名單");
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="team-page">
      <div className="settings-hero">
        <p className="eyebrow">團隊名單</p>
        <h1>團隊成員</h1>
        <p>查看目前工作空間的成員、分組與職位。成員資料請由管理員在「設定中心」管理。</p>
      </div>
      <section className="team-card">
        <div className="team-directory-head">
          <h2>成員名單</h2>
          <span>
            {nextCursor ? `已載入 ${members.length} 位` : `${members.length} 位`}
          </span>
        </div>
        <div className="team-directory">
          {members.map((member) => (
            <article key={member.id}>
              <div className="member-avatar">
                {member.user.avatarUrl ? (
                  <img
                    src={member.user.avatarUrl}
                    alt={`${displayName(member)} 的頭像`}
                    width={27}
                    height={27}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  member.user.avatarEmoji || displayName(member).slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <strong>{displayName(member)}</strong>
                <span>
                  {member.nickname
                    ? `${member.user.name} · ${member.user.email}`
                    : member.user.email}
                </span>
              </div>
              <small>{member.teamGroup || "未分組"}</small>
              <small>{member.jobTitle || "未設定職位"}</small>
              <small className="team-role">{roleNames[member.role]}</small>
            </article>
          ))}
        </div>
        {loading && !members.length && (
          <StatusMessage className="hint">正在載入成員…</StatusMessage>
        )}
        {!loading && !members.length && <p className="hint">尚無成員。</p>}
        {nextCursor && (
          <button
            type="button"
            className="team-load-more"
            disabled={loading}
            aria-busy={loading}
            onClick={() => void load(nextCursor)}
          >
            {loading && <span className="button-spinner" aria-hidden="true" />}
            <span>載入更多成員</span>
          </button>
        )}
        {notice && (
          <StatusMessage className="error" tone="alert">
            {notice}
          </StatusMessage>
        )}
      </section>
    </section>
  );
}
