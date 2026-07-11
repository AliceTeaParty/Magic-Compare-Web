import type {
  BrowserUploadFile,
  IgnoredUploadFile,
  WebUploadAssetPlan,
  WebUploadFramePlan,
  WebUploadIssue,
  WebUploadPlan,
} from "./web-upload-types";
import { cjkKebabCase } from "@magic-compare/shared-utils";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);
const SOURCE_VARIANTS = new Set(["src", "source", "ori", "origin", "before"]);
const PRIMARY_AFTER_VARIANTS = new Set(["after", "out", "output"]);
const COMPARISON_VARIANTS = new Set([
  ...PRIMARY_AFTER_VARIANTS,
  "rip",
  "deband",
  "nodeband",
  "noband",
  "nobanding",
  "degrain",
  "degrained",
  "denoise",
  "denoised",
  "clean",
  "cleaned",
]);
const HEATMAP_VARIANTS = new Set(["heatmap"]);
const BEFORE_DIR_HINTS = new Set([...SOURCE_VARIANTS, "before"]);
const AFTER_DIR_HINTS = new Set([...COMPARISON_VARIANTS, "after"]);
const MISC_DIR_HINTS = new Set(["misc", "extra", "extras", "alt", "alts"]);
const MATCH_KEY_VARIANTS = [
  "before",
  "after",
  "src",
  "source",
  "ori",
  "origin",
  "out",
  "output",
  "rip",
  "misc",
  "heatmap",
  "nodeband",
  "noband",
  "nobanding",
  "degrain",
  "degrained",
  "denoise",
  "denoised",
  "clean",
  "cleaned",
];
const IGNORED_BASENAMES = new Set([".ds_store", "thumbs.db"]);
const IGNORED_SUFFIXES = new Set([".json", ".yaml", ".yml", ".txt", ".md", ".csv", ".db", ".log"]);
const FILENAME_RE = /(?<prefix>.+?)[_\-.](?<frame>\d+)(?:[_\-.](?<variant>[^_\-.]+))?$/;
const FALLBACK_FILENAME_RE = /^(?<frame>\d+)(?<variant>[A-Za-z][A-Za-z0-9]*)$/;
const STRUCTURED_SOURCE_FILENAME_RE =
  /^(?:(?<fps>\d{2})_)?(?<title>.+)_(?<episode>\d+)(?:\.(?<sourceMarker>[^-]+))?-(?<frame>\d+)-(?<variant>[^_\-.]+)$/i;
const GROUP_SUFFIX_NOISE_RE = /(?:[_\-. ]+\d{4,5}[_\-. ]+(?:gen[_\-. ]+vpy|m2ts|mkv|mp4|ts))$/i;
const MATCH_KEY_SUFFIX_RE = new RegExp(
  `(?:[_\\-. ]+(?:${MATCH_KEY_VARIANTS.join("|")}))+$`,
  "i",
);
const NON_ALNUM_RE = /[^0-9a-z]+/g;
const MAX_AFTER_ASSETS = 4;

interface VolumeSortKey {
  kind: "VOL" | "BOX";
  number: number;
  label: string;
}

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
  frameKey: string;
  isFallback: boolean;
  isStructured: boolean;
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

function titleCase(input: string) {
  return input
    .replace(/[_\-.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function volumeSortKey(input: string): VolumeSortKey | null {
  const match = input.match(/(?:^|[^a-z0-9])(VOL|BOX)[ _-]*(\d+)(?=$|[^a-z0-9])/i);
  if (!match) {
    return null;
  }

  const kind = match[1].toUpperCase() as VolumeSortKey["kind"];
  const number = Number(match[2]);
  return { kind, number, label: `${kind}${number}` };
}

function compareVolumeHints(left: string, right: string) {
  const leftKey = volumeSortKey(left);
  const rightKey = volumeSortKey(right);
  const kindRank = (key: VolumeSortKey | null) => key ? (key.kind === "VOL" ? 0 : 1) : 2;

  return (
    kindRank(leftKey) - kindRank(rightKey) ||
    (leftKey?.number ?? Number.MAX_SAFE_INTEGER) - (rightKey?.number ?? Number.MAX_SAFE_INTEGER)
  );
}

function variantLabel(variant: string) {
  const normalized = variant.toLowerCase();
  if (PRIMARY_AFTER_VARIANTS.has(normalized)) {
    return "After";
  }
  if (normalized === "before" || normalized === "src" || normalized === "source" || normalized === "ori" || normalized === "origin") {
    return "Before";
  }
  if (normalized === "rip") {
    return "Rip";
  }
  if (normalized === "nodeband" || normalized === "noband" || normalized === "nobanding") {
    return "NoDeband";
  }
  return normalized
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function structuredFrameInfo(pathStem: string) {
  const match = STRUCTURED_SOURCE_FILENAME_RE.exec(pathStem);
  if (!match?.groups) {
    return null;
  }

  const title = titleCase(match.groups.title);
  const frameNumber = Number(match.groups.frame.replace(/^0+/, "") || "0");
  const fps = match.groups.fps ?? "00";
  const episodeNumber = Number(match.groups.episode) || 0;
  return {
    fps,
    episode: match.groups.episode,
    frameNumber,
    variant: match.groups.variant.toLowerCase(),
    title,
    // Group by work title + episode + frame, not fps/source marker. Real VSEditor exports can mix
    // `24_TITLE...gen.vpy` with `TITLE...m2ts`, but they still describe the same frame.
    frameKey: `structured:${matchKeyForName(match.groups.title)}:${episodeNumber}:${frameNumber}`,
    caption: match.groups.fps
      ? `${title} / ${match.groups.fps} fps / frame ${frameNumber}`
      : `${title} / frame ${frameNumber}`,
  };
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

function matchKeyForName(name: string) {
  const normalized = name.toLowerCase().replace(MATCH_KEY_SUFFIX_RE, "");
  return normalized.replace(NON_ALNUM_RE, "-").replace(/^-+|-+$/g, "") || name.toLowerCase().replace(NON_ALNUM_RE, "-").replace(/^-+|-+$/g, "");
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
  const structured = structuredFrameInfo(pathStem);
  if (structured) {
    return {
      entry,
      originalName: basename(entry.relativePath),
      variant: (variantOverride ?? structured.variant).trim().toLowerCase(),
      fps: structured.fps,
      episode: structured.episode,
      frameNumber: structured.frameNumber,
      title: structured.title,
      caption: structured.caption,
      rootHint: `${structured.fps}_${structured.title}_${structured.episode}`,
      frameKey: structured.frameKey,
      isFallback: false,
      isStructured: true,
    };
  }

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
      frameKey: `name:${matchKeyForName(pathStem)}`,
      isFallback: false,
      isStructured: false,
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
      frameKey: `fallback:${matchKeyForName(pathStem)}`,
      isFallback: true,
      isStructured: false,
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
    frameKey: `override:${variantOverride}:${matchKeyForName(pathStem)}`,
    isFallback: true,
    isStructured: false,
  };
}

function candidateFrameKey(candidate: SourceCandidate) {
  return candidate.frameKey;
}

function afterPriority(candidate: SourceCandidate) {
  const priority = candidate.variant === "out" ? 0 : candidate.variant === "output" ? 1 : candidate.variant === "after" ? 2 : 3;
  return `${priority}:${candidate.variant}:${candidate.originalName.toLowerCase()}`;
}

function alternatePriority(candidate: SourceCandidate) {
  const priority =
    candidate.variant === "after"
      ? 0
      : candidate.variant === "rip"
        ? 1
        : candidate.variant === "deband" || candidate.variant === "nodeband" || candidate.variant === "noband" || candidate.variant === "nobanding"
          ? 2
          : candidate.variant === "degrain" || candidate.variant === "degrained"
            ? 3
            : candidate.variant === "denoise" || candidate.variant === "denoised"
              ? 4
              : 5;
  return `${priority}:${candidate.variant}:${candidate.originalName.toLowerCase()}`;
}

function assetPlan(kind: WebUploadAssetPlan["kind"], candidate: SourceCandidate): WebUploadAssetPlan {
  const label =
    kind === "before"
      ? "Before"
      : kind === "after"
        ? "After"
        : kind === "heatmap"
          ? "Heatmap"
          : variantLabel(candidate.variant) || "Misc";
  return {
    kind,
    label,
    note: candidate.originalName,
    source: candidate.entry,
  };
}

function formatCandidateFrameTitle(
  candidate: SourceCandidate,
  fallbackWidth: number,
  structuredEpisodeWidth: number,
) {
  if (candidate.isFallback) {
    return candidate.frameNumber
      ? String(candidate.frameNumber).padStart(fallbackWidth, "0")
      : stem(candidate.entry.relativePath);
  }

  if (candidate.isStructured) {
    // VSEditor embeds the work title in every filename. Keep the row title to episode-frame so the
    // preview table stays scannable; the long title remains in caption and file tooltips.
    const episode = String(Number(candidate.episode) || 0).padStart(
      structuredEpisodeWidth,
      "0",
    );
    return `${episode}-${candidate.frameNumber}`;
  }

  return candidate.title;
}

function structuredEpisodeWidth(candidates: SourceCandidate[]) {
  const maxEpisode = Math.max(
    0,
    ...candidates
      .filter((candidate) => candidate.isStructured)
      .map((candidate) => Number(candidate.episode) || 0),
  );
  return Math.max(1, String(maxEpisode).length);
}

function buildFrameFromCandidates(
  order: number,
  candidates: SourceCandidate[],
  fallbackWidth: number,
  episodeWidth: number,
): WebUploadFramePlan | WebUploadIssue {
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
      message: `${candidates[0].title} 没有可用的 After 文件。`,
    };
  }

  const before = beforeCandidates[0];
  const after = [...outputCandidates].sort((left, right) => afterPriority(left).localeCompare(afterPriority(right)))[0];
  const misc = outputCandidates
    .filter((candidate) => candidate !== after)
    .sort((left, right) => alternatePriority(left).localeCompare(alternatePriority(right)));
  const title = formatCandidateFrameTitle(before, fallbackWidth, episodeWidth);
  const caption = before.isFallback ? `frame ${before.frameNumber}` : before.caption;

  return {
    order,
    title,
    caption,
    before: assetPlan("before", before),
    after: assetPlan("after", after),
    heatmap: heatmapCandidates[0] ? assetPlan("heatmap", heatmapCandidates[0]) : null,
    misc: misc.slice(0, MAX_AFTER_ASSETS - 1).map((candidate) => assetPlan("misc", candidate)),
  };
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
  const sourceSlug = cjkKebabCase(sourceRootName, "");
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
  const slug = cjkKebabCase(commonPrefix, "");
  if (slug.length < 3) {
    return { slug: cjkKebabCase(sourceRootName, "uploaded-group"), title: titleCase(sourceRootName) || "Uploaded Group" };
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
    const leftCandidate = left[1][0];
    const rightCandidate = right[1][0];
    return (
      Number(leftCandidate.episode) - Number(rightCandidate.episode) ||
      leftCandidate.frameNumber - rightCandidate.frameNumber ||
      compareVolumeHints(leftCandidate.rootHint, rightCandidate.rootHint) ||
      leftCandidate.rootHint.localeCompare(rightCandidate.rootHint)
    );
  });
  const fallbackWidth = Math.max(
    4,
    String(Math.max(0, ...orderedGroups.map(([, candidates]) => candidates[0]?.frameNumber ?? 0))).length,
  );
  const episodeWidth = structuredEpisodeWidth(parsed.candidates);
  const frames: WebUploadFramePlan[] = [];
  const issues: WebUploadIssue[] = [];
  orderedGroups.forEach(([, candidates], index) => {
    const frame = buildFrameFromCandidates(index, candidates, fallbackWidth, episodeWidth);
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
    heatmapReferenceLabel: "After",
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
        message: `Before 文件无法唯一配对：${key}`,
      });
    }
  }

  const afterAssignments = assignCandidatesToBeforeKeys(afterParsed, beforeByKey);
  const heatmapAssignments = assignCandidatesToBeforeKeys(heatmapParsed, beforeByKey);
  const miscAssignments = assignCandidatesToBeforeKeys(miscParsed, beforeByKey);
  const allBefore = [...beforeByKey.entries()]
    .map(([matchKey, candidates]) => [matchKey, candidates[0]] as const)
    .sort(
      (left, right) =>
        Number(left[1].episode) - Number(right[1].episode) ||
        left[1].frameNumber - right[1].frameNumber ||
        compareVolumeHints(left[1].rootHint, right[1].rootHint) ||
        left[0].localeCompare(right[0]),
    );
  const fallbackWidth = Math.max(4, String(Math.max(0, ...allBefore.map(([, candidate]) => candidate.frameNumber))).length);
  const episodeWidth = structuredEpisodeWidth(beforeParsed.candidates);
  const frames: WebUploadFramePlan[] = [];

  for (const [order, [matchKey, before]] of allBefore.entries()) {
    const matchedAfter = afterAssignments.grouped.get(matchKey) ?? [];
    if (matchedAfter.length === 0) {
      issues.push({
        code: "unmatched-before",
        severity: "error",
        path: before.entry.relativePath,
        message: `${before.originalName} 没有匹配到 After 文件。`,
      });
      continue;
    }

    const primaryAfter = [...matchedAfter].sort((left, right) => afterPriority(left).localeCompare(afterPriority(right)))[0];
    const extraAfter = matchedAfter
      .filter((candidate) => candidate !== primaryAfter)
      .sort((left, right) => alternatePriority(left).localeCompare(alternatePriority(right)));
    const title = formatCandidateFrameTitle(before, fallbackWidth, episodeWidth);
    frames.push({
      order,
      title,
      caption: before.isFallback ? `file ${stem(before.entry.relativePath)}` : before.caption,
      before: assetPlan("before", before),
      after: assetPlan("after", primaryAfter),
      heatmap: heatmapAssignments.grouped.get(matchKey)?.[0] ? assetPlan("heatmap", heatmapAssignments.grouped.get(matchKey)![0]) : null,
      misc: [
        ...extraAfter.slice(0, MAX_AFTER_ASSETS - 1),
        ...(miscAssignments.grouped.get(matchKey) ?? []),
      ].map((candidate) => assetPlan("misc", candidate)),
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
    heatmapReferenceLabel: "After",
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
