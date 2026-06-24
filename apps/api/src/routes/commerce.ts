import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Product, SaleLineInput } from "@blex/shared";
import { numberify, pool } from "../db.js";

const saleSchema = z.object({
  cashierId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  payment: z.enum(["cash", "card", "mobile", "credit", "voucher"]),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().positive(),
    price: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0)
  })).min(1)
});

export async function registerCommerceRoutes(app: FastifyInstance) {
  app.get("/dashboard", async () => {
    const [summary, trend, top] = await Promise.all([
      pool.query(`
        select
          coalesce((select sum(total) from sales where sold_at >= now() - interval '14 days'), 0) as revenue_14d,
          coalesce((select sum(sl.quantity * p.cost_price) from stock_levels sl join products p on p.id = sl.product_id), 0) as stock_value,
          coalesce((select count(*) from sales where sold_at >= now() - interval '14 days'), 0) as transaction_count_14d,
          coalesce((select count(*) from products p join stock_levels sl on sl.product_id = p.id where sl.quantity <= p.reorder_qty), 0) as low_stock_count
      `),
      pool.query(`
        select to_char(day, 'MM-DD') as day, coalesce(sum(s.total), 0) as revenue
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') day
        left join sales s on date(s.sold_at) = day
        group by day
        order by day
      `),
      pool.query(`
        select p.name, coalesce(sum(sl.quantity), 0) as stock
        from products p
        left join stock_levels sl on sl.product_id = p.id
        group by p.id
        order by stock desc
        limit 6
      `)
    ]);
    const row = summary.rows[0];
    return {
      revenue14d: numberify(row.revenue_14d),
      stockValue: numberify(row.stock_value),
      transactionCount14d: Number(row.transaction_count_14d),
      lowStockCount: Number(row.low_stock_count),
      revenueTrend: trend.rows.map((x) => ({ day: x.day, revenue: numberify(x.revenue) })),
      topProducts: top.rows.map((x) => ({ name: x.name, stock: numberify(x.stock) }))
    };
  });

  app.get("/categories", async () => {
    const result = await pool.query("select id, name from categories order by name");
    return result.rows;
  });

  app.get("/products", async () => {
    const result = await pool.query(`
      select p.id, p.sku, p.barcode, p.name, p.category_id, c.name as category_name, p.unit,
             p.is_raw, p.is_sellable, p.cost_price, p.sell_price, p.reorder_qty, p.image_url,
             coalesce(sum(sl.quantity), 0) as stock
      from products p
      left join categories c on c.id = p.category_id
      left join stock_levels sl on sl.product_id = p.id
      where p.status = 'active'
      group by p.id, c.name
      order by p.name
    `);
    return result.rows.map(toProduct);
  });

  app.get("/suppliers", async () => {
    const result = await pool.query(`
      select id, name, phone, email, address, note, opening_balance as balance, status
      from suppliers
      order by name
    `);
    return result.rows.map((x) => ({ ...x, balance: numberify(x.balance) }));
  });

  app.get("/customers", async () => {
    const result = await pool.query(`
      select id, name, phone, email, address, loyalty_points as "loyaltyPoints",
             credit_limit as "creditLimit", opening_balance as balance, status
      from customers
      order by name
    `);
    return result.rows.map((x) => ({
      ...x,
      creditLimit: numberify(x.creditLimit),
      balance: numberify(x.balance)
    }));
  });

  app.get("/sales", async () => {
    const result = await pool.query(`
      select s.id, s.ref_no as "refNo", s.sold_at as date, s.cashier_id as "cashierId",
             s.customer_id as "customerId", s.subtotal, s.discount, s.tax, s.total,
             coalesce(sp.method, 'cash') as payment, s.status
      from sales s
      left join lateral (
        select method from sale_payments where sale_id = s.id order by id desc limit 1
      ) sp on true
      order by s.sold_at desc
      limit 50
    `);
    return result.rows.map((x) => ({
      ...x,
      subtotal: numberify(x.subtotal),
      discount: numberify(x.discount),
      tax: numberify(x.tax),
      total: numberify(x.total)
    }));
  });

  app.post("/sales", async (request, reply) => {
    const body = saleSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const outlet = await client.query("select id from outlets order by created_at limit 1");
      if (!outlet.rows[0]) return reply.badRequest("No outlet configured");

      const subtotal = body.lines.reduce((sum, line) => sum + line.qty * line.price - line.discount, 0);
      const tax = Math.round(subtotal * 0.165);
      const total = subtotal + tax;
      const sale = await client.query(
        `insert into sales (ref_no, outlet_id, cashier_id, customer_id, subtotal, discount, tax, total)
         values ($1, $2, $3, $4, $5, 0, $6, $7)
         returning id, ref_no`,
        [`SL-${Date.now()}`, outlet.rows[0].id, body.cashierId, body.customerId ?? null, subtotal, tax, total]
      );

      for (const line of body.lines as SaleLineInput[]) {
        await client.query(
          `insert into sale_lines (sale_id, product_id, qty, unit_price, discount)
           values ($1, $2, $3, $4, $5)`,
          [sale.rows[0].id, line.productId, line.qty, line.price, line.discount]
        );
        await client.query(
          `update stock_levels set quantity = quantity - $1 where outlet_id = $2 and product_id = $3`,
          [line.qty, outlet.rows[0].id, line.productId]
        );
      }
      await client.query(
        `insert into sale_payments (sale_id, method, amount) values ($1, $2, $3)`,
        [sale.rows[0].id, body.payment, total]
      );
      const accounts = await client.query("select id, code from gl_accounts where code in ('1000','4000')");
      const cash = accounts.rows.find((account) => account.code === "1000")?.id;
      const income = accounts.rows.find((account) => account.code === "4000")?.id;
      if (cash && income) {
        await client.query(
          `insert into gl_entries (ref_type, ref_id, account_id, debit, credit, memo)
           values ('sale', $1, $2, $3, 0, $4), ('sale', $1, $5, 0, $3, $4)`,
          [sale.rows[0].id, cash, total, `POS sale ${sale.rows[0].ref_no}`, income]
        );
      }
      await client.query(
        `insert into audit_log (user_id, action, entity, entity_id, detail)
         values ($1, 'sale.complete', 'sale', $2, $3)`,
        [body.cashierId, sale.rows[0].id, `Completed ${sale.rows[0].ref_no}`]
      );
      await client.query("commit");
      return reply.code(201).send({ id: sale.rows[0].id, refNo: sale.rows[0].ref_no, total });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/purchase-orders", async () => {
    const result = await pool.query(`
      select po.id, po.supplier_id as "supplierId", s.name as "supplierName",
             po.order_date as date, po.status, po.total
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      order by po.order_date desc
    `);
    return result.rows.map((x) => ({ ...x, total: numberify(x.total) }));
  });

  app.get("/expenses", async () => {
    const result = await pool.query(`
      select e.id, e.expense_date as date, ec.name as category, e.description, e.amount, e.recurring
      from expenses e
      join expense_categories ec on ec.id = e.category_id
      order by e.expense_date desc
    `);
    return result.rows.map((x) => ({ ...x, amount: numberify(x.amount) }));
  });

  app.get("/audit", async () => {
    const result = await pool.query(`
      select id, created_at as ts, user_id as "userId", action, entity, detail
      from audit_log
      order by created_at desc
      limit 100
    `);
    return result.rows;
  });

  app.get("/notifications", async (request) => {
    const jwt = await request.jwtVerify<{ sub: string }>();
    const result = await pool.query(`
      select n.id, n.created_at as ts, n.type, n.title, n.body, n.is_read as read,
             d.channel, coalesce(d.status, 'pending') as status
      from notifications n
      left join lateral (
        select channel, status
        from notification_deliveries
        where notification_id = n.id
        order by created_at desc
        limit 1
      ) d on true
      where n.user_id is null or n.user_id = $1
      order by n.created_at desc
      limit 100
    `, [jwt.sub]);
    return result.rows;
  });

  app.post("/notifications/:id/read", async (request) => {
    const jwt = await request.jwtVerify<{ sub: string }>();
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await pool.query("update notifications set is_read = true where id = $1 and (user_id is null or user_id = $2)", [params.id, jwt.sub]);
    return { ok: true };
  });
}

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sku: String(row.sku),
    barcode: row.barcode ? String(row.barcode) : null,
    name: String(row.name),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_name ? String(row.category_name) : null,
    unit: String(row.unit),
    isRaw: Boolean(row.is_raw),
    isSellable: Boolean(row.is_sellable),
    cost: numberify(row.cost_price),
    price: numberify(row.sell_price),
    stock: numberify(row.stock),
    reorder: numberify(row.reorder_qty),
    imageUrl: row.image_url ? String(row.image_url) : null
  };
}
