import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const inputSchema = z.object({ key: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(240), description: z.string().trim().max(20_000).nullable().optional() });
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; if (!await projectAccess(session.user.id, id)) return NextResponse.json({ error: "Not found" }, { status: 404 }); return NextResponse.json(await prisma.requirement.findMany({ where: { projectId: id }, include: { verifications: { include: { testRecord: { select: { id: true, title: true, outcome: true } } } } }, orderBy: { key: "asc" } })); }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const input = inputSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "需求資料不正確" }, { status: 400 }); try { return NextResponse.json(await prisma.requirement.create({ data: { projectId: id, ...input.data } }), { status: 201 }); } catch { return NextResponse.json({ error: "需求代碼已存在" }, { status: 409 }); } }
