import { DatabasePropertyType, PrismaClient, WorkspaceRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processDatabaseImportJobs } from "@/lib/database-import";

const prisma = new PrismaClient();
let workspaceId = "";
let databaseId = "";
let propertyId = "";
let userId = "";

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { email: `integration-${suffix}@example.test`, name: "Integration Test", passwordHash: "not-used" } });
  const workspace = await prisma.workspace.create({ data: { name: "Integration Test", slug: `integration-${suffix}` } });
  await prisma.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER } });
  const project = await prisma.project.create({ data: { workspaceId: workspace.id, code: `IT-${suffix.slice(0, 6)}`, name: "Integration Test" } });
  const database = await prisma.database.create({ data: { projectId: project.id, name: "Import Test" } });
  const property = await prisma.databaseProperty.create({ data: { databaseId: database.id, name: "Title", type: DatabasePropertyType.TEXT } });
  await prisma.databaseImportJob.create({ data: { databaseId: database.id, userId: user.id, totalRows: 2, inputRows: [{ [property.id]: "first" }, { [property.id]: "second" }] } });
  workspaceId = workspace.id;
  databaseId = database.id;
  propertyId = property.id;
  userId = user.id;
});

afterAll(async () => {
  if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
  await prisma.$disconnect();
});

describe("database import worker", () => {
  it("commits a validated import atomically and records its source job", async () => {
    await expect(processDatabaseImportJobs()).resolves.toMatchObject({ completed: 1, failed: 0 });
    const [job, rows] = await Promise.all([
      prisma.databaseImportJob.findFirstOrThrow({ where: { databaseId } }),
      prisma.databaseRow.findMany({ where: { databaseId }, orderBy: { position: "asc" } }),
    ]);
    expect(job).toMatchObject({ status: "COMPLETED", processedRows: 2, createdRows: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.values && typeof row.values === "object" && !Array.isArray(row.values) ? row.values[propertyId] : undefined)).toEqual(["first", "second"]);
    expect(rows.every((row) => row.importJobId === job.id)).toBe(true);
  });

  it("rejects an invalid batch without committing its otherwise valid rows", async () => {
    const invalidJob = await prisma.databaseImportJob.create({
      data: {
        databaseId,
        userId,
        totalRows: 2,
        inputRows: [{ [propertyId]: "would be valid" }, { missingProperty: "invalid" }],
      },
    });

    await expect(processDatabaseImportJobs()).resolves.toMatchObject({ completed: 0, failed: 1 });

    const [job, rows] = await Promise.all([
      prisma.databaseImportJob.findUniqueOrThrow({ where: { id: invalidJob.id } }),
      prisma.databaseRow.findMany({ where: { databaseId } }),
    ]);
    expect(job).toMatchObject({ status: "FAILED", processedRows: 2, createdRows: 0 });
    expect(job.errorRows).toEqual([{ row: 3, message: "欄位不存在或已刪除" }]);
    expect(rows).toHaveLength(2);
  });
});
