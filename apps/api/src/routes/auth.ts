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
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await pool.query(
      `select u.id, u.username, u.email, u.full_name, u.password_hash, coalesce(ur.role_id, 'super_admin') as role
       from users u
       left join user_roles ur on ur.user_id = u.id
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
    return { token, user };
  });
}
