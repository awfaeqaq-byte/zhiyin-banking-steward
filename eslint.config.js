import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "node_modules",
      ".artifacts/**",
      "tmp/**",
      "output/**",
      "outputs/**",
      "releases/**",
      "docs/**",
      "deliverables/**",
      "reports/**",
      "参考文档/**",
      "mobilegym/**",
      "promptfoo-learning/generated/**",
      "vite.config.js",
      "vite.config.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
