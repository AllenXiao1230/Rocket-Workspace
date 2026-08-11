import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const docContent = z
  .object({ type: z.string().max(60), content: z.array(z.unknown()).optional() })
  .passthrough();
const propertiesSchema = z
  .record(z.string().trim().min(1).max(80), z.string().trim().max(2_000))
  .refine((value) => Object.keys(value).length <= 40, "屬性不可超過 40 個");
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(16).optional(),
  content: docContent,
  markdown: z.string().max(500_000).nullable().optional(),
  properties: propertiesSchema.optional(),
});
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectAccess(session.user.id, id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await prisma.documentTemplate.findMany({
      where: { projectId: id },
      orderBy: { name: "asc" },
    }),
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "文件模板資料不正確" }, { status: 400 });
  let template;
  try {
    template = await prisma.documentTemplate.create({
      data: {
        projectId: id,
        name: input.data.name,
        icon: input.data.icon || "📄",
        content: input.data.content as Prisma.InputJsonValue,
        markdown: input.data.markdown || null,
        properties: (input.data.properties || {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    return NextResponse.json({ error: "模板名稱已存在" }, { status: 409 });
  }
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "document_template.created",
      entity: "document_template",
      entityId: template.id,
      workspaceId: access.project.workspaceId,
      projectId: id,
      metadata: { name: template.name },
    },
  });
  return NextResponse.json(template, { status: 201 });
}
