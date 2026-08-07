import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parsePublishManifest } from "@magic-compare/content-schema";
import { renderPublicShareImage } from "../lib/share-image";
import { PUBLIC_SHARE_IMAGE_FILE_NAME } from "../lib/share-image-data";

const GROUPS_DIRECTORY = path.join(process.cwd(), "public", "published", "groups");

/** Generates cards sequentially so large published libraries have a bounded export memory peak. */
async function main(): Promise<void> {
  let entries;
  try {
    entries = await readdir(GROUPS_DIRECTORY, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  let generatedCount = 0;
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;

    const groupDirectory = path.join(GROUPS_DIRECTORY, entry.name);
    const manifestPath = path.join(groupDirectory, "manifest.json");
    try {
      const manifest = parsePublishManifest(JSON.parse(await readFile(manifestPath, "utf8")));
      const response = await renderPublicShareImage(manifest);
      // Social link crawlers support JPEG more consistently than WebP. MozJPEG quality 85 keeps
      // card typography crisp without carrying the renderer's much larger PNG output.
      const shareImage = await sharp(Buffer.from(await response.arrayBuffer()))
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      await writeFile(path.join(groupDirectory, PUBLIC_SHARE_IMAGE_FILE_NAME), shareImage);
      generatedCount += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate share image for ${entry.name}: ${reason}`, {
        cause: error,
      });
    }
  }

  console.log(`Generated ${generatedCount} public share image(s).`);
}

await main();
