import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { pool } from "./db.js";
import { config } from "./config.js";

const mode = process.argv[2];
const root = join(process.cwd(), "..", "..", "db", "postgres");
const migrations = [
  "001_init.sql",
  "002_srs_completion.sql",
  "003_app_branding.sql",
  "004_admin_completion.sql",
  "005_people_workflows.sql",
  "006_core_reset.sql",
  "007_grn_receiving_flow.sql",
  "008_item_images_payment_pop.sql",
  "009_v1_foundation_gaps.sql",
  "010_real_backup_payloads.sql",
  "011_persistent_notification_sources.sql"
];

async function runSql(path: string) {
  const sql = await readFile(path, "utf8");
  await pool.query(sql);
}

async function ensureMigrationTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function markApplied(version: string) {
  await pool.query("insert into schema_migrations (version) values ($1) on conflict (version) do nothing", [version]);
}

async function hasTable(name: string) {
  const result = await pool.query("select to_regclass($1) as table_name", [`public.${name}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function runMigrations() {
  await ensureMigrationTable();

  const applied = await pool.query("select version from schema_migrations");
  const appliedVersions = new Set(applied.rows.map((row) => String(row.version)));

  if (appliedVersions.size === 0 && await hasTable("users")) {
    for (const version of migrations.slice(0, 6)) {
      await markApplied(version);
      appliedVersions.add(version);
    }
    console.log("Existing Blex schema detected; marked destructive legacy migrations as applied.");
  }

  for (const version of migrations) {
    if (appliedVersions.has(version)) continue;
    await runSql(join(root, "migrations", version));
    await markApplied(version);
    console.log(`Applied ${version}`);
  }
}

function getDatabaseParts() {
  const url = new URL(config.databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(database)) {
    throw new Error(`Invalid database name in DATABASE_URL: ${database}`);
  }
  url.pathname = "/postgres";
  return { database, maintenanceUrl: url.toString() };
}

function redactedDatabaseUrl() {
  try {
    const url = new URL(config.databaseUrl);
    if (url.password) url.password = "****";
    if (url.username) url.username = "****";
    return url.toString();
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

async function createDatabaseIfMissing() {
  const { database, maintenanceUrl } = getDatabaseParts();
  const adminPool = new pg.Pool({
    connectionString: maintenanceUrl,
    max: 1,
    connectionTimeoutMillis: 5_000
  });

  try {
    const existing = await adminPool.query("select 1 from pg_database where datname = $1", [database]);
    if (existing.rowCount) {
      console.log(`PostgreSQL database "${database}" already exists.`);
      return;
    }
    await adminPool.query(`create database "${database.replace(/"/g, '""')}"`);
    console.log(`PostgreSQL database "${database}" created.`);
  } finally {
    await adminPool.end();
  }
}

try {
  if (mode === "create") {
    await createDatabaseIfMissing();
  } else if (mode === "check") {
    await pool.query("select 1");
    console.log("PostgreSQL connection OK.");
  } else if (mode === "migrate") {
    await runMigrations();
    console.log("PostgreSQL migrations applied.");
  } else if (mode === "seed") {
    await runSql(join(root, "seed", "001_seed.sql"));
    console.log("PostgreSQL seed data applied.");
  } else {
    console.error("Usage: npm run db:create | npm run db:check | npm run db:migrate | npm run db:seed");
    process.exitCode = 1;
  }
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "ECONNREFUSED") {
    console.error("\nPostgreSQL is not reachable.");
    console.error(`Tried DATABASE_URL=${redactedDatabaseUrl()}`);
    console.error("\nStart PostgreSQL first, then rerun:");
    console.error("  npm run db:check");
    console.error("  npm run db:migrate");
    console.error("  npm run db:seed\n");
    process.exitCode = 1;
  } else if (code === "3D000") {
    console.error("\nThe PostgreSQL server is running, but the app database does not exist.");
    console.error("\nCreate it first, then rerun migrations:");
    console.error("  npm run db:create");
    console.error("  npm run db:migrate");
    console.error("  npm run db:seed\n");
    process.exitCode = 1;
  } else if (code === "28P01") {
    console.error("\nPostgreSQL rejected the username or password in DATABASE_URL.");
    console.error("Update .env with the password you set during PostgreSQL installation, then rerun:");
    console.error("  npm run db:create\n");
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  if (mode !== "create") {
    await pool.end();
  }
}
