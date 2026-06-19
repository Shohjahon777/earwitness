import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moves the connection URL out of schema.prisma. The CLI (db push / migrate /
// studio) reads it from here; the runtime client uses the pg driver adapter (see lib/server/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
