export type FormulaEvaluationCode =
  | "INVALID_EXPRESSION"
  | "INVALID_ARITHMETIC"
  | "DIVISION_BY_ZERO"
  | "NON_FINITE_RESULT";

export type FormulaEvaluationResult =
  | { value: string; code: null }
  | { value: null; code: FormulaEvaluationCode };

/** Evaluate the small arithmetic subset supported by database formulas.
 * It deliberately accepts only numbers, parentheses, and + - * / % operators. */
export function evaluateFormulaResult(
  expression: string,
  valueForName: (name: string) => unknown,
): FormulaEvaluationResult {
  const expanded = expression.replace(/\{([^}]+)\}/g, (_, name) =>
    String(Number(valueForName(String(name).trim())) || 0),
  );
  const compact = expanded.replace(/\s+/g, "");
  if (!compact || !/^[\d+\-*/%.()]+$/.test(compact))
    return { value: null, code: "INVALID_EXPRESSION" };
  const tokens = compact.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join("") !== compact)
    return { value: null, code: "INVALID_EXPRESSION" };
  let index = 0;
  let divisionByZero = false;
  const factor = (): number | null => {
    const token = tokens[index++];
    if (token === "+") return factor();
    if (token === "-") {
      const value = factor();
      return value === null ? null : -value;
    }
    if (token === "(") {
      const value = expressionRule();
      if (tokens[index++] !== ")") return null;
      return value;
    }
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const term = (): number | null => {
    let value = factor();
    while (value !== null && ["*", "/", "%"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = factor();
      if (right === null) return null;
      if ((operator === "/" || operator === "%") && right === 0) {
        divisionByZero = true;
        return null;
      }
      value =
        operator === "*"
          ? value * right
          : operator === "/"
            ? value / right
            : value % right;
    }
    return value;
  };
  const expressionRule = (): number | null => {
    let value = term();
    while (value !== null && ["+", "-"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = term();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = expressionRule();
  if (divisionByZero) return { value: null, code: "DIVISION_BY_ZERO" };
  if (result === null || index !== tokens.length)
    return { value: null, code: "INVALID_ARITHMETIC" };
  if (!Number.isFinite(result)) return { value: null, code: "NON_FINITE_RESULT" };
  return { value: String(result), code: null };
}

export function evaluateFormula(
  expression: string,
  valueForName: (name: string) => unknown,
): string | null {
  return evaluateFormulaResult(expression, valueForName).value;
}
