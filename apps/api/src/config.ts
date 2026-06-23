import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url) });

function env(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export const config = {
  databaseUrl: env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/blex"),
  jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
  port: Number(env("API_PORT", "4000")),
  smtpHost: env("SMTP_HOST", ""),
  smtpFrom: env("SMTP_FROM", "no-reply@pos-inventory-plus.local"),
  appDownloadAndroidUrl: env("APP_DOWNLOAD_ANDROID_URL", "https://expo.dev/accounts/christianbaluti/projects/pos-inventory-plus"),
  appDownloadIosUrl: env("APP_DOWNLOAD_IOS_URL", "Ask your administrator for the TestFlight invite")
};
