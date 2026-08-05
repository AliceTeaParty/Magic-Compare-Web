import { describe, expect, it } from "vitest";
import { summarizePublicDeployError } from "./public-deploy-job";

describe("public deploy error summaries", () => {
  it("skips framework warning noise and keeps the first actionable detail", () => {
    expect(
      summarizePublicDeployError(`Command failed: pnpm --filter @magic-compare/public-site build
⚠ You are using a non-standard NODE_ENV value.
Each child in a list should have a unique key prop.
Check the top-level render call using <meta>.
See https://react.dev/link/warning-keys
Error occurred prerendering page /_global-error.`),
    ).toBe(
      "pnpm --filter @magic-compare/public-site build：Error occurred prerendering page /_global-error.",
    );
  });

  it("limits long command failures to the requested character count", () => {
    const summary = summarizePublicDeployError(`Command failed: ${"x".repeat(300)}`, 80);
    expect(Array.from(summary)).toHaveLength(80);
    expect(summary.endsWith("…")).toBe(true);
  });
});
