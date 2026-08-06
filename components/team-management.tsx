"use client";

import { useEffect, useState } from "react";

export type TeamMember = { id: string; role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER"; nickname: string | null; teamGroup: string | null; jobTitle: string | null; user: { id: string; name: string; email: string; avatarEmoji?: string | null } };
const roleNames = { OWNER: "擁有者", ADMIN: "管理員", EDITOR: "編輯者", VIEWER: "檢視者" };
const displayName = (member: TeamMember) => member.nickname || member.user.name;

export function TeamManagement({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  useEffect(() => { void fetch(`/api/workspaces/${workspaceId}/members`).then((response) => response.ok ? response.json() : []).then(setMembers); }, [workspaceId]);
  return <section className="team-page"><div className="settings-hero"><p className="eyebrow">團隊名單</p><h1>團隊成員</h1><p>查看目前工作空間的成員、分組與職位。成員資料請由管理員在「設定中心」管理。</p></div><section className="team-card"><div className="team-directory-head"><h2>成員名單</h2><span>{members.length} 位</span></div><div className="team-directory">{members.map((member) => <article key={member.id}><div className="member-avatar">{member.user.avatarEmoji || displayName(member).slice(0, 1).toUpperCase()}</div><div><strong>{displayName(member)}</strong><span>{member.nickname ? `${member.user.name} · ${member.user.email}` : member.user.email}</span></div><small>{member.teamGroup || "未分組"}</small><small>{member.jobTitle || "未設定職位"}</small><small className="team-role">{roleNames[member.role]}</small></article>)}</div>{!members.length && <p className="hint">尚無成員。</p>}</section></section>;
}
