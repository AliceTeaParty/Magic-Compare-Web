import { defineConfig } from "prisma/config";
import { DEFAULT_DATABASE_URL, resolveSqliteDatabaseUrl } from "./prisma/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: resolveSqliteDatabaseUrl(process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL),
  },
});
