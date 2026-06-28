import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { pool } from "./db.js";
import { config } from "./config.js";

const mode = process.argv[2];
const root = join(process.cwd(), "..", "..", "db", "postgres");

async function runSql(path: string) {
  const sql = await readFile(path, "utf8");
  await pool.query(sql);
}

async function runMigrations() {
  await runSql(join(root, "migrations", "001_init.sql"));
  await runSql(join(root, "migrations", "002_srs_completion.sql"));
  await runSql(join(root, "migrations", "003_app_branding.sql"));
  await runSql(join(root, "migrations", "004_admin_completion.sql"));
  await runSql(join(root, "migrations", "005_people_workflows.sql"));
  await runSql(join(root, "migrations", "006_core_reset.sql"));
  await runSql(join(root, "migrations", "007_grn_receiving_flow.sql"));
  await runSql(join(root, "migrations", "008_item_images_payment_pop.sql"));
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
    console.error(`Tried DATABASE_URL=${config.databaseUrl}`);
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
