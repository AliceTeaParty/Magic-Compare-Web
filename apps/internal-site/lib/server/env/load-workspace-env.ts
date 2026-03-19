import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let didLoadWorkspaceEnv = false;

function workspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../..");
}

export function loadWorkspaceEnv(): void {
  if (didLoadWorkspaceEnv) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    const envFilePath = path.join(workspaceRoot(), fileName);
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

  didLoadWorkspaceEnv = true;
}
