/** Evaluate the small arithmetic subset supported by database formulas.
 * It deliberately accepts only numbers, parentheses, and + - * / % operators. */
export function evaluateFormula(
  expression: string,
  valueForName: (name: string) => unknown,
): string | null {
  const expanded = expression.replace(/\{([^}]+)\}/g, (_, name) =>
    String(Number(valueForName(String(name).trim())) || 0),
  );
  const compact = expanded.replace(/\s+/g, "");
  if (!compact || !/^[\d+\-*/%.()]+$/.test(compact)) return null;
  const tokens = compact.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join("") !== compact) return null;
  let index = 0;
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
      if (right === null || ((operator === "/" || operator === "%") && right === 0))
        return null;
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
  return result === null || index !== tokens.length || !Number.isFinite(result)
    ? null
    : String(result);
}
