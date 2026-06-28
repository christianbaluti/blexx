import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@blex/shared";
import { pool } from "./db.js";

export type Permission =
  | "dashboard"
  | "pos"
  | "receipts"
  | "customers"
  | "inventory"
  | "production"
  | "purchasing"
  | "finance"
  | "reports"
  | "settings"
  | "admin"
  | "backup"
  | "sync";

export type AuthPayload = {
  sub: string;
  role?: Role;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthPayload;
  }
}

const rolePermissions: Record<Role, Permission[] | ["*"]> = {
  super_admin: ["*"],
  inventory_officer: ["dashboard", "inventory", "production", "purchasing", "reports", "sync"],
  production_officer: ["dashboard", "inventory", "production", "reports", "sync"],
  pos_cashier: ["dashboard", "pos", "receipts", "customers", "reports", "sync"],
  finance_user: ["dashboard", "purchasing", "finance", "reports", "customers", "receipts", "sync"],
  cro: ["dashboard", "customers", "receipts", "reports", "sync"]
};

const allAuthenticated: Permission[] = ["dashboard"];

export function actorId(request: FastifyRequest) {
  return request.authUser?.sub ?? null;
}

export function actorRole(request: FastifyRequest) {
  return request.authUser?.role ?? "pos_cashier";
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    request.authUser = await request.jwtVerify<AuthPayload>();
  } catch {
    return reply.unauthorized("Authentication required");
  }
}

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      const authResult = await requireAuth(request, reply);
      if (authResult) return authResult;
    }
    const role = actorRole(request);
    if (role !== "super_admin" && !roles.includes(role)) {
      return reply.forbidden("You do not have permission to perform this action");
    }
  };
}

export function installCoreAuthentication(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const path = (request.routeOptions.url ?? request.url.split("?")[0]).replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/health" || path === "/auth/login") return;
    return requireAuth(request, reply);
  });
}

export function installCoreAuthorization(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?")[0];
    const path = route.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/health" || path === "/auth/login" || request.method === "OPTIONS") return;
    const permission = routePermission(request.method, route);
    if (!permission || permission.length === 0) return;

    const role = actorRole(request);
    const allowed = rolePermissions[role] ?? [];
    if ((allowed as readonly string[]).includes("*")) return;
    if (permission.every((item) => allAuthenticated.includes(item))) return;
    if (permission.some((item) => (allowed as readonly Permission[]).includes(item))) return;
    return reply.forbidden("You do not have permission to perform this action");
  });
}

export function installAuditTrail(app: FastifyInstance) {
  app.addHook("onResponse", async (request, reply) => {
    if (!["POST", "PATCH", "DELETE", "PUT"].includes(request.method)) return;
    if (reply.statusCode >= 400) return;
    const path = request.routeOptions.url ?? request.url.split("?")[0];
    await writeAudit(request, actionFor(request.method, path), entityFor(path), entityIdFor(request.params), {
      body: scrub(request.body)
    });
  });
}

export async function writeAudit(request: FastifyRequest, action: string, entity: string, entityId?: string | null, detail?: unknown) {
  try {
    await pool.query(
      `insert into audit_log (user_id, action, entity, entity_id, detail, device_id, ip)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [
        actorId(request),
        action,
        entity,
        entityId ?? null,
        JSON.stringify(detail ?? {}),
        String(request.headers["x-device-id"] ?? ""),
        request.ip
      ]
    );
  } catch (error) {
    request.log.warn({ err: error }, "audit log write failed");
  }
}

function routePermission(method: string, route: string): Permission[] {
  const path = route.replace(/\/+$/, "") || "/";
  if (path === "/dashboard" || path === "/notifications" || path === "/notifications/:id/read") return ["dashboard"];
  if (path.startsWith("/settings") || path === "/smtp/test") return method === "GET" ? ["settings", "admin"] : ["admin"];
  if (path.startsWith("/users") || path === "/roles" || path === "/permissions" || path.startsWith("/sessions")) return ["admin"];
  if (path.startsWith("/backup")) return ["backup", "admin"];
  if (path.startsWith("/sync")) return ["sync"];
  if (path === "/products" || path.startsWith("/products/")) return method === "GET" ? ["inventory", "pos", "production"] : ["inventory"];
  if (path === "/items" || path.startsWith("/items/")) return ["inventory", "production"];
  if (path.startsWith("/stock") || path.startsWith("/inventory/adjustments") || path.startsWith("/transfers")) return ["inventory"];
  if (path.startsWith("/blueprints") || path.startsWith("/production")) return ["production"];
  if (path.startsWith("/purchase-orders") || path.startsWith("/grns") || path.startsWith("/supplier-invoices") || path.startsWith("/suppliers")) return ["purchasing", "finance"];
  if (path.startsWith("/sales")) return method === "GET" ? ["pos", "finance", "reports"] : ["pos"];
  if (path.startsWith("/receipts") || path.startsWith("/returns")) return ["pos", "receipts", "finance"];
  if (path.startsWith("/customers")) return ["customers", "pos", "finance"];
  if (path.startsWith("/finance") || path.startsWith("/expenses")) return ["finance"];
  if (path.startsWith("/reports") || path.startsWith("/audit")) return ["reports", "admin", "finance"];
  if (path.startsWith("/categories")) return method === "GET" ? ["inventory", "pos", "production"] : ["inventory"];
  if (path.startsWith("/loyalty") || path.startsWith("/credit")) return ["customers", "finance"];
  if (path.startsWith("/stock-counts")) return ["inventory"];
  return ["admin"];
}

function actionFor(method: string, path: string) {
  if (path.includes("/suspend")) return "suspend";
  if (path.includes("/revoke")) return "revoke";
  if (path.includes("/payments")) return "payment";
  if (path.includes("/resolve")) return "resolve";
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  if (method === "DELETE") return "delete";
  return method.toLowerCase();
}

function entityFor(path: string) {
  const first = path.split("/").filter(Boolean)[0] ?? "root";
  return first.replace(/-/g, "_");
}

function entityIdFor(params: unknown) {
  if (!params || typeof params !== "object") return null;
  const maybe = (params as { id?: unknown }).id;
  return typeof maybe === "string" ? maybe : null;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const lower = key.toLowerCase();
    if (lower.includes("password") || lower.includes("token") || lower.includes("secret")) return [key, "[redacted]"];
    if (lower.includes("attachmentdata") || lower.includes("imagedata") || lower.includes("logodataurl") || lower.includes("icondataurl")) return [key, "[data-url]"];
    return [key, scrub(entry)];
  }));
}
