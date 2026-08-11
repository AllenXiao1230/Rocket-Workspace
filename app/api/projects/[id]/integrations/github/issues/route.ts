import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectAccess } from "@/lib/permissions";
import { readWorkspaceSettings } from "@/lib/workspace-settings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const integration = (await readWorkspaceSettings(access.project.workspaceId))
    .integrations;
  if (!integration.githubEnabled)
    return NextResponse.json({ error: "管理者尚未啟用 GitHub 整合" }, { status: 403 });
  if (!/^[\w.-]+\/[\w.-]+$/.test(integration.githubRepository))
    return NextResponse.json(
      { error: "請在設定中心填入 GitHub 儲存庫（owner/repository）" },
      { status: 422 },
    );
  const response = await fetch(
    `https://api.github.com/repos/${integration.githubRepository}/issues?state=open&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Rocket-Workspace",
        ...(integration.githubToken
          ? { Authorization: `Bearer ${integration.githubToken}` }
          : {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | Array<{
        id: number;
        number: number;
        title: string;
        html_url: string;
        state: string;
        pull_request?: unknown;
      }>
    | { message?: string }
    | null;
  if (!response.ok)
    return NextResponse.json(
      {
        error: !Array.isArray(body)
          ? body?.message || `GitHub 回應失敗（${response.status}）`
          : "GitHub 回應失敗",
      },
      { status: 502 },
    );
  return NextResponse.json(
    (
      body as Array<{
        id: number;
        number: number;
        title: string;
        html_url: string;
        state: string;
        pull_request?: unknown;
      }>
    )
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state,
      })),
  );
}
