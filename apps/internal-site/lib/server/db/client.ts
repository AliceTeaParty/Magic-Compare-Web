import { PrismaClient } from "@prisma/client";

declare global {
  var magicComparePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.magicComparePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.magicComparePrisma = prisma;
}
