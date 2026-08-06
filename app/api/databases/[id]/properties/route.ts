import { NextResponse } from "next/server";
import { z } from "zod";
import { DatabasePropertyType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

const optionValue = z.union([z.array(z.string().trim().min(1).max(50)).max(40), z.record(z.string(), z.unknown())]);
const schema = z.object({ name: z.string().trim().min(1).max(80), type: z.nativeEnum(DatabasePropertyType).default("TEXT"), options: optionValue.optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid property" }, { status: 400 });
  const max = await prisma.databaseProperty.aggregate({ where: { databaseId: id, deletedAt: null }, _max: { position: true } });
  const property = await prisma.databaseProperty.create({ data: { databaseId: id, name: parsed.data.name, type: parsed.data.type, options: parsed.data.options as Prisma.InputJsonValue | undefined, position: (max._max.position ?? -1) + 1 } });
  return NextResponse.json(property, { status: 201 });
}
