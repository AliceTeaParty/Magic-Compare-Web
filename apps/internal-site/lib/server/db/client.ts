import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/server/db/create-client";

declare global {
  var magicComparePrisma: PrismaClient | undefined;
}

export const prisma = globalThis.magicComparePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.magicComparePrisma = prisma;
}
