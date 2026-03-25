import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DRIZZLE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Set DRIZZLE_DATABASE_URL or DATABASE_URL before running Drizzle commands.");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
