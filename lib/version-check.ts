export type VersionComparison = "UP_TO_DATE" | "UPDATE_AVAILABLE" | "NOT_CONFIGURED" | "NOT_COMPARABLE" | "UNAVAILABLE";

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const commitPattern = /^[a-f0-9]{7,64}$/i;
const branchPattern = /^[A-Za-z0-9._/-]{1,255}$/;

export function isValidRepository(repository: string) { return repositoryPattern.test(repository); }
export function isValidCommit(commit: string) { return commitPattern.test(commit); }
export function isValidBranch(branch: string) { return branchPattern.test(branch) && !branch.startsWith("/") && !branch.endsWith("/") && !branch.includes("//"); }
export function shortCommit(commit: string) { return isValidCommit(commit) ? commit.slice(0, 12) : "unknown"; }

export function comparisonFromBehind(behindBy: unknown): VersionComparison {
  return typeof behindBy === "number" && Number.isInteger(behindBy) && behindBy >= 0 ? behindBy > 0 ? "UPDATE_AVAILABLE" : "UP_TO_DATE" : "UNAVAILABLE";
}
