import type {
  BrowserUploadFile,
  IgnoredUploadFile,
  WebUploadAssetPlan,
  WebUploadFramePlan,
  WebUploadIssue,
  WebUploadPlan,
} from "./web-upload-types";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);
const SOURCE_VARIANTS = new Set(["src", "source", "ori", "origin", "before"]);
const AFTER_VARIANTS = new Set(["after", "out", "output", "rip"]);
const HEATMAP_VARIANTS = new Set(["heatmap"]);
const BEFORE_DIR_HINTS = new Set([...SOURCE_VARIANTS, "before"]);
const AFTER_DIR_HINTS = new Set([...AFTER_VARIANTS, "after"]);
const MISC_DIR_HINTS = new Set(["misc", "extra", "extras", "alt", "alts"]);
const IGNORED_BASENAMES = new Set([".ds_store", "thumbs.db"]);
const IGNORED_SUFFIXES = new Set([".json", ".yaml", ".yml", ".txt", ".md", ".csv", ".db", ".log"]);
const FILENAME_RE = /(?<prefix>.+?)[_\-.](?<frame>\d+)(?:[_\-.](?<variant>[^_\-.]+))?$/;
const FALLBACK_FILENAME_RE = /^(?<frame>\d+)(?<variant>[A-Za-z][A-Za-z0-9]*)$/;
const GROUP_SUFFIX_NOISE_RE = /(?:[_\-. ]+\d{4,5}[_\-. ]+gen[_\-. ]+vpy)$/i;
const MATCH_KEY_SUFFIX_RE = /(?:[_\-. ]+(?:before|after|src|source|ori|origin|out|output|rip|misc|heatmap))+$/i;
const NON_ALNUM_RE = /[^0-9a-z]+/g;

interface SourceCandidate {
  entry: BrowserUploadFile;
  originalName: string;
  variant: string;
  fps: string;
  episode: string;
  frameNumber: number;
  title: string;
  caption: string;
  rootHint: string;
  isFallback: boolean;
}

interface NonFlatLayout {
  beforeDir: string | null;
  afterDirs: string[];
  heatmapDirs: string[];
  miscDirs: string[];
}

function extensionOf(path: string) {
  const dotIndex = path.lastIndexOf(".");
  return dotIndex === -1 ? "" : path.slice(dotIndex).toLowerCase();
}

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function stem(path: string) {
  const name = basename(path);
  const dotIndex = name.lastIndexOf(".");
  return dotIndex === -1 ? name : name.slice(0, dotIndex);
}

function splitTokens(input: string) {
  return input.split(/[_\-.]+/).filter(Boolean);
}

function extractFps(input: string) {
  return input.match(/^(\d{2})/)?.[1] ?? "00";
}

function extractEpisode(prefix: string) {
  const numericTokens = splitTokens(prefix)
    .filter((token) => /^\d+$/.test(token))
    .reverse();
  const candidate = numericTokens.find((token) => String(Number(token)).length <= 3);
  return candidate ? String(Number(candidate)).padStart(2, "0") : "00";
}

function kebabCase(input: string) {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleCase(input: string) {
  return input
    .replace(/[_\-.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ignoreReason(entry: BrowserUploadFile) {
  const normalizedName = basename(entry.relativePath).toLowerCase();
  if (IGNORED_BASENAMES.has(normalizedName) || normalizedName.startsWith("._")) {
    return "system-artifact";
  }
  if (normalizedName.startsWith(".")) {
    return "hidden-file";
  }
  if (normalizedName.endsWith("~") || normalizedName.endsWith(".swp") || normalizedName.endsWith(".tmp")) {
    return "editor-temp";
  }
  if (normalizedName.startsWith("thumb-")) {
    return "generated-thumbnail";
  }
  if (IGNORED_SUFFIXES.has(extensionOf(normalizedName))) {
    return "sidecar-file";
  }
  if (!SUPPORTED_EXTENSIONS.has(extensionOf(normalizedName))) {
    return "unsupported-file-type";
  }
  return null;
}

function directoryTokens(name: string) {
  return new Set(
    name
      .toLowerCase()
      .replace(NON_ALNUM_RE, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function pathMatchesHints(path: string, hints: Set<string>) {
  return [...directoryTokens(basename(path))].some((token) => hints.has(token));
}

function topLevelDirectory(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : "";
}

function stripSharedTopLevelDirectory(entries: BrowserUploadFile[]) {
  if (entries.length === 0) {
    return entries;
  }

  const firstParts = entries[0].relativePath.split("/").filter(Boolean);
  if (firstParts.length <= 1) {
    return entries;
  }

  const sharedRoot = firstParts[0];
  if (
    !entries.every((entry) => {
      const parts = entry.relativePath.split("/").filter(Boolean);
      return parts.length > 1 && parts[0] === sharedRoot;
    })
  ) {
    return entries;
  }

  return entries.map((entry) => ({
    ...entry,
    relativePath: entry.relativePath.split("/").filter(Boolean).slice(1).join("/"),
  }));
}

function suggestNonFlatLayout(entries: BrowserUploadFile[]): NonFlatLayout {
  const directories = [...new Set(entries.map((entry) => topLevelDirectory(entry.relativePath)).filter(Boolean))].sort();
  const beforeDir = directories.find((path) => pathMatchesHints(path, BEFORE_DIR_HINTS)) ?? null;
  const afterDirs = directories.filter((path) => path !== beforeDir && pathMatchesHints(path, AFTER_DIR_HINTS));
  const heatmapDirs = directories.filter((path) => path !== beforeDir && !afterDirs.includes(path) && pathMatchesHints(path, HEATMAP_VARIANTS));
  const miscDirs = directories.filter((path) => path !== beforeDir && !afterDirs.includes(path) && !heatmapDirs.includes(path) && pathMatchesHints(path, MISC_DIR_HINTS));

  return { beforeDir, afterDirs, heatmapDirs, miscDirs };
}

function parseCandidate(entry: BrowserUploadFile, variantOverride?: string): SourceCandidate | null {
  const pathStem = stem(entry.relativePath);
  const match = FILENAME_RE.exec(pathStem);
  if (match?.groups) {
    const prefix = match.groups.prefix;
    const rawFrame = match.groups.frame;
    const frameNumber = Number(rawFrame.replace(/^0+/, "") || "0");
    const variant = (variantOverride ?? match.groups.variant ?? "output").trim().toLowerCase();
    const fps = extractFps(pathStem);
    const episode = extractEpisode(prefix);
    const title = `${fps}_${episode}_${frameNumber}`;
    return {
      entry,
      originalName: basename(entry.relativePath),
      variant,
      fps,
      episode,
      frameNumber,
      title,
      caption: `fps ${fps} / episode ${episode} / frame ${frameNumber}`,
      rootHint: prefix,
      isFallback: false,
    };
  }

  const fallbackMatch = FALLBACK_FILENAME_RE.exec(pathStem);
  if (fallbackMatch?.groups) {
    const frameNumber = Number(fallbackMatch.groups.frame.replace(/^0+/, "") || "0");
    return {
      entry,
      originalName: basename(entry.relativePath),
      variant: (variantOverride ?? fallbackMatch.groups.variant).trim().toLowerCase(),
      fps: "00",
      episode: "00",
      frameNumber,
      title: String(frameNumber),
      caption: `frame ${frameNumber}`,
      rootHint: pathStem,
      isFallback: true,
    };
  }

  if (!variantOverride) {
    return null;
  }

  const numberTokens = pathStem.match(/\d+/g);
  const frameNumber = Number(numberTokens?.at(-1)?.replace(/^0+/, "") || "0");
  const fallbackTitle = frameNumber ? String(frameNumber) : pathStem;
  return {
    entry,
    originalName: basename(entry.relativePath),
    variant: variantOverride,
    fps: "00",
    episode: "00",
    frameNumber,
    title: fallbackTitle,
    caption: `file ${pathStem}`,
    rootHint: pathStem,
    isFallback: true,
  };
}

function candidateFrameKey(candidate: SourceCandidate) {
  return `${candidate.fps}:${candidate.episode}:${candidate.frameNumber}`;
}

function afterPriority(candidate: SourceCandidate) {
  const priority = candidate.variant === "out" ? 0 : candidate.variant === "output" ? 1 : candidate.variant === "rip" ? 2 : candidate.variant === "after" ? 3 : 4;
  return `${priority}:${candidate.variant}:${candidate.originalName.toLowerCase()}`;
}

function assetPlan(kind: WebUploadAssetPlan["kind"], candidate: SourceCandidate): WebUploadAssetPlan {
  const label =
    kind === "before"
      ? "基准图"
      : kind === "after"
        ? "对比方案"
        : kind === "heatmap"
          ? "Heatmap"
          : candidate.variant || "Misc";
  return {
    kind,
    label,
    note: candidate.originalName,
    source: candidate.entry,
  };
}

function buildFrameFromCandidates(order: number, candidates: SourceCandidate[], fallbackWidth: number): WebUploadFramePlan | WebUploadIssue {
  const beforeCandidates = candidates.filter((candidate) => SOURCE_VARIANTS.has(candidate.variant));
  if (beforeCandidates.length !== 1) {
    return {
      code: "before-count",
      severity: "error",
      path: candidates[0]?.entry.relativePath ?? "",
      message: `${candidates[0]?.title ?? "frame"} 需要且只能有一个基准图 before/source 文件，当前找到 ${beforeCandidates.length} 个。`,
    };
  }

  const heatmapCandidates = candidates.filter((candidate) => HEATMAP_VARIANTS.has(candidate.variant));
  if (heatmapCandidates.length > 1) {
    return {
      code: "heatmap-count",
      severity: "error",
      path: heatmapCandidates[0].entry.relativePath,
      message: `${candidates[0].title} 存在多个 heatmap 候选。`,
    };
  }

  const outputCandidates = candidates.filter((candidate) => !SOURCE_VARIANTS.has(candidate.variant) && !HEATMAP_VARIANTS.has(candidate.variant));
  if (outputCandidates.length === 0) {
    return {
      code: "after-missing",
      severity: "error",
      path: candidates[0].entry.relativePath,
      message: `${candidates[0].title} 没有可用的对比方案 after/output 文件。`,
    };
  }

  const before = beforeCandidates[0];
  const after = [...outputCandidates].sort((left, right) => afterPriority(left).localeCompare(afterPriority(right)))[0];
  const misc = outputCandidates
    .filter((candidate) => candidate !== after)
    .sort((left, right) => `${left.variant}:${left.originalName}`.localeCompare(`${right.variant}:${right.originalName}`));
  const title = before.isFallback ? String(before.frameNumber).padStart(fallbackWidth, "0") : before.title;
  const caption = before.isFallback ? `frame ${before.frameNumber}` : before.caption;

  return {
    order,
    title,
    caption,
    before: assetPlan("before", before),
    after: assetPlan("after", after),
    heatmap: heatmapCandidates[0] ? assetPlan("heatmap", heatmapCandidates[0]) : null,
    misc: misc.map((candidate) => assetPlan("misc", candidate)),
  };
}

function matchKeyForName(name: string) {
  const normalized = name.toLowerCase().replace(MATCH_KEY_SUFFIX_RE, "");
  return normalized.replace(NON_ALNUM_RE, "-").replace(/^-+|-+$/g, "") || name.toLowerCase().replace(NON_ALNUM_RE, "-").replace(/^-+|-+$/g, "");
}

function matchTokensForName(name: string) {
  return new Set(matchKeyForName(name).split("-").filter(Boolean));
}

function similarityScore(left: Set<string>, right: Set<string>) {
  let score = 0;
  for (const token of left) {
    if (right.has(token)) {
      score += /^\d+$/.test(token) ? 3 : 1;
    }
  }
  return score;
}

function groupByMatchKey(candidates: SourceCandidate[]) {
  const grouped = new Map<string, SourceCandidate[]>();
  for (const candidate of candidates) {
    const key = matchKeyForName(stem(candidate.entry.relativePath));
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  return grouped;
}

function assignCandidatesToBeforeKeys(candidates: SourceCandidate[], beforeByKey: Map<string, SourceCandidate[]>) {
  const grouped = new Map<string, SourceCandidate[]>();
  const unmatched: SourceCandidate[] = [];
  const beforeTokens = new Map([...beforeByKey.entries()].map(([key, items]) => [key, matchTokensForName(stem(items[0].entry.relativePath))]));

  for (const candidate of candidates) {
    const directKey = matchKeyForName(stem(candidate.entry.relativePath));
    if (beforeByKey.has(directKey)) {
      grouped.set(directKey, [...(grouped.get(directKey) ?? []), candidate]);
      continue;
    }

    const candidateTokens = matchTokensForName(stem(candidate.entry.relativePath));
    const scored = [...beforeTokens.entries()]
      .map(([key, tokens]) => [key, similarityScore(candidateTokens, tokens)] as const)
      .sort((left, right) => right[1] - left[1]);
    if (scored.length === 0 || scored[0][1] <= 0 || scored[0][1] === scored[1]?.[1]) {
      unmatched.push(candidate);
      continue;
    }

    grouped.set(scored[0][0], [...(grouped.get(scored[0][0]) ?? []), candidate]);
  }

  return { grouped, unmatched };
}

function deriveGroupIdentity(sourceRootName: string, candidates: SourceCandidate[]) {
  const sourceSlug = kebabCase(sourceRootName);
  if (sourceSlug && sourceSlug !== "uploaded-group") {
    return {
      slug: sourceSlug,
      title: titleCase(sourceRootName) || "Uploaded Group",
    };
  }

  const hints = candidates.map((candidate) => candidate.rootHint);
  let commonPrefix = hints[0] ?? sourceRootName;
  for (const hint of hints.slice(1)) {
    let index = 0;
    while (index < commonPrefix.length && commonPrefix[index] === hint[index]) {
      index += 1;
    }
    commonPrefix = commonPrefix.slice(0, index);
  }
  commonPrefix = commonPrefix.replace(GROUP_SUFFIX_NOISE_RE, "").replace(/^[ _\-.]+|[ _\-.]+$/g, "") || sourceRootName;
  const slug = kebabCase(commonPrefix);
  if (slug.length < 3) {
    return { slug: kebabCase(sourceRootName) || "uploaded-group", title: titleCase(sourceRootName) || "Uploaded Group" };
  }
  return { slug, title: titleCase(commonPrefix) || titleCase(sourceRootName) || "Uploaded Group" };
}

function parseEntries(entries: BrowserUploadFile[], variantOverride?: string) {
  const candidates: SourceCandidate[] = [];
  const ignored: IgnoredUploadFile[] = [];
  for (const entry of entries) {
    const parsed = parseCandidate(entry, variantOverride);
    if (parsed) {
      candidates.push(parsed);
    } else {
      ignored.push({ path: entry.relativePath, reason: "unrecognized-image-name" });
    }
  }
  return { candidates, ignored };
}

function buildFlatPlan(sourceRootName: string, entries: BrowserUploadFile[], ignoredFiles: IgnoredUploadFile[]): WebUploadPlan {
  const parsed = parseEntries(entries);
  const grouped = new Map<string, SourceCandidate[]>();
  for (const candidate of parsed.candidates) {
    const key = candidateFrameKey(candidate);
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  const orderedGroups = [...grouped.entries()].sort((left, right) => {
    const [leftFps, leftEpisode, leftFrame] = left[0].split(":");
    const [rightFps, rightEpisode, rightFrame] = right[0].split(":");
    return Number(leftEpisode) - Number(rightEpisode) || Number(leftFrame) - Number(rightFrame) || leftFps.localeCompare(rightFps);
  });
  const fallbackWidth = Math.max(4, String(Math.max(0, ...orderedGroups.map(([key]) => Number(key.split(":")[2])))).length);
  const frames: WebUploadFramePlan[] = [];
  const issues: WebUploadIssue[] = [];
  orderedGroups.forEach(([, candidates], index) => {
    const frame = buildFrameFromCandidates(index, candidates, fallbackWidth);
    if ("severity" in frame) {
      issues.push(frame);
    } else {
      frames.push(frame);
    }
  });
  const identity = deriveGroupIdentity(sourceRootName, parsed.candidates);

  return {
    sourceRootName,
    suggestedGroupSlug: identity.slug,
    suggestedGroupTitle: identity.title,
    frames,
    ignoredFiles: [...ignoredFiles, ...parsed.ignored],
    issues,
  };
}

function buildNestedPlan(sourceRootName: string, entries: BrowserUploadFile[], ignoredFiles: IgnoredUploadFile[], layout: NonFlatLayout): WebUploadPlan {
  const scopedEntries = (directory: string | null) =>
    directory ? entries.filter((entry) => topLevelDirectory(entry.relativePath) === directory) : [];
  const beforeParsed = parseEntries(scopedEntries(layout.beforeDir), "source");
  const afterParsedResults = layout.afterDirs.map((directory, index) => parseEntries(scopedEntries(directory), index === 0 ? "out" : basename(directory).toLowerCase()));
  const heatmapParsedResults = layout.heatmapDirs.map((directory) => parseEntries(scopedEntries(directory), "heatmap"));
  const miscParsedResults = layout.miscDirs.map((directory) => parseEntries(scopedEntries(directory), basename(directory).toLowerCase() || "misc"));
  const afterParsed = afterParsedResults.flatMap((result) => result.candidates);
  const heatmapParsed = heatmapParsedResults.flatMap((result) => result.candidates);
  const miscParsed = miscParsedResults.flatMap((result) => result.candidates);
  const ignored = [
    ...ignoredFiles,
    ...beforeParsed.ignored,
    ...afterParsedResults.flatMap((result) => result.ignored),
    ...heatmapParsedResults.flatMap((result) => result.ignored),
    ...miscParsedResults.flatMap((result) => result.ignored),
  ];
  const issues: WebUploadIssue[] = [];

  const beforeByKey = groupByMatchKey(beforeParsed.candidates);
  for (const [key, candidates] of beforeByKey) {
    if (candidates.length > 1) {
      issues.push({
        code: "duplicate-before",
        severity: "error",
        path: candidates[0].entry.relativePath,
        message: `基准图文件无法唯一配对：${key}`,
      });
    }
  }

  const afterAssignments = assignCandidatesToBeforeKeys(afterParsed, beforeByKey);
  const heatmapAssignments = assignCandidatesToBeforeKeys(heatmapParsed, beforeByKey);
  const miscAssignments = assignCandidatesToBeforeKeys(miscParsed, beforeByKey);
  const allBefore = [...beforeByKey.entries()]
    .map(([matchKey, candidates]) => [matchKey, candidates[0]] as const)
    .sort((left, right) => Number(left[1].episode) - Number(right[1].episode) || left[1].frameNumber - right[1].frameNumber || left[0].localeCompare(right[0]));
  const fallbackWidth = Math.max(4, String(Math.max(0, ...allBefore.map(([, candidate]) => candidate.frameNumber))).length);
  const frames: WebUploadFramePlan[] = [];

  for (const [order, [matchKey, before]] of allBefore.entries()) {
    const matchedAfter = afterAssignments.grouped.get(matchKey) ?? [];
    if (matchedAfter.length === 0) {
      issues.push({
        code: "unmatched-before",
        severity: "error",
        path: before.entry.relativePath,
        message: `${before.originalName} 没有匹配到对比方案文件。`,
      });
      continue;
    }

    const primaryAfter = [...matchedAfter].sort((left, right) => afterPriority(left).localeCompare(afterPriority(right)))[0];
    const extraAfter = matchedAfter.filter((candidate) => candidate !== primaryAfter);
    const title = before.isFallback ? (before.frameNumber ? String(before.frameNumber).padStart(fallbackWidth, "0") : stem(before.entry.relativePath)) : before.title;
    frames.push({
      order,
      title,
      caption: before.isFallback ? `file ${stem(before.entry.relativePath)}` : before.caption,
      before: assetPlan("before", before),
      after: assetPlan("after", primaryAfter),
      heatmap: heatmapAssignments.grouped.get(matchKey)?.[0] ? assetPlan("heatmap", heatmapAssignments.grouped.get(matchKey)![0]) : null,
      misc: [...extraAfter, ...(miscAssignments.grouped.get(matchKey) ?? [])].map((candidate) => assetPlan("misc", candidate)),
    });
  }

  for (const candidate of [...afterAssignments.unmatched, ...heatmapAssignments.unmatched, ...miscAssignments.unmatched]) {
    ignored.push({ path: candidate.entry.relativePath, reason: "unmatched-file" });
  }

  const identity = deriveGroupIdentity(sourceRootName, beforeParsed.candidates);
  return {
    sourceRootName,
    suggestedGroupSlug: identity.slug,
    suggestedGroupTitle: identity.title,
    frames,
    ignoredFiles: ignored,
    issues,
  };
}

/**
 * Scans browser-selected files into the same frame-first model expected by the upload API while
 * keeping raw File objects outside React state in the caller.
 */
export function scanBrowserUploadFiles(entries: BrowserUploadFile[], sourceRootName = "uploaded-group"): WebUploadPlan {
  const importableEntries: BrowserUploadFile[] = [];
  const ignoredFiles: IgnoredUploadFile[] = [];
  for (const entry of entries) {
    const reason = ignoreReason(entry);
    if (reason) {
      ignoredFiles.push({ path: entry.relativePath, reason });
    } else {
      importableEntries.push(entry);
    }
  }

  const normalizedEntries = stripSharedTopLevelDirectory(importableEntries);
  const layout = suggestNonFlatLayout(normalizedEntries);
  if (layout.beforeDir && layout.afterDirs.length > 0) {
    return buildNestedPlan(sourceRootName, normalizedEntries, ignoredFiles, layout);
  }

  return buildFlatPlan(sourceRootName, normalizedEntries, ignoredFiles);
}
