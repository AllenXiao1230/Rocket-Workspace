import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  projectAccess: vi.fn(),
  bomItemFindFirst: vi.fn(),
  testRecordFindFirst: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentFindFirst: vi.fn(),
  attachmentUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  enqueueAttachmentDelete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/permissions", () => ({
  canWrite: (role: string) => role !== "VIEWER",
  projectAccess: mocks.projectAccess,
}));
vi.mock("@/lib/attachment-sync", () => ({
  enqueueAttachmentDelete: mocks.enqueueAttachmentDelete,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bomItem: { findFirst: mocks.bomItemFindFirst },
    testRecord: { findFirst: mocks.testRecordFindFirst },
    attachment: {
      findMany: mocks.attachmentFindMany,
      findFirst: mocks.attachmentFindFirst,
      updateMany: mocks.attachmentUpdateMany,
    },
    auditEvent: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
  },
}));

import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/projects/[id]/records/[module]/[recordId]/attachments/recycle/route";

const context = {
  params: Promise.resolve({ id: "project-a", module: "bom", recordId: "bom-a" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
  mocks.projectAccess.mockResolvedValue({
    project: { workspaceId: "workspace-a" },
    membership: { role: "EDITOR" },
  });
  mocks.bomItemFindFirst.mockResolvedValue({ id: "bom-a" });
  mocks.testRecordFindFirst.mockResolvedValue(null);
  mocks.attachmentFindMany.mockResolvedValue([]);
  mocks.attachmentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({});
  mocks.enqueueAttachmentDelete.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ auditEvent: { create: mocks.auditCreate } }),
  );
});

describe("record attachment recycle API", () => {
  it("lists only trashed attachments scoped to its BOM item", async () => {
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "attachment-a", filename: "drawing.pdf", deletedAt: new Date() },
    ]);

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "attachment-a", filename: "drawing.pdf" }),
    ]);
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bomItemId: "bom-a", deletedAt: { not: null } },
      }),
    );
  });

  it("restores a trashed attachment for an editor and records an audit event", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ attachmentId: "attachment-a" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "attachment-a",
          bomItemId: "bom-a",
          deletedAt: { not: null },
        },
        data: { deletedAt: null, deletionBatchId: null },
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "record_attachment.restored",
          workspaceId: "workspace-a",
          projectId: "project-a",
        }),
      }),
    );
  });

  it("rejects permanent deletion by editors", async () => {
    const response = await DELETE(
      new Request("http://localhost?attachmentId=attachment-a", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.attachmentFindFirst).not.toHaveBeenCalled();
  });

  it("queues permanent deletion for an owner and audits the irreversible action", async () => {
    mocks.projectAccess.mockResolvedValue({
      project: { workspaceId: "workspace-a" },
      membership: { role: "OWNER" },
    });
    mocks.attachmentFindFirst.mockResolvedValue({
      id: "attachment-a",
      filename: "drawing.pdf",
    });

    const response = await DELETE(
      new Request("http://localhost?attachmentId=attachment-a", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueueAttachmentDelete).toHaveBeenCalledWith(
      expect.anything(),
      "attachment-a",
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "record_attachment.purge_queued",
          metadata: expect.objectContaining({ irreversible: true }),
        }),
      }),
    );
  });
});
