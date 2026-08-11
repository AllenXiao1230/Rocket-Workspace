import { AttachmentSyncAction, AttachmentSyncStatus, type Prisma } from "@prisma/client";
import {
  attachmentBucket,
  DeleteObjectCommand,
  objectStorage,
  PutObjectCommand,
} from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";

export async function enqueueAttachmentUpload(
  client: Prisma.TransactionClient,
  attachmentId: string,
  payload: Uint8Array,
) {
  await client.attachmentSyncJob.create({
    data: {
      attachmentId,
      action: AttachmentSyncAction.UPLOAD,
      payload: new Uint8Array(payload),
    },
  });
}

export async function enqueueAttachmentDelete(
  client: Prisma.TransactionClient,
  attachmentId: string,
) {
  await client.attachmentSyncJob.upsert({
    where: { attachmentId },
    create: { attachmentId, action: AttachmentSyncAction.DELETE },
    update: {
      action: AttachmentSyncAction.DELETE,
      payload: null,
      attempts: 0,
      lastError: null,
    },
  });
}

async function processJob(
  job: Awaited<ReturnType<typeof prisma.attachmentSyncJob.findFirst>> & {
    attachment: { id: string; storageKey: string; mimeType: string };
  },
) {
  try {
    if (job.action === AttachmentSyncAction.UPLOAD) {
      if (!job.payload) throw new Error("Missing attachment upload payload");
      await objectStorage.send(
        new PutObjectCommand({
          Bucket: attachmentBucket,
          Key: job.attachment.storageKey,
          Body: job.payload,
          ContentType: job.attachment.mimeType,
        }),
      );
      await prisma.$transaction([
        prisma.attachment.update({
          where: { id: job.attachmentId },
          data: { syncStatus: AttachmentSyncStatus.READY, syncError: null },
        }),
        prisma.attachmentSyncJob.delete({ where: { id: job.id } }),
      ]);
    } else {
      await objectStorage.send(
        new DeleteObjectCommand({
          Bucket: attachmentBucket,
          Key: job.attachment.storageKey,
        }),
      );
      await prisma.attachment.delete({ where: { id: job.attachmentId } });
    }
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Unknown attachment sync error";
    await prisma.$transaction([
      prisma.attachmentSyncJob.update({
        where: { id: job.id },
        data: { attempts: { increment: 1 }, lastError: message },
      }),
      prisma.attachment.update({
        where: { id: job.attachmentId },
        data: { syncStatus: AttachmentSyncStatus.FAILED, syncError: message },
      }),
    ]);
    return false;
  }
}

export async function processAttachmentSyncJob(attachmentId: string) {
  const job = await prisma.attachmentSyncJob.findUnique({
    where: { attachmentId },
    include: { attachment: true },
  });
  return job ? processJob(job) : true;
}

export async function processAttachmentSyncJobs(limit = 25) {
  const jobs = await prisma.attachmentSyncJob.findMany({
    select: { attachmentId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    if (await processAttachmentSyncJob(job.attachmentId)) completed += 1;
    else failed += 1;
  }
  return { completed, failed, pending: Math.max(0, jobs.length - completed) };
}
