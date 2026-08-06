import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "專案代碼只能使用英文字母、數字、底線或連字號"),
  description: z.string().trim().max(1_000).optional(),
});

async function workspaceMembership(userId: string, workspaceId: string) {
  return prisma.membership.findFirst({ where: { userId, workspaceId } });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!await workspaceMembership(session.user.id, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.project.findMany({ where: { workspaceId: id }, select: { id: true, name: true, code: true, description: true, createdAt: true }, orderBy: { createdAt: "asc" } }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const membership = await workspaceMembership(session.user.id, id);
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) return NextResponse.json({ error: "只有擁有者或管理員能建立專案" }, { status: 403 });
  const input = projectSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message || "專案資料不正確" }, { status: 400 });
  try {
    const project = await prisma.project.create({ data: { workspaceId: id, ...input.data, description: input.data.description || null } });
    await prisma.auditEvent.create({ data: { userId: session.user.id, action: "project.created", entity: "project", entityId: project.id, workspaceId: id, projectId: project.id, metadata: { code: project.code } } });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ error: code === "P2002" ? "此專案代碼已被使用" : "無法建立專案" }, { status: code === "P2002" ? 409 : 500 });
  }
}
