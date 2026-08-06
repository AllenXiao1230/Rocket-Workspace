import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { documentAccess } from "@/lib/permissions";
import { canWrite } from "@/lib/permissions";
import { createCollaborationToken } from "@/lib/collaboration-token";
import { readWorkspaceSettings } from "@/lib/workspace-settings";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await readWorkspaceSettings(access.document.project.workspaceId)).security.collaborationEnabled) return NextResponse.json({ disabled: true });
  if (!canWrite(access.membership.role)) return NextResponse.json({ readOnly: true });
  return NextResponse.json({ token: await createCollaborationToken(session.user.id, id) });
}
