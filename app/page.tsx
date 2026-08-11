import { redirect } from "next/navigation";
import { rawAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceShell } from "@/components/workspace-shell";

export const dynamic = "force-dynamic";

// Keep the first response bounded to one project. Other projects are only
// represented by their selector metadata instead of serializing every document,
// database row, and task from the workspace into the initial page payload.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string;
    project?: string;
    document?: string;
    task?: string;
  }>;
}) {
  const session = await rawAuth();
  if (!session?.user?.id) redirect("/login");
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, name: true, avatarEmoji: true, avatarKey: true },
  });
  if (account?.mustChangePassword) redirect("/change-password");
  const {
    workspace: requestedWorkspaceId,
    project: requestedProjectId,
    document: requestedDocumentId,
    task: requestedTaskId,
  } = await searchParams;
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { workspace: { createdAt: "asc" } },
  });
  const membership =
    memberships.find((item) => item.workspaceId === requestedWorkspaceId) ||
    memberships[0];
  if (!membership)
    return (
      <main className="login">
        <section className="login-card">
          <p className="brand">Rocket Workspace</p>
          <h1>尚未加入工作空間</h1>
          <p className="hint">請由工作空間管理員邀請你的帳號後再登入。</p>
        </section>
      </main>
    );
  const workspace = await prisma.workspace.findUnique({
    where: { id: membership.workspaceId },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarEmoji: true } },
        },
        orderBy: { nickname: "asc" },
      },
      projects: {
        select: { id: true, name: true, code: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!workspace) redirect("/");
  const task = requestedTaskId
    ? await prisma.task.findFirst({
        where: {
          id: requestedTaskId,
          deletedAt: null,
          project: { workspaceId: membership.workspaceId },
        },
        select: { id: true, projectId: true },
      })
    : null;
  const projectId =
    task?.projectId ||
    workspace.projects.find((project) => project.id === requestedProjectId)?.id ||
    workspace.projects[0]?.id;
  if (!projectId)
    return (
      <main className="login">
        <section className="login-card">
          <p className="brand">Rocket Workspace</p>
          <h1>尚未建立專案</h1>
        </section>
      </main>
    );
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: membership.workspaceId },
    include: {
      documents: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          icon: true,
          parentId: true,
          position: true,
          updatedAt: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: 51,
      },
      databases: {
        select: { id: true, name: true, icon: true, parentDocumentId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) redirect("/");
  const documents = project.documents.slice(0, 50);
  const nextDocumentCursor =
    project.documents.length > 50 ? documents.at(-1)?.id || null : null;
  return (
    <WorkspaceShell
      user={{
        id: session.user.id,
        name: account?.name || session.user.name || session.user.email || "Member",
        avatarEmoji: account?.avatarEmoji,
        avatarUrl: account?.avatarKey ? "/api/account/avatar" : null,
        role: membership.role,
      }}
      workspace={workspace.name}
      workspaceId={workspace.id}
      workspaces={memberships.map((item) => item.workspace)}
      project={{ id: project.id, name: project.name, code: project.code }}
      projects={workspace.projects}
      documents={documents}
      nextDocumentCursor={nextDocumentCursor}
      initialActiveId={
        documents.some((document) => document.id === requestedDocumentId)
          ? requestedDocumentId
          : undefined
      }
      initialModule={task ? "tasks" : undefined}
      initialSelectedTaskId={task?.id}
      databases={project.databases.map((database) => ({
        ...database,
        properties: [],
        rows: [],
        views: [],
        templates: [],
        automations: [],
      }))}
      records={{ tasks: [], issues: [], bom: [], tests: [] }}
      myTasks={[]}
      teamMembers={workspace.memberships.map((item) => ({
        id: item.id,
        role: item.role,
        nickname: item.nickname,
        teamGroup: item.teamGroup,
        jobTitle: item.jobTitle,
        user: item.user,
      }))}
    />
  );
}
