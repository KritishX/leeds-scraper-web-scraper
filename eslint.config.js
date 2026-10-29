import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig(
  { ignores: ["dist/", "data/", "data-*/"] },
  js.configs.recommended,
  {
    files: ["server/**", "scripts/**", "tests/**", "*.config.*"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Catalog-driven forms carry values whose shape the server declares.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  { files: ["public/**/*.js"], languageOptions: { globals: globals.browser } },
);
