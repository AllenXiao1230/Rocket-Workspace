import { AutomationTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyAutomations } from "@/lib/database-automations";
import { validateRowValues } from "@/lib/database-validation";

type InputRow = Record<string, unknown>;
type ImportError = { row: number | null; message: string };

export async function retryDatabaseImportJob(
  jobId: string,
  databaseId: string,
  userId: string,
) {
  const result = await prisma.databaseImportJob.updateMany({
    where: { id: jobId, databaseId, userId, status: "FAILED" },
    data: {
      status: "PENDING",
      processedRows: 0,
      createdRows: 0,
      errorRows: Prisma.DbNull,
    },
  });
  return result.count === 1;
}

export async function processDatabaseImportJobs(limit = 1) {
  let completed = 0;
  let failed = 0;
  for (let count = 0; count < limit; count += 1) {
    const job = await prisma.databaseImportJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) break;
    const claimed = await prisma.databaseImportJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING" },
    });
    if (!claimed.count) continue;
    const inputRows = Array.isArray(job.inputRows)
      ? (job.inputRows.filter((row) =>
          Boolean(row && typeof row === "object" && !Array.isArray(row)),
        ) as unknown as InputRow[])
      : [];
    try {
      const [properties, automations] = await Promise.all([
        prisma.databaseProperty.findMany({
          where: { databaseId: job.databaseId, deletedAt: null },
          select: { id: true, name: true, type: true, options: true },
        }),
        prisma.databaseAutomation.findMany({
          where: {
            databaseId: job.databaseId,
            trigger: AutomationTrigger.ROW_CREATED,
            enabled: true,
          },
          select: { name: true, action: true, config: true },
        }),
      ]);
      const rows: Prisma.InputJsonValue[] = [];
      const notifications: Array<{ title: string; body: string }> = [];
      const errors: ImportError[] = [];
      for (const [index, input] of inputRows.entries()) {
        const initial = validateRowValues(properties, input);
        const automated = initial.issues.length
          ? null
          : applyAutomations(automations, initial.values);
        const final = automated
          ? validateRowValues(properties, automated.values)
          : initial;
        const generated =
          automated?.createdRows.map((values) => validateRowValues(properties, values)) ||
          [];
        const issues = automated
          ? [...final.issues, ...generated.flatMap((result) => result.issues)]
          : initial.issues;
        errors.push(
          ...issues.map((issue) => ({ row: index + 2, message: issue.message })),
        );
        if (!issues.length) {
          rows.push(
            final.values as Prisma.InputJsonValue,
            ...generated.map((result) => result.values as Prisma.InputJsonValue),
          );
          notifications.push(...(automated?.notifications || []));
        }
        if ((index + 1) % 25 === 0 || index + 1 === inputRows.length) {
          await prisma.databaseImportJob.update({
            where: { id: job.id },
            data: { processedRows: index + 1 },
          });
        }
      }
      if (errors.length) {
        await prisma.databaseImportJob.update({
          where: { id: job.id },
          data: { status: "FAILED", processedRows: inputRows.length, errorRows: errors },
        });
        failed += 1;
        continue;
      }
      if (rows.length > 5_000) throw new Error("自動化產生的列數過多");
      await prisma.$transaction(async (tx) => {
        const max = await tx.databaseRow.aggregate({
          where: { databaseId: job.databaseId, deletedAt: null },
          _max: { position: true },
        });
        const position = (max._max.position ?? -1) + 1;
        await tx.databaseRow.createMany({
          data: rows.map((values, index) => ({
            databaseId: job.databaseId,
            values,
            position: position + index,
            importJobId: job.id,
          })),
        });
        if (notifications.length)
          await tx.notification.createMany({
            data: notifications.map((notification) => ({
              userId: job.userId,
              ...notification,
            })),
          });
        await tx.databaseImportJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            processedRows: inputRows.length,
            createdRows: rows.length,
          },
        });
      });
      completed += 1;
    } catch (error) {
      await prisma.databaseImportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorRows: [
            { row: null, message: error instanceof Error ? error.message : "匯入失敗" },
          ],
        },
      });
      failed += 1;
    }
  }
  return { completed, failed };
}
