import { NextResponse } from "next/server";

const repository = process.env.UPDATE_REPOSITORY || "AllenXiao1230/Rocket-Workspace";
const localCommit = process.env.APP_COMMIT || "unknown";
const localVersion = process.env.APP_VERSION || "0.1.0";
const updateToken = process.env.UPDATE_GITHUB_TOKEN?.trim();

export async function GET() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return NextResponse.json({ version: localVersion, commit: localCommit, configured: false, updateAvailable: false });
  if (!/^[a-f0-9]{7,64}$/i.test(localCommit)) return NextResponse.json({ version: localVersion, commit: localCommit, configured: false, updateAvailable: false, message: "此部署未提供提交版本資訊，無法比對更新。" });
  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "Rocket-Workspace", ...(updateToken ? { Authorization: `Bearer ${updateToken}` } : {}) };
    const repo = await fetch(`https://api.github.com/repos/${repository}`, { headers, next: { revalidate: 900 } });
    if (!repo.ok) throw new Error("repository unavailable");
    const branch = (await repo.json() as { default_branch?: string }).default_branch || "main";
    const compare = await fetch(`https://api.github.com/repos/${repository}/compare/${localCommit}...${branch}`, { headers, next: { revalidate: 900 } });
    if (!compare.ok) throw new Error("compare unavailable");
    const result = await compare.json() as { behind_by?: number; ahead_by?: number; html_url?: string; commits?: Array<{ sha: string }> };
    return NextResponse.json({ version: localVersion, commit: localCommit.slice(0, 12), configured: true, updateAvailable: Boolean(result.behind_by), behindBy: result.behind_by || 0, aheadBy: result.ahead_by || 0, remoteCommit: result.commits?.at(-1)?.sha?.slice(0, 12) || null, updateUrl: result.html_url || `https://github.com/${repository}` });
  } catch { return NextResponse.json({ version: localVersion, commit: localCommit.slice(0, 12), configured: true, updateAvailable: false, unavailable: true, message: "暫時無法檢查遠端版本。" }, { headers: { "Cache-Control": "private, max-age=300" } }); }
}
