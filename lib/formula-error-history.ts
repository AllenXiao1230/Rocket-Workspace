import { createHash } from "node:crypto";
import { DatabasePropertyType, Prisma } from "@prisma/client";
import { evaluateFormulaResult, type FormulaEvaluationCode } from "@/lib/formula";

const RETENTION_DAYS = 90;
const MAX_ERRORS_PER_DATABASE = 500;

type FormulaProperty = {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options: unknown;
};

type FormulaRow = { id: string; values: unknown };

type FormulaFailure = {
  propertyId: string;
  code: FormulaEvaluationCode;
  expressionHash: string;
};

const optionsFor = (options: unknown) =>
  options && typeof options === "object" && !Array.isArray(options)
    ? (options as Record<string, unknown>)
    : {};

const rowValues = (values: unknown) =>
  values && typeof values === "object" && !Array.isArray(values)
    ? (values as Record<string, unknown>)
    : {};

export function findFormulaFailures(
  properties: FormulaProperty[],
  row: FormulaRow,
): FormulaFailure[] {
  const values = rowValues(row.values);
  return properties.flatMap((property) => {
    if (property.type !== DatabasePropertyType.FORMULA) return [];
    const expression = String(optionsFor(property.options).expression || "");
    const result = evaluateFormulaResult(expression, (name) => {
      const source = properties.find((candidate) => candidate.name === name);
      return source ? values[source.id] : undefined;
    });
    return result.code
      ? [
          {
            propertyId: property.id,
            code: result.code,
            expressionHash: createHash("sha256").update(expression).digest("hex"),
          },
        ]
      : [];
  });
}

export async function recordFormulaFailures(
  tx: Pick<Prisma.TransactionClient, "formulaEvaluationError">,
  input: {
    databaseId: string;
    projectId: string;
    workspaceId: string;
    properties: FormulaProperty[];
    rows: FormulaRow[];
  },
) {
  const failures = input.rows.flatMap((row) =>
    findFormulaFailures(input.properties, row).map((failure) => ({
      ...failure,
      rowId: row.id,
      databaseId: input.databaseId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
    })),
  );
  if (!failures.length) return 0;
  await tx.formulaEvaluationError.createMany({ data: failures });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  await tx.formulaEvaluationError.deleteMany({
    where: { databaseId: input.databaseId, createdAt: { lt: cutoff } },
  });
  const excess = await tx.formulaEvaluationError.findMany({
    where: { databaseId: input.databaseId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    skip: MAX_ERRORS_PER_DATABASE,
  });
  if (excess.length)
    await tx.formulaEvaluationError.deleteMany({
      where: { id: { in: excess.map((error) => error.id) } },
    });
  return failures.length;
}
