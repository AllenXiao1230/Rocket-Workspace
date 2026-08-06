import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const requirements = await prisma.requirement.findMany({ where: { projectId: id }, include: { verifications: { include: { testRecord: { select: { title: true, outcome: true, testDate: true } } } } }, orderBy: { key: "asc" } });
  const records = await prisma.testRecord.findMany({ where: { projectId: id, deletedAt: null }, include: { plan: true, steps: { orderBy: { position: "asc" } }, measurements: true, approvals: { include: { reviewer: { select: { name: true } } } } }, orderBy: { testDate: "desc" } });
  const matrix = requirements.map((requirement) => [requirement.key, requirement.title, requirement.verifications.map((verification) => `${verification.testRecord.title} (${verification.testRecord.outcome})`).join(" | ") || "未驗證"]); const summary = records.map((record) => [record.title, record.plan?.title || "", record.outcome, record.testDate?.toISOString().slice(0, 10) || "", String(record.steps.length), String(record.measurements.length), record.approvals.map((approval) => `${approval.status}:${approval.reviewer.name}`).join(" | ") || "未簽核"]);
  const csv = toCsv([["需求追溯矩陣"], ["需求代碼", "需求", "驗證測試"], ...matrix, [], ["測試報告"], ["測試", "計畫", "結果", "日期", "步驟", "量測", "簽核"], ...summary]);
  return new NextResponse("\ufeff" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${access.project.code}-test-report.csv`)}`, "Cache-Control": "private, no-store" } });
}
