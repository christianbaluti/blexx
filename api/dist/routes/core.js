import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { numberify, pool } from "../db.js";
import { config } from "../config.js";
import { actorId, installCoreAuthorization } from "../authz.js";
const idParam = z.object({ id: z.string().uuid() });
const nullableText = z.string().trim().nullable().optional();
const dataUrl = z.string().max(140_000).regex(/^data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+$/).nullable().optional();
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_DATA_URL_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 200;
const attachmentDataUrl = z.string()
    .max(MAX_ATTACHMENT_DATA_URL_CHARS, "Attached file must be 5 MB or smaller")
    .regex(/^data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+$/, "Attachment must be a base64 data URL")
    .refine((value) => {
    const base64 = value.split(",")[1] ?? "";
    return Math.ceil((base64.length * 3) / 4) <= MAX_ATTACHMENT_BYTES;
}, "Attached file must be 5 MB or smaller")
    .nullable()
    .optional();
function ref(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function money(value) {
    return Number(Number(value ?? 0).toFixed(2));
}
function renderTemplate(template, values) {
    return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}
function formatMoney(value) {
    return `MWK ${money(value).toLocaleString("en-MW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pdfText(value) {
    return String(value ?? "").trim();
}
function quoteIdent(value) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
        throw new Error(`Unsafe SQL identifier: ${value}`);
    return `"${value.replace(/"/g, "\"\"")}"`;
}
async function createJsonBackup(client) {
    const tableResult = await client.query(`
    select table_name as name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name <> 'backup_records'
    order by table_name
  `);
    const tables = {};
    for (const table of tableResult.rows) {
        const tableName = String(table.name);
        const rows = await client.query(`select to_jsonb(row_data) as row from (select * from ${quoteIdent(tableName)}) row_data`);
        tables[tableName] = rows.rows.map((row) => row.row);
    }
    return {
        format: "blex-json-backup-v1",
        createdAt: new Date().toISOString(),
        tables
    };
}
async function upsertGeneratedNotifications(rows) {
    if (!rows.length)
        return;
    await Promise.all(rows.map((row) => pool.query(`insert into notifications (source_key, type, severity, title, body, entity, entity_id, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (source_key) do update
       set type = excluded.type,
           severity = excluded.severity,
           title = excluded.title,
           body = excluded.body,
           entity = excluded.entity,
           entity_id = excluded.entity_id,
           status = excluded.status`, [row.sourceKey, row.type, row.severity, row.title, row.body, row.entity ?? null, row.entityId ?? null, row.status ?? "pending"])));
}
function createPurchaseOrderPdf(order, items) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const page = { left: 42, right: 553, bottom: 760 };
        const refNo = pdfText(order.refNo ?? order.ref_no);
        const companyName = pdfText(order.companyName) || "POS & Inventory +";
        const column = {
            item: { x: 50, width: 205 },
            unit: { x: 265, width: 48 },
            qty: { x: 318, width: 52 },
            cost: { x: 378, width: 78 },
            total: { x: 464, width: 82 }
        };
        function drawHeader() {
            doc.fillColor("#221e1a").font("Helvetica-Bold").fontSize(20).text(companyName, page.left, 42, { width: 290 });
            doc.font("Helvetica-Bold").fontSize(17).text("PURCHASE ORDER", 330, 42, { width: 223, align: "right" });
            doc.font("Helvetica").fontSize(10).fillColor("#6f665c").text(refNo, 330, 65, { width: 223, align: "right" });
            doc.moveTo(page.left, 92).lineTo(page.right, 92).strokeColor("#d8d0c5").lineWidth(1).stroke();
            const infoTop = 108;
            doc.fillColor("#9a5529").font("Helvetica-Bold").fontSize(9).text("SUPPLIER", page.left, infoTop);
            doc.fillColor("#221e1a").fontSize(11).text(pdfText(order.supplierName), page.left, infoTop + 15, { width: 235 });
            doc.font("Helvetica").fontSize(9).fillColor("#5f564d");
            if (order.supplierEmail)
                doc.text(pdfText(order.supplierEmail), page.left, doc.y + 3, { width: 235 });
            if (order.supplierPhone)
                doc.text(pdfText(order.supplierPhone), page.left, doc.y + 3, { width: 235 });
            if (order.supplierAddress)
                doc.text(pdfText(order.supplierAddress), page.left, doc.y + 3, { width: 235 });
            const metaX = 330;
            const metaRows = [
                ["PO number", refNo],
                ["Order date", pdfText(order.date ?? order.order_date)],
                ["Status", pdfText(order.status) || "ordered"]
            ];
            let metaY = infoTop;
            for (const [label, value] of metaRows) {
                doc.fillColor("#6f665c").font("Helvetica-Bold").fontSize(9).text(label, metaX, metaY, { width: 88 });
                doc.fillColor("#221e1a").font("Helvetica").fontSize(9).text(value || "-", metaX + 96, metaY, { width: 127, align: "right" });
                metaY += 17;
            }
            doc.y = 205;
        }
        function drawTableHeader(y) {
            doc.rect(page.left, y, page.right - page.left, 24).fill("#f4f1eb");
            doc.fillColor("#5b5147").font("Helvetica-Bold").fontSize(8);
            doc.text("ITEM", column.item.x, y + 8, { width: column.item.width });
            doc.text("UNIT", column.unit.x, y + 8, { width: column.unit.width });
            doc.text("QTY", column.qty.x, y + 8, { width: column.qty.width, align: "right" });
            doc.text("UNIT COST", column.cost.x, y + 8, { width: column.cost.width, align: "right" });
            doc.text("LINE TOTAL", column.total.x, y + 8, { width: column.total.width, align: "right" });
            doc.strokeColor("#d8d0c5").rect(page.left, y, page.right - page.left, 24).stroke();
            doc.y = y + 24;
        }
        function ensureSpace(height) {
            if (doc.y + height <= page.bottom)
                return;
            doc.addPage();
            drawTableHeader(54);
        }
        drawHeader();
        drawTableHeader(doc.y);
        for (const item of items) {
            const itemName = pdfText(item.name) || "Item";
            const rowHeight = Math.max(28, doc.heightOfString(itemName, { width: column.item.width }) + 14);
            ensureSpace(rowHeight);
            const y = doc.y;
            doc.rect(page.left, y, page.right - page.left, rowHeight).fill(items.indexOf(item) % 2 ? "#fbfaf7" : "#ffffff");
            doc.fillColor("#221e1a").font("Helvetica").fontSize(9);
            doc.text(itemName, column.item.x, y + 8, { width: column.item.width });
            doc.text(pdfText(item.unit) || "-", column.unit.x, y + 8, { width: column.unit.width });
            doc.text(pdfText(item.quantity) || "0", column.qty.x, y + 8, { width: column.qty.width, align: "right" });
            doc.text(formatMoney(item.unitCost), column.cost.x, y + 8, { width: column.cost.width, align: "right" });
            doc.text(formatMoney(item.lineTotal), column.total.x, y + 8, { width: column.total.width, align: "right" });
            doc.strokeColor("#e1dbd2").rect(page.left, y, page.right - page.left, rowHeight).stroke();
            doc.y = y + rowHeight;
        }
        ensureSpace(138);
        doc.moveDown(1);
        const totalsX = 348;
        const totals = [
            ["Subtotal", formatMoney(order.subtotal)],
            ["Landed costs", formatMoney(order.landedCost ?? order.landed_cost)],
            ["Total", formatMoney(order.total)]
        ];
        let totalsY = doc.y;
        for (const [label, value] of totals) {
            const isTotal = label === "Total";
            if (isTotal)
                doc.rect(totalsX - 8, totalsY - 5, 205, 24).fill("#f4f1eb");
            doc.fillColor(isTotal ? "#9a5529" : "#5f564d").font(isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(isTotal ? 12 : 10);
            doc.text(label, totalsX, totalsY, { width: 80 });
            doc.text(value, totalsX + 83, totalsY, { width: 105, align: "right" });
            totalsY += isTotal ? 27 : 20;
        }
        doc.y = totalsY + 10;
        if (order.note) {
            ensureSpace(74);
            doc.fillColor("#9a5529").font("Helvetica-Bold").fontSize(9).text("NOTES", page.left, doc.y);
            doc.fillColor("#5f564d").font("Helvetica").fontSize(9).text(pdfText(order.note), page.left, doc.y + 8, { width: 300 });
        }
        ensureSpace(62);
        const signY = Math.max(doc.y + 22, 690);
        doc.strokeColor("#d8d0c5").moveTo(page.left, signY).lineTo(250, signY).stroke();
        doc.moveTo(345, signY).lineTo(page.right, signY).stroke();
        doc.fillColor("#6f665c").font("Helvetica").fontSize(8).text("Prepared by", page.left, signY + 6);
        doc.text("Supplier acceptance", 345, signY + 6);
        const range = doc.bufferedPageRange();
        for (let index = range.start; index < range.start + range.count; index += 1) {
            doc.switchToPage(index);
            doc.fillColor("#8b8176").font("Helvetica").fontSize(8).text(`Page ${index + 1} of ${range.count}`, page.left, 802, { width: page.right - page.left, align: "center" });
        }
        doc.end();
    });
}
function mailTransport() {
    return nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: config.smtpUser && config.smtpPass ? { user: config.smtpUser, pass: config.smtpPass } : undefined
    });
}
async function defaultLocation(type, client = pool) {
    const result = await client.query("select id from stock_locations where type = $1 order by is_default desc, created_at limit 1", [type]);
    const row = result.rows[0];
    if (!row)
        throw new Error(`No ${type} location configured`);
    return row.id;
}
async function updateWarehouseItem(client, itemId, qty) {
    await client.query(`insert into warehouse_stock (item_id, quantity) values ($1, $2)
     on conflict (item_id) do update set quantity = warehouse_stock.quantity + excluded.quantity, updated_at = now()`, [itemId, qty]);
}
async function updateWarehouseProduct(client, productId, qty) {
    await client.query(`insert into warehouse_stock (product_id, quantity) values ($1, $2)
     on conflict (product_id) do update set quantity = warehouse_stock.quantity + excluded.quantity, updated_at = now()`, [productId, qty]);
}
async function updateShopProduct(client, productId, qty) {
    await client.query(`insert into shop_stock (product_id, quantity) values ($1, $2)
     on conflict (product_id) do update set quantity = shop_stock.quantity + excluded.quantity, updated_at = now()`, [productId, qty]);
}
async function assertWarehouseItem(client, itemId, qty) {
    const result = await client.query("select coalesce(quantity, 0) as quantity from warehouse_stock where item_id = $1 for update", [itemId]);
    if (numberify(result.rows[0]?.quantity) < qty)
        throw new Error("Not enough raw item stock in warehouse");
}
async function assertWarehouseProduct(client, productId, qty) {
    const result = await client.query("select coalesce(quantity, 0) as quantity from warehouse_stock where product_id = $1 for update", [productId]);
    if (numberify(result.rows[0]?.quantity) < qty)
        throw new Error("Not enough finished product stock in warehouse");
}
async function assertShopProduct(client, productId, qty) {
    const result = await client.query("select coalesce(quantity, 0) as quantity from shop_stock where product_id = $1 for update", [productId]);
    if (numberify(result.rows[0]?.quantity) < qty)
        throw new Error("Not enough product stock in shop");
}
const supplierSchema = z.object({
    name: z.string().trim().min(1),
    phone: nullableText,
    email: nullableText,
    address: nullableText,
    note: nullableText
});
const customerSchema = supplierSchema.omit({ note: true }).extend({
    creditLimit: z.number().nonnegative().optional(),
    loyaltyPoints: z.number().int().nonnegative().optional()
});
const itemSchema = z.object({
    sku: z.string().trim().min(1),
    name: z.string().trim().min(1),
    unit: z.string().trim().default("ea"),
    reorderLevel: z.number().nonnegative().default(0),
    imageData: dataUrl
});
const productSchema = z.object({
    sku: z.string().trim().min(1),
    barcode: nullableText,
    name: z.string().trim().min(1),
    categoryId: z.string().uuid().nullable().optional(),
    unit: z.string().trim().default("ea"),
    sellingPrice: z.number().nonnegative().default(0),
    reorderLevel: z.number().nonnegative().default(0),
    imageData: dataUrl
});
const categorySchema = z.object({
    name: z.string().trim().min(1),
    parentId: z.string().uuid().nullable().optional()
});
const brandingSchema = z.object({
    appName: z.string().trim().min(1).default("POS & Inventory +"),
    appSubtitle: z.string().trim().default("Sales, stock and operations"),
    logoDataUrl: dataUrl,
    iconDataUrl: dataUrl,
    logoUpdatedAt: nullableText
});
const poSchema = z.object({
    supplierId: z.string().uuid(),
    expectedDate: nullableText,
    note: nullableText,
    landedCost: z.number().nonnegative().default(0),
    createdBy: z.string().uuid().nullable().optional(),
    items: z.array(z.object({
        itemId: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).optional(),
        description: nullableText,
        unit: z.string().trim().default("ea"),
        imageData: dataUrl,
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative()
    }).refine((line) => Boolean(line.itemId || line.name), "Select an item or enter a new item name")).min(1)
});
const grnSchema = z.object({
    purchaseOrderId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid(),
    locationId: z.string().uuid().nullable().optional(),
    receivedBy: z.string().uuid().nullable().optional(),
    note: nullableText,
    createInvoice: z.boolean().default(false),
    invoiceDueDate: nullableText,
    invoiceAttachmentName: nullableText,
    invoiceAttachmentMime: nullableText,
    invoiceAttachmentData: attachmentDataUrl,
    invoiceExtraCosts: z.array(z.object({
        description: z.string().trim().min(1),
        amount: z.number().nonnegative()
    })).default([]),
    items: z.array(z.object({
        purchaseOrderItemId: z.string().uuid().nullable().optional(),
        itemId: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).optional(),
        unit: z.string().trim().default("ea"),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
        expiryDate: nullableText
    }).refine((line) => Boolean(line.itemId || line.name || line.purchaseOrderItemId), "Select an item or create a new one")).min(1)
});
const invoiceSchema = z.object({
    supplierId: z.string().uuid(),
    purchaseOrderId: z.string().uuid().nullable().optional(),
    grnId: z.string().uuid().nullable().optional(),
    invoiceDate: z.string().optional(),
    dueDate: nullableText,
    total: z.number().nonnegative(),
    paid: z.number().nonnegative().optional(),
    paymentMethod: z.enum(["cash", "card", "mobile", "bank", "credit"]).optional(),
    paymentReference: nullableText,
    paymentNote: nullableText,
    paymentAttachmentName: nullableText,
    paymentAttachmentMime: nullableText,
    paymentAttachmentData: attachmentDataUrl,
    attachmentName: nullableText,
    attachmentMime: nullableText,
    attachmentData: attachmentDataUrl,
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
    cashierId: z.string().uuid().nullable().optional(),
    paymentMethod: z.enum(["cash", "card", "mobile", "bank", "credit"]),
    discount: z.number().nonnegative().default(0),
    items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        discount: z.number().nonnegative().default(0)
    })).min(1)
});
const stockAdjustmentSchema = z.object({
    productId: z.string().uuid().optional(),
    itemId: z.string().uuid().optional(),
    outletId: z.string().min(1),
    qty: z.number().refine((value) => value !== 0, "Quantity cannot be zero"),
    reason: z.enum(["adjust", "damage"]).default("adjust"),
    note: nullableText,
    userId: z.string().uuid().nullable().optional()
}).refine((line) => Boolean(line.productId || line.itemId), "Select an item or product");
const userSchema = z.object({
    username: z.string().trim().min(2),
    email: z.string().email(),
    name: z.string().trim().min(1),
    password: z.string().min(4),
    role: z.string().default("pos_cashier")
});
const expenseSchema = z.object({
    supplierInvoiceId: z.string().uuid().nullable().optional(),
    category: z.string().trim().min(1).default("general"),
    description: nullableText,
    amount: z.number().nonnegative(),
    expenseDate: nullableText,
    status: z.enum(["open", "partial", "paid", "void"]).default("open")
});
const stockCountSchema = z.object({
    outletId: z.string().min(1).optional(),
    locationId: z.string().uuid().nullable().optional(),
    note: nullableText
});
const returnSchema = z.object({
    saleId: z.string().uuid(),
    reason: z.string().trim().min(1),
    refundMethod: z.enum(["cash", "card", "mobile", "bank", "credit"]).default("cash"),
    items: z.array(z.object({
        saleItemId: z.string().uuid().optional(),
        productId: z.string().uuid(),
        quantity: z.number().positive()
    })).min(1)
});
const syncPushSchema = z.object({
    deviceId: z.string().trim().min(1),
    mutations: z.array(z.object({
        id: z.string().uuid(),
        entity: z.string().trim().min(1),
        operation: z.enum(["create", "update", "delete"]),
        payload: z.unknown(),
        clientTs: z.string().optional(),
        attempts: z.number().optional(),
        status: z.string().optional()
    })).default([])
});
export async function registerCoreRoutes(app) {
    installCoreAuthorization(app);
    const defaultSettings = {
        company: {
            tradingName: "POS & Inventory +",
            currency: "MWK",
            vatRate: 0,
            address: ""
        },
        downloads: {
            androidUrl: "",
            iosUrl: ""
        },
        security: {
            requireTwoFactor: false,
            biometricUnlock: true,
            sessionAutoLockMinutes: 15,
            passwordExpiryDays: 0
        },
        notifications: {
            lowStockEmailEnabled: false,
            expiryEmailEnabled: false
        },
        emailTemplates: {
            purchaseOrderSubject: "Purchase order {{refNo}} from {{companyName}}",
            purchaseOrderBody: "Dear {{supplierName}},\n\nPlease find attached purchase order {{refNo}}.\n\nRegards,\n{{companyName}}"
        }
    };
    const defaultBranding = {
        appName: "POS & Inventory +",
        appSubtitle: "Sales, stock and operations",
        logoDataUrl: null,
        iconDataUrl: null,
        logoUpdatedAt: null
    };
    async function loadSettings() {
        const result = await pool.query("select value from app_settings where key = 'settings'");
        const saved = result.rows[0]?.value;
        return {
            ...defaultSettings,
            ...saved,
            company: { ...defaultSettings.company, ...saved?.company },
            downloads: { ...defaultSettings.downloads, ...saved?.downloads },
            security: { ...defaultSettings.security, ...saved?.security },
            notifications: { ...defaultSettings.notifications, ...saved?.notifications },
            emailTemplates: { ...defaultSettings.emailTemplates, ...saved?.emailTemplates }
        };
    }
    async function loadBranding() {
        const result = await pool.query("select value from app_settings where key = 'branding'");
        const saved = result.rows[0]?.value;
        return { ...defaultBranding, ...saved };
    }
    app.get("/settings/branding", async () => loadBranding());
    app.patch("/settings/branding", async (request) => {
        const body = brandingSchema.partial().parse(request.body ?? {});
        if (body.logoDataUrl && Buffer.byteLength(body.logoDataUrl, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Logo must be under 100 KB after optimization");
        if (body.iconDataUrl && Buffer.byteLength(body.iconDataUrl, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Icon must be under 100 KB after optimization");
        const current = await loadBranding();
        const value = {
            ...current,
            ...body,
            logoUpdatedAt: body.logoUpdatedAt ?? (body.logoDataUrl || body.iconDataUrl ? new Date().toISOString() : current.logoUpdatedAt)
        };
        await pool.query(`insert into app_settings (key, value, updated_at) values ('branding', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(value)]);
        return value;
    });
    app.get("/settings", async () => loadSettings());
    app.patch("/settings", async (request) => {
        const current = await loadSettings();
        const incoming = request.body;
        const value = {
            ...current,
            ...incoming,
            company: { ...current.company, ...incoming?.company },
            downloads: { ...current.downloads, ...incoming?.downloads },
            security: { ...current.security, ...incoming?.security },
            notifications: { ...current.notifications, ...incoming?.notifications },
            emailTemplates: { ...current.emailTemplates, ...incoming?.emailTemplates }
        };
        await pool.query(`insert into app_settings (key, value, updated_at) values ('settings', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(value)]);
        return value;
    });
    app.get("/sync/health", async () => {
        const result = await pool.query(`
      select
        coalesce((select count(*) from sync_mutations where status = 'pending'), 0) as pending,
        coalesce((select count(*) from sync_mutations where status = 'failed'), 0) as failed,
        coalesce((select count(*) from sync_conflicts where status = 'open'), 0) as conflicts,
        (select max(applied_at) from sync_mutations where status = 'accepted') as "lastSyncedAt"
    `);
        const row = result.rows[0];
        return {
            online: true,
            pending: Number(row.pending),
            conflicts: Number(row.conflicts),
            failed: Number(row.failed),
            lastSyncedAt: row.lastSyncedAt ? String(row.lastSyncedAt) : new Date().toISOString()
        };
    });
    app.post("/sync/push", async (request) => {
        const body = syncPushSchema.parse(request.body ?? {});
        const userId = actorId(request);
        let accepted = 0;
        const acceptedIds = [];
        const conflicts = [];
        for (const mutation of body.mutations) {
            const client = await pool.connect();
            try {
                await client.query("begin");
                const existing = await client.query("select id, status from sync_mutations where id = $1", [mutation.id]);
                if (existing.rows[0]) {
                    if (existing.rows[0].status === "accepted") {
                        accepted += 1;
                        acceptedIds.push(mutation.id);
                    }
                    await client.query("commit");
                    continue;
                }
                await client.query(`insert into sync_mutations (id, device_id, entity, operation, payload, status)
           values ($1,$2,$3,$4,$5::jsonb,'pending')`, [mutation.id, body.deviceId, mutation.entity, mutation.operation, JSON.stringify(mutation.payload)]);
                if (mutation.operation === "create" && ["customer", "customers"].includes(mutation.entity)) {
                    const payload = customerSchema.parse(mutation.payload);
                    await client.query("insert into customers (name, phone, email, address, credit_limit, loyalty_points) values ($1,$2,$3,$4,$5,$6)", [payload.name, payload.phone ?? null, payload.email ?? null, payload.address ?? null, payload.creditLimit ?? 0, payload.loyaltyPoints ?? 0]);
                    await client.query("update sync_mutations set status = 'accepted', applied_at = now() where id = $1", [mutation.id]);
                    accepted += 1;
                    acceptedIds.push(mutation.id);
                }
                else if (mutation.operation === "create" && ["sale", "sales"].includes(mutation.entity)) {
                    const payload = mutation.payload;
                    const rawLines = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.lines) ? payload.lines : [];
                    const normalized = saleSchema.parse({
                        customerId: payload.customerId ?? null,
                        paymentMethod: payload.paymentMethod ?? payload.payment ?? "cash",
                        discount: Number(payload.discount ?? 0),
                        items: rawLines.map((line) => {
                            const row = line;
                            return {
                                productId: row.productId,
                                quantity: Number(row.quantity ?? row.qty ?? 0),
                                unitPrice: Number(row.unitPrice ?? row.price ?? 0),
                                discount: Number(row.discount ?? 0)
                            };
                        })
                    });
                    const shopId = await defaultLocation("shop", client);
                    let subtotal = 0;
                    let cogs = 0;
                    for (const line of normalized.items) {
                        await assertShopProduct(client, line.productId, line.quantity);
                        const product = await client.query("select average_cost from products where id = $1", [line.productId]);
                        subtotal += line.quantity * line.unitPrice - line.discount;
                        cogs += line.quantity * numberify(product.rows[0]?.average_cost);
                    }
                    const total = Math.max(0, subtotal - normalized.discount);
                    if (normalized.paymentMethod === "credit") {
                        if (!normalized.customerId)
                            throw app.httpErrors.badRequest("Credit sales require a customer.");
                        const credit = await client.query(`
              select c.credit_limit, greatest(0, coalesce(sum(s.total), 0) - coalesce((select sum(p.amount) from payments p where p.customer_id = c.id), 0)) as balance
              from customers c
              left join sales s on s.customer_id = c.id and s.payment_method = 'credit' and s.status <> 'void'
              where c.id = $1
              group by c.id
            `, [normalized.customerId]);
                        const remaining = numberify(credit.rows[0]?.credit_limit) - numberify(credit.rows[0]?.balance);
                        if (remaining < total)
                            throw app.httpErrors.badRequest(`Customer credit limit exceeded. Available credit: ${formatMoney(remaining)}`);
                    }
                    const sale = await client.query(`insert into sales (ref_no, customer_id, cashier_id, subtotal, discount, total, payment_method)
             values ($1,$2,$3,$4,$5,$6,$7) returning id`, [ref("SL"), normalized.customerId ?? null, userId, subtotal, normalized.discount, total, normalized.paymentMethod]);
                    for (const line of normalized.items) {
                        const product = await client.query("select average_cost from products where id = $1", [line.productId]);
                        const unitCost = numberify(product.rows[0]?.average_cost);
                        await client.query(`insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_cost, line_total)
               values ($1,$2,$3,$4,$5,$6,$7)`, [sale.rows[0].id, line.productId, line.quantity, line.unitPrice, line.discount, unitCost, line.quantity * line.unitPrice - line.discount]);
                        await updateShopProduct(client, line.productId, -line.quantity);
                        await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
               values ($1,$2,'out',$3,$4,'sale',$5,$6,'Offline POS sale replay')`, [shopId, line.productId, line.quantity, unitCost, sale.rows[0].id, userId]);
                    }
                    if (normalized.paymentMethod !== "credit") {
                        await client.query("insert into payments (party_type, customer_id, sale_id, method, amount) values ('customer',$1,$2,$3,$4)", [normalized.customerId ?? null, sale.rows[0].id, normalized.paymentMethod, total]);
                    }
                    await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('sale_revenue','sale',$1,$2,'Offline POS sale')", [sale.rows[0].id, total]);
                    await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('cogs','sale',$1,$2,'Offline COGS')", [sale.rows[0].id, cogs]);
                    await client.query("update sync_mutations set status = 'accepted', applied_at = now() where id = $1", [mutation.id]);
                    accepted += 1;
                    acceptedIds.push(mutation.id);
                }
                else {
                    const conflict = await client.query(`insert into sync_conflicts (device_id, entity, entity_id, local_payload, reason)
             values ($1,$2,$3,$4::jsonb,$5)
             returning id as "conflictId", entity, entity_id as "entityId", local_payload as local, remote_payload as remote, reason, created_at as "createdAt"`, [body.deviceId, mutation.entity, mutation.id, JSON.stringify(mutation.payload), "This offline mutation type is not supported yet."]);
                    await client.query("update sync_mutations set status = 'conflict', error = $2 where id = $1", [mutation.id, "Unsupported offline mutation"]);
                    conflicts.push(conflict.rows[0]);
                }
                await client.query("commit");
            }
            catch (error) {
                await client.query("rollback");
                const conflict = await pool.query(`insert into sync_conflicts (device_id, entity, entity_id, local_payload, reason)
           values ($1,$2,$3,$4::jsonb,$5)
           returning id as "conflictId", entity, entity_id as "entityId", local_payload as local, remote_payload as remote, reason, created_at as "createdAt"`, [body.deviceId, mutation.entity, mutation.id, JSON.stringify(mutation.payload), error instanceof Error ? error.message : "Sync failed"]);
                await pool.query(`insert into sync_mutations (id, device_id, entity, operation, payload, status, error)
           values ($1,$2,$3,$4,$5::jsonb,'conflict',$6)
           on conflict (id) do update set status = 'conflict', error = excluded.error`, [mutation.id, body.deviceId, mutation.entity, mutation.operation, JSON.stringify(mutation.payload), conflict.rows[0].reason]);
                conflicts.push(conflict.rows[0]);
            }
            finally {
                client.release();
            }
        }
        return { accepted, acceptedIds, conflicts };
    });
    app.get("/sync/pull", async () => {
        const [products, customers, shopStock] = await Promise.all([
            pool.query("select id, sku, barcode, name, category_id as \"categoryId\", unit, selling_price as \"sellingPrice\", average_cost as \"averageCost\", updated_at as \"updatedAt\" from products where status = 'active' order by updated_at desc limit 500"),
            pool.query("select id, name, phone, email, address, updated_at as \"updatedAt\" from customers where status = 'active' order by updated_at desc limit 500"),
            pool.query("select product_id as \"productId\", quantity, updated_at as \"updatedAt\" from shop_stock order by updated_at desc limit 500")
        ]);
        return {
            serverTime: new Date().toISOString(),
            products: products.rows,
            customers: customers.rows,
            shopStock: shopStock.rows
        };
    });
    app.get("/sync/conflicts", async () => {
        const result = await pool.query(`
      select id as "conflictId", entity, entity_id as "entityId", local_payload as local,
             remote_payload as remote, reason, created_at as "createdAt"
      from sync_conflicts
      where status = 'open'
      order by created_at desc
      limit 100
    `);
        return result.rows;
    });
    app.post("/sync/conflicts/:id/resolve", async (request) => {
        const { id } = idParam.parse(request.params);
        const result = await pool.query("update sync_conflicts set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1 and status = 'open' returning id", [id, actorId(request)]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Sync conflict not found");
        return { ok: true };
    });
    app.get("/backup", async () => {
        const result = await pool.query(`
      select id, name, format, path, created_at as "createdAt", completed_at as "completedAt", size_bytes as "sizeBytes", status, error
      from backup_records
      order by created_at desc
      limit 100
    `);
        return result.rows.map((row) => ({ ...row, sizeBytes: Number(row.sizeBytes) }));
    });
    app.get("/backup/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const result = await pool.query(`
      select id, name, format, path, payload_json as payload, created_at as "createdAt",
             completed_at as "completedAt", size_bytes as "sizeBytes", status, error
      from backup_records
      where id = $1
    `, [id]);
        const row = result.rows[0];
        if (!row)
            throw app.httpErrors.notFound("Backup not found");
        return { ...row, sizeBytes: Number(row.sizeBytes) };
    });
    app.post("/backup", async (request) => {
        const client = await pool.connect();
        const backupName = `Manual backup ${new Date().toISOString()}`;
        try {
            await client.query("begin");
            const created = await client.query(`insert into backup_records (name, status, size_bytes, created_by, format)
         values ($1, 'running', 0, $2, 'blex-json-backup-v1')
         returning id`, [backupName, actorId(request)]);
            const backupId = String(created.rows[0].id);
            const payload = await createJsonBackup(client);
            const payloadText = JSON.stringify(payload);
            const updated = await client.query(`update backup_records
         set status = 'ready', payload_json = $2::jsonb, path = $3, size_bytes = $4, completed_at = now(), error = null
         where id = $1
         returning id, name, format, path, created_at as "createdAt", completed_at as "completedAt", size_bytes as "sizeBytes", status, error`, [backupId, payloadText, `postgres://backup_records/${backupId}`, Buffer.byteLength(payloadText, "utf8")]);
            await client.query("commit");
            return { ...updated.rows[0], sizeBytes: Number(updated.rows[0].sizeBytes) };
        }
        catch (error) {
            await client.query("rollback");
            const message = error instanceof Error ? error.message : "Backup failed";
            await pool.query(`insert into backup_records (name, status, size_bytes, created_by, completed_at, error)
         values ($1, 'failed', 0, $2, now(), $3)`, [backupName, actorId(request), message]).catch(() => undefined);
            throw app.httpErrors.internalServerError("Backup failed. Check server logs and backup records.");
        }
        finally {
            client.release();
        }
    });
    app.get("/dashboard", async () => {
        const [summary, trend, topProducts] = await Promise.all([
            pool.query(`
      select
        coalesce((select sum(total) from sales where sale_date >= now() - interval '14 days'), 0) as revenue_14d,
        coalesce((select coalesce(sum(amount) filter (where type = 'sale_revenue'), 0) - coalesce(sum(amount) filter (where type in ('discount', 'cogs')), 0) from finance_transactions where created_at >= now() - interval '14 days'), 0) as profit_14d,
        coalesce((select sum(quantity * p.average_cost) from shop_stock ss join products p on p.id = ss.product_id), 0) as shop_value,
        coalesce((select sum(quantity * p.average_cost) from warehouse_stock ws join products p on p.id = ws.product_id), 0) +
        coalesce((select sum(quantity * i.average_cost) from warehouse_stock ws join items i on i.id = ws.item_id), 0) as warehouse_value,
        coalesce((select count(*) from sales where sale_date >= now() - interval '14 days'), 0) as sales_count,
        coalesce((select count(*) from shop_stock ss join products p on p.id = ss.product_id where ss.quantity <= p.reorder_level), 0) as low_stock_count
    `),
            pool.query(`
        select to_char(day::date, 'Mon DD') as day, coalesce(sum(s.total), 0) as revenue
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') day
        left join sales s on s.sale_date::date = day::date
        group by day
        order by day
      `),
            pool.query(`
        select p.name, coalesce(ss.quantity, 0) as stock
        from products p
        left join shop_stock ss on ss.product_id = p.id
        order by coalesce(ss.quantity, 0) desc, p.name
        limit 6
      `)
        ]);
        const row = summary.rows[0];
        return {
            revenue14d: money(row.revenue_14d),
            profit14d: money(row.profit_14d),
            shopValue: money(row.shop_value),
            warehouseValue: money(row.warehouse_value),
            salesCount: Number(row.sales_count),
            lowStockCount: Number(row.low_stock_count),
            revenueTrend: trend.rows.map((entry) => ({ day: String(entry.day), revenue: money(entry.revenue) })),
            topProducts: topProducts.rows.map((entry) => ({ name: String(entry.name), stock: numberify(entry.stock) }))
        };
    });
    app.get("/notifications", async (request) => {
        const [lowStock, overdueInvoices, syncConflicts, failedBackups] = await Promise.all([
            pool.query(`
        select 'product' as entity, p.id, p.name, coalesce(ss.quantity, 0) as quantity, p.reorder_level as "reorderLevel", 'shop' as location
        from products p
        left join shop_stock ss on ss.product_id = p.id
        where p.reorder_level > 0 and coalesce(ss.quantity, 0) <= p.reorder_level
        union all
        select 'item' as entity, i.id, i.name, coalesce(ws.quantity, 0) as quantity, i.reorder_level as "reorderLevel", 'warehouse' as location
        from items i
        left join warehouse_stock ws on ws.item_id = i.id
        where i.reorder_level > 0 and coalesce(ws.quantity, 0) <= i.reorder_level
        order by quantity, name
        limit 25
      `),
            pool.query(`
        select id, ref_no, due_date, total, paid
        from supplier_invoices
        where due_date < current_date and status in ('open', 'partial')
        order by due_date
        limit 25
      `),
            pool.query(`
        select id, entity, entity_id, reason
        from sync_conflicts
        where status = 'open'
        order by created_at desc
        limit 25
      `),
            pool.query(`
        select id, name, error
        from backup_records
        where status = 'failed'
        order by created_at desc
        limit 25
      `)
        ]);
        const generatedNotifications = [
            ...lowStock.rows.map((row) => ({
                sourceKey: `low-stock:${row.entity}:${row.id}`,
                type: "low_stock",
                severity: (numberify(row.quantity) <= 0 ? "critical" : "warning"),
                title: `${row.name} is low in ${row.location} stock`,
                body: `${numberify(row.quantity)} available; reorder point is ${numberify(row.reorderLevel)}.`,
                entity: String(row.entity),
                entityId: String(row.id)
            })),
            ...overdueInvoices.rows.map((row) => ({
                sourceKey: `supplier-invoice-overdue:${row.id}`,
                type: "system",
                severity: "warning",
                title: `Supplier invoice ${row.ref_no} is overdue`,
                body: `${formatMoney(numberify(row.total) - numberify(row.paid))} remains payable.`,
                entity: "supplier_invoice",
                entityId: String(row.id)
            })),
            ...syncConflicts.rows.map((row) => ({
                sourceKey: `sync-conflict:${row.id}`,
                type: "system",
                severity: "critical",
                title: "Offline sync conflict needs review",
                body: String(row.reason ?? "A queued offline change could not be applied."),
                entity: "sync_conflict",
                entityId: String(row.id)
            })),
            ...failedBackups.rows.map((row) => ({
                sourceKey: `backup-failed:${row.id}`,
                type: "system",
                severity: "critical",
                title: `Backup failed: ${row.name}`,
                body: String(row.error ?? "The backup could not be completed."),
                entity: "backup",
                entityId: String(row.id),
                status: "failed"
            }))
        ];
        await upsertGeneratedNotifications(generatedNotifications);
        const saved = await pool.query(`
      select id, created_at as ts, type, severity, title, body, read_at is not null as read,
             'in_app' as channel, status, entity, entity_id as "entityId"
      from notifications
      where user_id is null or user_id = $1
      order by created_at desc
      limit 100
    `, [actorId(request)]);
        return saved.rows;
    });
    app.post("/notifications/:id/read", async (request) => {
        const rawId = request.params.id ?? "";
        if (/^[0-9a-f-]{36}$/i.test(rawId)) {
            await pool.query("update notifications set read_at = now() where id = $1", [rawId]);
        }
        return { ok: true };
    });
    app.get("/stock/locations", async () => (await pool.query("select id, code, name, type, address from stock_locations order by type, name")).rows);
    app.get("/categories", async () => {
        const result = await pool.query(`
      select id, name, parent_id as "parentId"
      from categories
      where status = 'active'
      order by name
    `);
        return result.rows;
    });
    app.post("/categories", async (request, reply) => {
        const body = categorySchema.parse(request.body);
        const result = await pool.query("insert into categories (name, parent_id) values ($1,$2) returning id", [body.name, body.parentId ?? null]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.patch("/categories/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = categorySchema.partial().parse(request.body);
        const result = await pool.query(`update categories
       set name = coalesce($2, name), parent_id = case when $3::boolean then $4 else parent_id end, updated_at = now()
       where id = $1 and status = 'active'
       returning id`, [id, body.name ?? null, Object.prototype.hasOwnProperty.call(body, "parentId"), body.parentId ?? null]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Category not found");
        return { ok: true };
    });
    app.delete("/categories/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const linked = await pool.query("select 1 from products where category_id = $1 and status = 'active' limit 1", [id]);
        if (linked.rows.length)
            throw app.httpErrors.conflict("Category is used by products. Archive products or move them first.");
        await pool.query("update categories set status = 'disabled', updated_at = now() where id = $1", [id]);
        return { ok: true };
    });
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
        const result = await pool.query(`insert into suppliers (name, phone, email, address, note) values ($1,$2,$3,$4,$5) returning id`, [body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.note ?? null]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.patch("/suppliers/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = supplierSchema.partial().parse(request.body);
        const result = await pool.query(`update suppliers set
        name = case when $2::boolean then $3 else name end,
        phone = case when $4::boolean then $5 else phone end,
        email = case when $6::boolean then $7 else email end,
        address = case when $8::boolean then $9 else address end,
        note = case when $10::boolean then $11 else note end,
        updated_at = now()
       where id = $1
       returning id`, [
            id,
            Object.prototype.hasOwnProperty.call(body, "name"), body.name ?? null,
            Object.prototype.hasOwnProperty.call(body, "phone"), body.phone ?? null,
            Object.prototype.hasOwnProperty.call(body, "email"), body.email ?? null,
            Object.prototype.hasOwnProperty.call(body, "address"), body.address ?? null,
            Object.prototype.hasOwnProperty.call(body, "note"), body.note ?? null
        ]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Supplier not found");
        return { ok: true };
    });
    app.delete("/suppliers/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const linked = await pool.query(`select 1 from purchase_orders where supplier_id = $1
       union all select 1 from grns where supplier_id = $1
       union all select 1 from supplier_invoices where supplier_id = $1
       union all select 1 from payments where supplier_id = $1
       limit 1`, [id]);
        if (linked.rows.length)
            throw app.httpErrors.conflict("Supplier has activity. Suspend instead of deleting.");
        const result = await pool.query("delete from suppliers where id = $1 returning id", [id]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Supplier not found");
        return { ok: true };
    });
    app.post("/suppliers/:id/suspend", async (request) => {
        const { id } = idParam.parse(request.params);
        const result = await pool.query("update suppliers set status = 'suspended', updated_at = now() where id = $1 returning id", [id]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Supplier not found");
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
        if (!supplier.rows[0])
            throw app.httpErrors.notFound("Supplier not found");
        return { supplier: supplier.rows[0], purchaseOrders: purchaseOrders.rows, grns: grns.rows, invoices: invoices.rows, payments: payments.rows };
    });
    app.get("/items", async () => {
        const result = await pool.query(`
      select i.id, i.sku, i.name, i.unit, i.reorder_level as "reorderLevel", i.average_cost as "averageCost",
             i.image_data as "imageData", i.image_mime as "imageMime", i.status, coalesce(ws.quantity, 0) as stock,
             0::numeric as "shopStock"
      from items i
      left join warehouse_stock ws on ws.item_id = i.id
      where i.status = 'active'
      order by i.name
    `);
        return result.rows.map((row) => ({
            ...row,
            stock: numberify(row.stock),
            shopStock: numberify(row.shopStock),
            averageCost: numberify(row.averageCost),
            reorderLevel: numberify(row.reorderLevel)
        }));
    });
    app.post("/items", async (request, reply) => {
        const body = itemSchema.parse(request.body);
        if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Item image must be under 100 KB after optimization");
        const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
        const result = await pool.query("insert into items (sku, name, unit, reorder_level, image_data, image_mime) values ($1,$2,$3,$4,$5,$6) returning id", [body.sku, body.name, body.unit, body.reorderLevel, body.imageData ?? null, mime]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.patch("/items/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = itemSchema.partial().parse(request.body);
        if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Item image must be under 100 KB after optimization");
        const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
        await pool.query(`update items set sku = coalesce($2, sku), name = coalesce($3, name), unit = coalesce($4, unit),
       reorder_level = coalesce($5, reorder_level), image_data = coalesce($6, image_data), image_mime = coalesce($7, image_mime),
       updated_at = now()
       where id = $1`, [id, body.sku ?? null, body.name ?? null, body.unit ?? null, body.reorderLevel ?? null, body.imageData ?? null, mime]);
        return { ok: true };
    });
    app.delete("/items/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const linked = await pool.query(`
      select 1 from warehouse_stock where item_id = $1 and quantity <> 0
      union all select 1 from purchase_order_items where item_id = $1
      union all select 1 from grn_items where item_id = $1
      union all select 1 from product_blueprint_items where item_id = $1
      union all select 1 from production_batch_items where item_id = $1
      union all select 1 from stock_movements where item_id = $1
      limit 1
    `, [id]);
        if (linked.rows.length) {
            const archived = await pool.query("update items set status = 'disabled', updated_at = now() where id = $1 returning id", [id]);
            if (!archived.rowCount)
                throw app.httpErrors.notFound("Item not found");
            return { ok: true, archived: true };
        }
        const deleted = await pool.query("delete from items where id = $1 returning id", [id]);
        if (!deleted.rowCount)
            throw app.httpErrors.notFound("Item not found");
        return { ok: true, deleted: true };
    });
    app.get("/products", async () => {
        const result = await pool.query(`
      select p.id, p.sku, p.barcode, p.name, p.unit, p.selling_price as "sellingPrice", p.average_cost as "averageCost",
             p.reorder_level as "reorderLevel", p.image_data as "imageData", coalesce(ws.quantity, 0) as "warehouseStock",
             coalesce(ss.quantity, 0) as "shopStock", p.status, p.category_id as "categoryId", c.name as "categoryName"
      from products p
      left join categories c on c.id = p.category_id
      left join warehouse_stock ws on ws.product_id = p.id
      left join shop_stock ss on ss.product_id = p.id
      where p.status = 'active'
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
        if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Product image must be under 100 KB after optimization");
        const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
        const result = await pool.query(`insert into products (sku, barcode, name, category_id, unit, selling_price, reorder_level, image_data, image_mime)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [body.sku, body.barcode ?? null, body.name, body.categoryId ?? null, body.unit, body.sellingPrice, body.reorderLevel, body.imageData ?? null, mime]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.patch("/products/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = productSchema.partial().parse(request.body);
        if (body.imageData && Buffer.byteLength(body.imageData, "utf8") > 140_000)
            throw app.httpErrors.badRequest("Product image must be under 100 KB after optimization");
        const mime = body.imageData?.match(/^data:([^;]+);/)?.[1] ?? null;
        await pool.query(`update products set sku = coalesce($2, sku), barcode = coalesce($3, barcode), name = coalesce($4, name),
       category_id = case when $5::boolean then $6 else category_id end,
       unit = coalesce($7, unit), selling_price = coalesce($8, selling_price), reorder_level = coalesce($9, reorder_level),
       image_data = coalesce($10, image_data), image_mime = coalesce($11, image_mime), updated_at = now()
       where id = $1`, [
            id,
            body.sku ?? null,
            body.barcode ?? null,
            body.name ?? null,
            Object.prototype.hasOwnProperty.call(body, "categoryId"), body.categoryId ?? null,
            body.unit ?? null,
            body.sellingPrice ?? null,
            body.reorderLevel ?? null,
            body.imageData ?? null,
            mime
        ]);
        return { ok: true };
    });
    app.delete("/products/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const linked = await pool.query(`
      select 1 from warehouse_stock where product_id = $1 and quantity <> 0
      union all select 1 from shop_stock where product_id = $1 and quantity <> 0
      union all select 1 from product_blueprints where product_id = $1
      union all select 1 from production_batches where product_id = $1
      union all select 1 from stock_transfers where product_id = $1
      union all select 1 from sale_items where product_id = $1
      union all select 1 from stock_movements where product_id = $1
      limit 1
    `, [id]);
        if (linked.rows.length) {
            const archived = await pool.query("update products set status = 'disabled', updated_at = now() where id = $1 returning id", [id]);
            if (!archived.rowCount)
                throw app.httpErrors.notFound("Product not found");
            return { ok: true, archived: true };
        }
        const deleted = await pool.query("delete from products where id = $1 returning id", [id]);
        if (!deleted.rowCount)
            throw app.httpErrors.notFound("Product not found");
        return { ok: true, deleted: true };
    });
    app.post("/purchase-orders", async (request, reply) => {
        const body = poSchema.parse(request.body);
        const userId = actorId(request);
        const subtotal = body.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
        const total = subtotal + body.landedCost;
        const client = await pool.connect();
        try {
            await client.query("begin");
            const po = await client.query(`insert into purchase_orders (ref_no, supplier_id, expected_date, note, landed_cost, subtotal, total, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,'ordered',$8) returning id, ref_no`, [ref("PO"), body.supplierId, body.expectedDate ?? null, body.note ?? null, body.landedCost, subtotal, total, userId]);
            for (const line of body.items) {
                let itemId = line.itemId;
                if (!itemId) {
                    const existing = await client.query("select id from items where lower(name) = lower($1) and unit = $2 limit 1", [line.name, line.unit]);
                    itemId = existing.rows[0]?.id;
                }
                if (!itemId) {
                    const item = await client.query(`insert into items (sku, name, unit, reorder_level) values ($1,$2,$3,0) returning id`, [ref("ITM"), line.name, line.unit]);
                    itemId = item.rows[0].id;
                }
                await client.query(`insert into purchase_order_items (purchase_order_id, item_id, quantity, unit_cost, line_total)
           values ($1,$2,$3,$4,$5)`, [po.rows[0].id, itemId, line.quantity, line.unitCost, line.quantity * line.unitCost]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: po.rows[0].id, refNo: po.rows[0].ref_no });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
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
    app.get("/purchase-orders/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const [purchaseOrder, lines] = await Promise.all([
            pool.query(`select po.*, po.ref_no as "refNo", po.order_date as "date", s.name as "supplierName", s.email as "supplierEmail", s.phone as "supplierPhone", s.address as "supplierAddress"
         from purchase_orders po
         join suppliers s on s.id = po.supplier_id
         where po.id = $1`, [id]),
            pool.query(`select poi.id, poi.quantity, poi.unit_cost as "unitCost", poi.line_total as "lineTotal",
                coalesce(sum(gi.quantity), 0) as "receivedQty",
                i.id as "itemId", i.sku, i.name, i.unit
         from purchase_order_items poi
         join items i on i.id = poi.item_id
         left join grn_items gi on gi.purchase_order_item_id = poi.id
         where poi.purchase_order_id = $1
         group by poi.id, i.id
         order by poi.id`, [id])
        ]);
        const row = purchaseOrder.rows[0];
        if (!row)
            throw app.httpErrors.notFound("Purchase order not found");
        return { ...row, subtotal: money(row.subtotal), landedCost: money(row.landed_cost), total: money(row.total), items: lines.rows.map((line) => ({ ...line, quantity: numberify(line.quantity), receivedQty: numberify(line.receivedQty), remainingQty: Math.max(0, numberify(line.quantity) - numberify(line.receivedQty)), unitCost: money(line.unitCost), lineTotal: money(line.lineTotal) })) };
    });
    async function purchaseOrderPdfPayload(id) {
        const [orderResult, linesResult, settingsResult] = await Promise.all([
            pool.query(`select po.*, po.ref_no as "refNo", po.order_date as "date",
                s.email as "supplierEmail", s.name as "supplierName", s.phone as "supplierPhone", s.address as "supplierAddress"
         from purchase_orders po join suppliers s on s.id = po.supplier_id where po.id = $1`, [id]),
            pool.query(`select poi.id, poi.quantity, poi.unit_cost as "unitCost", poi.line_total as "lineTotal", i.name, i.unit
         from purchase_order_items poi join items i on i.id = poi.item_id
         where poi.purchase_order_id = $1 order by poi.id`, [id]),
            pool.query("select value from app_settings where key = 'settings'")
        ]);
        const row = orderResult.rows[0];
        if (!row)
            throw app.httpErrors.notFound("Purchase order not found");
        const settings = settingsResult.rows[0]?.value;
        const companyName = settings?.company?.tradingName ?? "POS & Inventory +";
        const refNo = String(row.refNo ?? row.ref_no);
        const pdf = await createPurchaseOrderPdf({ ...row, companyName }, linesResult.rows);
        return { row, lines: linesResult.rows, settings, companyName, refNo, pdf };
    }
    app.get("/purchase-orders/:id/pdf", async (request) => {
        const { id } = idParam.parse(request.params);
        const payload = await purchaseOrderPdfPayload(id);
        return {
            filename: `${payload.refNo}.pdf`,
            mimeType: "application/pdf",
            data: payload.pdf.toString("base64")
        };
    });
    app.post("/purchase-orders/:id/email", async (request) => {
        const { id } = idParam.parse(request.params);
        const { row, settings, companyName, refNo, pdf } = await purchaseOrderPdfPayload(id);
        if (!row)
            throw app.httpErrors.notFound("Purchase order not found");
        if (!row.supplierEmail)
            throw app.httpErrors.badRequest("Supplier does not have an email address.");
        if (!config.smtpHost || !config.smtpUser || !config.smtpPass)
            throw app.httpErrors.serviceUnavailable("SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM and SMTP_SECURE on the backend.");
        const values = {
            refNo,
            supplierName: String(row.supplierName ?? ""),
            companyName
        };
        const subject = renderTemplate(settings?.emailTemplates?.purchaseOrderSubject ?? "Purchase order {{refNo}} from {{companyName}}", values);
        const text = renderTemplate(settings?.emailTemplates?.purchaseOrderBody ?? "Dear {{supplierName}},\n\nPlease find attached purchase order {{refNo}}.\n\nRegards,\n{{companyName}}", values);
        await mailTransport().sendMail({
            from: config.smtpFrom,
            to: String(row.supplierEmail),
            subject,
            text,
            attachments: [{ filename: `${refNo}.pdf`, content: pdf, contentType: "application/pdf" }]
        });
        return { ok: true, message: "Purchase order email sent." };
    });
    app.post("/smtp/test", async (request) => {
        if (!config.smtpHost || !config.smtpUser || !config.smtpPass)
            throw app.httpErrors.serviceUnavailable("SMTP is not configured.");
        const body = z.object({ to: z.string().email().optional() }).parse(request.body ?? {});
        await mailTransport().sendMail({
            from: config.smtpFrom,
            to: body.to ?? config.smtpFrom,
            subject: "POS & Inventory + SMTP test",
            text: "SMTP is configured and working."
        });
        return { ok: true };
    });
    app.post("/grns", async (request, reply) => {
        const body = grnSchema.parse(request.body);
        const userId = actorId(request);
        const locationId = body.locationId ?? await defaultLocation("warehouse");
        const extraCostTotal = body.invoiceExtraCosts.reduce((sum, cost) => sum + cost.amount, 0);
        const goodsTotal = body.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
        const invoiceTotal = goodsTotal + extraCostTotal;
        const client = await pool.connect();
        try {
            await client.query("begin");
            const grn = await client.query(`insert into grns (ref_no, purchase_order_id, supplier_id, location_id, received_by, note, total)
         values ($1,$2,$3,$4,$5,$6,$7) returning id, ref_no`, [ref("GRN"), body.purchaseOrderId ?? null, body.supplierId, locationId, userId, body.note ?? null, invoiceTotal]);
            const grnId = grn.rows[0].id;
            const grnRef = grn.rows[0].ref_no;
            let lineIndex = 0;
            for (const line of body.items) {
                lineIndex += 1;
                let itemId = line.itemId ?? undefined;
                let unitCost = line.unitCost;
                let purchaseOrderItemId = line.purchaseOrderItemId ?? null;
                if (body.purchaseOrderId && purchaseOrderItemId) {
                    const poLine = await client.query(`select poi.id, poi.item_id, poi.quantity, poi.unit_cost, coalesce(sum(gi.quantity), 0) as received
             from purchase_order_items poi
             left join grn_items gi on gi.purchase_order_item_id = poi.id
             where poi.id = $1 and poi.purchase_order_id = $2
             group by poi.id`, [purchaseOrderItemId, body.purchaseOrderId]);
                    const source = poLine.rows[0];
                    if (!source)
                        throw app.httpErrors.badRequest("Selected PO item does not belong to this purchase order.");
                    const remaining = numberify(source.quantity) - numberify(source.received);
                    if (line.quantity > remaining)
                        throw app.httpErrors.badRequest(`Received quantity is greater than remaining PO quantity. Remaining: ${remaining}`);
                    itemId = source.item_id;
                    unitCost = line.unitCost || numberify(source.unit_cost);
                }
                if (!itemId) {
                    const existing = await client.query("select id from items where lower(name) = lower($1) and unit = $2 limit 1", [line.name, line.unit]);
                    itemId = existing.rows[0]?.id;
                }
                if (!itemId) {
                    const item = await client.query(`insert into items (sku, name, unit, reorder_level) values ($1,$2,$3,0) returning id`, [ref("ITM"), line.name, line.unit]);
                    itemId = item.rows[0].id;
                }
                const lineTotal = line.quantity * unitCost;
                const landedUnitCost = goodsTotal > 0 ? unitCost + ((lineTotal / goodsTotal) * extraCostTotal / line.quantity) : unitCost;
                const batchNo = `${grnRef}-${String(lineIndex).padStart(2, "0")}`;
                await client.query(`insert into grn_items (grn_id, purchase_order_item_id, item_id, quantity, unit_cost, landed_unit_cost, line_total, batch_no, expiry_date)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [grnId, purchaseOrderItemId, itemId, line.quantity, unitCost, landedUnitCost, lineTotal, batchNo, line.expiryDate ?? null]);
                await updateWarehouseItem(client, itemId, line.quantity);
                await client.query("update items set average_cost = $2, updated_at = now() where id = $1", [itemId, landedUnitCost]);
                await client.query(`insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'in',$3,$4,'grn',$5,$6,'Goods received')`, [locationId, itemId, line.quantity, landedUnitCost, grnId, userId]);
            }
            if (body.purchaseOrderId) {
                const progress = await client.query(`select bool_and(received >= quantity) as complete, bool_or(received > 0) as started
           from (
             select poi.quantity, coalesce(sum(gi.quantity), 0) as received
             from purchase_order_items poi
             left join grn_items gi on gi.purchase_order_item_id = poi.id
             where poi.purchase_order_id = $1
             group by poi.id
           ) lines`, [body.purchaseOrderId]);
                const complete = Boolean(progress.rows[0]?.complete);
                const started = Boolean(progress.rows[0]?.started);
                await client.query("update purchase_orders set status = $2 where id = $1", [body.purchaseOrderId, complete ? "received" : started ? "partial" : "ordered"]);
            }
            if (body.createInvoice) {
                const invoice = await client.query(`insert into supplier_invoices (ref_no, supplier_id, purchase_order_id, grn_id, due_date, total, attachment_name, attachment_mime, attachment_data, note)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'from grn') returning id`, [ref("SI"), body.supplierId, body.purchaseOrderId ?? null, grnId, body.invoiceDueDate ?? null, invoiceTotal, body.invoiceAttachmentName ?? null, body.invoiceAttachmentMime ?? null, body.invoiceAttachmentData ?? null]);
                await client.query("insert into expenses (supplier_invoice_id, category, description, amount) values ($1,'supplier_invoice','Supplier invoice from GRN goods',$2)", [invoice.rows[0].id, goodsTotal]);
                for (const cost of body.invoiceExtraCosts) {
                    if (cost.amount > 0) {
                        await client.query("insert into expenses (supplier_invoice_id, category, description, amount) values ($1,'purchase_expense',$2,$3)", [invoice.rows[0].id, cost.description, cost.amount]);
                    }
                }
                await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_invoice','supplier_invoice',$1,$2,'Supplier invoice from GRN')", [invoice.rows[0].id, invoiceTotal]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: grnId, refNo: grnRef });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/grns", async () => {
        const result = await pool.query(`
      select g.id, g.ref_no as "refNo", g.purchase_order_id as "poId", po.ref_no as "poRefNo",
             g.supplier_id as "supplierId", s.name as "supplierName",
             g.location_id as "locationId", l.name as "locationName", l.type as "locationType",
             g.received_at as "receivedAt", g.received_by as "receivedBy", g.note, g.total,
             coalesce(count(gi.id), 0) as "totalItems"
      from grns g join suppliers s on s.id = g.supplier_id join stock_locations l on l.id = g.location_id
      left join grn_items gi on gi.grn_id = g.id
      left join purchase_orders po on po.id = g.purchase_order_id
      group by g.id, po.ref_no, s.name, l.name, l.type
      order by g.received_at desc
    `);
        return result.rows.map((row) => ({ ...row, outletId: row.locationId, outletName: row.locationName, total: money(row.total), totalItems: Number(row.totalItems) }));
    });
    app.get("/grns/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const [grn, items, invoices] = await Promise.all([
            pool.query(`select g.*, g.ref_no as "refNo", po.ref_no as "poRefNo", s.name as supplier_name, s.name as "supplierName", l.name as "locationName", l.type as "locationType"
         from grns g
         join suppliers s on s.id = g.supplier_id
         join stock_locations l on l.id = g.location_id
         left join purchase_orders po on po.id = g.purchase_order_id
         where g.id = $1`, [id]),
            pool.query(`select gi.*, gi.batch_no as "batchNo", gi.expiry_date as "expiryDate", gi.unit_cost as "unitCost", gi.line_total as "lineTotal",
                i.name as item_name, i.name as "itemName", i.sku, i.unit, poi.quantity as "orderedQty"
         from grn_items gi
         join items i on i.id = gi.item_id
         left join purchase_order_items poi on poi.id = gi.purchase_order_item_id
         where gi.grn_id = $1
         order by gi.id`, [id]),
            pool.query(`select id, ref_no as "refNo", due_date as "dueDate", total, paid, status, attachment_name as "attachmentName", attachment_mime as "attachmentMime", attachment_data as "attachmentData"
         from supplier_invoices where grn_id = $1 order by created_at desc`, [id])
        ]);
        if (!grn.rows[0])
            throw app.httpErrors.notFound("GRN not found");
        return { ...grn.rows[0], items: items.rows, invoices: invoices.rows.map((row) => ({ ...row, total: money(row.total), paid: money(row.paid) })) };
    });
    app.post("/supplier-invoices", async (request, reply) => {
        const body = invoiceSchema.parse(request.body);
        const paid = body.paid ?? 0;
        const status = paid >= body.total && body.total > 0 ? "paid" : paid > 0 ? "partial" : "open";
        const client = await pool.connect();
        try {
            await client.query("begin");
            const result = await client.query(`insert into supplier_invoices (ref_no, supplier_id, purchase_order_id, grn_id, invoice_date, due_date, total, paid, status, attachment_name, attachment_mime, attachment_data, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, ref_no`, [ref("SI"), body.supplierId, body.purchaseOrderId ?? null, body.grnId ?? null, body.invoiceDate ?? new Date().toISOString().slice(0, 10), body.dueDate ?? null, body.total, paid, status, body.attachmentName ?? null, body.attachmentMime ?? null, body.attachmentData ?? null, body.note ?? null]);
            const invoiceId = result.rows[0].id;
            await client.query("insert into expenses (supplier_invoice_id, category, description, amount, status) values ($1,'supplier_invoice','Supplier invoice',$2,$3)", [invoiceId, body.total, status]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_invoice','supplier_invoice',$1,$2,'Supplier invoice')", [invoiceId, body.total]);
            if (paid > 0) {
                await client.query(`insert into payments (party_type, supplier_id, supplier_invoice_id, method, amount, reference, attachment_name, attachment_mime, attachment_data, note)
           values ('supplier',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [body.supplierId, invoiceId, body.paymentMethod ?? "bank", paid, body.paymentReference ?? null, body.paymentAttachmentName ?? null, body.paymentAttachmentMime ?? null, body.paymentAttachmentData ?? null, body.paymentNote ?? null]);
                await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_payment','supplier_invoice',$1,$2,'Supplier payment')", [invoiceId, paid]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: result.rows[0].id, refNo: result.rows[0].ref_no });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
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
        if (!invoice.rows[0])
            throw app.httpErrors.notFound("Invoice not found");
        return { ...invoice.rows[0], payments: payments.rows, expenses: expense.rows };
    });
    app.patch("/supplier-invoices/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({
            dueDate: nullableText,
            total: z.number().nonnegative().optional(),
            paid: z.number().nonnegative().optional(),
            attachmentName: nullableText,
            attachmentMime: nullableText,
            attachmentData: attachmentDataUrl,
            status: z.enum(["open", "partial", "paid", "void"]).optional()
        }).parse(request.body);
        const current = await pool.query("select total, paid from supplier_invoices where id = $1", [id]);
        if (!current.rows[0])
            throw app.httpErrors.notFound("Invoice not found");
        const nextTotal = body.total ?? numberify(current.rows[0].total);
        const nextPaid = body.paid ?? numberify(current.rows[0].paid);
        const nextStatus = body.status ?? (nextPaid >= nextTotal && nextTotal > 0 ? "paid" : nextPaid > 0 ? "partial" : "open");
        await pool.query(`update supplier_invoices
       set due_date = coalesce($2, due_date), total = $3, paid = $4, status = $5::document_status,
           attachment_name = coalesce($6, attachment_name), attachment_mime = coalesce($7, attachment_mime), attachment_data = coalesce($8, attachment_data)
       where id = $1`, [id, body.dueDate ?? null, nextTotal, nextPaid, nextStatus, body.attachmentName ?? null, body.attachmentMime ?? null, body.attachmentData ?? null]);
        return { ok: true };
    });
    app.delete("/supplier-invoices/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const paid = await pool.query("select 1 from payments where supplier_invoice_id = $1 limit 1", [id]);
        if (paid.rows.length)
            throw app.httpErrors.conflict("Invoice has payments. Void it instead of deleting.");
        await pool.query("delete from expenses where supplier_invoice_id = $1", [id]);
        await pool.query("delete from supplier_invoices where id = $1", [id]);
        return { ok: true };
    });
    app.post("/supplier-invoices/:id/payments", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({
            amount: z.number().positive(),
            method: z.enum(["cash", "card", "mobile", "bank", "credit"]),
            reference: nullableText,
            attachmentName: nullableText,
            attachmentMime: nullableText,
            attachmentData: attachmentDataUrl,
            note: nullableText
        }).parse(request.body);
        const client = await pool.connect();
        try {
            await client.query("begin");
            const invoice = await client.query("select * from supplier_invoices where id = $1 for update", [id]);
            if (!invoice.rows[0])
                throw app.httpErrors.notFound("Invoice not found");
            await client.query(`insert into payments (party_type, supplier_id, supplier_invoice_id, method, amount, reference, attachment_name, attachment_mime, attachment_data, note)
         values ('supplier',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [invoice.rows[0].supplier_id, id, body.method, body.amount, body.reference ?? null, body.attachmentName ?? null, body.attachmentMime ?? null, body.attachmentData ?? null, body.note ?? null]);
            const paid = numberify(invoice.rows[0].paid) + body.amount;
            const status = paid >= numberify(invoice.rows[0].total) ? "paid" : "partial";
            await client.query("update supplier_invoices set paid = $2, status = $3 where id = $1", [id, paid, status]);
            await client.query("update expenses set status = $2 where supplier_invoice_id = $1", [id, status]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('supplier_payment','supplier_invoice',$1,$2,'Supplier payment')", [id, body.amount]);
            await client.query("commit");
            return { ok: true };
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
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
            const bp = await client.query(`insert into product_blueprints (product_id, name, output_qty, labor_cost, overhead_cost) values ($1,$2,$3,$4,$5) returning id`, [body.productId, body.name, body.outputQty, body.laborCost, body.overheadCost]);
            for (const line of body.items) {
                await client.query("insert into product_blueprint_items (blueprint_id, item_id, quantity) values ($1,$2,$3)", [bp.rows[0].id, line.itemId, line.quantity]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: bp.rows[0].id });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/production", async (request, reply) => {
        const body = productionSchema.parse(request.body);
        const userId = actorId(request);
        const warehouseId = await defaultLocation("warehouse");
        const client = await pool.connect();
        try {
            await client.query("begin");
            const bp = await client.query("select * from product_blueprints where id = $1", [body.blueprintId]);
            if (!bp.rows[0])
                throw app.httpErrors.notFound("Blueprint not found");
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
            const batch = await client.query(`insert into production_batches (ref_no, blueprint_id, warehouse_location_id, quantity_to_produce, quantity_produced, quantity_wasted, extra_cost, total_cost, unit_cost, selling_price, produced_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, ref_no`, [ref("PB"), body.blueprintId, warehouseId, body.quantityToProduce, body.quantityProduced, body.quantityWasted, body.extraCost, totalCost, unitCost, body.sellingPrice ?? null, userId]);
            for (const line of components.rows) {
                const requiredQty = numberify(line.quantity) * factor;
                const lineCost = requiredQty * numberify(line.average_cost);
                await updateWarehouseItem(client, line.item_id, -requiredQty);
                await client.query("insert into production_batch_items (production_batch_id, item_id, required_qty, consumed_qty, unit_cost, total_cost) values ($1,$2,$3,$3,$4,$5)", [batch.rows[0].id, line.item_id, requiredQty, line.average_cost, lineCost]);
                await client.query(`insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'out',$3,$4,'production',$5,$6,'Raw item consumed')`, [warehouseId, line.item_id, requiredQty, line.average_cost, batch.rows[0].id, userId]);
            }
            await updateWarehouseProduct(client, bp.rows[0].product_id, body.quantityProduced);
            await client.query("update products set average_cost = $2, selling_price = coalesce($3, selling_price), updated_at = now() where id = $1", [bp.rows[0].product_id, unitCost, body.sellingPrice ?? null]);
            await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
         values ($1,$2,'in',$3,$4,'production',$5,$6,'Finished product produced')`, [warehouseId, bp.rows[0].product_id, body.quantityProduced, unitCost, batch.rows[0].id, userId]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('production_cost','production_batch',$1,$2,'Production cost')", [batch.rows[0].id, totalCost]);
            await client.query("commit");
            return reply.code(201).send({ id: batch.rows[0].id, refNo: batch.rows[0].ref_no, totalCost: money(totalCost), unitCost: numberify(unitCost) });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
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
      select sm.id, coalesce(i.id, p.id) as "productId", coalesce(i.name, p.name) as "productName",
             sm.location_id as "outletId", l.name as "outletName", sm.direction as movement, sm.quantity as qty,
             sm.unit_cost as "unitCost", sm.ref_type as "refType", sm.ref_id as "refId", sm.note, sm.created_at as "createdAt"
      from stock_movements sm
      join stock_locations l on l.id = sm.location_id
      left join items i on i.id = sm.item_id
      left join products p on p.id = sm.product_id
      order by sm.created_at desc
      limit 150
    `);
        return result.rows.map((row) => ({ ...row, qty: numberify(row.qty), unitCost: numberify(row.unitCost) }));
    });
    app.get("/stock/batches", async () => {
        const result = await pool.query(`
      select gi.id, gi.item_id as "productId", i.name as "productName", g.location_id as "outletId",
             l.name as "outletName", gi.batch_no as "batchNo", gi.expiry_date as "expiryDate",
             gi.quantity, gi.landed_unit_cost as cost
      from grn_items gi
      join grns g on g.id = gi.grn_id
      join stock_locations l on l.id = g.location_id
      join items i on i.id = gi.item_id
      order by gi.expiry_date nulls last, gi.id desc
      limit 200
    `);
        return result.rows.map((row) => ({
            ...row,
            quantity: numberify(row.quantity),
            cost: numberify(row.cost)
        }));
    });
    app.post("/inventory/adjustments", async (request) => {
        const body = stockAdjustmentSchema.parse(request.body);
        const userId = actorId(request);
        const client = await pool.connect();
        try {
            await client.query("begin");
            let locationId = body.outletId;
            let locationType = body.outletId === "shop" ? "shop" : "warehouse";
            if (body.outletId === "warehouse" || body.outletId === "shop") {
                locationId = await defaultLocation(body.outletId, client);
            }
            else {
                const location = await client.query("select id, type from stock_locations where id = $1", [body.outletId]);
                if (!location.rows[0])
                    throw app.httpErrors.notFound("Stock location not found");
                locationId = location.rows[0].id;
                locationType = location.rows[0].type;
            }
            const qty = Math.abs(body.qty);
            const direction = body.qty > 0 ? "in" : "out";
            const note = body.note ?? (body.reason === "damage" ? "Damaged stock adjustment" : "Manual stock adjustment");
            if (body.itemId) {
                if (locationType !== "warehouse")
                    throw app.httpErrors.badRequest("Raw items can only be adjusted in the warehouse.");
                if (direction === "out")
                    await assertWarehouseItem(client, body.itemId, qty);
                await updateWarehouseItem(client, body.itemId, direction === "in" ? qty : -qty);
                const item = await client.query("select average_cost from items where id = $1", [body.itemId]);
                await client.query(`insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, user_id, note)
           values ($1,$2,$3,$4,$5,'adjustment',$6,$7)`, [locationId, body.itemId, direction, qty, numberify(item.rows[0]?.average_cost), userId, note]);
            }
            else if (body.productId) {
                if (locationType === "shop") {
                    if (direction === "out")
                        await assertShopProduct(client, body.productId, qty);
                    await updateShopProduct(client, body.productId, direction === "in" ? qty : -qty);
                }
                else {
                    if (direction === "out")
                        await assertWarehouseProduct(client, body.productId, qty);
                    await updateWarehouseProduct(client, body.productId, direction === "in" ? qty : -qty);
                }
                const product = await client.query("select average_cost from products where id = $1", [body.productId]);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, user_id, note)
           values ($1,$2,$3,$4,$5,'adjustment',$6,$7)`, [locationId, body.productId, direction, qty, numberify(product.rows[0]?.average_cost), userId, note]);
            }
            await client.query("commit");
            return { ok: true };
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/stock-counts", async () => {
        const result = await pool.query(`
      select sc.id, sc.location_id as "outletId", l.name as "outletName", sc.status,
             sc.created_at as "createdAt", sc.closed_at as "closedAt",
             coalesce(sum(abs(scl.variance_qty)), 0) as variance
      from stock_counts sc
      join stock_locations l on l.id = sc.location_id
      left join stock_count_lines scl on scl.stock_count_id = sc.id
      group by sc.id, l.name
      order by sc.created_at desc
      limit 100
    `);
        return result.rows.map((row) => ({
            ...row,
            variance: numberify(row.variance)
        }));
    });
    app.post("/stock-counts", async (request, reply) => {
        const body = stockCountSchema.parse(request.body ?? {});
        const userId = actorId(request);
        let locationId = body.locationId ?? body.outletId ?? "warehouse";
        if (locationId === "warehouse" || locationId === "shop")
            locationId = await defaultLocation(locationId);
        const client = await pool.connect();
        try {
            await client.query("begin");
            const location = await client.query("select id, type from stock_locations where id = $1", [locationId]);
            if (!location.rows[0])
                throw app.httpErrors.notFound("Stock location not found");
            const count = await client.query("insert into stock_counts (location_id, created_by, note) values ($1,$2,$3) returning id", [locationId, userId, body.note ?? null]);
            const countId = count.rows[0].id;
            if (location.rows[0].type === "shop") {
                await client.query(`
          insert into stock_count_lines (stock_count_id, product_id, expected_qty)
          select $1, product_id, quantity from shop_stock
        `, [countId]);
            }
            else {
                await client.query(`
          insert into stock_count_lines (stock_count_id, item_id, product_id, expected_qty)
          select $1, item_id, product_id, quantity from warehouse_stock
        `, [countId]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: countId });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/stock-counts/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const [count, lines] = await Promise.all([
            pool.query(`
        select sc.*, l.name as "outletName", l.type as "locationType"
        from stock_counts sc join stock_locations l on l.id = sc.location_id
        where sc.id = $1
      `, [id]),
            pool.query(`
        select scl.id, scl.item_id as "itemId", scl.product_id as "productId",
               coalesce(i.name, p.name) as name, coalesce(i.sku, p.sku) as sku,
               coalesce(i.unit, p.unit) as unit, scl.expected_qty as "expectedQty",
               scl.counted_qty as "countedQty", scl.variance_qty as "varianceQty"
        from stock_count_lines scl
        left join items i on i.id = scl.item_id
        left join products p on p.id = scl.product_id
        where scl.stock_count_id = $1
        order by name
      `, [id])
        ]);
        if (!count.rows[0])
            throw app.httpErrors.notFound("Stock count not found");
        return { ...count.rows[0], lines: lines.rows.map((line) => ({ ...line, expectedQty: numberify(line.expectedQty), countedQty: line.countedQty == null ? null : numberify(line.countedQty), varianceQty: numberify(line.varianceQty) })) };
    });
    app.patch("/stock-counts/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({
            lines: z.array(z.object({ id: z.string().uuid(), countedQty: z.number().nonnegative() })).default([])
        }).parse(request.body ?? {});
        const count = await pool.query("select status from stock_counts where id = $1", [id]);
        if (!count.rows[0])
            throw app.httpErrors.notFound("Stock count not found");
        if (count.rows[0].status !== "open")
            throw app.httpErrors.badRequest("Only open stock counts can be edited.");
        for (const line of body.lines) {
            await pool.query("update stock_count_lines set counted_qty = $3 where id = $1 and stock_count_id = $2", [line.id, id, line.countedQty]);
        }
        return { ok: true };
    });
    app.post("/stock-counts/:id/submit", async (request) => {
        const { id } = idParam.parse(request.params);
        await pool.query("update stock_counts set status = 'submitted', submitted_at = now() where id = $1 and status = 'open'", [id]);
        return { ok: true };
    });
    app.post("/stock-counts/:id/cancel", async (request) => {
        const { id } = idParam.parse(request.params);
        await pool.query("update stock_counts set status = 'cancelled' where id = $1 and status in ('open','submitted')", [id]);
        return { ok: true };
    });
    app.post("/stock-counts/:id/close", async (request) => {
        const { id } = idParam.parse(request.params);
        const userId = actorId(request);
        const client = await pool.connect();
        try {
            await client.query("begin");
            const count = await client.query(`
        select sc.*, l.type as "locationType"
        from stock_counts sc join stock_locations l on l.id = sc.location_id
        where sc.id = $1 for update
      `, [id]);
            if (!count.rows[0])
                throw app.httpErrors.notFound("Stock count not found");
            if (!["open", "submitted"].includes(String(count.rows[0].status)))
                throw app.httpErrors.badRequest("Stock count is already closed or cancelled.");
            const lines = await client.query("select * from stock_count_lines where stock_count_id = $1 and counted_qty is not null", [id]);
            for (const line of lines.rows) {
                const variance = numberify(line.variance_qty);
                if (variance === 0)
                    continue;
                const direction = variance > 0 ? "in" : "out";
                const qty = Math.abs(variance);
                if (line.item_id) {
                    await updateWarehouseItem(client, String(line.item_id), variance);
                    const item = await client.query("select average_cost from items where id = $1", [line.item_id]);
                    await client.query(`insert into stock_movements (location_id, item_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
             values ($1,$2,$3,$4,$5,'stock_count',$6,$7,'Stock count variance')`, [count.rows[0].location_id, line.item_id, direction, qty, numberify(item.rows[0]?.average_cost), id, userId]);
                }
                else if (line.product_id) {
                    if (count.rows[0].locationType === "shop")
                        await updateShopProduct(client, String(line.product_id), variance);
                    else
                        await updateWarehouseProduct(client, String(line.product_id), variance);
                    const product = await client.query("select average_cost from products where id = $1", [line.product_id]);
                    await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
             values ($1,$2,$3,$4,$5,'stock_count',$6,$7,'Stock count variance')`, [count.rows[0].location_id, line.product_id, direction, qty, numberify(product.rows[0]?.average_cost), id, userId]);
                }
            }
            await client.query("update stock_counts set status = 'closed', approved_by = $2, closed_at = now() where id = $1", [id, userId]);
            await client.query("commit");
            return { ok: true };
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/transfers", async (request, reply) => {
        const body = transferSchema.parse(request.body);
        const userId = actorId(request);
        const warehouseId = await defaultLocation("warehouse");
        const shopId = await defaultLocation("shop");
        const transfer = await pool.query(`insert into stock_transfers (ref_no, from_location_id, to_location_id, product_id, quantity, transferred_by, note, status)
       values ($1,$2,$3,$4,$5,$6,$7,'draft') returning id, ref_no`, [ref("TR"), warehouseId, shopId, body.productId, body.quantity, userId, body.note ?? null]);
        return reply.code(201).send({ id: transfer.rows[0].id, refNo: transfer.rows[0].ref_no });
    });
    app.get("/transfers", async () => {
        const result = await pool.query(`
      select t.id, t.ref_no as "refNo", t.from_location_id as "fromOutletId", t.to_location_id as "toOutletId",
             fl.name as "fromOutletName", tl.name as "toOutletName", p.name as "productName",
             t.quantity as "totalItems", t.transferred_at as "createdAt", t.note, u.full_name as "userName",
             t.status::text as status
      from stock_transfers t
      join products p on p.id = t.product_id
      join stock_locations fl on fl.id = t.from_location_id
      join stock_locations tl on tl.id = t.to_location_id
      left join users u on u.id = t.transferred_by
      order by t.transferred_at desc
    `);
        return result.rows.map((row) => ({ ...row, totalItems: numberify(row.totalItems) }));
    });
    async function changeTransferStatus(id, userId, action) {
        const client = await pool.connect();
        try {
            await client.query("begin");
            const transfer = await client.query("select * from stock_transfers where id = $1 for update", [id]);
            const row = transfer.rows[0];
            if (!row)
                throw app.httpErrors.notFound("Transfer not found");
            const status = String(row.status);
            const quantity = numberify(row.quantity);
            const productId = String(row.product_id);
            const product = await client.query("select average_cost from products where id = $1", [productId]);
            const unitCost = numberify(product.rows[0]?.average_cost);
            if (action === "send") {
                if (status !== "draft")
                    throw app.httpErrors.badRequest("Only draft transfers can be sent.");
                await assertWarehouseProduct(client, productId, quantity);
                await updateWarehouseProduct(client, productId, -quantity);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'out',$3,$4,'transfer',$5,$6,'Transfer sent from warehouse')`, [row.from_location_id, productId, quantity, unitCost, id, userId]);
                await client.query("update stock_transfers set status = 'sent', sent_at = now(), transferred_by = coalesce($2, transferred_by) where id = $1", [id, userId]);
            }
            if (action === "receive") {
                if (status !== "sent")
                    throw app.httpErrors.badRequest("Only sent transfers can be received.");
                await updateShopProduct(client, productId, quantity);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'in',$3,$4,'transfer',$5,$6,'Transfer received into shop')`, [row.to_location_id, productId, quantity, unitCost, id, userId]);
                await client.query("update stock_transfers set status = 'received', received_at = now() where id = $1", [id]);
            }
            if (action === "cancel") {
                if (!["draft", "sent"].includes(status))
                    throw app.httpErrors.badRequest("Only draft or sent transfers can be cancelled.");
                if (status === "sent") {
                    await updateWarehouseProduct(client, productId, quantity);
                    await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
             values ($1,$2,'in',$3,$4,'transfer',$5,$6,'Transfer cancelled back to warehouse')`, [row.from_location_id, productId, quantity, unitCost, id, userId]);
                }
                await client.query("update stock_transfers set status = 'cancelled', cancelled_at = now() where id = $1", [id]);
            }
            await client.query("commit");
            return { ok: true };
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    }
    app.post("/transfers/:id/send", async (request) => {
        const { id } = idParam.parse(request.params);
        return changeTransferStatus(id, actorId(request), "send");
    });
    app.post("/transfers/:id/receive", async (request) => {
        const { id } = idParam.parse(request.params);
        return changeTransferStatus(id, actorId(request), "receive");
    });
    app.post("/transfers/:id/cancel", async (request) => {
        const { id } = idParam.parse(request.params);
        return changeTransferStatus(id, actorId(request), "cancel");
    });
    app.post("/sales", async (request, reply) => {
        const body = saleSchema.parse(request.body);
        const userId = actorId(request);
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
            if (body.paymentMethod === "credit") {
                if (!body.customerId)
                    throw app.httpErrors.badRequest("Credit sales require a customer.");
                const credit = await client.query(`
          select c.credit_limit, greatest(0, coalesce(sum(s.total), 0) - coalesce((select sum(p.amount) from payments p where p.customer_id = c.id), 0)) as balance
          from customers c
          left join sales s on s.customer_id = c.id and s.payment_method = 'credit' and s.status <> 'void'
          where c.id = $1
          group by c.id
        `, [body.customerId]);
                const remaining = numberify(credit.rows[0]?.credit_limit) - numberify(credit.rows[0]?.balance);
                if (remaining < total)
                    throw app.httpErrors.badRequest(`Customer credit limit exceeded. Available credit: ${formatMoney(remaining)}`);
            }
            const sale = await client.query(`insert into sales (ref_no, customer_id, cashier_id, subtotal, discount, total, payment_method)
         values ($1,$2,$3,$4,$5,$6,$7) returning id, ref_no`, [ref("SL"), body.customerId ?? null, userId, subtotal, body.discount, total, body.paymentMethod]);
            const receiptItems = [];
            for (const line of body.items) {
                const product = await client.query("select name, sku, average_cost from products where id = $1", [line.productId]);
                const unitCost = numberify(product.rows[0]?.average_cost);
                const lineTotal = line.quantity * line.unitPrice - line.discount;
                receiptItems.push({
                    productId: line.productId,
                    sku: product.rows[0]?.sku ?? "",
                    name: product.rows[0]?.name ?? line.productId,
                    qty: line.quantity,
                    price: line.unitPrice,
                    discount: line.discount,
                    total: lineTotal
                });
                await client.query(`insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_cost, line_total)
           values ($1,$2,$3,$4,$5,$6,$7)`, [sale.rows[0].id, line.productId, line.quantity, line.unitPrice, line.discount, unitCost, lineTotal]);
                await updateShopProduct(client, line.productId, -line.quantity);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'out',$3,$4,'sale',$5,$6,'POS sale')`, [shopId, line.productId, line.quantity, unitCost, sale.rows[0].id, userId]);
            }
            if (body.paymentMethod !== "credit") {
                await client.query("insert into payments (party_type, customer_id, sale_id, method, amount) values ('customer',$1,$2,$3,$4)", [body.customerId ?? null, sale.rows[0].id, body.paymentMethod, total]);
            }
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('sale_revenue','sale',$1,$2,'POS sale')", [sale.rows[0].id, total]);
            if (body.discount)
                await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('discount','sale',$1,$2,'Sale discount')", [sale.rows[0].id, body.discount]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('cogs','sale',$1,$2,'Cost of goods sold')", [sale.rows[0].id, cogs]);
            const receiptPayload = { refNo: sale.rows[0].ref_no, customerId: body.customerId ?? null, items: receiptItems, subtotal, discount: body.discount, total, paymentMethod: body.paymentMethod };
            const receipt = await client.query("insert into receipts (sale_id, receipt_no, payload) values ($1,$2,$3) returning id, receipt_no", [sale.rows[0].id, ref("RCPT"), JSON.stringify(receiptPayload)]);
            await client.query("commit");
            return reply.code(201).send({ id: sale.rows[0].id, refNo: sale.rows[0].ref_no, receiptId: receipt.rows[0].id, receiptNo: receipt.rows[0].receipt_no, total: money(total) });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/sales", async () => {
        const result = await pool.query(`
      select s.*, s.ref_no as "refNo", s.sale_date as date, s.cashier_id as "cashierId",
             s.customer_id as "customerId", c.name as "customerName", s.payment_method as payment
      from sales s
      left join customers c on c.id = s.customer_id
      order by s.sale_date desc
      limit 100
    `);
        return result.rows.map((row) => ({
            ...row,
            subtotal: money(row.subtotal),
            discount: money(row.discount),
            total: money(row.total),
            tax: 0
        }));
    });
    app.get("/receipts", async () => {
        const result = await pool.query(`
      select r.id, r.receipt_no as "receiptNo", r.payload, r.created_at as "createdAt",
             s.id as "saleId", s.ref_no as "saleRefNo", s.total, s.payment_method as payment,
             c.name as "customerName"
      from receipts r
      join sales s on s.id = r.sale_id
      left join customers c on c.id = s.customer_id
      order by r.created_at desc
      limit 100
    `);
        return result.rows.map((row) => {
            const payload = row.payload;
            return {
                ...row,
                refNo: row.receiptNo,
                lineCount: Array.isArray(payload?.items) ? payload.items.length : 0,
                subtotal: money(payload?.subtotal ?? row.total),
                discount: money(payload?.discount ?? 0),
                total: money(row.total),
                payment: payload?.paymentMethod ?? row.payment,
                status: "completed"
            };
        });
    });
    app.get("/receipts/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const result = await pool.query(`
      select r.id, r.receipt_no as "receiptNo", r.payload, r.created_at as "createdAt",
             s.id as "saleId", s.ref_no as "saleRefNo", s.total, s.payment_method as payment,
             c.name as "customerName"
      from receipts r
      join sales s on s.id = r.sale_id
      left join customers c on c.id = s.customer_id
      where r.id = $1
    `, [id]);
        const row = result.rows[0];
        if (!row)
            throw app.httpErrors.notFound("Receipt not found");
        return { ...row, total: money(row.total) };
    });
    app.get("/returns", async () => {
        const result = await pool.query(`
      select r.id, r.ref_no as "refNo", r.sale_id as "saleId", s.ref_no as "saleRefNo",
             c.name as "customerName", r.reason, r.refund_method as "refundMethod",
             r.subtotal, r.total, r.status, r.created_at as "createdAt",
             coalesce(count(ri.id), 0) as "lineCount"
      from returns r
      join sales s on s.id = r.sale_id
      left join customers c on c.id = r.customer_id
      left join return_items ri on ri.return_id = r.id
      group by r.id, s.ref_no, c.name
      order by r.created_at desc
      limit 100
    `);
        return result.rows.map((row) => ({ ...row, subtotal: money(row.subtotal), total: money(row.total), lineCount: Number(row.lineCount) }));
    });
    app.post("/returns", async (request, reply) => {
        const body = returnSchema.parse(request.body);
        const userId = actorId(request);
        const shopId = await defaultLocation("shop");
        const client = await pool.connect();
        try {
            await client.query("begin");
            const sale = await client.query("select * from sales where id = $1 for update", [body.saleId]);
            const saleRow = sale.rows[0];
            if (!saleRow)
                throw app.httpErrors.notFound("Sale not found");
            if (String(saleRow.status) === "void")
                throw app.httpErrors.badRequest("Voided sales cannot be returned.");
            const createdReturn = await client.query(`insert into returns (ref_no, sale_id, customer_id, cashier_id, reason, refund_method)
         values ($1,$2,$3,$4,$5,$6) returning id, ref_no`, [ref("RET"), body.saleId, saleRow.customer_id ?? null, userId, body.reason, body.refundMethod]);
            const returnId = createdReturn.rows[0].id;
            let subtotal = 0;
            let cogs = 0;
            for (const line of body.items) {
                const saleItem = await client.query(`select si.*, coalesce(sum(ri.quantity), 0) as returned_qty
           from sale_items si
           left join return_items ri on ri.sale_item_id = si.id
           where si.sale_id = $1 and ($2::uuid is null or si.id = $2) and si.product_id = $3
           group by si.id
           order by si.id
           limit 1`, [body.saleId, line.saleItemId ?? null, line.productId]);
                const item = saleItem.rows[0];
                if (!item)
                    throw app.httpErrors.badRequest("Return item does not belong to this sale.");
                const remaining = numberify(item.quantity) - numberify(item.returned_qty);
                if (line.quantity > remaining)
                    throw app.httpErrors.badRequest(`Return quantity is greater than sold quantity. Remaining: ${remaining}`);
                const lineTotal = line.quantity * numberify(item.unit_price);
                const lineCost = line.quantity * numberify(item.unit_cost);
                subtotal += lineTotal;
                cogs += lineCost;
                await client.query(`insert into return_items (return_id, sale_item_id, product_id, quantity, unit_price, unit_cost, line_total)
           values ($1,$2,$3,$4,$5,$6,$7)`, [returnId, item.id, line.productId, line.quantity, item.unit_price, item.unit_cost, lineTotal]);
                await updateShopProduct(client, line.productId, line.quantity);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'in',$3,$4,'return',$5,$6,$7)`, [shopId, line.productId, line.quantity, numberify(item.unit_cost), returnId, userId, body.reason]);
            }
            await client.query("update returns set subtotal = $2, total = $3 where id = $1", [returnId, subtotal, subtotal]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('sale_revenue','return',$1,$2,$3)", [returnId, -subtotal, "Sale return"]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('cogs','return',$1,$2,$3)", [returnId, -cogs, "COGS reversal"]);
            const totals = await client.query(`
        select coalesce(sum(si.quantity), 0) as sold, coalesce((select sum(ri.quantity) from return_items ri join sale_items x on x.id = ri.sale_item_id where x.sale_id = $1), 0) as returned
        from sale_items si where si.sale_id = $1
      `, [body.saleId]);
            if (numberify(totals.rows[0]?.returned) >= numberify(totals.rows[0]?.sold)) {
                await client.query("update sales set status = 'returned' where id = $1", [body.saleId]);
            }
            await client.query("commit");
            return reply.code(201).send({ id: returnId, refNo: createdReturn.rows[0].ref_no });
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/sales/:id/void", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({ reason: z.string().trim().min(1).default("Voided sale") }).parse(request.body ?? {});
        const userId = actorId(request);
        const shopId = await defaultLocation("shop");
        const client = await pool.connect();
        try {
            await client.query("begin");
            const sale = await client.query("select * from sales where id = $1 for update", [id]);
            const saleRow = sale.rows[0];
            if (!saleRow)
                throw app.httpErrors.notFound("Sale not found");
            if (String(saleRow.status) === "void")
                throw app.httpErrors.badRequest("Sale is already void.");
            if (String(saleRow.status) === "returned")
                throw app.httpErrors.badRequest("Returned sales cannot be voided.");
            const lines = await client.query(`
        select si.*, coalesce(sum(ri.quantity), 0) as returned_qty
        from sale_items si
        left join return_items ri on ri.sale_item_id = si.id
        where si.sale_id = $1
        group by si.id
      `, [id]);
            let revenue = 0;
            let cogs = 0;
            for (const line of lines.rows) {
                const qty = numberify(line.quantity) - numberify(line.returned_qty);
                if (qty <= 0)
                    continue;
                revenue += qty * numberify(line.unit_price) - numberify(line.discount);
                cogs += qty * numberify(line.unit_cost);
                await updateShopProduct(client, String(line.product_id), qty);
                await client.query(`insert into stock_movements (location_id, product_id, direction, quantity, unit_cost, ref_type, ref_id, user_id, note)
           values ($1,$2,'in',$3,$4,'sale_void',$5,$6,$7)`, [shopId, line.product_id, qty, numberify(line.unit_cost), id, userId, body.reason]);
            }
            await client.query("update sales set status = 'void' where id = $1", [id]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('sale_revenue','sale_void',$1,$2,$3)", [id, -revenue, body.reason]);
            await client.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('cogs','sale_void',$1,$2,$3)", [id, -cogs, "COGS reversal"]);
            await client.query("commit");
            return { ok: true };
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/customers", async () => {
        const result = await pool.query(`
      select c.*, coalesce(sum(s.total), 0) as "totalPurchases", coalesce(count(distinct s.id), 0) as "saleCount",
             greatest(0, coalesce(sum(s.total), 0) - coalesce((select sum(p.amount) from payments p where p.customer_id = c.id), 0)) as balance
      from customers c
      left join sales s on s.customer_id = c.id
      group by c.id
      order by c.name
    `);
        return result.rows.map((row) => ({ ...row, totalPurchases: money(row.totalPurchases), balance: money(row.balance), saleCount: Number(row.saleCount) }));
    });
    app.post("/customers", async (request, reply) => {
        const body = customerSchema.parse(request.body);
        const result = await pool.query("insert into customers (name, phone, email, address, credit_limit, loyalty_points) values ($1,$2,$3,$4,$5,$6) returning id", [body.name, body.phone ?? null, body.email ?? null, body.address ?? null, body.creditLimit ?? 0, body.loyaltyPoints ?? 0]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.patch("/customers/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = customerSchema.partial().extend({ status: z.enum(["active", "suspended", "disabled"]).optional() }).parse(request.body);
        await pool.query(`update customers set name = coalesce($2, name), phone = coalesce($3, phone), email = coalesce($4, email),
       address = coalesce($5, address), status = coalesce($6::user_status, status),
       credit_limit = coalesce($7, credit_limit), loyalty_points = coalesce($8, loyalty_points),
       updated_at = now()
       where id = $1`, [id, body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null, body.status ?? null, body.creditLimit ?? null, body.loyaltyPoints ?? null]);
        return { ok: true };
    });
    app.delete("/customers/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const linked = await pool.query("select 1 from sales where customer_id = $1 limit 1", [id]);
        if (linked.rows.length)
            throw app.httpErrors.conflict("Customer has sales. Suspend instead of deleting.");
        await pool.query("delete from customers where id = $1", [id]);
        return { ok: true };
    });
    app.post("/customers/:id/suspend", async (request) => {
        const { id } = idParam.parse(request.params);
        await pool.query("update customers set status = 'suspended', updated_at = now() where id = $1", [id]);
        return { ok: true };
    });
    app.get("/customers/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const [customer, sales, payments] = await Promise.all([
            pool.query("select * from customers where id = $1", [id]),
            pool.query("select * from sales where customer_id = $1 order by sale_date desc", [id]),
            pool.query("select * from payments where customer_id = $1 order by paid_at desc", [id])
        ]);
        if (!customer.rows[0])
            throw app.httpErrors.notFound("Customer not found");
        return { customer: customer.rows[0], sales: sales.rows, payments: payments.rows };
    });
    app.post("/customers/:id/payment", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({ amount: z.number().positive(), method: z.enum(["cash", "card", "mobile", "bank", "credit"]).default("cash"), note: nullableText }).parse(request.body);
        await pool.query("insert into payments (party_type, customer_id, method, amount, note) values ('customer', $1, $2, $3, $4)", [id, body.method, body.amount, body.note ?? null]);
        await pool.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('customer_payment','customer',$1,$2,'Customer payment')", [id, body.amount]);
        return { ok: true };
    });
    app.get("/finance", async () => {
        const result = await pool.query(`
      select
        coalesce(sum(amount) filter (where type = 'sale_revenue'), 0) as revenue,
        coalesce(sum(amount) filter (where type = 'discount'), 0) as discounts,
        coalesce(sum(amount) filter (where type = 'cogs'), 0) as cogs,
        coalesce(sum(amount) filter (where type in ('supplier_invoice','purchase_expense','production_cost')), 0) as expenses,
        coalesce(sum(amount) filter (where type = 'supplier_payment'), 0) as supplier_payments,
        coalesce((select sum(total - paid) from supplier_invoices where status <> 'void'), 0) as accounts_payable,
        coalesce((select sum(s.total) from sales s where s.customer_id is not null), 0) -
        coalesce((select sum(p.amount) from payments p where p.customer_id is not null), 0) as accounts_receivable,
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
            accountsPayable: money(row.accounts_payable),
            accountsReceivable: money(row.accounts_receivable),
            warehouseValue: money(row.warehouse_value),
            shopValue: money(row.shop_value)
        };
    });
    app.get("/finance/transactions", async () => (await pool.query("select * from finance_transactions order by created_at desc limit 200")).rows);
    app.get("/expenses", async () => {
        const result = await pool.query("select id, expense_date as date, category, description, amount, status from expenses order by created_at desc limit 200");
        return result.rows.map((row) => ({ ...row, amount: money(row.amount), recurring: false }));
    });
    app.post("/expenses", async (request, reply) => {
        const body = expenseSchema.parse(request.body ?? {});
        const result = await pool.query(`insert into expenses (supplier_invoice_id, category, description, amount, expense_date, status)
       values ($1,$2,$3,$4,coalesce($5::date, current_date),$6::document_status)
       returning id`, [body.supplierInvoiceId ?? null, body.category, body.description ?? null, body.amount, body.expenseDate ?? null, body.status]);
        await pool.query("insert into finance_transactions (type, ref_type, ref_id, amount, note) values ('purchase_expense','expense',$1,$2,$3)", [result.rows[0].id, body.amount, body.description ?? body.category]);
        return reply.code(201).send({ id: result.rows[0].id });
    });
    app.get("/loyalty", async () => {
        const result = await pool.query(`
      select id, name, loyalty_points as "loyaltyPoints"
      from customers
      order by loyalty_points desc, name
      limit 200
    `);
        return result.rows;
    });
    app.get("/credit", async () => {
        const result = await pool.query(`
      select c.id, c.name, c.credit_limit as "creditLimit",
             greatest(0, coalesce(sum(s.total), 0) - coalesce((select sum(p.amount) from payments p where p.customer_id = c.id), 0)) as balance
      from customers c
      left join sales s on s.customer_id = c.id and s.payment_method = 'credit'
      group by c.id
      order by balance desc, c.name
    `);
        return result.rows.map((row) => ({ ...row, creditLimit: money(row.creditLimit), balance: money(row.balance) }));
    });
    app.get("/reports", async () => {
        const [finance, topProducts, stockMoves] = await Promise.all([
            pool.query("select type, coalesce(sum(amount), 0) as amount from finance_transactions group by type order by type"),
            pool.query(`select p.name, coalesce(sum(si.quantity), 0) as qty, coalesce(sum(si.line_total), 0) as revenue from sale_items si join products p on p.id = si.product_id group by p.id order by revenue desc limit 10`),
            pool.query("select ref_type, count(*) as count from stock_movements group by ref_type order by ref_type")
        ]);
        return { finance: finance.rows, topProducts: topProducts.rows, stockMovements: stockMoves.rows };
    });
    app.get("/audit", async (request) => {
        const query = request.query;
        const limit = Math.min(500, Math.max(1, Number(query.limit ?? 200)));
        const result = await pool.query(`select a.id, a.ts, a.user_id as "userId", u.full_name as "userName", a.action, a.entity,
              a.entity_id as "entityId", a.detail::text as detail, a.device_id as "deviceId", a.ip
       from audit_log a
       left join users u on u.id = a.user_id
       where ($1::text is null or a.entity = $1)
         and ($2::text is null or a.action = $2)
         and ($3::uuid is null or a.user_id = $3)
       order by a.ts desc
       limit $4`, [query.entity ?? null, query.action ?? null, query.userId ?? null, limit]);
        return result.rows;
    });
    app.get("/users", async () => (await pool.query("select id, username, email, full_name as name, role, status, last_login_at as \"lastLoginAt\" from users order by created_at desc")).rows);
    const roleDetails = [
        { id: "super_admin", label: "Administrator", permissions: [{ id: "all", label: "Full system access" }] },
        { id: "inventory_officer", label: "Inventory officer", permissions: [{ id: "inventory", label: "Inventory" }, { id: "purchasing", label: "Purchasing" }, { id: "transfers", label: "Transfers" }] },
        { id: "production_officer", label: "Production officer", permissions: [{ id: "blueprints", label: "Product blueprints" }, { id: "production", label: "Production" }, { id: "warehouse", label: "Warehouse stock" }] },
        { id: "pos_cashier", label: "POS cashier", permissions: [{ id: "pos", label: "POS sales" }, { id: "receipts", label: "Receipts" }, { id: "customers", label: "Customers" }] },
        { id: "finance_user", label: "Finance user", permissions: [{ id: "finance", label: "Finance" }, { id: "reports", label: "Reports" }, { id: "supplier_invoices", label: "Supplier invoices" }] }
    ];
    app.get("/roles", async () => roleDetails);
    app.get("/permissions", async () => {
        const permissions = new Map();
        for (const role of roleDetails) {
            for (const permission of role.permissions) {
                const current = permissions.get(permission.id) ?? { ...permission, roles: [] };
                current.roles.push(role.id);
                permissions.set(permission.id, current);
            }
        }
        return [...permissions.values()].sort((a, b) => a.id.localeCompare(b.id));
    });
    app.get("/sessions", async () => {
        const result = await pool.query(`
      select s.id, s.user_id as "userId", u.full_name as "userName", u.email, s.device_id as "deviceId",
             s.user_agent as "userAgent", s.ip, s.created_at as "createdAt", s.expires_at as "expiresAt",
             s.revoked_at as "revokedAt",
             (s.revoked_at is null and s.expires_at > now()) as active
      from sessions s
      join users u on u.id = s.user_id
      order by s.created_at desc
      limit 200
    `);
        return result.rows;
    });
    app.post("/sessions/:id/revoke", async (request) => {
        const { id } = idParam.parse(request.params);
        const result = await pool.query("update sessions set revoked_at = now() where id = $1 and revoked_at is null returning id", [id]);
        if (!result.rowCount)
            throw app.httpErrors.notFound("Session not found or already revoked");
        return { ok: true };
    });
    app.post("/users", async (request, reply) => {
        const body = userSchema.parse(request.body);
        const passwordHash = await bcrypt.hash(body.password, 10);
        const result = await pool.query("insert into users (username, email, full_name, password_hash, role) values ($1,$2,$3,$4,$5) returning id", [body.username, body.email, body.name, passwordHash, body.role]);
        let inviteSent = false;
        if (config.smtpHost && config.smtpUser && config.smtpPass) {
            try {
                const settingsResult = await pool.query("select value from app_settings where key = 'settings'");
                const settings = settingsResult.rows[0]?.value;
                await mailTransport().sendMail({
                    from: config.smtpFrom,
                    to: body.email,
                    subject: `Your ${settings?.company?.tradingName ?? "POS & Inventory +"} account`,
                    text: [
                        `Hello ${body.name},`,
                        "",
                        "Your account has been created.",
                        `Username: ${body.username}`,
                        `Email: ${body.email}`,
                        `Temporary password: ${body.password}`,
                        "",
                        `Android: ${settings?.downloads?.androidUrl ?? ""}`,
                        `iOS: ${settings?.downloads?.iosUrl ?? ""}`
                    ].join("\n")
                });
                inviteSent = true;
            }
            catch {
                inviteSent = false;
            }
        }
        return reply.code(201).send({ id: result.rows[0].id, inviteSent });
    });
    app.patch("/users/:id", async (request) => {
        const { id } = idParam.parse(request.params);
        const body = z.object({
            name: z.string().trim().min(1).optional(),
            email: z.string().email().optional(),
            role: z.string().optional(),
            status: z.enum(["active", "suspended", "disabled"]).optional()
        }).parse(request.body);
        await pool.query(`update users set full_name = coalesce($2, full_name), email = coalesce($3, email), role = coalesce($4, role),
       status = coalesce($5::user_status, status), updated_at = now() where id = $1`, [id, body.name ?? null, body.email ?? null, body.role ?? null, body.status ?? null]);
        return { ok: true };
    });
}
