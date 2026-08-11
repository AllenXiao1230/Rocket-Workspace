import { DatabasePropertyType, PrismaClient, WorkspaceRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordFormulaFailures } from "@/lib/formula-error-history";

const prisma = new PrismaClient();
let workspaceId = "";
let databaseId = "";
let projectId = "";
let propertyId = "";
let rowId = "";

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `formula-history-${suffix}@example.test`,
      name: "Formula History Test",
      passwordHash: "not-used",
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: "Formula History Test", slug: `formula-history-${suffix}` },
  });
  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      code: `FH-${suffix.slice(0, 6)}`,
      name: "Formula History Test",
    },
  });
  const database = await prisma.database.create({
    data: { projectId: project.id, name: "Formula History Test" },
  });
  const [divisor, formula] = await Promise.all([
    prisma.databaseProperty.create({
      data: { databaseId: database.id, name: "除數", type: DatabasePropertyType.NUMBER },
    }),
    prisma.databaseProperty.create({
      data: {
        databaseId: database.id,
        name: "結果",
        type: DatabasePropertyType.FORMULA,
        options: { expression: "10 / {除數}" },
      },
    }),
  ]);
  const row = await prisma.databaseRow.create({
    data: { databaseId: database.id, values: { [divisor.id]: 0 } },
  });
  workspaceId = workspace.id;
  databaseId = database.id;
  projectId = project.id;
  propertyId = formula.id;
  rowId = row.id;
});

afterAll(async () => {
  if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
  await prisma.$disconnect();
});

describe("formula error history persistence", () => {
  it("keeps the error project-scoped without persisting source values", async () => {
    const [properties, row] = await Promise.all([
      prisma.databaseProperty.findMany({
        where: { databaseId },
        select: { id: true, name: true, type: true, options: true },
      }),
      prisma.databaseRow.findUniqueOrThrow({ where: { id: rowId } }),
    ]);
    await prisma.$transaction((tx) =>
      recordFormulaFailures(tx, {
        databaseId,
        projectId,
        workspaceId,
        properties,
        rows: [row],
      }),
    );
    const errors = await prisma.formulaEvaluationError.findMany({
      where: { databaseId },
    });
    expect(errors).toEqual([
      expect.objectContaining({
        rowId,
        propertyId,
        projectId,
        workspaceId,
        code: "DIVISION_BY_ZERO",
      }),
    ]);
    expect(Object.keys(errors[0])).not.toContain("values");
  });
});
