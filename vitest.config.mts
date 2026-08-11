import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      thresholds: { branches: 35, functions: 50, lines: 50, statements: 50 },
    },
  },
});
