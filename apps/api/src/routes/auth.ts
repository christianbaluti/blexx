import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AuthUser, Role } from "@blex/shared";
import { pool } from "../db.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/auth/me", async (request) => {
    const jwt = await request.jwtVerify<{ sub: string; role?: Role }>();
    const result = await pool.query(
      `select u.id, u.username, u.email, u.full_name, coalesce(u.role, $2) as role
       from users u
       where u.id = $1 and u.status = 'active'
       limit 1`,
      [jwt.sub, jwt.role ?? "pos_cashier"]
    );
    const row = result.rows[0];
    if (!row) return app.httpErrors.unauthorized("Session user no longer exists");
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      name: row.full_name,
      role: row.role as Role
    } satisfies AuthUser;
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await pool.query(
      `select u.id, u.username, u.email, u.full_name, u.password_hash, coalesce(u.role, 'super_admin') as role
       from users u
       where (u.username = $1 or u.email = $1) and u.status = 'active'
       limit 1`,
      [body.username.trim()]
    );

    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(body.password, row.password_hash))) {
      return reply.unauthorized("Invalid credentials");
    }

    const user: AuthUser = {
      id: row.id,
      username: row.username,
      email: row.email,
      name: row.full_name,
      role: row.role as Role
    };
    const token = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: "30d" });
    await pool.query(
      `insert into sessions (user_id, device_id, user_agent, ip, expires_at)
       values ($1, $2, $3, $4, now() + interval '30 days')`,
      [user.id, body.username.trim(), String(request.headers["user-agent"] ?? "").slice(0, 255), request.ip]
    ).catch(() => undefined);
    await pool.query("update users set last_login_at = now() where id = $1", [user.id]).catch(() => undefined);
    return { token, user };
  });
}
