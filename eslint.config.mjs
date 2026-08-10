import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
      "prisma/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["components/**/*.tsx"],
    rules: {
      // Avatar URLs are authenticated, user-uploaded routes. Keep them out of
      // the image optimizer, which would otherwise fetch them server-side.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
