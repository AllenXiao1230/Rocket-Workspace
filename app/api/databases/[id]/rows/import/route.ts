import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { retryDatabaseImportJob } from "@/lib/database-import";

const schema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2_000) });
const patchSchema = z.object({ jobId: z.string().min(1), action: z.enum(["rollback", "retry"]).default("rollback") });

async function accessFor(userId: string, databaseId: string) { return databaseAccess(userId, databaseId); }
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"`;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await accessFor(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "匯入資料必須為 1 至 2,000 列" }, { status: 400 });
  const job = await prisma.databaseImportJob.create({ data: { databaseId: id, userId: session.user.id, totalRows: input.data.rows.length, inputRows: input.data.rows as Prisma.InputJsonValue } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_import.queued", entity: "database_import", entityId: job.id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, totalRows: job.totalRows } } });
  return NextResponse.json({ id: job.id, status: job.status, totalRows: job.totalRows }, { status: 202 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const access = await accessFor(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const jobId = new URL(request.url).searchParams.get("jobId"); if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const job = await prisma.databaseImportJob.findFirst({ where: { id: jobId, databaseId: id, userId: session.user.id }, select: { id: true, status: true, totalRows: true, processedRows: true, createdRows: true, errorRows: true, createdAt: true, updatedAt: true } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (new URL(request.url).searchParams.get("download") === "errors") {
    const errors = Array.isArray(job.errorRows) ? job.errorRows : [];
    const csv = ["row,message", ...errors.map((error) => {
      const item = error && typeof error === "object" ? error as { row?: unknown; message?: unknown } : {};
      return `${csvCell(item.row ?? "")},${csvCell(item.message ?? "匯入失敗")}`;
    })].join("\r\n");
    return new NextResponse(`\ufeff${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="database-import-${job.id}-errors.csv"` } });
  }
  return NextResponse.json(job);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const access = await accessFor(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = patchSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "匯入操作不正確" }, { status: 400 });
  if (input.data.action === "retry") {
    const job = await prisma.databaseImportJob.findFirst({ where: { id: input.data.jobId, databaseId: id, userId: session.user.id, status: "FAILED" }, select: { id: true, totalRows: true } });
    if (!job || !await retryDatabaseImportJob(job.id, id, session.user.id)) return NextResponse.json({ error: "找不到可重新嘗試的匯入" }, { status: 404 });
    await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_import.retried", entity: "database_import", entityId: job.id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, totalRows: job.totalRows } } });
    return NextResponse.json({ id: job.id, status: "PENDING", totalRows: job.totalRows, processedRows: 0, createdRows: 0 });
  }
  const job = await prisma.databaseImportJob.findFirst({ where: { id: input.data.jobId, databaseId: id, userId: session.user.id, status: "COMPLETED" } }); if (!job) return NextResponse.json({ error: "找不到可回復的匯入" }, { status: 404 });
  const deletionBatchId = crypto.randomUUID();
  const result = await prisma.$transaction([prisma.databaseRow.updateMany({ where: { databaseId: id, importJobId: job.id, deletedAt: null }, data: { deletedAt: new Date(), deletionBatchId } }), prisma.databaseImportJob.update({ where: { id: job.id }, data: { status: "ROLLED_BACK" } }), prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_import.rolled_back", entity: "database_import", entityId: job.id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, rolledBackRows: job.createdRows } } })]);
  return NextResponse.json({ ok: true, rolledBackRows: result[0].count });
}
