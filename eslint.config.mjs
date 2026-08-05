import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const reactSourceFiles = [
  "apps/**/*.{ts,tsx}",
  "packages/compare-core/src/**/*.{ts,tsx}",
  "packages/ui/src/**/*.{ts,tsx}",
];

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.next-dev/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/out/**",
      "**/next-env.d.ts",
    ],
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: reactSourceFiles,
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Keep the stable correctness rules without enabling experimental compiler-oriented checks.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
