import { PrismaClient, WorkspaceRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canWrite,
  databaseAccess,
  documentAccess,
  projectAccess,
} from "@/lib/permissions";

const prisma = new PrismaClient();
let workspaceId = "";
let projectId = "";
let databaseId = "";
let documentId = "";
let ownerId = "";
let adminId = "";
let editorId = "";
let viewerId = "";
let outsiderId = "";
let outsiderWorkspaceId = "";

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const [owner, admin, editor, viewer, outsider] = await Promise.all([
    prisma.user.create({
      data: {
        email: `owner-${suffix}@example.test`,
        name: "Owner",
        passwordHash: "not-used",
      },
    }),
    prisma.user.create({
      data: {
        email: `admin-${suffix}@example.test`,
        name: "Admin",
        passwordHash: "not-used",
      },
    }),
    prisma.user.create({
      data: {
        email: `editor-${suffix}@example.test`,
        name: "Editor",
        passwordHash: "not-used",
      },
    }),
    prisma.user.create({
      data: {
        email: `viewer-${suffix}@example.test`,
        name: "Viewer",
        passwordHash: "not-used",
      },
    }),
    prisma.user.create({
      data: {
        email: `outsider-${suffix}@example.test`,
        name: "Outsider",
        passwordHash: "not-used",
      },
    }),
  ]);
  const workspace = await prisma.workspace.create({
    data: { name: "Access Test", slug: `access-${suffix}` },
  });
  const outsiderWorkspace = await prisma.workspace.create({
    data: { name: "Other Access Test", slug: `other-access-${suffix}` },
  });
  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      code: `AC-${suffix.slice(0, 6)}`,
      name: "Access Test",
    },
  });
  const [database, document] = await Promise.all([
    prisma.database.create({ data: { projectId: project.id, name: "Access Database" } }),
    prisma.document.create({ data: { projectId: project.id, title: "Access Document" } }),
    prisma.membership.create({
      data: { userId: owner.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
    }),
    prisma.membership.create({
      data: { userId: admin.id, workspaceId: workspace.id, role: WorkspaceRole.ADMIN },
    }),
    prisma.membership.create({
      data: { userId: editor.id, workspaceId: workspace.id, role: WorkspaceRole.EDITOR },
    }),
    prisma.membership.create({
      data: { userId: viewer.id, workspaceId: workspace.id, role: WorkspaceRole.VIEWER },
    }),
    prisma.membership.create({
      data: {
        userId: outsider.id,
        workspaceId: outsiderWorkspace.id,
        role: WorkspaceRole.OWNER,
      },
    }),
  ]);
  workspaceId = workspace.id;
  projectId = project.id;
  databaseId = database.id;
  documentId = document.id;
  ownerId = owner.id;
  adminId = admin.id;
  editorId = editor.id;
  viewerId = viewer.id;
  outsiderId = outsider.id;
  outsiderWorkspaceId = outsiderWorkspace.id;
});

afterAll(async () => {
  if (workspaceId)
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  if (outsiderWorkspaceId)
    await prisma.workspace
      .delete({ where: { id: outsiderWorkspaceId } })
      .catch(() => undefined);
  await prisma.user
    .deleteMany({
      where: {
        id: { in: [ownerId, adminId, editorId, viewerId, outsiderId].filter(Boolean) },
      },
    })
    .catch(() => undefined);
  await prisma.$disconnect();
});

describe("workspace access boundaries", () => {
  it("returns each member's role for project, document, and database access", async () => {
    const memberIds = [ownerId, adminId, editorId, viewerId];
    const expectedRoles = [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ];
    const access = await Promise.all(
      memberIds.map(async (userId) => {
        const [project, document, database] = await Promise.all([
          projectAccess(userId, projectId),
          documentAccess(userId, documentId),
          databaseAccess(userId, databaseId),
        ]);
        return { project, document, database };
      }),
    );

    expect(access.map((result) => result.project?.membership.role)).toEqual(
      expectedRoles,
    );
    expect(access.map((result) => result.document?.membership.role)).toEqual(
      expectedRoles,
    );
    expect(access.map((result) => result.database?.membership.role)).toEqual(
      expectedRoles,
    );
    expect(
      access.every(
        (result) =>
          result.document?.document.id === documentId &&
          result.database?.database.id === databaseId,
      ),
    ).toBe(true);
    expect(expectedRoles.map(canWrite)).toEqual([true, true, true, false]);
  });

  it("denies a member of another workspace and excludes deleted documents", async () => {
    await expect(
      Promise.all([
        projectAccess(outsiderId, projectId),
        documentAccess(outsiderId, documentId),
        databaseAccess(outsiderId, databaseId),
      ]),
    ).resolves.toEqual([null, null, null]);

    await prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
    await expect(documentAccess(ownerId, documentId)).resolves.toBeNull();
  });
});
