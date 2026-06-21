import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { pool } from "./db.js";

const setupFiles = [
  "migrations/001_init.sql",
  "migrations/002_srs_completion.sql",
  "migrations/003_app_branding.sql",
  "seed/001_seed.sql"
];

export async function registerSetupRoute(app: FastifyInstance) {
  app.post("/admin/setup-db", async (request, reply) => {
    if (request.headers["x-setup-token"] !== config.jwtSecret) {
      return reply.unauthorized("Invalid setup token");
    }

    const root = join(process.cwd(), "db", "postgres");
    const applied: string[] = [];
    for (const file of setupFiles) {
      const sql = await readFile(join(root, file), "utf8");
      await pool.query(sql);
      applied.push(file);
    }

    return { ok: true, applied };
  });
}
