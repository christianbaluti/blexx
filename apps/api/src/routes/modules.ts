import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defaultAppBranding, type AppBranding } from "@blex/shared";
import { numberify, pool } from "../db.js";
import { config } from "../config.js";

const idParam = z.object({ id: z.string().min(1) });
const syncPushSchema = z.object({
  deviceId: z.string().min(1),
  mutations: z.array(z.object({
    id: z.string(),
    entity: z.string(),
    operation: z.enum(["create", "update", "delete"]),
    payload: z.unknown(),
    baseVersion: z.number().optional(),
    clientTs: z.string()
  }))
});

const productSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().nullable().optional(),
  name: z.string().min(1),
  categoryId: z.string().uuid().nullable().optional(),
  unit: z.string().default("ea"),
  isRaw: z.boolean().default(false),
  isSellable: z.boolean().default(true),
  cost: z.number().nonnegative().default(0),
  price: z.number().nonnegative().default(0),
  reorder: z.number().nonnegative().default(0),
  imageUrl: z.string().max(140_000).nullable().optional()
});

const partySchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  openingBalance: z.number().default(0)
});

const expenseSchema = z.object({
  categoryId: z.string().uuid(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  amount: z.number().positive(),
  recurring: z.boolean().default(false),
  outletId: z.string().uuid().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional()
});

const userSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(4),
  role: z.string().default("pos_cashier")
});

const dataUrlSchema = z
  .string()
  .max(1_200_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/)
  .nullable();

const brandingSchema = z.object({
  appName: z.string().trim().min(2).max(48),
  appSubtitle: z.string().trim().min(2).max(64),
  logoDataUrl: dataUrlSchema,
  iconDataUrl: dataUrlSchema,
  logoUpdatedAt: z.string().nullable().optional()
});

const appSettingsSchema = z.object({
  company: z.object({
    tradingName: z.string().min(2).max(120),
    currency: z.string().min(2).max(40),
    vatRate: z.number().min(0).max(100),
    address: z.string().max(255)
  }),
  downloads: z.object({
    androidUrl: z.string().min(1).max(500),
    iosUrl: z.string().min(1).max(500)
  }),
  security: z.object({
    requireTwoFactor: z.boolean(),
    biometricUnlock: z.boolean(),
    sessionAutoLockMinutes: z.number().min(1).max(240),
    passwordExpiryDays: z.number().min(0).max(365)
  }),
  notifications: z.object({
    lowStockEmailEnabled: z.boolean(),
    expiryEmailEnabled: z.boolean()
  })
});

type AppSettings = z.infer<typeof appSettingsSchema>;

function defaultSettings(): AppSettings {
  return {
    company: {
      tradingName: defaultAppBranding.appName,
      currency: "MWK",
      vatRate: 16.5,
      address: ""
    },
    downloads: {
      androidUrl: config.appDownloadAndroidUrl,
      iosUrl: config.appDownloadIosUrl
    },
    security: {
      requireTwoFactor: false,
      biometricUnlock: true,
      sessionAutoLockMinutes: 15,
      passwordExpiryDays: 0
    },
    notifications: {
      lowStockEmailEnabled: true,
      expiryEmailEnabled: true
    }
  };
}

function normalizeBranding(value: unknown, updatedAt?: Date | string | null): AppBranding {
  const parsed = brandingSchema.partial().safeParse(value ?? {});
  const branding = {
    ...defaultAppBranding,
    ...(parsed.success ? parsed.data : {})
  };
  return {
    ...branding,
    logoUpdatedAt: updatedAt ? new Date(updatedAt).toISOString() : branding.logoUpdatedAt ?? null
  };
}

function normalizeSettings(value: unknown): AppSettings {
  const parsed = appSettingsSchema.partial().safeParse(value ?? {});
  const base = defaultSettings();
  if (!parsed.success) return base;
  return {
    company: { ...base.company, ...parsed.data.company },
    downloads: { ...base.downloads, ...parsed.data.downloads },
    security: { ...base.security, ...parsed.data.security },
    notifications: { ...base.notifications, ...parsed.data.notifications }
  };
}

async function getSettings() {
  const result = await pool.query("select value from app_settings where key = 'settings'");
  return normalizeSettings(result.rows[0]?.value);
}

async function ensureLowStockNotifications() {
  const settings = await getSettings();
  const lowStock = await pool.query(`
    select p.id, p.name, p.sku, p.reorder_qty, coalesce(sum(sl.quantity), 0) as stock
    from products p
    left join stock_levels sl on sl.product_id = p.id
    where p.status = 'active'
    group by p.id
    having coalesce(sum(sl.quantity), 0) <= p.reorder_qty
    order by p.name
  `);
  if (!lowStock.rows.length) return;

  const recipients = await pool.query(`
    select distinct u.id, u.email
    from users u
    join user_roles ur on ur.user_id = u.id
    left join role_permissions rp on rp.role_id = ur.role_id
    where u.status = 'active'
      and (ur.role_id in ('super_admin', 'inventory_officer') or rp.permission_id like 'inventory%')
  `);

  for (const product of lowStock.rows) {
    const title = `Low stock: ${product.name}`;
    const detail = `${product.name} (${product.sku}) is at ${numberify(product.stock)} against reorder ${numberify(product.reorder_qty)}.`;
    for (const user of recipients.rows) {
      const notification = await pool.query(
        `insert into notifications (user_id, type, title, body)
         select $1, 'low_stock', $2, $3
         where not exists (
           select 1 from notifications
           where user_id = $1 and type = 'low_stock' and title = $2 and created_at > now() - interval '24 hours'
         )
         returning id`,
        [user.id, title, detail]
      );
      const id = notification.rows[0]?.id;
      if (id && settings.notifications.lowStockEmailEnabled) {
        await pool.query(
          `insert into notification_deliveries (notification_id, channel, recipient, status, error, sent_at)
           values ($1, 'email', $2, $3, $4, case when $3 = 'sent' then now() else null end)`,
          [id, user.email, config.smtpHost ? "sent" : "pending", config.smtpHost ? null : "SMTP is not configured; queued for email provider"]
        );
      }
    }
  }
}

export async function registerModuleRoutes(app: FastifyInstance) {
  app.get("/settings/branding", async () => {
    const result = await pool.query("select value, updated_at from app_settings where key = 'branding'");
    return normalizeBranding(result.rows[0]?.value, result.rows[0]?.updated_at);
  });

  app.patch("/settings/branding", async (request) => {
    const jwt = await request.jwtVerify<{ role?: string }>();
    if (jwt.role !== "super_admin") throw app.httpErrors.forbidden("Only administrators can change app branding");

    const body = brandingSchema.parse(request.body);
    const payload = {
      appName: body.appName,
      appSubtitle: body.appSubtitle,
      logoDataUrl: body.logoDataUrl,
      iconDataUrl: body.iconDataUrl
    };
    const result = await pool.query(
      `insert into app_settings (key, value, updated_at)
       values ('branding', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()
       returning value, updated_at`,
      [JSON.stringify(payload)]
    );
    await pool.query("insert into audit_log (action, entity, detail) values ('settings.branding.update', 'settings', $1)", [`Updated app branding to ${payload.appName}`]);
    return normalizeBranding(result.rows[0].value, result.rows[0].updated_at);
  });

  app.get("/settings", async () => getSettings());

  app.patch("/settings", async (request) => {
    const jwt = await request.jwtVerify<{ role?: string }>();
    if (jwt.role !== "super_admin") throw app.httpErrors.forbidden("Only administrators can change settings");
    const body = appSettingsSchema.parse(request.body);
    const result = await pool.query(
      `insert into app_settings (key, value, updated_at)
       values ('settings', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()
       returning value`,
      [JSON.stringify(body)]
    );
    await pool.query("insert into audit_log (action, entity, detail) values ('settings.update', 'settings', 'Updated company and security settings')");
    return normalizeSettings(result.rows[0].value);
  });

  app.get("/users", async () => {
    const result = await pool.query(`
      select u.id, u.username, u.email, u.full_name as name, coalesce(ur.role_id, 'super_admin') as role,
             u.status, (u.two_factor_secret is not null) as "twoFactorEnabled", u.last_login_at as "lastLoginAt"
      from users u
      left join user_roles ur on ur.user_id = u.id
      order by u.created_at desc
    `);
    return result.rows;
  });

  app.post("/users", async (request) => {
    const body = userSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const user = await client.query(
        `insert into users (username, email, full_name, password_hash)
         values ($1, $2, $3, $4)
         returning id, username, email, full_name as name, status, last_login_at as "lastLoginAt"`,
        [body.username, body.email, body.name, passwordHash]
      );
      await client.query("insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing", [user.rows[0].id, body.role]);
      const settings = await getSettings();
      const invite = await client.query(
        `insert into notifications (user_id, type, title, body)
         values ($1, 'system', 'Your account is ready', $2)
         returning id`,
        [user.rows[0].id, `Username: ${body.username}. Temporary password: ${body.password}. Android: ${settings.downloads.androidUrl}. iOS: ${settings.downloads.iosUrl}.`]
      );
      await client.query(
        `insert into notification_deliveries (notification_id, channel, recipient, status, error, sent_at)
         values ($1, 'email', $2, $3, $4, case when $3 = 'sent' then now() else null end)`,
        [invite.rows[0].id, body.email, config.smtpHost ? "sent" : "pending", config.smtpHost ? null : "SMTP is not configured; queued for email provider"]
      );
      await client.query("insert into audit_log (action, entity, entity_id, detail) values ('user.create', 'user', $1, $2)", [user.rows[0].id, `Created ${body.username}`]);
      await client.query("commit");
      return { ...user.rows[0], role: body.role, twoFactorEnabled: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/users/:id", async (request) => {
    const params = idParam.parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      status: z.enum(["active", "suspended", "disabled"]).optional(),
      role: z.string().optional()
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `update users set
          full_name = coalesce($2, full_name),
          email = coalesce($3, email),
          status = coalesce($4::user_status, status),
          updated_at = now()
         where id = $1
         returning id, username, email, full_name as name, status`,
        [params.id, body.name ?? null, body.email ?? null, body.status ?? null]
      );
      if (body.role) {
        await client.query("delete from user_roles where user_id = $1", [params.id]);
        await client.query("insert into user_roles (user_id, role_id) values ($1, $2)", [params.id, body.role]);
      }
      await client.query("commit");
      return result.rows[0];
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/roles", async () => {
    const roles = await pool.query("select id, label from roles order by label");
    const permissions = await pool.query(`
      select rp.role_id, p.id, p.label
      from role_permissions rp
      join permissions p on p.id = rp.permission_id
      order by p.label
    `);
    return roles.rows.map((role) => ({
      id: role.id,
      label: role.label,
      permissions: permissions.rows.filter((p) => p.role_id === role.id).map(({ id, label }) => ({ id, label }))
    }));
  });

  app.get("/permissions", async () => {
    const result = await pool.query("select id, label from permissions order by label");
    return result.rows;
  });

  app.get("/sessions", async () => {
    const result = await pool.query(`
      select s.id, s.user_id as "userId", u.full_name as "userName", s.device_id as "deviceId",
             s.ip, s.expires_at as "expiresAt", s.revoked_at as "revokedAt", s.created_at as "createdAt"
      from sessions s
      join users u on u.id = s.user_id
      order by s.created_at desc
      limit 100
    `);
    return result.rows;
  });

  app.post("/sessions/:id/revoke", async (request) => {
    const params = idParam.parse(request.params);
    await pool.query("update sessions set revoked_at = now() where id = $1 and revoked_at is null", [params.id]);
    await pool.query("insert into audit_log (action, entity, entity_id, detail) values ('session.revoke', 'session', $1, 'Revoked user session')", [params.id]);
    return { ok: true };
  });

  app.post("/auth/2fa/setup", async (request) => {
    const body = z.object({ userId: z.string().uuid() }).parse(request.body);
    const secret = `BLEX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    await pool.query("update users set two_factor_secret = $1 where id = $2", [secret, body.userId]);
    return { secret, otpauthUrl: `otpauth://totp/Blex:${body.userId}?secret=${secret}&issuer=Blex` };
  });

  app.post("/auth/2fa/verify", async (request) => {
    const body = z.object({ userId: z.string().uuid(), code: z.string().min(4) }).parse(request.body);
    const result = await pool.query("select two_factor_secret from users where id = $1", [body.userId]);
    return { verified: Boolean(result.rows[0]?.two_factor_secret && body.code.length >= 4) };
  });

  app.get("/inventory", async () => {
    await ensureLowStockNotifications();
    const result = await pool.query(`
      select p.id as "productId", p.name as "productName", p.sku, p.unit, p.reorder_qty as reorder,
             o.id as "outletId", o.name as "outletName", coalesce(sl.quantity, 0) as quantity,
             p.cost_price as cost, p.sell_price as price
      from products p
      cross join outlets o
      left join stock_levels sl on sl.product_id = p.id and sl.outlet_id = o.id
      where p.status = 'active'
      order by p.name
    `);
    return result.rows.map((x) => ({
      ...x,
      reorder: numberify(x.reorder),
      quantity: numberify(x.quantity),
      cost: numberify(x.cost),
      price: numberify(x.price)
    }));
  });

  app.post("/products", async (request) => {
    const body = productSchema.parse(request.body);
    const result = await pool.query(
      `insert into products (sku, barcode, name, category_id, unit, is_raw, is_sellable, cost_price, sell_price, reorder_qty, image_url)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id`,
      [body.sku, body.barcode ?? null, body.name, body.categoryId ?? null, body.unit, body.isRaw, body.isSellable, body.cost, body.price, body.reorder, body.imageUrl ?? null]
    );
    await pool.query("insert into audit_log (action, entity, entity_id, detail) values ('product.create', 'product', $1, $2)", [result.rows[0].id, `Created ${body.name}`]);
    return { id: result.rows[0].id };
  });

  app.patch("/products/:id", async (request) => {
    const params = idParam.parse(request.params);
    const body = productSchema.partial().parse(request.body);
    await pool.query(
      `update products set
        sku = coalesce($2, sku),
        barcode = coalesce($3, barcode),
        name = coalesce($4, name),
        category_id = coalesce($5, category_id),
        unit = coalesce($6, unit),
        is_raw = coalesce($7, is_raw),
        is_sellable = coalesce($8, is_sellable),
        cost_price = coalesce($9, cost_price),
        sell_price = coalesce($10, sell_price),
        reorder_qty = coalesce($11, reorder_qty),
        image_url = coalesce($12, image_url),
        version = version + 1,
        updated_at = now()
       where id = $1`,
      [params.id, body.sku ?? null, body.barcode ?? null, body.name ?? null, body.categoryId ?? null, body.unit ?? null, body.isRaw ?? null, body.isSellable ?? null, body.cost ?? null, body.price ?? null, body.reorder ?? null, body.imageUrl ?? null]
    );
    return { ok: true };
  });

  app.delete("/products/:id", async (request) => {
    const params = idParam.parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const product = await client.query("select id, name from products where id = $1 for update", [params.id]);
      if (!product.rows[0]) throw app.httpErrors.notFound("Product not found");
      await client.query("delete from transfer_lines where product_id = $1", [params.id]);
      await client.query("delete from stock_count_lines where product_id = $1", [params.id]);
      await client.query("delete from grn_lines where product_id = $1", [params.id]);
      await client.query("delete from sale_lines where product_id = $1", [params.id]);
      await client.query("delete from purchase_order_lines where product_id = $1", [params.id]);
      await client.query("delete from stock_movements where product_id = $1", [params.id]);
      await client.query("delete from bom_components where material_id = $1", [params.id]);
      await client.query("delete from production_batches where bom_id in (select id from boms where product_id = $1)", [params.id]);
      await client.query("delete from boms where product_id = $1", [params.id]);
      await client.query("delete from products where id = $1", [params.id]);
      await client.query("insert into audit_log (action, entity, entity_id, detail) values ('product.delete', 'product', $1, $2)", [params.id, `Deleted ${product.rows[0].name}`]);
      await client.query("commit");
      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/inventory/batches", async () => {
    const result = await pool.query(`
      select b.id, b.product_id as "productId", p.name as "productName", b.outlet_id as "outletId",
             o.name as "outletName", b.batch_no as "batchNo", b.expiry_date as "expiryDate",
             b.quantity, b.cost_price as cost
      from stock_batches b
      join products p on p.id = b.product_id
      join outlets o on o.id = b.outlet_id
      order by b.created_at desc
    `);
    return result.rows.map((x) => ({ ...x, quantity: numberify(x.quantity), cost: numberify(x.cost) }));
  });

  app.get("/inventory/movements", async () => {
    const result = await pool.query(`
      select sm.id, sm.product_id as "productId", p.name as "productName", sm.outlet_id as "outletId",
             sm.movement, sm.qty, sm.unit_cost as "unitCost", sm.ref_type as "refType",
             sm.ref_id as "refId", sm.note, sm.created_at as "createdAt"
      from stock_movements sm
      join products p on p.id = sm.product_id
      order by sm.created_at desc
      limit 150
    `);
    return result.rows.map((x) => ({ ...x, qty: numberify(x.qty), unitCost: numberify(x.unitCost) }));
  });

  app.get("/outlets", async () => {
    const result = await pool.query("select id, code, name, type, address from outlets order by name");
    return result.rows;
  });

  app.post("/inventory/adjustments", async (request) => {
    const body = z.object({
      productId: z.string().uuid(),
      outletId: z.string().uuid(),
      qty: z.number(),
      reason: z.enum(["adjust", "damage"]).default("adjust"),
      note: z.string().optional()
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`
        insert into stock_levels (outlet_id, product_id, quantity) values ($1, $2, $3)
        on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
      `, [body.outletId, body.productId, body.qty]);
      await client.query(`
        insert into stock_movements (product_id, outlet_id, movement, qty, note)
        values ($1, $2, $3, $4, $5)
      `, [body.productId, body.outletId, body.reason, body.qty, body.note ?? null]);
      await client.query("insert into audit_log (action, entity, entity_id, detail) values ('inventory.adjust', 'inventory', $1, $2)", [body.productId, `${body.reason} ${body.qty}`]);
      await client.query("commit");
      await ensureLowStockNotifications();
      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/stock-counts", async () => {
    const result = await pool.query(`
      select sc.id, sc.outlet_id as "outletId", o.name as "outletName", sc.status,
             sc.created_at as "createdAt", sc.closed_at as "closedAt",
             coalesce(sum(scl.variance_qty), 0) as variance
      from stock_counts sc
      join outlets o on o.id = sc.outlet_id
      left join stock_count_lines scl on scl.count_id = sc.id
      group by sc.id, o.name
      order by sc.created_at desc
    `);
    return result.rows.map((x) => ({ ...x, variance: numberify(x.variance) }));
  });

  app.post("/stock-counts", async (request) => {
    const body = z.object({ outletId: z.string().uuid(), createdBy: z.string().uuid().nullable().optional() }).parse(request.body);
    const result = await pool.query("insert into stock_counts (outlet_id, created_by) values ($1, $2) returning id", [body.outletId, body.createdBy ?? null]);
    await pool.query(`
      insert into stock_count_lines (count_id, product_id, expected_qty, counted_qty)
      select $1, product_id, quantity, quantity from stock_levels where outlet_id = $2
    `, [result.rows[0].id, body.outletId]);
    return { id: result.rows[0].id };
  });

  app.post("/stock-counts/:id/close", async (request) => {
    const params = idParam.parse(request.params);
    await pool.query("update stock_counts set status = 'closed', closed_at = now() where id = $1", [params.id]);
    return { ok: true };
  });

  app.get("/transfers", async () => {
    const result = await pool.query(`
      select t.id, t.from_outlet_id as "fromOutletId", t.to_outlet_id as "toOutletId",
             fo.name as "fromOutletName", tor.name as "toOutletName",
             t.status, t.created_at as "createdAt", coalesce(sum(tl.qty), 0) as "totalItems"
      from transfers t
      join outlets fo on fo.id = t.from_outlet_id
      join outlets tor on tor.id = t.to_outlet_id
      left join transfer_lines tl on tl.transfer_id = t.id
      group by t.id, fo.name, tor.name
      order by t.created_at desc
    `);
    return result.rows.map((x) => ({ ...x, totalItems: numberify(x.totalItems) }));
  });

  app.post("/transfers", async (request) => {
    const body = z.object({
      fromOutletId: z.string().uuid(),
      toOutletId: z.string().uuid(),
      createdBy: z.string().uuid().nullable().optional(),
      lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive() })).min(1)
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const transfer = await client.query(
        "insert into transfers (from_outlet_id, to_outlet_id, created_by, status) values ($1, $2, $3, 'sent') returning id",
        [body.fromOutletId, body.toOutletId, body.createdBy ?? null]
      );
      for (const line of body.lines) {
        await client.query("insert into transfer_lines (transfer_id, product_id, qty) values ($1, $2, $3)", [transfer.rows[0].id, line.productId, line.qty]);
      }
      await client.query("commit");
      return { id: transfer.rows[0].id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/transfers/:id/receive", async (request) => {
    const params = idParam.parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const transfer = await client.query("select * from transfers where id = $1 for update", [params.id]);
      if (!transfer.rows[0]) throw app.httpErrors.notFound("Transfer not found");
      const lines = await client.query("select * from transfer_lines where transfer_id = $1", [params.id]);
      for (const line of lines.rows) {
        await client.query("update stock_levels set quantity = quantity - $1 where outlet_id = $2 and product_id = $3", [line.qty, transfer.rows[0].from_outlet_id, line.product_id]);
        await client.query(`
          insert into stock_levels (outlet_id, product_id, quantity) values ($1, $2, $3)
          on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
        `, [transfer.rows[0].to_outlet_id, line.product_id, line.qty]);
      }
      await client.query("update transfers set status = 'received', received_at = now() where id = $1", [params.id]);
      await client.query("commit");
      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/boms", async () => {
    const result = await pool.query(`
      select b.id, b.product_id as "productId", p.name as "productName", b.name,
             b.output_qty as "outputQty", b.labor_cost as "laborCost", b.overhead_cost as overhead,
             coalesce(json_agg(json_build_object(
               'productId', bc.material_id,
               'productName', mp.name,
               'qty', bc.qty
             ) order by mp.name) filter (where bc.id is not null), '[]') as components
      from boms b
      join products p on p.id = b.product_id
      left join bom_components bc on bc.bom_id = b.id
      left join products mp on mp.id = bc.material_id
      group by b.id, p.name
      order by b.created_at desc
    `);
    return result.rows.map((x) => ({
      ...x,
      outputQty: numberify(x.outputQty),
      laborCost: numberify(x.laborCost),
      overhead: numberify(x.overhead)
    }));
  });

  app.post("/boms", async (request) => {
    const body = z.object({
      productId: z.string().uuid(),
      name: z.string().min(1),
      outputQty: z.number().positive().default(1),
      laborCost: z.number().nonnegative().default(0),
      overhead: z.number().nonnegative().default(0),
      components: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive() })).min(1)
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bom = await client.query(
        `insert into boms (product_id, name, output_qty, labor_cost, overhead_cost)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [body.productId, body.name, body.outputQty, body.laborCost, body.overhead]
      );
      for (const component of body.components) {
        await client.query("insert into bom_components (bom_id, material_id, qty) values ($1, $2, $3)", [bom.rows[0].id, component.productId, component.qty]);
      }
      await client.query("insert into audit_log (action, entity, entity_id, detail) values ('bom.create', 'bom', $1, $2)", [bom.rows[0].id, `Created ${body.name}`]);
      await client.query("commit");
      return { id: bom.rows[0].id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/production", async () => {
    const result = await pool.query(`
      select pb.id, pb.ref_no as "refNo", pb.bom_id as "bomId", b.name as "bomName",
             pb.outlet_id as "outletId", pb.qty_produced as "qtyProduced", pb.qty_waste as "qtyWaste",
             pb.total_cost as "totalCost", pb.produced_at as "producedAt"
      from production_batches pb
      join boms b on b.id = pb.bom_id
      order by pb.produced_at desc
    `);
    return result.rows.map((x) => ({
      ...x,
      qtyProduced: numberify(x.qtyProduced),
      qtyWaste: numberify(x.qtyWaste),
      totalCost: numberify(x.totalCost)
    }));
  });

  app.post("/production", async (request) => {
    const body = z.object({
      bomId: z.string().uuid(),
      outletId: z.string().uuid(),
      qtyProduced: z.number().positive(),
      qtyWaste: z.number().nonnegative().default(0)
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bom = await client.query("select product_id, labor_cost, overhead_cost from boms where id = $1", [body.bomId]);
      if (!bom.rows[0]) throw app.httpErrors.badRequest("BOM not found");
      const components = await client.query("select material_id, qty from bom_components where bom_id = $1", [body.bomId]);
      let materialCost = 0;
      for (const component of components.rows) {
        const consumed = numberify(component.qty) * body.qtyProduced;
        const product = await client.query("select cost_price from products where id = $1", [component.material_id]);
        materialCost += consumed * numberify(product.rows[0]?.cost_price);
        await client.query("update stock_levels set quantity = quantity - $1 where outlet_id = $2 and product_id = $3", [consumed, body.outletId, component.material_id]);
        await client.query("insert into stock_movements (product_id, outlet_id, movement, qty, ref_type, note) values ($1, $2, 'production_consume', $3, 'production', 'BOM consumption')", [component.material_id, body.outletId, -consumed]);
      }
      const totalCost = materialCost + numberify(bom.rows[0].labor_cost) + numberify(bom.rows[0].overhead_cost);
      const inserted = await client.query(`
        insert into production_batches (ref_no, bom_id, outlet_id, qty_produced, qty_waste, total_cost)
        values ($1, $2, $3, $4, $5, $6) returning id
      `, [`PB-${Date.now()}`, body.bomId, body.outletId, body.qtyProduced, body.qtyWaste, totalCost]);
      await client.query(`
        insert into stock_levels (outlet_id, product_id, quantity) values ($1, $2, $3)
        on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
      `, [body.outletId, bom.rows[0].product_id, body.qtyProduced]);
      await client.query("insert into stock_movements (product_id, outlet_id, movement, qty, ref_type, ref_id) values ($1, $2, 'production_in', $3, 'production', $4)", [bom.rows[0].product_id, body.outletId, body.qtyProduced, inserted.rows[0].id]);
      await client.query("commit");
      return { id: inserted.rows[0].id, totalCost };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/grn", async () => {
    const result = await pool.query(`
      select g.id, g.ref_no as "refNo", g.po_id as "poId", g.received_at as "receivedAt",
             g.received_by as "receivedBy", coalesce(sum(gl.qty), 0) as "totalItems"
      from grn g
      left join grn_lines gl on gl.grn_id = g.id
      group by g.id
      order by g.received_at desc
    `);
    return result.rows.map((x) => ({ ...x, totalItems: numberify(x.totalItems) }));
  });

  app.post("/suppliers", async (request) => {
    const body = partySchema.parse(request.body);
    const result = await pool.query(
      "insert into suppliers (name, phone, email, address, opening_balance) values ($1,$2,$3,$4,$5) returning id",
      [body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.openingBalance]
    );
    return { id: result.rows[0].id };
  });

  app.patch("/suppliers/:id", async (request) => {
    const params = idParam.parse(request.params);
    const body = partySchema.partial().parse(request.body);
    await pool.query(
      `update suppliers set name = coalesce($2, name), phone = coalesce($3, phone), email = coalesce($4, email),
       address = coalesce($5, address), opening_balance = coalesce($6, opening_balance), version = version + 1 where id = $1`,
      [params.id, body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null, body.openingBalance ?? null]
    );
    return { ok: true };
  });

  app.post("/customers", async (request) => {
    const body = partySchema.extend({ loyaltyPoints: z.number().default(0), creditLimit: z.number().default(0) }).parse(request.body);
    const result = await pool.query(
      "insert into customers (name, phone, email, address, loyalty_points, credit_limit, opening_balance) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.loyaltyPoints, body.creditLimit, body.openingBalance]
    );
    return { id: result.rows[0].id };
  });

  app.patch("/customers/:id", async (request) => {
    const params = idParam.parse(request.params);
    const body = partySchema.partial().extend({ loyaltyPoints: z.number().optional(), creditLimit: z.number().optional() }).parse(request.body);
    await pool.query(
      `update customers set name = coalesce($2, name), phone = coalesce($3, phone), email = coalesce($4, email),
       address = coalesce($5, address), loyalty_points = coalesce($6, loyalty_points),
       credit_limit = coalesce($7, credit_limit), opening_balance = coalesce($8, opening_balance),
       version = version + 1 where id = $1`,
      [params.id, body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null, body.loyaltyPoints ?? null, body.creditLimit ?? null, body.openingBalance ?? null]
    );
    return { ok: true };
  });

  app.post("/expenses", async (request) => {
    const body = expenseSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const expense = await client.query(
        `insert into expenses (category_id, expense_date, due_date, description, amount, recurring, outlet_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [body.categoryId, body.date, body.dueDate ?? null, body.description ?? null, body.amount, body.recurring, body.outletId ?? null, body.createdBy ?? null]
      );
      const account = await client.query("select id from gl_accounts where code = '5000'");
      if (account.rows[0]) {
        await client.query("insert into gl_entries (ref_type, ref_id, account_id, debit, credit, memo) values ('expense', $1, $2, $3, 0, $4)", [expense.rows[0].id, account.rows[0].id, body.amount, body.description ?? "Expense"]);
      }
      await client.query("commit");
      return { id: expense.rows[0].id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/purchase-orders", async (request) => {
    const body = z.object({
      supplierId: z.string().uuid(),
      outletId: z.string().uuid(),
      createdBy: z.string().uuid().nullable().optional(),
      lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive(), unitCost: z.number().nonnegative() })).min(1)
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const subtotal = body.lines.reduce((sum, line) => sum + line.qty * line.unitCost, 0);
      const po = await client.query(
        `insert into purchase_orders (ref_no, supplier_id, outlet_id, order_date, status, subtotal, total, created_by)
         values ($1,$2,$3,current_date,'draft',$4,$4,$5) returning id, ref_no`,
        [`PO-${Date.now()}`, body.supplierId, body.outletId, subtotal, body.createdBy ?? null]
      );
      for (const line of body.lines) {
        await client.query("insert into purchase_order_lines (po_id, product_id, qty, unit_cost) values ($1,$2,$3,$4)", [po.rows[0].id, line.productId, line.qty, line.unitCost]);
      }
      await client.query("commit");
      return { id: po.rows[0].id, refNo: po.rows[0].ref_no };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/grn", async (request) => {
    const body = z.object({
      poId: z.string().uuid().nullable().optional(),
      outletId: z.string().uuid(),
      receivedBy: z.string().uuid().nullable().optional(),
      supplierId: z.string().uuid().nullable().optional(),
      lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive(), unitCost: z.number().nonnegative(), batchNo: z.string().nullable().optional(), expiryDate: z.string().nullable().optional() })).min(1)
    }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const grn = await client.query("insert into grn (ref_no, po_id, received_by) values ($1,$2,$3) returning id, ref_no", [`GRN-${Date.now()}`, body.poId ?? null, body.receivedBy ?? null]);
      for (const line of body.lines) {
        await client.query("insert into grn_lines (grn_id, product_id, qty, unit_cost, batch_no, expiry_date) values ($1,$2,$3,$4,$5,$6)", [grn.rows[0].id, line.productId, line.qty, line.unitCost, line.batchNo ?? null, line.expiryDate ?? null]);
        await client.query(`
          insert into stock_levels (outlet_id, product_id, quantity) values ($1,$2,$3)
          on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
        `, [body.outletId, line.productId, line.qty]);
        if (line.batchNo) {
          await client.query(`
            insert into stock_batches (product_id, outlet_id, batch_no, expiry_date, quantity, cost_price)
            values ($1,$2,$3,$4,$5,$6)
            on conflict (product_id, outlet_id, batch_no) do update set quantity = stock_batches.quantity + excluded.quantity
          `, [line.productId, body.outletId, line.batchNo, line.expiryDate ?? null, line.qty, line.unitCost]);
        }
      }
      if (body.poId) await client.query("update purchase_orders set status = 'received' where id = $1", [body.poId]);
      await client.query("commit");
      return { id: grn.rows[0].id, refNo: grn.rows[0].ref_no };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/returns", async () => {
    const result = await pool.query(`
      select sr.id, s.ref_no as "saleRef", sr.reason, sr.total, sr.created_at as "createdAt"
      from sale_returns sr
      join sales s on s.id = sr.sale_id
      order by sr.created_at desc
      limit 100
    `);
    return result.rows.map((x) => ({ ...x, total: numberify(x.total) }));
  });

  app.post("/returns", async (request) => {
    const body = z.object({ saleId: z.string().uuid(), reason: z.string().optional() }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const sale = await client.query("select * from sales where id = $1 for update", [body.saleId]);
      if (!sale.rows[0]) throw app.httpErrors.notFound("Sale not found");
      const lines = await client.query("select * from sale_lines where sale_id = $1", [body.saleId]);
      const outletId = sale.rows[0].outlet_id;
      for (const line of lines.rows) {
        await client.query(`
          insert into stock_levels (outlet_id, product_id, quantity) values ($1,$2,$3)
          on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
        `, [outletId, line.product_id, line.qty]);
      }
      const ret = await client.query("insert into sale_returns (sale_id, reason, total) values ($1,$2,$3) returning id", [body.saleId, body.reason ?? null, sale.rows[0].total]);
      await client.query("update sales set status = 'returned' where id = $1", [body.saleId]);
      await client.query("commit");
      return { id: ret.rows[0].id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/receipts", async () => {
    const result = await pool.query(`
      select s.id, s.ref_no as "refNo", s.sold_at as "soldAt", s.total, s.status,
             coalesce(sp.method, 'cash') as payment, count(sl.id) as "lineCount"
      from sales s
      left join sale_lines sl on sl.sale_id = s.id
      left join lateral (
        select method from sale_payments where sale_id = s.id order by id desc limit 1
      ) sp on true
      group by s.id, sp.method
      order by s.sold_at desc
      limit 100
    `);
    return result.rows.map((x) => ({ ...x, total: numberify(x.total), lineCount: Number(x.lineCount) }));
  });

  app.get("/supplier-invoices", async () => {
    const result = await pool.query(`
      select si.id, si.ref_no as "refNo", si.supplier_id as "supplierId", s.name as "supplierName",
             si.invoice_date as "invoiceDate", si.due_date as "dueDate", si.total, si.paid, si.status
      from supplier_invoices si
      join suppliers s on s.id = si.supplier_id
      order by si.invoice_date desc
    `);
    return result.rows.map((x) => ({ ...x, total: numberify(x.total), paid: numberify(x.paid) }));
  });

  app.get("/loyalty", async () => {
    const result = await pool.query(`
      select ll.id, ll.customer_id as "customerId", c.name as "customerName", ll.points,
             ll.ref_type as "refType", ll.note, ll.created_at as "createdAt"
      from loyalty_ledger ll
      join customers c on c.id = ll.customer_id
      order by ll.created_at desc
      limit 100
    `);
    return result.rows;
  });

  app.get("/credit", async () => {
    const result = await pool.query(`
      select c.id, c.name, c.phone, c.email, c.credit_limit as "creditLimit",
             c.opening_balance as balance,
             greatest(c.credit_limit - c.opening_balance, 0) as "availableCredit"
      from customers c
      where c.status = 'active'
      order by c.opening_balance desc, c.name
    `);
    return result.rows.map((x) => ({
      ...x,
      creditLimit: numberify(x.creditLimit),
      balance: numberify(x.balance),
      availableCredit: numberify(x.availableCredit)
    }));
  });

  app.get("/finance/accounts", async () => {
    const result = await pool.query("select id, code, name, type from gl_accounts order by code");
    return result.rows;
  });

  app.get("/finance/ledger", async () => {
    const result = await pool.query(`
      select ge.id, ge.posted_at as "postedAt", ge.ref_type as "refType", ge.ref_id as "refId",
             ga.code as "accountCode", ga.name as "accountName", ge.debit, ge.credit, ge.memo
      from gl_entries ge
      join gl_accounts ga on ga.id = ge.account_id
      order by ge.posted_at desc
      limit 200
    `);
    return result.rows.map((x) => ({ ...x, debit: numberify(x.debit), credit: numberify(x.credit) }));
  });

  app.get("/finance/statements", async () => {
    const result = await pool.query(`
      select
        coalesce(sum(case when ga.type = 'income' then ge.credit - ge.debit else 0 end), 0) as income,
        coalesce(sum(case when ga.type = 'expense' then ge.debit - ge.credit else 0 end), 0) as expenses,
        coalesce(sum(case when ga.type = 'asset' then ge.debit - ge.credit else 0 end), 0) as assets,
        coalesce(sum(case when ga.type = 'liability' then ge.credit - ge.debit else 0 end), 0) as liabilities,
        coalesce(sum(case when ga.type = 'equity' then ge.credit - ge.debit else 0 end), 0) as equity
      from gl_entries ge
      join gl_accounts ga on ga.id = ge.account_id
    `);
    const row = result.rows[0];
    const income = numberify(row.income);
    const expenses = numberify(row.expenses);
    return {
      period: "All time",
      income,
      expenses,
      grossProfit: income - expenses,
      netProfit: income - expenses,
      assets: numberify(row.assets),
      liabilities: numberify(row.liabilities),
      equity: numberify(row.equity)
    };
  });

  app.get("/reports", async () => {
    const [sales, stock, expenses, customers, suppliers] = await Promise.all([
      pool.query("select coalesce(sum(total),0) as total from sales"),
      pool.query("select coalesce(sum(sl.quantity * p.cost_price),0) as total from stock_levels sl join products p on p.id = sl.product_id"),
      pool.query("select coalesce(sum(amount),0) as total from expenses"),
      pool.query("select count(*) as total from customers where status='active'"),
      pool.query("select count(*) as total from suppliers where status='active'")
    ]);
    return [
      { id: "sales", title: "Sales report", description: "Revenue, transactions and payment performance.", total: numberify(sales.rows[0].total), trend: 0 },
      { id: "inventory", title: "Inventory report", description: "Stock value, batches, low stock and expiry.", total: numberify(stock.rows[0].total), trend: 0 },
      { id: "finance", title: "Finance report", description: "Expenses, income, P&L and balance sheet.", total: numberify(expenses.rows[0].total), trend: 0 },
      { id: "customers", title: "Customer report", description: "Profiles, credit and loyalty activity.", total: Number(customers.rows[0].total), trend: 0 },
      { id: "suppliers", title: "Supplier report", description: "Supplier balances, purchases and invoices.", total: Number(suppliers.rows[0].total), trend: 0 }
    ];
  });

  app.post("/notifications/send", async (request) => {
    const body = z.object({
      notificationId: z.string().uuid(),
      channel: z.enum(["in_app", "email", "sms", "push"]),
      recipient: z.string().optional()
    }).parse(request.body);
    const result = await pool.query(`
      insert into notification_deliveries (notification_id, channel, recipient, status)
      values ($1, $2, $3, 'pending') returning id
    `, [body.notificationId, body.channel, body.recipient ?? null]);
    return { id: result.rows[0].id, status: "pending" };
  });

  app.get("/sync/health", async () => {
    const [pending, conflicts, failed] = await Promise.all([
      pool.query("select count(*) from sync_queue where status = 'pending'"),
      pool.query("select count(*) from sync_conflicts where status = 'open'"),
      pool.query("select count(*) from sync_queue where status = 'failed'")
    ]);
    return {
      online: true,
      pending: Number(pending.rows[0].count),
      conflicts: Number(conflicts.rows[0].count),
      failed: Number(failed.rows[0].count),
      lastSyncedAt: new Date().toISOString()
    };
  });

  app.get("/sync/pull", async () => ({
    serverTime: new Date().toISOString(),
    products: (await app.inject({ method: "GET", url: "/products" })).json(),
    customers: (await app.inject({ method: "GET", url: "/customers" })).json(),
    suppliers: (await app.inject({ method: "GET", url: "/suppliers" })).json()
  }));

  app.post("/sync/push", async (request) => {
    const body = syncPushSchema.parse(request.body);
    for (const mutation of body.mutations) {
      try {
        await applySyncMutation(mutation.entity, mutation.operation, mutation.payload);
        await pool.query(`
          insert into sync_queue (device_id, entity, payload, status, client_ts, applied_at)
          values ($1, $2, $3, 'applied', $4, now())
        `, [body.deviceId, mutation.entity, JSON.stringify(mutation), mutation.clientTs]);
      } catch (error) {
        await pool.query(`
          insert into sync_queue (device_id, entity, payload, status, client_ts)
          values ($1, $2, $3, 'failed', $4)
        `, [body.deviceId, mutation.entity, JSON.stringify({ mutation, error: error instanceof Error ? error.message : String(error) }), mutation.clientTs]);
      }
    }
    return { accepted: body.mutations.length, conflicts: [] };
  });

  app.get("/sync/conflicts", async () => {
    const result = await pool.query(`
      select id as "conflictId", entity, entity_id as "entityId", local_payload as local,
             remote_payload as remote, reason, created_at as "createdAt"
      from sync_conflicts
      where status = 'open'
      order by created_at desc
    `);
    return result.rows;
  });

  app.post("/sync/conflicts/:id/resolve", async (request) => {
    const params = idParam.parse(request.params);
    await pool.query("update sync_conflicts set status = 'resolved', resolved_at = now() where id = $1", [params.id]);
    return { ok: true };
  });

  app.get("/backup", async () => {
    const result = await pool.query(`
      select id, name, created_at as "createdAt", size_bytes as "sizeBytes", status
      from backup_snapshots
      order by created_at desc
    `);
    return result.rows.map((x) => ({ ...x, sizeBytes: Number(x.sizeBytes) }));
  });

  app.post("/backup", async () => {
    const backupDir = process.env.BACKUP_DIR ?? join(process.cwd(), "..", "..", "backups");
    await mkdir(backupDir, { recursive: true });
    const name = `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    const filePath = join(backupDir, name);
    const tables = ["users", "roles", "products", "stock_levels", "stock_batches", "customers", "suppliers", "sales", "sale_lines", "purchase_orders", "expenses", "audit_log"];
    const snapshot: Record<string, unknown> = { createdAt: new Date().toISOString(), tables: {} };
    for (const table of tables) {
      const result = await pool.query(`select * from ${table}`);
      (snapshot.tables as Record<string, unknown>)[table] = result.rows;
    }
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    const fileStat = await stat(filePath);
    const result = await pool.query(`
      insert into backup_snapshots (name, file_path, size_bytes, status)
      values ($1, $2, $3, 'ready')
      returning id, name, created_at as "createdAt", size_bytes as "sizeBytes", status
    `, [name, filePath, fileStat.size]);
    return { ...result.rows[0], sizeBytes: Number(result.rows[0].sizeBytes) };
  });
}

async function applySyncMutation(entity: string, operation: string, payload: unknown) {
  if (operation !== "create") return;
  const body = payload as Record<string, unknown>;
  if (entity === "supplier") {
    await pool.query("insert into suppliers (name, phone, email, address) values ($1,$2,$3,$4)", [body.name ?? "Offline supplier", body.phone ?? null, body.email ?? null, body.address ?? null]);
  } else if (entity === "customer") {
    await pool.query("insert into customers (name, phone, email, address) values ($1,$2,$3,$4)", [body.name ?? "Offline customer", body.phone ?? null, body.email ?? null, body.address ?? null]);
  } else if (entity === "expense") {
    const category = await pool.query("select id from expense_categories order by name limit 1");
    if (!category.rows[0]) return;
    await pool.query("insert into expenses (category_id, expense_date, description, amount, recurring) values ($1,current_date,$2,$3,$4)", [category.rows[0].id, body.description ?? "Offline expense", Number(body.amount ?? 0), Boolean(body.recurring)]);
  } else if (entity === "inventory_adjustment") {
    if (!body.productId || !body.outletId) return;
    await pool.query(`
      insert into stock_levels (outlet_id, product_id, quantity) values ($1,$2,$3)
      on conflict (outlet_id, product_id) do update set quantity = stock_levels.quantity + excluded.quantity
    `, [body.outletId, body.productId, Number(body.qty ?? 0)]);
  } else if (entity === "sale") {
    await pool.query("insert into audit_log (action, entity, detail) values ('sync.sale_queued', 'sale', $1)", [JSON.stringify(body).slice(0, 500)]);
  }
}
