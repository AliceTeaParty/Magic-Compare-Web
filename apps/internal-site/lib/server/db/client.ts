import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "@/lib/server/db/database-url";

declare global {
  var magicComparePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.magicComparePrisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.magicComparePrisma = prisma;
}
