import { prisma } from "../lib/server/db/client";

async function main() {
  const existingCases = await prisma.case.count();

  if (existingCases > 0) {
    return;
  }

  console.log("Database is ready. Import content with the uploader to populate cases.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
