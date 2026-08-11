import { AttachmentSyncStatus, PrismaClient, WorkspaceRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enqueueAttachmentUpload, processAttachmentSyncJob } from "@/lib/attachment-sync";
import {
  attachmentBucket,
  DeleteObjectCommand,
  GetObjectCommand,
  objectStorage,
} from "@/lib/object-storage";

const prisma = new PrismaClient();
let workspaceId = "";
let attachmentId = "";
let storageKey = "";

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `attachment-${suffix}@example.test`,
      name: "Integration Test",
      passwordHash: "not-used",
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: "Attachment Test", slug: `attachment-${suffix}` },
  });
  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      code: `AT-${suffix.slice(0, 6)}`,
      name: "Attachment Test",
    },
  });
  const document = await prisma.document.create({
    data: { projectId: project.id, title: "Attachment Test" },
  });
  storageKey = `integration/${suffix}.txt`;
  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({
      data: {
        documentId: document.id,
        filename: "proof.txt",
        mimeType: "text/plain",
        size: 5,
        storageKey,
      },
    });
    await enqueueAttachmentUpload(tx, created.id, new TextEncoder().encode("proof"));
    return created;
  });
  workspaceId = workspace.id;
  attachmentId = attachment.id;
});

afterAll(async () => {
  if (storageKey)
    await objectStorage
      .send(new DeleteObjectCommand({ Bucket: attachmentBucket, Key: storageKey }))
      .catch(() => undefined);
  if (attachmentId)
    await prisma.attachment
      .delete({ where: { id: attachmentId } })
      .catch(() => undefined);
  if (workspaceId)
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("attachment sync worker", () => {
  it("persists the queued payload to object storage and marks the attachment ready", async () => {
    await expect(processAttachmentSyncJob(attachmentId)).resolves.toBe(true);
    const [attachment, object] = await Promise.all([
      prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } }),
      objectStorage.send(
        new GetObjectCommand({ Bucket: attachmentBucket, Key: storageKey }),
      ),
    ]);
    expect(attachment.syncStatus).toBe(AttachmentSyncStatus.READY);
    await expect(object.Body?.transformToString()).resolves.toBe("proof");
    await expect(
      prisma.attachmentSyncJob.findUnique({ where: { attachmentId } }),
    ).resolves.toBeNull();
  });
});
