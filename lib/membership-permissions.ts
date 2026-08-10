import type { WorkspaceRole } from "@prisma/client";

/**
 * Owners are the only role allowed to create, promote, demote, or remove an
 * owner. The caller must also leave at least one owner in the workspace.
 */
export function canChangeMembershipRole(
  requester: WorkspaceRole,
  currentRole: WorkspaceRole | null,
  nextRole: WorkspaceRole,
  ownerCount: number,
) {
  if (requester !== "OWNER" && (currentRole === "OWNER" || nextRole === "OWNER")) return false;
  if (currentRole === "OWNER" && nextRole !== "OWNER" && ownerCount <= 1) return false;
  return true;
}
