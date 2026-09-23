import { prisma } from "../lib/server/db/client";
import { mapWithConcurrency } from "../lib/server/concurrency/map-with-concurrency";
import { generateAssetPlaceholderJson } from "../lib/server/storage/asset-placeholders";

/** Upgrade immutable legacy assets once; this work never runs on a Viewer request or publishes content. */
async function main() {
  const groupSlug = process.argv[2];
  const assets = await prisma.asset.findMany({
    where: {
      imagePlaceholderJson: null,
      ...(groupSlug ? { frame: { group: { slug: groupSlug } } } : {}),
    },
    select: { id: true, thumbUrl: true },
  });
  let generated = 0;
  let failed = 0;
  await mapWithConcurrency(assets, 4, async (asset) => {
    const imagePlaceholderJson = await generateAssetPlaceholderJson(asset.thumbUrl);
    if (imagePlaceholderJson === null) {
      failed += 1;
    } else {
      await prisma.asset.update({ where: { id: asset.id }, data: { imagePlaceholderJson } });
      generated += 1;
    }
    if ((generated + failed) % 100 === 0)
      console.log(`Processed ${generated + failed}/${assets.length}`);
  });
  console.log(JSON.stringify({ generated, failed, total: assets.length }));
  if (failed > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
