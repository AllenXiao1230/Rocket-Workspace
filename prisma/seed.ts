import { AutomationAction, AutomationTrigger, PrismaClient, Prisma, WorkspaceRole, TaskStatus, IssueStatus, TestOutcome } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const doc = (content: Prisma.InputJsonValue[]): Prisma.InputJsonValue => ({ type: "doc", content });

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
  const admin = await prisma.user.upsert({
    where: { email },
    update: { name: process.env.BOOTSTRAP_ADMIN_NAME || "Workspace Admin" },
    create: { email, name: process.env.BOOTSTRAP_ADMIN_NAME || "Workspace Admin", passwordHash: await bcrypt.hash(password, 12) },
  });
  const workspace = await prisma.workspace.upsert({
    where: { slug: "rocket" }, update: {}, create: { name: "Rocket Workspace", slug: "rocket" },
  });
  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: admin.id, workspaceId: workspace.id } },
    update: { role: WorkspaceRole.OWNER },
    create: { userId: admin.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
  });
  const project = await prisma.project.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "ROCKET-2027" } },
    update: {}, create: { workspaceId: workspace.id, code: "ROCKET-2027", name: "Rocket 2027", description: "Flight hardware and ground-station programme" },
  });
  const overview = await prisma.document.upsert({
    where: { id: "seed-project-overview" }, update: {}, create: { id: "seed-project-overview", projectId: project.id, title: "Project Overview", position: 0, content: doc([
      { type: "paragraph", content: [{ type: "text", text: "A shared, auditable project space for the Rocket 2027 programme." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Operating rule" }] },
      { type: "paragraph", content: [{ type: "text", text: "Flight-state evaluation remains ObserveOnly. Actuation must be separately designed, reviewed, and explicitly enabled." }] },
    ]) } });
  await prisma.document.upsert({ where: { id: "seed-test-plan" }, update: {}, create: { id: "seed-test-plan", projectId: project.id, parentId: overview.id, title: "Test Plan", position: 1, content: doc([{ type: "paragraph", content: [{ type: "text", text: "Record procedure, hardware revision, operator, evidence, and outcome for every test." }] }]) } });
  await prisma.document.upsert({ where: { id: "seed-flight-notes" }, update: {}, create: { id: "seed-flight-notes", projectId: project.id, title: "Flight Notes", position: 2, content: doc([{ type: "paragraph", content: [{ type: "text", text: "Mission records are retained as evidence. Unknown telemetry is recorded as UNKNOWN, not zero." }] }]) } });
  await prisma.task.upsert({ where: { id: "seed-task-1" }, update: {}, create: { id: "seed-task-1", projectId: project.id, title: "Review telemetry v2 acceptance criteria", status: TaskStatus.IN_PROGRESS, priority: 1, assigneeId: admin.id } });
  await prisma.issue.upsert({ where: { projectId_key: { projectId: project.id, key: "ROCKET-17" } }, update: {}, create: { projectId: project.id, key: "ROCKET-17", title: "Confirm ground-link stale frame handling", status: IssueStatus.INVESTIGATING, severity: 1 } });
  await prisma.bomItem.upsert({ where: { projectId_partNumber: { projectId: project.id, partNumber: "LORA-E32" } }, update: {}, create: { projectId: project.id, partNumber: "LORA-E32", name: "LoRa telemetry module", quantity: 2, supplier: "TBD", status: "VERIFY" } });
  await prisma.testRecord.upsert({ where: { id: "seed-test-1" }, update: {}, create: { id: "seed-test-1", projectId: project.id, title: "Ground-link fail-closed test", outcome: TestOutcome.PLANNED, operator: admin.name } });
  const existingDatabase = await prisma.database.findFirst({ where: { projectId: project.id, name: "Mission tracker" } });
  if (!existingDatabase) {
    const database = await prisma.database.create({
      data: { projectId: project.id, name: "Mission tracker", properties: { create: [
        { name: "Name", type: "TEXT", position: 0 },
        { name: "Status", type: "STATUS", options: ["Not started", "In progress", "Done"], position: 1 },
        { name: "Priority", type: "SELECT", options: ["High", "Medium", "Low"], position: 2 },
        { name: "Due date", type: "DATE", position: 3 },
      ] }, views: { create: { name: "All records", position: 0 } } },
      include: { properties: { orderBy: { position: "asc" } } },
    });
    const [name, status, priority, dueDate] = database.properties;
    await prisma.databaseRow.createMany({ data: [
      { databaseId: database.id, position: 0, values: { [name.id]: "Telemetry review", [status.id]: "In progress", [priority.id]: "High", [dueDate.id]: "2026-08-20" } },
      { databaseId: database.id, position: 1, values: { [name.id]: "Ground link test evidence", [status.id]: "Not started", [priority.id]: "Medium", [dueDate.id]: "2026-08-24" } },
    ] });
  }
  const tracker = await prisma.database.findFirst({ where: { projectId: project.id, name: "Mission tracker" }, include: { properties: { orderBy: { position: "asc" } } } });
  if (tracker) {
    const nameProperty = tracker.properties.find((property) => property.name === "Name"); const statusProperty = tracker.properties.find((property) => property.name === "Status");
    if (nameProperty) await prisma.databaseTemplate.upsert({ where: { databaseId_name: { databaseId: tracker.id, name: "Test evidence" } }, update: {}, create: { databaseId: tracker.id, name: "Test evidence", values: { [nameProperty.id]: "New test evidence", ...(statusProperty ? { [statusProperty.id]: "Not started" } : {}) } } });
    if (statusProperty && !await prisma.databaseAutomation.findFirst({ where: { databaseId: tracker.id, name: "Default task status" } })) await prisma.databaseAutomation.create({ data: { databaseId: tracker.id, name: "Default task status", trigger: AutomationTrigger.ROW_CREATED, action: AutomationAction.SET_PROPERTY, config: { propertyId: statusProperty.id, value: "Not started" } } });
  }
}

main().finally(() => prisma.$disconnect());
