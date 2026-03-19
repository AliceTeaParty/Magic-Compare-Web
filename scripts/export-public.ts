import { exportPublicSite } from "../apps/internal-site/lib/server/public-site/runtime";

async function main() {
  const result = await exportPublicSite();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
