import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url) });

function env(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export const config = {
  databaseUrl: env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/blex"),
  jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
  port: Number(env("API_PORT", "4000"))
};
