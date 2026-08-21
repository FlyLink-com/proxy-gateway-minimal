// ESLint flat config baseline for proxy-gateway-admin.
//
// Scope: src/**\/*.{ts,tsx}. Vite config files, build outputs, and
// generated artifacts are ignored. Recommended presets only; the
// minimum hand-tuned rules needed to catch the most common React +
// TypeScript regressions are layered on top.
//
// Intent: build a stable quality gate for future PRs. This PR
// deliberately does NOT touch source files. Any findings surfaced
// during the baseline run will be addressed in a separate follow-up PR
// (`fix(admin): resolve eslint baseline findings`).

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-portal/**",
      "dist-site/**",
      "node_modules/**",
      "public/**",
      "coverage/**",
      "vite*.config.ts",
      "*.config.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
