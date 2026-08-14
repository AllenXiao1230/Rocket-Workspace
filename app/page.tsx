import { redirect } from "next/navigation";
import { rawAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { TaskView } from "@/components/project-module-board";

export const dynamic = "force-dynamic";

const workspaceModules = ["tasks", "gantt", "issues", "bom", "tests"] as const;
const workspacePanels = ["settings", "team", "recycle", "ai"] as const;
const taskViews = ["table", "board"] as const;
type WorkspaceModule = (typeof workspaceModules)[number];
type WorkspacePanel = (typeof workspacePanels)[number];

const isWorkspaceModule = (value: string | undefined): value is WorkspaceModule =>
  Boolean(value && workspaceModules.includes(value as WorkspaceModule));
const isWorkspacePanel = (value: string | undefined): value is WorkspacePanel =>
  Boolean(value && workspacePanels.includes(value as WorkspacePanel));
const isTaskView = (value: string | undefined): value is TaskView =>
  Boolean(value && taskViews.includes(value as TaskView));

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
    database?: string;
    module?: string;
    task?: string;
    taskView?: string;
    panel?: string;
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
    database: requestedDatabaseId,
    module: requestedModuleId,
    task: requestedTaskId,
    taskView: requestedTaskViewId,
    panel: requestedPanelId,
  } = await searchParams;
  const requestedModule = isWorkspaceModule(requestedModuleId)
    ? requestedModuleId
    : undefined;
  const requestedPanel = isWorkspacePanel(requestedPanelId)
    ? requestedPanelId
    : undefined;
  const requestedTaskView = isTaskView(requestedTaskViewId)
    ? requestedTaskViewId
    : undefined;
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
      <main id="main-content" className="login" tabIndex={-1}>
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
  const [task, requestedDocument, requestedDatabase] = await Promise.all([
    requestedTaskId
      ? prisma.task.findFirst({
          where: {
            id: requestedTaskId,
            deletedAt: null,
            project: { workspaceId: membership.workspaceId },
          },
          select: { id: true, projectId: true },
        })
      : null,
    requestedDocumentId
      ? prisma.document.findFirst({
          where: {
            id: requestedDocumentId,
            deletedAt: null,
            project: { workspaceId: membership.workspaceId },
          },
          select: {
            id: true,
            projectId: true,
            title: true,
            icon: true,
            parentId: true,
            position: true,
            updatedAt: true,
          },
        })
      : null,
    requestedDatabaseId
      ? prisma.database.findFirst({
          where: {
            id: requestedDatabaseId,
            project: { workspaceId: membership.workspaceId },
          },
          select: { id: true, projectId: true },
        })
      : null,
  ]);
  const projectId =
    task?.projectId ||
    requestedDocument?.projectId ||
    requestedDatabase?.projectId ||
    workspace.projects.find((project) => project.id === requestedProjectId)?.id ||
    workspace.projects[0]?.id;
  if (!projectId)
    return (
      <main id="main-content" className="login" tabIndex={-1}>
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
  const selectedDocument =
    requestedDocument?.projectId === project.id &&
    !documents.some((document) => document.id === requestedDocument.id)
      ? requestedDocument
      : null;
  const visibleDocuments = selectedDocument
    ? [...documents, selectedDocument]
    : documents;
  const nextDocumentCursor =
    project.documents.length > 50 ? documents.at(-1)?.id || null : null;
  return (
    <WorkspaceShell
      key={`${workspace.id}:${project.id}`}
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
      documents={visibleDocuments}
      nextDocumentCursor={nextDocumentCursor}
      initialActiveId={
        visibleDocuments.some((document) => document.id === requestedDocumentId)
          ? requestedDocumentId
          : undefined
      }
      initialDatabaseId={
        project.databases.some((database) => database.id === requestedDatabase?.id)
          ? requestedDatabase?.id
          : undefined
      }
      initialModule={task ? "tasks" : requestedModule}
      initialSelectedTaskId={task?.id}
      initialTaskView={
        task || requestedModule === "tasks" ? requestedTaskView : undefined
      }
      initialPanel={requestedPanel}
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
