import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canChangeMembershipRole } from "@/lib/membership-permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspaceId: id },
  });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const members = await prisma.membership.findMany({
    where: { workspaceId: id },
    include: {
      user: {
        select: { id: true, email: true, name: true, avatarEmoji: true, avatarKey: true },
      },
    },
    orderBy: { nickname: "asc" },
  });
  return NextResponse.json(
    members.map(({ user, ...member }) => ({
      ...member,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarEmoji: user.avatarEmoji,
        avatarUrl: user.avatarKey
          ? `/api/account/avatar?userId=${encodeURIComponent(user.id)}&v=${encodeURIComponent(user.avatarKey.slice(-12))}`
          : null,
      },
    })),
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
  const input = z
    .object({
      email: z.string().email(),
      nickname: z.string().trim().min(1).max(40).optional(),
      teamGroup: z.string().trim().min(1).max(60).optional(),
      jobTitle: z.string().trim().min(1).max(80).optional(),
      role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.VIEWER),
    })
    .safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid member" }, { status: 400 });
  try {
    const member = await prisma.$transaction(
      async (tx) => {
        const requester = await tx.membership.findFirst({
          where: {
            userId: session.user.id,
            workspaceId: id,
            role: { in: ["OWNER", "ADMIN"] },
          },
        });
        if (!requester) throw new Error("FORBIDDEN");
        const user = await tx.user.findUnique({
          where: { email: input.data.email.toLowerCase() },
        });
        if (!user) throw new Error("USER_NOT_FOUND");
        const current = await tx.membership.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
        });
        const ownerCount =
          current?.role === "OWNER" && input.data.role !== "OWNER"
            ? await tx.membership.count({ where: { workspaceId: id, role: "OWNER" } })
            : 2;
        if (
          !canChangeMembershipRole(
            requester.role,
            current?.role || null,
            input.data.role,
            ownerCount,
          )
        )
          throw new Error("OWNER_PROTECTED");
        const saved = await tx.membership.upsert({
          where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
          update: {
            role: input.data.role,
            nickname: input.data.nickname,
            teamGroup: input.data.teamGroup,
            jobTitle: input.data.jobTitle,
          },
          create: {
            userId: user.id,
            workspaceId: id,
            role: input.data.role,
            nickname: input.data.nickname,
            teamGroup: input.data.teamGroup,
            jobTitle: input.data.jobTitle,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatarEmoji: true,
                avatarKey: true,
              },
            },
          },
        });
        await tx.auditEvent.create({
          data: {
            userId: session.user.id,
            action: current ? "workspace.member_updated" : "workspace.member_added",
            entity: "membership",
            entityId: saved.id,
            workspaceId: id,
            metadata: { role: input.data.role },
          },
        });
        return {
          ...saved,
          user: {
            id: saved.user.id,
            email: saved.user.email,
            name: saved.user.name,
            avatarEmoji: saved.user.avatarEmoji,
            avatarUrl: saved.user.avatarKey
              ? `/api/account/avatar?userId=${encodeURIComponent(saved.user.id)}&v=${encodeURIComponent(saved.user.avatarKey.slice(-12))}`
              : null,
          },
        };
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN" || message === "OWNER_PROTECTED")
      return NextResponse.json(
        {
          error: "只有擁有者能建立、變更或移除擁有者角色，且工作空間至少要保留一位擁有者",
        },
        { status: 403 },
      );
    if (message === "USER_NOT_FOUND")
      return NextResponse.json(
        { error: "Create the user account before adding a membership" },
        { status: 404 },
      );
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json(
      {
        error:
          code === "P2034"
            ? "成員資料剛被其他管理者變更，請重新整理後再試"
            : "無法儲存成員",
      },
      { status: code === "P2034" ? 409 : 500 },
    );
  }
}
