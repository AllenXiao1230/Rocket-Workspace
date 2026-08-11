import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

export const recordAttachmentModules = ["bom", "tests"] as const;
export type RecordAttachmentModule = (typeof recordAttachmentModules)[number];

export function isRecordAttachmentModule(
  module: string,
): module is RecordAttachmentModule {
  return recordAttachmentModules.includes(module as RecordAttachmentModule);
}

export function recordAttachmentWhere(module: RecordAttachmentModule, recordId: string) {
  return module === "bom" ? { bomItemId: recordId } : { testRecordId: recordId };
}

export async function recordAttachmentAccess(
  userId: string,
  projectId: string,
  module: string,
  recordId: string,
) {
  if (!isRecordAttachmentModule(module)) return null;
  const access = await projectAccess(userId, projectId);
  if (!access) return null;
  const record =
    module === "bom"
      ? await prisma.bomItem.findFirst({
          where: { id: recordId, projectId, deletedAt: null },
        })
      : await prisma.testRecord.findFirst({
          where: { id: recordId, projectId, deletedAt: null },
        });
  return record ? { access, module } : null;
}
