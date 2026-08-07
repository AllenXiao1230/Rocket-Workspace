import { redirect } from "next/navigation";
import { rawAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceShell } from "@/components/workspace-shell";
import { readDocumentMarkdown } from "@/lib/document-storage";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string; document?: string; task?: string }> }) {
  const session = await rawAuth();
  if (!session?.user?.id) redirect("/login");
  const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mustChangePassword: true, name: true, avatarEmoji: true } });
  if (account?.mustChangePassword) redirect("/change-password");
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: {
        include: {
          memberships: { include: { user: { select: { id: true, name: true, email: true, avatarEmoji: true } } }, orderBy: { nickname: "asc" } },
          projects: {
            include: {
              documents: { where: { deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
              databases: { include: { properties: { where: { deletedAt: null }, orderBy: { position: "asc" } }, views: { orderBy: { position: "asc" } }, rows: { where: { deletedAt: null }, orderBy: { position: "asc" } }, templates: { orderBy: { name: "asc" } }, automations: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "asc" } },
              tasks: { where: { deletedAt: null }, orderBy: [{ dueDate: "asc" }, { priority: "asc" }, { updatedAt: "desc" }], include: { assignee: { select: { id: true, name: true, email: true } }, dependencies: { where: { dependsOn: { deletedAt: null } }, include: { dependsOn: { select: { id: true, title: true, status: true } } } } } },
              issues: { where: { deletedAt: null } },
              bomItems: { where: { deletedAt: null } },
              testRecords: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  });
  if (!membership) return <main className="login"><section className="login-card"><p className="brand">Rocket Workspace</p><h1>尚未加入工作空間</h1><p className="hint">請由工作空間管理員邀請你的帳號後再登入。</p></section></main>;
  const { project: requestedProjectId, document: requestedDocumentId, task: requestedTaskId } = await searchParams;
  const taskProject = requestedTaskId ? membership.workspace.projects.find((item) => item.tasks.some((task) => task.id === requestedTaskId)) : undefined;
  const project = taskProject || membership.workspace.projects.find((item) => item.id === requestedProjectId) || membership.workspace.projects[0];
  if (!project) return <main className="login"><section className="login-card"><p className="brand">Rocket Workspace</p><h1>尚未建立專案</h1></section></main>;
  const documents = await Promise.all(project.documents.map(async (d) => ({ ...d, content: d.content as Record<string, unknown>, markdown: await readDocumentMarkdown(d) })));
  const myTasks = membership.workspace.projects.flatMap((item) => item.tasks.filter((task) => task.assigneeId === session.user.id).map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, updatedAt: task.updatedAt, dependencies: task.dependencies, projectId: item.id, projectName: item.name, projectCode: item.code })));
  return <WorkspaceShell user={{ id: session.user.id, name: account?.name || session.user.name || session.user.email || "Member", avatarEmoji: account?.avatarEmoji, role: membership.role }} workspace={membership.workspace.name} workspaceId={membership.workspace.id} project={{ id: project.id, name: project.name, code: project.code }} projects={membership.workspace.projects.map((item) => ({ id: item.id, name: item.name, code: item.code }))} documents={documents} initialActiveId={documents.some((document) => document.id === requestedDocumentId) ? requestedDocumentId : undefined} initialModule={taskProject ? "tasks" : undefined} initialSelectedTaskId={taskProject ? requestedTaskId : undefined} databases={project.databases.map((database) => ({ ...database, properties: database.properties.map((property) => ({ ...property, options: property.options })), views: database.views.map((view) => ({ ...view, config: view.config as Record<string, unknown> | null, filter: view.filter as Record<string, unknown> | null, sort: view.sort as Record<string, unknown> | null })), rows: database.rows.map((row) => ({ ...row, values: row.values as Record<string, unknown> })), templates: database.templates.map((template) => ({ ...template, values: template.values as Record<string, unknown> })), automations: database.automations.map((automation) => ({ ...automation, config: automation.config as Record<string, unknown> })) }))} records={{ tasks: project.tasks, issues: project.issues, bom: project.bomItems.map((item) => ({ ...item, unitCost: item.unitCost?.toString() ?? null })), tests: project.testRecords }} myTasks={myTasks} teamMembers={membership.workspace.memberships.map((item) => ({ id: item.id, role: item.role, nickname: item.nickname, teamGroup: item.teamGroup, jobTitle: item.jobTitle, user: item.user }))} />;
}
