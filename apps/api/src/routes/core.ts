import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { numberify, pool } from "../db.js";

type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

const idParam = z.object({ id: z.string().uuid() });
const nullableText = z.string().trim().nullable().optional();
const dataUrl = z.string().max(140_000).regex(/^data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+$/).nullable().optional();

function ref(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function money(value: unknown) {
  return Number(Number(value ?? 0).toFixed(2));
}

async function defaultLocation(type: "warehouse" | "shop", client: DbClient = pool) {
  const result = await client.query("select id from stock_locations where type = $1 order by is_default desc, created_at limit 1", [type]);
  const row = result.rows[0];
  if (!row) throw new Error(`No ${type} location configured`);
  return row.id as string;
}

async function updateWarehouseItem(client: DbClient, itemId: string, qty: number) {
  await client.query(
    `insert into warehouse_stock (item_id, quantity) values ($1, $2)
     on conflict (item_id) do update set quantity = warehouse_stock.quantity + excluded.quantity, updated_at = now()`,
    [itemId, qty]
  );
}

async function updateWarehouseProduct(client: DbClient, productId: string, qty: number) {
  await client.query(
    `insert into warehouse_stock (product_id, quantity) values ($1, $2)
     on conflict (product_id) do update set quantity = warehouse_stock.quantity + excluded.quantity, updated_at = now()`,
    [productId, qty]
  );
}

async function updateShopProduct(client: DbClient, productId: string, qty: number) {
  await client.query(
    `insert into shop_stock (product_id, quantity) values ($1, $2)
     on conflict (product_id) do update set quantity = shop_stock.quantity + excluded.quantity, updated_at = now()`,
    [productId, qty]
  );
}

async function assertWarehouseItem(client: DbClient, itemId: string, qty: number) {
  const result = await client.query("select coalesce(quantity, 0) as quantity from warehouse_stock where item_id = $1 for update", [itemId]);
  if (numberify(result.rows[0]?.quantity) < qty) throw new Error("Not enough raw item stock in warehouse");
}

async function assertWarehouseProduct(client: DbClient, productId: string, qty: number) {
  const result = await client.query("select coalesce(quantity, 0) as quantity from warehouse_stock where product_id = $1 for update", [productId]);
  if (numberify(result.rows[0]?.quantity) < qty) throw new Error("Not enough finished product stock in warehouse");
}

async function assertShopProduct(client: DbClient, productId: string, qty: number) {
  const result = await client.query("select coalesce(quantity, 0) as quantity from shop_stock where product_id = $1 for update", [productId]);
  if (numberify(result.rows[0]?.quantity) < qty) throw new Error("Not enough product stock in shop");
}

const supplierSchema = z.object({
  name: z.string().trim().min(1),
  phone: nullableText,
  email: nullableText,
  address: nullableText,
  note: nullableText
});

const customerSchema = supplierSchema.omit({ note: true });

const itemSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  unit: z.string().trim().default("ea"),
  reorderLevel: z.number().nonnegative().default(0)
});

const productSchema = z.object({
  sku: z.string().trim().min(1),
  barcode: nullableText,
  name: z.string().trim().min(1),
  unit: z.string().trim().default("ea"),
  sellingPrice: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  imageData: dataUrl
});

const poSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: nullableText,
  note: nullableText,
  landedCost: z.number().nonnegative().default(0),
  createdBy: z.string().uuid().nullable().optional(),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative()
  })).min(1)
});

const grnSchema = z.object({
  purchaseOrderId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  receivedBy: z.string().uuid().nullable().optional(),
  note: nullableText,
  createInvoice: z.boolean().default(false),
  invoiceDueDate: nullableText,
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative()
  })).min(1)
});

const invoiceSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  grnId: z.string().uuid().nullable().optional(),
  invoiceDate: z.string().optional(),
  dueDate: nullableText,
  total: z.number().nonnegative(),
  attachmentName: nullableText,
  attachmentMime: nullableText,
  attachmentData: dataUrl,
  note: nullableText
});

const blueprintSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1),
  outputQty: z.number().positive().default(1),
  laborCost: z.number().nonnegative().default(0),
  overheadCost: z.number().nonnegative().default(0),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().positive()
  })).min(1)
});

const productionSchema = z.object({
  blueprintId: z.string().uuid(),
  quantityToProduce: z.number().positive(),
  quantityProduced: z.number().positive(),
  quantityWasted: z.number().nonnegative().default(0),
  extraCost: z.number().nonnegative().default(0),
  sellingPrice: z.number().nonnegative().optional(),
  producedBy: z.string().uuid().nullable().optional()
});

const transferSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  transferredBy: z.string().uuid().nullable().optional(),
  note: nullableText
});

const saleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  cashierId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "card", "mobile", "bank", "credit"]),
  discount: z.number().nonnegative().default(0),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0)
  })).min(1)
});

const userSchema = z.object({
  username: z.string().trim().min(2),
  email: z.string().email(),
  name: z.string().trim().min(1),
  password: z.string().min(4),
  role: z.string().default("pos_cashier")
});

export async function registerCoreRoutes(app: FastifyInstance) {
  app.get("/settings", async () => {
    const result = await pool.query("select value from app_settings where key = 'settings'");
    return result.rows[0]?.value ?? {};
  });

  app.get("/dashboard", async () => {
    const result = await pool.query(`
      select
        coalesce((select sum(total) from sales where sale_date >= now() - interval '14 days'), 0) as revenue_14d,
        coalesce((select sum(quantity * p.average_cost) from shop_stock ss join products p on p.id = ss.product_id), 0) as shop_value,
        coalesce((select sum(quantity * p.average_cost) from warehouse_stock ws join products p on p.id = ws.product_id), 0) +
        coalesce((select sum(quantity * i.average_cost) from warehouse_stock ws join items i on i.id = ws.item_id), 0) as warehouse_value,
        coalesce((select count(*) from sales where sale_date >= now() - interval '14 days'), 0) as sales_count,
        coalesce((select count(*) from shop_stock ss join products p on p.id = ss.product_id where ss.quantity <= p.reorder_level), 0) as low_stock_count
    `);
    const row = result.rows[0];
    return {
      revenue14d: money(row.revenue_14d),
      shopValue: money(row.shop_value),
      warehouseValue: money(row.warehouse_value),
      salesCount: Number(row.sales_count),
      lowStockCount: Number(row.low_stock_count)
    };
  });

  app.get("/stock/locations", async () => (await pool.query("select id, code, name, type, address from stock_locations order by type, name")).rows);

  app.get("/suppliers", async () => {
    const result = await pool.query(`
      select s.*, coalesce(sum(si.total - si.paid), 0) as balance
      from suppliers s
      left join supplier_invoices si on si.supplier_id = s.id and si.status <> 'void'
      group by s.id
      order by s.name
    `);
    return result.rows.map((row) => ({ ...row, balance: money(row.balance) }));
  });

  app.post("/suppliers", async (request, reply) => {
    const body = supplierSchema.parse(request.body);
    const result = await pool.query(
      `insert into suppliers (name, phone, email, address, note) values ($1,$2,$3,$4,$5) returning id`,
      [body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.note ?? null]
    );
    return reply.code(201).send({ id: result.rows[0].id });
  });

  app.patch("/suppliers/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const body = supplierSchema.partial().parse(request.body);
    await pool.query(
      `update suppliers set name = coalesce($2, name), phone = coalesce($3, phone), email = coalesce($4, email),
       address = coalesce($5, address), note = coalesce($6, note), updated_at = now() where id = $1`,
      [id, body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null, body.note ?? null]
    );
    return { ok: true };
  });

  app.delete("/suppliers/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const linked = await pool.query("select 1 from purchase_orders where supplier_id = $1 union all select 1 from supplier_invoices where supplier_id = $1 limit 1", [id]);
    if (linked.rows.length) throw app.httpErrors.conflict("Supplier has activity. Suspend instead of deleting.");
    await pool.query("delete from suppliers where id = $1", [id]);
    return { ok: true };
  });

  app.post("/suppliers/:id/suspend", async (request) => {
    const { id } = idParam.parse(request.params);
    await pool.query("update suppliers set status = 'suspended', updated_at = now() where id = $1", [id]);
    return { ok: true };
  });

  app.get("/suppliers/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const [supplier, purchaseOrders, grns, invoices, payments] = await Promise.all([
      pool.query("select * from suppliers where id = $1", [id]),
      pool.query("select * from purchase_orders where supplier_id = $1 order by created_at desc", [id]),
      pool.query("select * from grns where supplier_id = $1 order by received_at desc", [id]),
      pool.query("select * from supplier_invoices where supplier_id = $1 order by created_at desc", [id]),
      pool.query("select * from payments where supplier_id = $1 order by paid_at desc", [id])
    ]);
    if (!supplier.rows[0]) throw app.httpErrors.notFound("Supplier not found");
    return { supplier: supplier.rows[0], purchaseOrders: purchaseOrders.rows, grns: grns.rows, invoices: invoices.rows, payments: payments.rows };
  });

  app.get("/items", async () => {
    const result = await pool.query(`
      select i.id, i.sku, i.name, i.unit, i.reorder_level as "reorderLevel", i.average_cost as "averageCost",
             i.status, coalesce(ws.quantity, 0) as stock
      from items i
      left join warehouse_stock ws on ws.item_id = i.id
      order by i.name
    `);
    return result.rows.map((row) => ({ ...row, stock: numberify(row.stock), averageCost: numberify(row.averageCost), reorderLevel: numberify(row.reorderLevel) }));
  });

  app.post("/items", async (request, reply) => {
    const body = itemSchema.parse(request.body);
    const result = await pool.query(
      "insert into items (sku, name, unit, reorder_level) values ($1,$2,$3,$4) returning id",
      [body.sku, body.name, body.unit, body.reorderLevel]
    );
    return reply.code(201).send({ id: result.rows[0].id });
  });

  app.get("/products", async () => {
    const result = await pool.query(`
      select p.id, p.sku, p.barcode, p.name, p.unit, p.selling_price as "sellingPrice", p.average_cost as "averageCost",
             p.reorder_level as "reorderLevel", p.image_data as "imageData", coalesce(ws.quantity, 0) as "warehouseStock",
             coalesce(ss.quantity, 0) as "shopStock", p.status
      from products p
      left join warehouse_stock ws on ws.product_id = p.id
      left join shop_stock ss on ss.product_id = p.id
      order by p.name
    `);
    return result.rows.map((row) => ({
      ...row,
      sellingPrice: money(row.sellingPrice),
      averageCost: numberify(row.averageCost),
      reorderLevel: numberify(row.reorderLevel),
      warehouseStock: numberify(row.warehouseStock),
      shopStock: numberify(row.shopStock)
    }));
  });

  app.post("/products", async (request, reply) => {
    const body = productSchema.parse(request.body);
    if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000) throw app.httpErrors.badRequest("Product image must be under 100 KB after optimization");
    const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
    const result = await pool.query(
      `insert into products (sku, barcode, name, unit, selling_price, reorder_level, image_data, image_mime)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [body.sku, body.barcode ?? null, body.name, body.unit, body.sellingPrice, body.reorderLevel, body.imageData ?? null, mime]
    );
    return reply.code(201).send({ id: result.rows[0].id });
  });

  app.patch("/products/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const body = productSchema.partial().parse(request.body);
    if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000) throw app.httpErrors.badRequest("Product image must be under 100 KB after optimization");
    const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
    await pool.query(
      `update products set sku = coalesce($2, sku), barcode = coalesce($3, barcode), name = coalesce($4, name),
       unit = coalesce($5, unit), selling_price = coalesce($6, selling_price), reorder_level = coalesce($7, reorder_level),
       image_data = coalesce($8, image_data), image_mime = coalesce($9, image_mime), updated_at = now()
       where id = $1`,
      [id, body.sku ?? null, body.barcode ?? null, body.name ?? null, body.unit ?? null, body.sellingPrice ?? null, body.reorderLevel ?? null, body.imageData ?? null, mime]
    );
    return { ok: true };
  });

  app.delete("/products/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const linked = await pool.query(`
      select 1 from product_blueprints where product_id = $1
      union all select 1 from sale_items where product_id = $1
      union all select 1 from stock_movements where product_id = $1
      limit 1
    `, [id]);
    if (linked.rows.length) throw app.httpErrors.conflict("Product has activity. Suspend it instead of deleting.");
    await pool.query("delete from products where id = $1", [id]);
    return { ok: true };
  });

  app.post("/purchase-orders", async (request, reply) => {
    const body = poSchema.parse(request.body);
    const subtotal = body.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const total = subtotal + body.landedCost;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const po = await client.query(
        `insert into purchase_orders (ref_no, supplier_id, expected_date, note, landed_cost, subtotal, total, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,'ordered',$8) returning id, ref_no`,
        [ref("PO"), body.supplierId, body.expectedDate ?? null, body.note ?? null, body.landedCost, subtotal, total, body.createdBy ?? null]
      );
      for (const line of body.items) {
        await client.query(
          `insert into purchase_order_items (purchase_order_id, item_id, quantity, unit_cost, line_total)
           values ($1,$2,$3,$4,$5)`,
          [po.rows[0].id, line.itemId, line.quantity, line.unitCost, line.quantity * line.unitCost]
        );
      }
      await client.query("commit");
      return reply.code(201).send({ id: po.rows[0].id, refNo: po.rows[0].ref_no });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/purchase-orders", async () => {
    const result = await pool.query(`
      select po.*, s.name as "supplierName", coalesce(count(poi.id), 0) as "lineCount"
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      left join purchase_order_items poi on poi.purchase_order_id = po.id
      group by po.id, s.name
      order by po.created_at desc
    `);
    return result.rows.map((row) => ({ ...row, total: money(row.total), lineCount: Number(row.lineCount) }));
  });

  app.post("/grns", async (request, reply) => {
    const body = grnSchema.parse(request.body);
    const locationId = body.locationId ?? await defaultLocation("warehouse");
    const total = body.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const grn = await client.query(
        `insert into grns (ref_no, purchase_order_id, supplier_id, location_id, received_by, note, total)
         values ($1,$2,$3,$4,$5,$6,$7) returning id, ref_no`,
        [ref("GRN"), body.purchaseOrderId ?? null, body.supplierId, locationId, body.receivedBy ?? null, body.note ?? null, total]
      );
      for (const line of body.items) {
        await client.query(
          `insert into grn_items (grn_id, item_id, quantity, unit_cost, landed_unit_cost, line_total)
           values ($1,$2,$3,$4,$4,$5)`,
          [grn.rows[0].id, line.itemId, line.quantity, line.unitCost, line.quantity * line.unitCost]
        );
        await updateWarehouseItem(client, line.itemId, line.quantity);
        await client.query("update items set average_cost = $2, updated_at = now() where id = $1", [line.itemId, line.unitCost]);
        await client.query(
          `insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'in',$3,$4,'grn',$5,$6,'Goods received')`,
          [locationId, line.itemId, line.quantity, line.unitCost, grn.rows[0].id, body.receivedBy ?? null]
        );
      }
      if (body.purchaseOrderId) await client.query("update purchase_orders set status = 'received' where id = $1", [body.purchaseOrderId]);
      if (body.createInvoice) {
        const invoice = await client.query(
          `insert into supplier_invoices (ref_no, supplier_id, purchase_order_id, grn_id, due_date, total, note)
           values ($1,$2,$3,$4,$5,$6,'from grn') returning id`,
          [ref("SI"), body.supplierId, body.purchaseOrderId ?? null, grn.rows[0].id, body.invoiceDueDate ?? null, total]
        );
        await client.query("insert into expenses (supplier_invoice_id, category, description, amount) values ($1,'supplier_invoice','Supplier invoice from GRN',$2)", [invoice.rows[0].id, total]);
        await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_invoice','supplier_invoice',$1,$2,'Supplier invoice from GRN')", [invoice.rows[0].id, total]);
      }
      await client.query("commit");
      return reply.code(201).send({ id: grn.rows[0].id, refNo: grn.rows[0].ref_no });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/grns", async () => {
    const result = await pool.query(`
      select g.*, s.name as "supplierName", l.name as "locationName", coalesce(count(gi.id), 0) as "lineCount"
      from grns g join suppliers s on s.id = g.supplier_id join stock_locations l on l.id = g.location_id
      left join grn_items gi on gi.grn_id = g.id
      group by g.id, s.name, l.name
      order by g.received_at desc
    `);
    return result.rows.map((row) => ({ ...row, total: money(row.total), lineCount: Number(row.lineCount) }));
  });

  app.get("/grns/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const [grn, items] = await Promise.all([
      pool.query("select g.*, s.name as supplier_name from grns g join suppliers s on s.id = g.supplier_id where g.id = $1", [id]),
      pool.query("select gi.*, i.name as item_name, i.sku from grn_items gi join items i on i.id = gi.item_id where gi.grn_id = $1", [id])
    ]);
    if (!grn.rows[0]) throw app.httpErrors.notFound("GRN not found");
    return { ...grn.rows[0], items: items.rows };
  });

  app.post("/supplier-invoices", async (request, reply) => {
    const body = invoiceSchema.parse(request.body);
    const result = await pool.query(
      `insert into supplier_invoices (ref_no, supplier_id, purchase_order_id, grn_id, invoice_date, due_date, total, attachment_name, attachment_mime, attachment_data, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, ref_no`,
      [ref("SI"), body.supplierId, body.purchaseOrderId ?? null, body.grnId ?? null, body.invoiceDate ?? new Date().toISOString().slice(0, 10), body.dueDate ?? null, body.total, body.attachmentName ?? null, body.attachmentMime ?? null, body.attachmentData ?? null, body.note ?? null]
    );
    await pool.query("insert into expenses (supplier_invoice_id, category, description, amount) values ($1,'supplier_invoice','Supplier invoice',$2)", [result.rows[0].id, body.total]);
    await pool.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_invoice','supplier_invoice',$1,$2,'Supplier invoice')", [result.rows[0].id, body.total]);
    return reply.code(201).send({ id: result.rows[0].id, refNo: result.rows[0].ref_no });
  });

  app.get("/supplier-invoices", async () => {
    const result = await pool.query(`
      select si.*, s.name as "supplierName", g.ref_no as "grnRefNo"
      from supplier_invoices si
      join suppliers s on s.id = si.supplier_id
      left join grns g on g.id = si.grn_id
      order by si.created_at desc
    `);
    return result.rows.map((row) => ({ ...row, total: money(row.total), paid: money(row.paid) }));
  });

  app.get("/supplier-invoices/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const [invoice, payments, expense] = await Promise.all([
      pool.query(`select si.*, s.name as "supplierName", g.ref_no as "grnRefNo" from supplier_invoices si join suppliers s on s.id = si.supplier_id left join grns g on g.id = si.grn_id where si.id = $1`, [id]),
      pool.query("select * from payments where supplier_invoice_id = $1 order by paid_at desc", [id]),
      pool.query("select * from expenses where supplier_invoice_id = $1 order by created_at desc", [id])
    ]);
    if (!invoice.rows[0]) throw app.httpErrors.notFound("Invoice not found");
    return { ...invoice.rows[0], payments: payments.rows, expenses: expense.rows };
  });

  app.patch("/supplier-invoices/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const body = z.object({
      dueDate: nullableText,
      total: z.number().nonnegative().optional(),
      status: z.enum(["open", "partial", "paid", "void"]).optional()
    }).parse(request.body);
    await pool.query(
      "update supplier_invoices set due_date = coalesce($2, due_date), total = coalesce($3, total), status = coalesce($4::document_status, status) where id = $1",
      [id, body.dueDate ?? null, body.total ?? null, body.status ?? null]
    );
    return { ok: true };
  });

  app.delete("/supplier-invoices/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const paid = await pool.query("select 1 from payments where supplier_invoice_id = $1 limit 1", [id]);
    if (paid.rows.length) throw app.httpErrors.conflict("Invoice has payments. Void it instead of deleting.");
    await pool.query("delete from expenses where supplier_invoice_id = $1", [id]);
    await pool.query("delete from supplier_invoices where id = $1", [id]);
    return { ok: true };
  });

  app.post("/supplier-invoices/:id/payments", async (request) => {
    const { id } = idParam.parse(request.params);
    const body = z.object({ amount: z.number().positive(), method: z.enum(["cash", "card", "mobile", "bank", "credit"]), reference: nullableText, note: nullableText }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const invoice = await client.query("select * from supplier_invoices where id = $1 for update", [id]);
      if (!invoice.rows[0]) throw app.httpErrors.notFound("Invoice not found");
      await client.query(
        `insert into payments (party_type, supplier_id, supplier_invoice_id, method, amount, reference, note)
         values ('supplier',$1,$2,$3,$4,$5,$6)`,
        [invoice.rows[0].supplier_id, id, body.method, body.amount, body.reference ?? null, body.note ?? null]
      );
      const paid = numberify(invoice.rows[0].paid) + body.amount;
      const status = paid >= numberify(invoice.rows[0].total) ? "paid" : "partial";
      await client.query("update supplier_invoices set paid = $2, status = $3 where id = $1", [id, paid, status]);
      await client.query("update expenses set status = $2 where supplier_invoice_id = $1", [id, status]);
      await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_payment','supplier_invoice',$1,$2,'Supplier payment')", [id, body.amount]);
      await client.query("commit");
      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/blueprints", async () => {
    const result = await pool.query(`
      select b.*, p.name as "productName", p.selling_price as "sellingPrice",
        coalesce(json_agg(json_build_object('itemId', bi.item_id, 'itemName', i.name, 'quantity', bi.quantity)) filter (where bi.id is not null), '[]') as items
      from product_blueprints b
      join products p on p.id = b.product_id
      left join product_blueprint_items bi on bi.blueprint_id = b.id
      left join items i on i.id = bi.item_id
      group by b.id, p.name, p.selling_price
      order by b.created_at desc
    `);
    return result.rows;
  });

  app.post("/blueprints", async (request, reply) => {
    const body = blueprintSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bp = await client.query(
        `insert into product_blueprints (product_id, name, output_qty, labor_cost, overhead_cost) values ($1,$2,$3,$4,$5) returning id`,
        [body.productId, body.name, body.outputQty, body.laborCost, body.overheadCost]
      );
      for (const line of body.items) {
        await client.query("insert into product_blueprint_items (blueprint_id, item_id, quantity) values ($1,$2,$3)", [bp.rows[0].id, line.itemId, line.quantity]);
      }
      await client.query("commit");
      return reply.code(201).send({ id: bp.rows[0].id });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/production", async (request, reply) => {
    const body = productionSchema.parse(request.body);
    const warehouseId = await defaultLocation("warehouse");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bp = await client.query("select * from product_blueprints where id = $1", [body.blueprintId]);
      if (!bp.rows[0]) throw app.httpErrors.notFound("Blueprint not found");
      const factor = body.quantityToProduce / numberify(bp.rows[0].output_qty);
      const components = await client.query(`
        select bi.item_id, bi.quantity, i.average_cost
        from product_blueprint_items bi join items i on i.id = bi.item_id
        where bi.blueprint_id = $1
      `, [body.blueprintId]);
      let materialCost = 0;
      for (const line of components.rows) {
        const requiredQty = numberify(line.quantity) * factor;
        await assertWarehouseItem(client, line.item_id, requiredQty);
        materialCost += requiredQty * numberify(line.average_cost);
      }
      const totalCost = materialCost + numberify(bp.rows[0].labor_cost) + numberify(bp.rows[0].overhead_cost) + body.extraCost;
      const unitCost = totalCost / body.quantityProduced;
      const batch = await client.query(
        `insert into production_batches (ref_no, blueprint_id, warehouse_location_id, quantity_to_produce, quantity_produced, quantity_wasted, extra_cost, total_cost, unit_cost, selling_price, produced_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, ref_no`,
        [ref("PB"), body.blueprintId, warehouseId, body.quantityToProduce, body.quantityProduced, body.quantityWasted, body.extraCost, totalCost, unitCost, body.sellingPrice ?? null, body.producedBy ?? null]
      );
      for (const line of components.rows) {
        const requiredQty = numberify(line.quantity) * factor;
        const lineCost = requiredQty * numberify(line.average_cost);
        await updateWarehouseItem(client, line.item_id, -requiredQty);
        await client.query(
          "insert into production_batch_items (production_batch_id, item_id, required_qty, consumed_qty, unit_cost, total_cost) values ($1,$2,$3,$3,$4,$5)",
          [batch.rows[0].id, line.item_id, requiredQty, line.average_cost, lineCost]
        );
        await client.query(
          `insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'out',$3,$4,'production',$5,$6,'Raw item consumed')`,
          [warehouseId, line.item_id, requiredQty, line.average_cost, batch.rows[0].id, body.producedBy ?? null]
        );
      }
      await updateWarehouseProduct(client, bp.rows[0].product_id, body.quantityProduced);
      await client.query("update products set average_cost = $2, selling_price = coalesce($3, selling_price), updated_at = now() where id = $1", [bp.rows[0].product_id, unitCost, body.sellingPrice ?? null]);
      await client.query(
        `insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
         values ($1,$2,'in',$3,$4,'production',$5,$6,'Finished product produced')`,
        [warehouseId, bp.rows[0].product_id, body.quantityProduced, unitCost, batch.rows[0].id, body.producedBy ?? null]
      );
      await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('production_cost','production_batch',$1,$2,'Production cost')", [batch.rows[0].id, totalCost]);
      await client.query("commit");
      return reply.code(201).send({ id: batch.rows[0].id, refNo: batch.rows[0].ref_no, totalCost: money(totalCost), unitCost: numberify(unitCost) });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/production", async () => {
    const result = await pool.query(`
      select pb.*, b.name as "blueprintName", p.name as "productName"
      from production_batches pb
      join product_blueprints b on b.id = pb.blueprint_id
      join products p on p.id = b.product_id
      order by pb.produced_at desc
    `);
    return result.rows;
  });

  app.get("/stock/warehouse", async () => {
    const result = await pool.query(`
      select 'item' as type, i.id, i.sku, i.name, i.unit, ws.quantity, i.average_cost as "unitCost"
      from warehouse_stock ws join items i on i.id = ws.item_id
      union all
      select 'product' as type, p.id, p.sku, p.name, p.unit, ws.quantity, p.average_cost as "unitCost"
      from warehouse_stock ws join products p on p.id = ws.product_id
      order by name
    `);
    return result.rows.map((row) => ({ ...row, quantity: numberify(row.quantity), unitCost: numberify(row.unitCost), value: money(numberify(row.quantity) * numberify(row.unitCost)) }));
  });

  app.get("/stock/shop", async () => {
    const result = await pool.query(`
      select p.id, p.sku, p.name, p.unit, p.selling_price as "sellingPrice", p.average_cost as "unitCost", ss.quantity
      from shop_stock ss join products p on p.id = ss.product_id
      order by p.name
    `);
    return result.rows.map((row) => ({ ...row, quantity: numberify(row.quantity), sellingPrice: money(row.sellingPrice), unitCost: numberify(row.unitCost), value: money(numberify(row.quantity) * numberify(row.unitCost)) }));
  });

  app.get("/stock/movements", async () => {
    const result = await pool.query(`
      select sm.id, coalesce(i.name, p.name) as "productName", sm.direction as movement, sm.quantity as qty,
             sm.unit_cost as "unitCost", sm.ref_type as "refType", sm.ref_id as "refId", sm.note, sm.created_at as "createdAt"
      from stock_movements sm
      left join items i on i.id = sm.item_id
      left join products p on p.id = sm.product_id
      order by sm.created_at desc
      limit 150
    `);
    return result.rows.map((row) => ({ ...row, qty: numberify(row.qty), unitCost: numberify(row.unitCost) }));
  });

  app.post("/transfers", async (request, reply) => {
    const body = transferSchema.parse(request.body);
    const warehouseId = await defaultLocation("warehouse");
    const shopId = await defaultLocation("shop");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await assertWarehouseProduct(client, body.productId, body.quantity);
      await updateWarehouseProduct(client, body.productId, -body.quantity);
      await updateShopProduct(client, body.productId, body.quantity);
      const transfer = await client.query(
        `insert into stock_transfers (ref_no, from_location_id, to_location_id, product_id, quantity, transferred_by, note)
         values ($1,$2,$3,$4,$5,$6,$7) returning id, ref_no`,
        [ref("TR"), warehouseId, shopId, body.productId, body.quantity, body.transferredBy ?? null, body.note ?? null]
      );
      const product = await client.query("select average_cost from products where id = $1", [body.productId]);
      const unitCost = numberify(product.rows[0]?.average_cost);
      await client.query("insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note) values ($1,$2,'out',$3,$4,'transfer',$5,$6,'Warehouse to shop')", [warehouseId, body.productId, body.quantity, unitCost, transfer.rows[0].id, body.transferredBy ?? null]);
      await client.query("insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note) values ($1,$2,'in',$3,$4,'transfer',$5,$6,'Warehouse to shop')", [shopId, body.productId, body.quantity, unitCost, transfer.rows[0].id, body.transferredBy ?? null]);
      await client.query("commit");
      return reply.code(201).send({ id: transfer.rows[0].id, refNo: transfer.rows[0].ref_no });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/transfers", async () => {
    const result = await pool.query(`
      select t.*, p.name as "productName", fl.name as "fromLocation", tl.name as "toLocation", u.full_name as "userName"
      from stock_transfers t
      join products p on p.id = t.product_id
      join stock_locations fl on fl.id = t.from_location_id
      join stock_locations tl on tl.id = t.to_location_id
      left join users u on u.id = t.transferred_by
      order by t.transferred_at desc
    `);
    return result.rows;
  });

  app.post("/sales", async (request, reply) => {
    const body = saleSchema.parse(request.body);
    const shopId = await defaultLocation("shop");
    const client = await pool.connect();
    try {
      await client.query("begin");
      let subtotal = 0;
      let cogs = 0;
      for (const line of body.items) {
        await assertShopProduct(client, line.productId, line.quantity);
        const product = await client.query("select average_cost from products where id = $1", [line.productId]);
        subtotal += line.quantity * line.unitPrice - line.discount;
        cogs += line.quantity * numberify(product.rows[0]?.average_cost);
      }
      const total = Math.max(0, subtotal - body.discount);
      const sale = await client.query(
        `insert into sales (ref_no, customer_id, cashier_id, subtotal, discount, total, payment_method)
         values ($1,$2,$3,$4,$5,$6,$7) returning id, ref_no`,
        [ref("SL"), body.customerId ?? null, body.cashierId, subtotal, body.discount, total, body.paymentMethod]
      );
      for (const line of body.items) {
        const product = await client.query("select average_cost from products where id = $1", [line.productId]);
        const unitCost = numberify(product.rows[0]?.average_cost);
        await client.query(
          `insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_cost, line_total)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [sale.rows[0].id, line.productId, line.quantity, line.unitPrice, line.discount, unitCost, line.quantity * line.unitPrice - line.discount]
        );
        await updateShopProduct(client, line.productId, -line.quantity);
        await client.query(
          `insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'out',$3,$4,'sale',$5,$6,'POS sale')`,
          [shopId, line.productId, line.quantity, unitCost, sale.rows[0].id, body.cashierId]
        );
      }
      await client.query("insert into payments (party_type, customer_id, sale_id, method, amount) values ('customer',$1,$2,$3,$4)", [body.customerId ?? null, sale.rows[0].id, body.paymentMethod, total]);
      await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('sale_revenue','sale',$1,$2,'POS sale')", [sale.rows[0].id, total]);
      if (body.discount) await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('discount','sale',$1,$2,'Sale discount')", [sale.rows[0].id, body.discount]);
      await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('cogs','sale',$1,$2,'Cost of goods sold')", [sale.rows[0].id, cogs]);
      const receiptPayload = { refNo: sale.rows[0].ref_no, items: body.items, subtotal, discount: body.discount, total, paymentMethod: body.paymentMethod };
      const receipt = await client.query("insert into receipts (sale_id, receipt_no, payload) values ($1,$2,$3) returning id, receipt_no", [sale.rows[0].id, ref("RCPT"), JSON.stringify(receiptPayload)]);
      await client.query("commit");
      return reply.code(201).send({ id: sale.rows[0].id, refNo: sale.rows[0].ref_no, receiptId: receipt.rows[0].id, receiptNo: receipt.rows[0].receipt_no, total: money(total) });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/sales", async () => {
    const result = await pool.query("select s.*, c.name as customer_name from sales s left join customers c on c.id = s.customer_id order by s.sale_date desc limit 100");
    return result.rows;
  });

  app.get("/receipts", async () => {
    const result = await pool.query(`
      select r.id, r.receipt_no as "receiptNo", r.payload, r.created_at as "createdAt", s.ref_no as "saleRefNo", s.total
      from receipts r join sales s on s.id = r.sale_id order by r.created_at desc limit 100
    `);
    return result.rows.map((row) => ({ ...row, total: money(row.total) }));
  });

  app.get("/customers", async () => {
    const result = await pool.query(`
      select c.*, coalesce(sum(s.total), 0) as "totalPurchases", coalesce(count(s.id), 0) as "saleCount"
      from customers c left join sales s on s.customer_id = c.id
      group by c.id order by c.name
    `);
    return result.rows.map((row) => ({ ...row, totalPurchases: money(row.totalPurchases), saleCount: Number(row.saleCount) }));
  });

  app.post("/customers", async (request, reply) => {
    const body = customerSchema.parse(request.body);
    const result = await pool.query("insert into customers (name, phone, email, address) values ($1,$2,$3,$4) returning id", [body.name, body.phone ?? null, body.email ?? null, body.address ?? null]);
    return reply.code(201).send({ id: result.rows[0].id });
  });

  app.get("/customers/:id", async (request) => {
    const { id } = idParam.parse(request.params);
    const [customer, sales, payments] = await Promise.all([
      pool.query("select * from customers where id = $1", [id]),
      pool.query("select * from sales where customer_id = $1 order by sale_date desc", [id]),
      pool.query("select * from payments where customer_id = $1 order by paid_at desc", [id])
    ]);
    if (!customer.rows[0]) throw app.httpErrors.notFound("Customer not found");
    return { customer: customer.rows[0], sales: sales.rows, payments: payments.rows };
  });

  app.get("/finance", async () => {
    const result = await pool.query(`
      select
        coalesce(sum(amount) filter (where type = 'sale_revenue'), 0) as revenue,
        coalesce(sum(amount) filter (where type = 'discount'), 0) as discounts,
        coalesce(sum(amount) filter (where type = 'cogs'), 0) as cogs,
        coalesce(sum(amount) filter (where type in ('supplier_invoice','purchase_expense','production_cost')), 0) as expenses,
        coalesce(sum(amount) filter (where type = 'supplier_payment'), 0) as supplier_payments,
        coalesce((select sum(quantity * i.average_cost) from warehouse_stock ws join items i on i.id = ws.item_id), 0) +
        coalesce((select sum(quantity * p.average_cost) from warehouse_stock ws join products p on p.id = ws.product_id), 0) as warehouse_value,
        coalesce((select sum(quantity * p.average_cost) from shop_stock ss join products p on p.id = ss.product_id), 0) as shop_value
      from finance_transactions
    `);
    const row = result.rows[0];
    const revenue = money(row.revenue);
    const discounts = money(row.discounts);
    const cogs = money(row.cogs);
    return {
      revenue,
      discounts,
      cogs,
      grossProfit: money(revenue - discounts - cogs),
      expenses: money(row.expenses),
      supplierPayments: money(row.supplier_payments),
      warehouseValue: money(row.warehouse_value),
      shopValue: money(row.shop_value)
    };
  });

  app.get("/finance/transactions", async () => (await pool.query("select * from finance_transactions order by created_at desc limit 200")).rows);

  app.get("/expenses", async () => {
    const result = await pool.query("select id, expense_date as date, category, description, amount, status from expenses order by created_at desc limit 200");
    return result.rows.map((row) => ({ ...row, amount: money(row.amount), recurring: false }));
  });

  app.get("/reports", async () => {
    const [finance, topProducts, stockMoves] = await Promise.all([
      pool.query("select type, coalesce(sum(amount), 0) as amount from finance_transactions group by type order by type"),
      pool.query(`select p.name, coalesce(sum(si.quantity), 0) as qty, coalesce(sum(si.line_total), 0) as revenue from sale_items si join products p on p.id = si.product_id group by p.id order by revenue desc limit 10`),
      pool.query("select ref_type, count(*) as count from stock_movements group by ref_type order by ref_type")
    ]);
    return { finance: finance.rows, topProducts: topProducts.rows, stockMovements: stockMoves.rows };
  });

  app.get("/users", async () => (await pool.query("select id, username, email, full_name as name, role, status, last_login_at as \"lastLoginAt\" from users order by created_at desc")).rows);

  app.post("/users", async (request, reply) => {
    const body = userSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await pool.query(
      "insert into users (username, email, full_name, password_hash, role) values ($1,$2,$3,$4,$5) returning id",
      [body.username, body.email, body.name, passwordHash, body.role]
    );
    return reply.code(201).send({ id: result.rows[0].id });
  });
}
