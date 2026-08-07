import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const loadedWorkspaceRoots = new Set<string>();

export function resolveWorkspaceRoot(fromModuleUrl: string, levelsUp: number): string {
  const currentDir = path.dirname(fileURLToPath(fromModuleUrl));
  return path.resolve(currentDir, ...Array(levelsUp).fill(".."));
}

/** Keeps generated published bundles under the ignored workspace output directory. */
export function resolveDefaultPublishedRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "output", "published");
}

/** Keeps the deployable public export beside other ignored workspace output. */
export function resolveDefaultPublicExportDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "output", "public-site");
}

export function loadWorkspaceEnvFromModule(fromModuleUrl: string, levelsUp: number): void {
  const workspaceRoot = resolveWorkspaceRoot(fromModuleUrl, levelsUp);
  if (loadedWorkspaceRoots.has(workspaceRoot)) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    // Local env files are a development fallback; deployment values come from process.env and
    // must not make Turbopack trace the entire workspace into the server bundle.
    const envFilePath = path.join(/* turbopackIgnore: true */ workspaceRoot, fileName);
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

  loadedWorkspaceRoots.add(workspaceRoot);
}
