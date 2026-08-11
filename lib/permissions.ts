import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function documentAccess(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: { project: true },
  });
  if (!document) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId, workspaceId: document.project.workspaceId },
  });
  return membership ? { document, membership } : null;
}
export async function projectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId, workspaceId: project.workspaceId },
  });
  return membership ? { project, membership } : null;
}
export async function databaseAccess(userId: string, databaseId: string) {
  const database = await prisma.database.findUnique({
    where: { id: databaseId },
    include: { project: true },
  });
  if (!database) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId, workspaceId: database.project.workspaceId },
  });
  return membership ? { database, membership } : null;
}
export function canWrite(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN" || role === "EDITOR";
}
