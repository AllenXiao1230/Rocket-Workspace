import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { comparisonFromBehind, isValidBranch, isValidCommit, isValidRepository, shortCommit, type VersionComparison } from "@/lib/version-check";

const repository = process.env.UPDATE_REPOSITORY || "AllenXiao1230/Rocket-Workspace";
const localCommit = process.env.APP_COMMIT || "unknown";
const localVersion = process.env.APP_VERSION || "0.1.0";
const updateToken = process.env.UPDATE_GITHUB_TOKEN?.trim();
const cacheHeaders = { "Cache-Control": "private, max-age=300", Vary: "Cookie" };

type VersionPayload = {
  version: string;
  commit: string;
  configured: boolean;
  comparison: VersionComparison;
  updateAvailable: boolean;
  behindBy?: number;
  aheadBy?: number;
  remoteCommit?: string | null;
  updateUrl?: string;
  message?: string;
};

function respond(payload: VersionPayload) { return NextResponse.json(payload, { headers: cacheHeaders }); }
function base(comparison: VersionComparison, configured: boolean, message?: string): VersionPayload {
  return { version: localVersion, commit: shortCommit(localCommit), configured, comparison, updateAvailable: false, ...(message ? { message } : {}) };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cacheHeaders });
  if (!isValidRepository(repository)) return respond(base("NOT_CONFIGURED", false, "更新儲存庫設定格式不正確。"));
  if (!isValidCommit(localCommit)) return respond(base("NOT_CONFIGURED", false, "此部署未提供有效的提交版本資訊，無法比對更新。"));
  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "Rocket-Workspace", ...(updateToken ? { Authorization: `Bearer ${updateToken}` } : {}) };
    const request = { headers, signal: AbortSignal.timeout(10_000), next: { revalidate: 900 } };
    const repo = await fetch(`https://api.github.com/repos/${repository}`, request);
    if (repo.status === 404) return respond(base("NOT_CONFIGURED", false, "找不到更新儲存庫，或伺服器缺少其讀取權限。"));
    if (!repo.ok) return respond(base("UNAVAILABLE", true, "暫時無法讀取遠端儲存庫資訊。"));
    const branch = (await repo.json() as { default_branch?: unknown }).default_branch;
    if (typeof branch !== "string" || !isValidBranch(branch)) return respond(base("UNAVAILABLE", true, "遠端儲存庫未提供有效的預設分支。"));
    const compare = await fetch(`https://api.github.com/repos/${repository}/compare/${encodeURIComponent(localCommit)}...${encodeURIComponent(branch)}`, request);
    if (compare.status === 404 || compare.status === 409 || compare.status === 422) return respond(base("NOT_COMPARABLE", true, "目前提交不在遠端預設分支的可比較歷史中。"));
    if (!compare.ok) return respond(base("UNAVAILABLE", true, "暫時無法比對遠端版本。"));
    const result = await compare.json() as { behind_by?: unknown; ahead_by?: unknown; html_url?: unknown; commits?: Array<{ sha?: unknown }> };
    const comparison = comparisonFromBehind(result.behind_by);
    if (comparison === "UNAVAILABLE") return respond(base("UNAVAILABLE", true, "遠端版本回應格式不正確。"));
    const behindBy = result.behind_by as number; const aheadBy = typeof result.ahead_by === "number" && Number.isInteger(result.ahead_by) && result.ahead_by >= 0 ? result.ahead_by : 0;
    const remoteSha = result.commits?.at(-1)?.sha;
    const updateUrl = typeof result.html_url === "string" && result.html_url.startsWith(`https://github.com/${repository}/compare/`) ? result.html_url : `https://github.com/${repository}/compare/${encodeURIComponent(localCommit)}...${encodeURIComponent(branch)}`;
    return respond({ version: localVersion, commit: shortCommit(localCommit), configured: true, comparison, updateAvailable: comparison === "UPDATE_AVAILABLE", behindBy, aheadBy, remoteCommit: typeof remoteSha === "string" && isValidCommit(remoteSha) ? shortCommit(remoteSha) : null, updateUrl });
  } catch {
    return respond(base("UNAVAILABLE", true, "暫時無法檢查遠端版本。"));
  }
}
