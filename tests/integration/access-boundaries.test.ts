import { PrismaClient, WorkspaceRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseAccess, documentAccess, projectAccess } from "@/lib/permissions";

const prisma = new PrismaClient();
let workspaceId = "";
let projectId = "";
let databaseId = "";
let documentId = "";
let ownerId = "";
let viewerId = "";
let outsiderId = "";

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const [owner, viewer, outsider] = await Promise.all([
    prisma.user.create({ data: { email: `owner-${suffix}@example.test`, name: "Owner", passwordHash: "not-used" } }),
    prisma.user.create({ data: { email: `viewer-${suffix}@example.test`, name: "Viewer", passwordHash: "not-used" } }),
    prisma.user.create({ data: { email: `outsider-${suffix}@example.test`, name: "Outsider", passwordHash: "not-used" } }),
  ]);
  const workspace = await prisma.workspace.create({ data: { name: "Access Test", slug: `access-${suffix}` } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, code: `AC-${suffix.slice(0, 6)}`, name: "Access Test" } });
  const [database, document] = await Promise.all([
    prisma.database.create({ data: { projectId: project.id, name: "Access Database" } }),
    prisma.document.create({ data: { projectId: project.id, title: "Access Document" } }),
    prisma.membership.create({ data: { userId: owner.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER } }),
    prisma.membership.create({ data: { userId: viewer.id, workspaceId: workspace.id, role: WorkspaceRole.VIEWER } }),
  ]);
  workspaceId = workspace.id;
  projectId = project.id;
  databaseId = database.id;
  documentId = document.id;
  ownerId = owner.id;
  viewerId = viewer.id;
  outsiderId = outsider.id;
});

afterAll(async () => {
  if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId, outsiderId].filter(Boolean) } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("workspace access boundaries", () => {
  it("allows workspace members to access project, document, and database resources", async () => {
    const [project, document, database] = await Promise.all([
      projectAccess(viewerId, projectId),
      documentAccess(ownerId, documentId),
      databaseAccess(viewerId, databaseId),
    ]);

    expect(project?.membership.role).toBe(WorkspaceRole.VIEWER);
    expect(document?.document.id).toBe(documentId);
    expect(database?.database.id).toBe(databaseId);
  });

  it("denies cross-workspace access and excludes deleted documents", async () => {
    await expect(Promise.all([
      projectAccess(outsiderId, projectId),
      documentAccess(outsiderId, documentId),
      databaseAccess(outsiderId, databaseId),
    ])).resolves.toEqual([null, null, null]);

    await prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await expect(documentAccess(ownerId, documentId)).resolves.toBeNull();
  });
});
