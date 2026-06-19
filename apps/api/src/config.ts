import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url) });

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/blex",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  port: Number(process.env.API_PORT ?? 4000)
};
