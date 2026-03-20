import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");

function loadWorkspaceEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const envFilePath = path.join(workspaceRoot, fileName);
    if (!existsSync(envFilePath)) {
      continue;
    }

    const fileContents = readFileSync(envFilePath, "utf8");
    for (const rawLine of fileContents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) {
        continue;
      }

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

loadWorkspaceEnv();

const sourceDir = process.env.MAGIC_COMPARE_PUBLISHED_ROOT
  ? path.resolve(process.env.MAGIC_COMPARE_PUBLISHED_ROOT)
  : path.join(workspaceRoot, "content", "published");
const destinationDir = path.join(
  workspaceRoot,
  "apps",
  "public-site",
  "public",
  "published",
);

mkdirSync(path.dirname(destinationDir), { recursive: true });
rmSync(destinationDir, { recursive: true, force: true });

if (existsSync(sourceDir)) {
  cpSync(sourceDir, destinationDir, { recursive: true });
} else {
  mkdirSync(destinationDir, { recursive: true });
}
