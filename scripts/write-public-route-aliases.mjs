import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// legacy-compat route aliases for existing /cases/[caseSlug]/groups/[groupSlug] links
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const exportRoot = path.join(workspaceRoot, "apps", "public-site", "out");
const aliasRoot = path.join(exportRoot, "cases");
const emptyPlaceholderSlug = "__empty__";

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

function publishedGroupsDir() {
  const publishedRoot = process.env.MAGIC_COMPARE_PUBLISHED_ROOT?.trim()
    ? path.resolve(process.env.MAGIC_COMPARE_PUBLISHED_ROOT.trim())
    : path.join(workspaceRoot, "content", "published");
  return path.join(publishedRoot, "groups");
}

function readAliases() {
  const groupsDir = publishedGroupsDir();
  if (!existsSync(groupsDir)) {
    return [];
  }

  return readdirSync(groupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = path.join(groupsDir, entry.name, "manifest.json");
      if (!existsSync(manifestPath)) {
        return [];
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const caseSlug = manifest?.case?.slug;
      const groupSlug = manifest?.group?.slug;
      const publicSlug = manifest?.publicSlug;

      if (!caseSlug || !groupSlug || !publicSlug) {
        return [];
      }

      return [{ caseSlug, groupSlug, publicSlug }];
    });
}

function renderRedirectHtml(targetHref) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${targetHref}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting…</title>
    <script>window.location.replace(${JSON.stringify(targetHref)});</script>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #000814;
        color: #f7f2da;
        font-family: "IBM Plex Sans", sans-serif;
      }
      main { padding: 24px; text-align: center; }
      a { color: inherit; }
      p { margin: 0; }
      p + p { margin-top: 12px; opacity: 0.8; }
    </style>
  </head>
  <body>
    <main>
      <p>Redirecting to the public group page…</p>
      <p><a href="${targetHref}">Continue manually</a></p>
    </main>
  </body>
</html>
`;
}

function main() {
  loadWorkspaceEnv();

  if (!existsSync(exportRoot)) {
    throw new Error(`Public export output not found: ${exportRoot}`);
  }

  rmSync(aliasRoot, { recursive: true, force: true });
  rmSync(path.join(exportRoot, "g", `${emptyPlaceholderSlug}.html`), { force: true });
  rmSync(path.join(exportRoot, "g", `${emptyPlaceholderSlug}.txt`), { force: true });

  for (const alias of readAliases()) {
    const aliasDir = path.join(aliasRoot, alias.caseSlug, "groups", alias.groupSlug);
    mkdirSync(aliasDir, { recursive: true });
    writeFileSync(
      path.join(aliasDir, "index.html"),
      renderRedirectHtml(`/g/${alias.publicSlug}`),
      "utf8",
    );
  }
}

main();
