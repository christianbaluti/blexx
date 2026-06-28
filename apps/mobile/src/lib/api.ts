import type {
  AuditEntry,
  AppBranding,
  AppSettings,
  AuthUser,
  BackupSnapshot,
  Bom,
  Category,
  Customer,
  DashboardSummary,
  Expense,
  FinancialStatement,
  GlAccount,
  GlEntry,
  GoodsReceivedNote,
  InventoryBatch,
  NotificationItem,
  Product,
  ProductionBatch,
  PurchaseOrder,
  ReportSummary,
  RoleDetail,
  Sale,
  SaleLineInput,
  StockCount,
  StockMovement,
  Supplier,
  SupplierInvoice,
  SyncConflict,
  SyncHealth,
  SyncMutation,
  Transfer,
  UserAccount
} from "@blex/shared";
import { defaultAppBranding } from "@blex/shared";
import { defaultAppSettings } from "@blex/shared";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { readCacheAsync, saveCache } from "./localDb";
import { getAuthToken } from "./sessionStore";

const API_PORT = "4000";
const PRODUCTION_API_URL = "https://blexx-api-ms2z.vercel.app";

function cleanUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function hostFromExpo() {
  const constants = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string; hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };
  const hostUri =
    Constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.manifest?.hostUri ??
    constants.manifest?.debuggerHost;

  const host = hostUri?.replace(/^https?:\/\//, "").replace(/^exp:\/\//, "").split("/")[0]?.split(":")[0];
  if (!host) return null;
  if (host === "localhost" && Platform.OS === "android") return "10.0.2.2";
  return host;
}

export function getApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return cleanUrl(configured);

  const useLocalApi = process.env.EXPO_PUBLIC_USE_LOCAL_API === "true";
  if (useLocalApi) {
    const expoHost = hostFromExpo();
    if (expoHost) return `http://${expoHost}:${API_PORT}`;
    return "http://localhost:4000";
  }

  return PRODUCTION_API_URL;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiUrl = getApiUrl();
  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = await getAuthToken();
  if (token && path !== "/auth/login") headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error(`Cannot reach Blex API at ${apiUrl}. Check your connection and backend status.`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

async function cached<T>(key: string, path: string, fallback: T): Promise<T> {
  try {
    const data = await request<T>(path);
    saveCache(key, data);
    return data;
  } catch (error) {
    const cachedValue = await readCacheAsync<T>(key, fallback);
    if (Array.isArray(cachedValue) ? cachedValue.length : Boolean(cachedValue)) return cachedValue;
    throw error;
  }
}

export const api = {
  baseUrl: getApiUrl,
  login(username: string, password: string) {
    return request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  me: () => request<AuthUser>("/auth/me"),
  branding: () => cached<AppBranding>("branding", "/settings/branding", defaultAppBranding),
  updateBranding(payload: AppBranding) {
    return request<AppBranding>("/settings/branding", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  settings: () => cached<AppSettings>("settings", "/settings", defaultAppSettings),
  updateSettings(payload: AppSettings) {
    return request<AppSettings>("/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  async dashboard() {
    const data = await cached<Record<string, unknown>>("dashboard", "/dashboard", {});
    return {
      revenue14d: Number(data.revenue14d ?? 0),
      stockValue: Number(data.warehouseValue ?? 0) + Number(data.shopValue ?? 0),
      transactionCount14d: Number(data.salesCount ?? 0),
      lowStockCount: Number(data.lowStockCount ?? 0),
      revenueTrend: [] as DashboardSummary["revenueTrend"],
      topProducts: [] as DashboardSummary["topProducts"]
    } satisfies DashboardSummary;
  },
  async products() {
    const rows = await cached<Record<string, unknown>[]>("products", "/products", []);
    return rows.map((row) => ({
      id: String(row.id),
      sku: String(row.sku),
      barcode: row.barcode ? String(row.barcode) : null,
      name: String(row.name),
      categoryId: null,
      categoryName: null,
      unit: String(row.unit ?? "ea"),
      isRaw: false,
      isSellable: true,
      cost: Number(row.averageCost ?? 0),
      price: Number(row.sellingPrice ?? 0),
      stock: Number(row.shopStock ?? 0),
      reorder: Number(row.reorderLevel ?? 0),
      imageUrl: row.imageData ? String(row.imageData) : null,
      warehouseStock: Number(row.warehouseStock ?? 0),
      shopStock: Number(row.shopStock ?? 0)
    } as Product & { warehouseStock: number; shopStock: number }));
  },
  async items() {
    const rows = await cached<Record<string, unknown>[]>("items", "/items", []);
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      sku: String(row.sku ?? ""),
      name: String(row.name ?? ""),
      unit: String(row.unit ?? "ea"),
      stock: Number(row.stock ?? 0),
      shopStock: Number(row.shopStock ?? row.shop_stock ?? 0),
      averageCost: Number(row.averageCost ?? row.average_cost ?? 0),
      reorderLevel: Number(row.reorderLevel ?? row.reorder_level ?? 0),
      imageData: row.imageData || row.image_data ? String(row.imageData ?? row.image_data) : null,
      imageMime: row.imageMime || row.image_mime ? String(row.imageMime ?? row.image_mime) : null,
      status: String(row.status ?? "active")
    }));
  },
  categories: async () => [] as Category[],
  suppliers: () => cached<Supplier[]>("suppliers", "/suppliers", []),
  async customers() {
    const rows = await cached<Record<string, unknown>[]>("customers", "/customers", []);
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      phone: row.phone ? String(row.phone) : null,
      email: row.email ? String(row.email) : null,
      address: row.address ? String(row.address) : null,
      loyaltyPoints: 0,
      creditLimit: 0,
      balance: 0,
      totalPurchases: Number(row.totalPurchases ?? 0),
      saleCount: Number(row.saleCount ?? 0),
      status: String(row.status ?? "active") as Customer["status"]
    } as Customer & { totalPurchases: number; saleCount: number }));
  },
  async sales() {
    const rows = await cached<Record<string, unknown>[]>("sales", "/sales", []);
    return rows.map((row) => ({
      id: String(row.id),
      refNo: String(row.ref_no ?? row.refNo),
      date: String(row.sale_date ?? row.date),
      cashierId: String(row.cashier_id ?? row.cashierId ?? ""),
      customerId: row.customer_id ? String(row.customer_id) : null,
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      tax: 0,
      total: Number(row.total ?? 0),
      payment: String(row.payment_method ?? "cash") as Sale["payment"],
      status: "completed" as const
    }));
  },
  async purchaseOrders() {
    const rows = await cached<Record<string, unknown>[]>("purchase-orders", "/purchase-orders", []);
    return rows.map((row) => ({
      id: String(row.id),
      refNo: String(row.refNo ?? row.ref_no),
      supplierId: String(row.supplierId ?? row.supplier_id ?? ""),
      supplierName: row.supplierName ? String(row.supplierName) : undefined,
      date: String(row.date ?? row.order_date ?? row.created_at ?? ""),
      status: String(row.status ?? "ordered") as PurchaseOrder["status"],
      total: Number(row.total ?? 0)
    }));
  },
  returns: () => cached<Record<string, unknown>[]>("returns", "/returns", []),
  receipts: () => cached<Record<string, unknown>[]>("receipts", "/receipts", []),
  expenses: () => cached<Expense[]>("expenses", "/expenses", []),
  audit: () => cached<AuditEntry[]>("audit", "/audit", []),
  notifications: async () => [] as NotificationItem[],
  markNotificationRead(id: string) {
    return request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" });
  },
  users: () => cached<UserAccount[]>("users", "/users", []),
  roles: () => cached<RoleDetail[]>("roles", "/roles", []),
  async inventory() {
    const [warehouse, shop] = await Promise.all([
      cached<Record<string, unknown>[]>("warehouse-stock", "/stock/warehouse", []),
      cached<Record<string, unknown>[]>("shop-stock", "/stock/shop", [])
    ]);
    return [
      ...warehouse.map((row) => ({
        productId: row.id,
        productName: row.name,
        sku: row.sku,
        unit: row.unit,
        outletId: "warehouse",
        outletName: "Warehouse",
        quantity: row.quantity,
        cost: row.unitCost,
        price: 0,
        reorder: 0
      })),
      ...shop.map((row) => ({
        productId: row.id,
        productName: row.name,
        sku: row.sku,
        unit: row.unit,
        outletId: "shop",
        outletName: "Shop",
        quantity: row.quantity,
        cost: row.unitCost,
        price: row.sellingPrice,
        reorder: 0
      }))
    ];
  },
  batches: async () => [] as InventoryBatch[],
  movements: async () => [] as StockMovement[],
  stockCounts: () => cached<StockCount[]>("stock-counts", "/stock-counts", []),
  transfers: () => cached<Transfer[]>("transfers", "/transfers", []),
  async boms() {
    const rows = await cached<Record<string, unknown>[]>("blueprints", "/blueprints", []);
    return rows.map((row) => ({
      id: String(row.id),
      productId: String(row.product_id ?? row.productId),
      productName: row.productName ? String(row.productName) : undefined,
      name: String(row.name),
      laborCost: Number(row.labor_cost ?? row.laborCost ?? 0),
      overhead: Number(row.overhead_cost ?? row.overhead ?? 0),
      outputQty: Number(row.output_qty ?? row.outputQty ?? 1),
      components: Array.isArray(row.items)
        ? row.items.map((item) => ({
            productId: String((item as Record<string, unknown>).itemId),
            productName: String((item as Record<string, unknown>).itemName ?? ""),
            qty: Number((item as Record<string, unknown>).quantity ?? 0)
          }))
        : []
    }));
  },
  production: () => cached<ProductionBatch[]>("production", "/production", []),
  async grn() {
    const rows = await cached<Record<string, unknown>[]>("grn", "/grns", []);
    return rows.map((row) => ({
      id: String(row.id),
      refNo: String(row.refNo ?? row.ref_no),
      poId: row.poId || row.purchase_order_id ? String(row.poId ?? row.purchase_order_id) : null,
      poRefNo: row.poRefNo ? String(row.poRefNo) : null,
      supplierId: row.supplierId || row.supplier_id ? String(row.supplierId ?? row.supplier_id) : null,
      supplierName: row.supplierName ? String(row.supplierName) : null,
      outletId: row.outletId || row.locationId ? String(row.outletId ?? row.locationId) : null,
      outletName: row.outletName || row.locationName ? String(row.outletName ?? row.locationName) : null,
      locationType: row.locationType ? String(row.locationType) : null,
      receivedAt: String(row.receivedAt ?? row.received_at),
      receivedBy: row.receivedBy || row.received_by ? String(row.receivedBy ?? row.received_by) : null,
      totalItems: Number(row.totalItems ?? row.lineCount ?? 0),
      total: Number(row.total ?? 0),
      note: row.note ? String(row.note) : null
    })) as GoodsReceivedNote[];
  },
  async supplierInvoices() {
    const rows = await cached<Record<string, unknown>[]>("supplier-invoices", "/supplier-invoices", []);
    return rows.map((row) => ({
      id: String(row.id),
      refNo: String(row.refNo ?? row.ref_no),
      supplierId: String(row.supplierId ?? row.supplier_id ?? ""),
      supplierName: String(row.supplierName ?? ""),
      invoiceDate: String(row.invoiceDate ?? row.invoice_date ?? ""),
      dueDate: row.dueDate || row.due_date ? String(row.dueDate ?? row.due_date) : null,
      total: Number(row.total ?? 0),
      paid: Number(row.paid ?? 0),
      status: String(row.status ?? "open") as SupplierInvoice["status"],
      grnId: row.grnId || row.grn_id ? String(row.grnId ?? row.grn_id) : null,
      grnRefNo: row.grnRefNo ? String(row.grnRefNo) : null,
      attachmentName: row.attachmentName || row.attachment_name ? String(row.attachmentName ?? row.attachment_name) : null,
      attachmentMime: row.attachmentMime || row.attachment_mime ? String(row.attachmentMime ?? row.attachment_mime) : null,
      attachmentData: row.attachmentData || row.attachment_data ? String(row.attachmentData ?? row.attachment_data) : null
    }));
  },
  loyalty: () => cached<Record<string, unknown>[]>("loyalty", "/loyalty", []),
  credit: () => cached<Record<string, unknown>[]>("credit", "/credit", []),
  permissions: () => cached<Record<string, unknown>[]>("permissions", "/permissions", []),
  sessions: () => cached<Record<string, unknown>[]>("sessions", "/sessions", []),
  revokeSession(id: string) {
    return request<{ ok: boolean }>(`/sessions/${id}/revoke`, { method: "POST" });
  },
  outlets: () => cached<Record<string, unknown>[]>("outlets", "/stock/locations", []),
  glAccounts: async () => [] as GlAccount[],
  async ledger() {
    const rows = await cached<Record<string, unknown>[]>("ledger", "/finance/transactions", []);
    return rows.map((row) => ({
      id: Number(row.id),
      postedAt: String(row.created_at ?? row.createdAt),
      refType: String(row.ref_type ?? row.refType ?? ""),
      refId: row.ref_id ? String(row.ref_id) : null,
      accountCode: String(row.type ?? ""),
      accountName: String(row.type ?? ""),
      debit: Number(row.amount ?? 0),
      credit: 0,
      memo: row.note ? String(row.note) : null
    }));
  },
  async statements() {
    const row = await cached<Record<string, unknown>>("statements", "/finance", {});
    return {
      period: "Current period",
      income: Number(row.revenue ?? 0),
      expenses: Number(row.expenses ?? 0),
      grossProfit: Number(row.grossProfit ?? 0),
      netProfit: Number(row.grossProfit ?? 0) - Number(row.expenses ?? 0),
      assets: Number(row.warehouseValue ?? 0) + Number(row.shopValue ?? 0),
      liabilities: Number(row.supplierPayments ?? 0),
      equity: Number(row.warehouseValue ?? 0) + Number(row.shopValue ?? 0) - Number(row.supplierPayments ?? 0)
    } satisfies FinancialStatement;
  },
  async reports() {
    const data = await cached<Record<string, unknown>>("reports", "/reports", {});
    const financeRows = Array.isArray(data.finance) ? data.finance as Record<string, unknown>[] : [];
    return financeRows.map((row) => ({
      title: String(row.type),
      total: Number(row.amount ?? 0),
      trend: 0
    })) as ReportSummary[];
  },
  syncHealth: () => cached<SyncHealth>("sync-health", "/sync/health", {
    online: false,
    pending: 0,
    conflicts: 0,
    failed: 0,
    lastSyncedAt: null
  }),
  conflicts: () => cached<SyncConflict[]>("sync-conflicts", "/sync/conflicts", []),
  backups: () => cached<BackupSnapshot[]>("backups", "/backup", []),
  createSale(payload: {
    cashierId: string;
    customerId?: string | null;
    payment: Sale["payment"];
    lines: SaleLineInput[];
  }) {
    return request<{ id: string; refNo: string; total: number }>("/sales", {
      method: "POST",
      body: JSON.stringify({
        cashierId: payload.cashierId,
        customerId: payload.customerId ?? null,
        paymentMethod: payload.payment === "voucher" ? "cash" : payload.payment,
        items: payload.lines.map((line) => ({
          productId: line.productId,
          quantity: line.qty,
          unitPrice: line.price,
          discount: line.discount
        }))
      })
    });
  },
  createProduct(payload: Record<string, unknown>) {
    return request<{ id: string }>("/products", {
      method: "POST",
      body: JSON.stringify({
        sku: payload.sku,
        barcode: payload.barcode,
        name: payload.name,
        unit: payload.unit,
        sellingPrice: payload.price ?? payload.sellingPrice ?? 0,
        reorderLevel: payload.reorder ?? payload.reorderLevel ?? 0,
        imageData: payload.imageUrl ?? payload.imageData ?? null
      })
    });
  },
  createItem(payload: Record<string, unknown>) {
    return request<{ id: string }>("/items", { method: "POST", body: JSON.stringify(payload) });
  },
  updateProduct(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        sku: payload.sku,
        barcode: payload.barcode,
        name: payload.name,
        unit: payload.unit,
        sellingPrice: payload.price ?? payload.sellingPrice,
        reorderLevel: payload.reorder ?? payload.reorderLevel,
        imageData: payload.imageUrl ?? payload.imageData
      })
    });
  },
  updateItem(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteProduct(id: string) {
    return request<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" });
  },
  createSupplier(payload: Record<string, unknown>) {
    return request<{ id: string }>("/suppliers", { method: "POST", body: JSON.stringify(payload) });
  },
  updateSupplier(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteSupplier(id: string) {
    return request<{ ok: boolean }>(`/suppliers/${id}`, { method: "DELETE" });
  },
  suspendSupplier(id: string) {
    return request<{ ok: boolean }>(`/suppliers/${id}/suspend`, { method: "POST" });
  },
  supplierStatement(id: string) {
    return request<Record<string, unknown>>(`/suppliers/${id}`);
  },
  createCustomer(payload: Record<string, unknown>) {
    return request<{ id: string }>("/customers", { method: "POST", body: JSON.stringify(payload) });
  },
  updateCustomer(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteCustomer(id: string) {
    return request<{ ok: boolean }>(`/customers/${id}`, { method: "DELETE" });
  },
  suspendCustomer(id: string) {
    return request<{ ok: boolean }>(`/customers/${id}/suspend`, { method: "POST" });
  },
  customerStatement(id: string) {
    return request<Record<string, unknown>>(`/customers/${id}`);
  },
  recordCustomerPayment(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/customers/${id}/payment`, { method: "POST", body: JSON.stringify(payload) });
  },
  createExpense(payload: Record<string, unknown>) {
    return request<{ id: string }>("/expenses", { method: "POST", body: JSON.stringify(payload) });
  },
  createPurchaseOrder(payload: Record<string, unknown>) {
    return request<{ id: string; refNo: string }>("/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
  },
  purchaseOrderDetail(id: string) {
    return request<Record<string, unknown>>(`/purchase-orders/${id}`);
  },
  emailPurchaseOrder(id: string) {
    return request<{ ok: boolean; message?: string }>(`/purchase-orders/${id}/email`, { method: "POST" });
  },
  purchaseOrderPdf(id: string) {
    return request<{ filename: string; mimeType: string; data: string }>(`/purchase-orders/${id}/pdf`);
  },
  createGrn(payload: Record<string, unknown>) {
    return request<{ id: string; refNo: string }>("/grns", { method: "POST", body: JSON.stringify(payload) });
  },
  grnDetail(id: string) {
    return request<Record<string, unknown>>(`/grns/${id}`);
  },
  createSupplierInvoice(payload: Record<string, unknown>) {
    return request<{ id: string; refNo: string }>("/supplier-invoices", { method: "POST", body: JSON.stringify(payload) });
  },
  updateSupplierInvoice(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/supplier-invoices/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  recordSupplierInvoicePayment(id: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>(`/supplier-invoices/${id}/payments`, { method: "POST", body: JSON.stringify(payload) });
  },
  deleteSupplierInvoice(id: string) {
    return request<{ ok: boolean }>(`/supplier-invoices/${id}`, { method: "DELETE" });
  },
  supplierInvoiceDetail(id: string) {
    return request<Record<string, unknown>>(`/supplier-invoices/${id}`);
  },
  createReturn(payload: Record<string, unknown>) {
    return request<{ id: string }>("/returns", { method: "POST", body: JSON.stringify(payload) });
  },
  createStockCount(payload: Record<string, unknown>) {
    return request<{ id: string }>("/stock-counts", { method: "POST", body: JSON.stringify(payload) });
  },
  createTransfer(payload: Record<string, unknown>) {
    const firstLine = Array.isArray(payload.lines) ? payload.lines[0] as Record<string, unknown> | undefined : undefined;
    return request<{ id: string }>("/transfers", {
      method: "POST",
      body: JSON.stringify({
        productId: payload.productId ?? firstLine?.productId,
        quantity: payload.quantity ?? firstLine?.qty,
        transferredBy: payload.transferredBy ?? null,
        note: payload.note ?? null
      })
    });
  },
  receiveTransfer(id: string) {
    void id;
    return Promise.resolve({ ok: true });
  },
  createBom(payload: Record<string, unknown>) {
    return request<{ id: string }>("/blueprints", { method: "POST", body: JSON.stringify(payload) });
  },
  createUser(payload: Record<string, unknown>) {
    return request<{ id: string }>("/users", { method: "POST", body: JSON.stringify(payload) });
  },
  updateUser(id: string, payload: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  adjustInventory(payload: { productId: string; outletId: string; qty: number; reason: "adjust" | "damage"; note?: string }) {
    return request<{ ok: boolean }>("/inventory/adjustments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  createProduction(payload: { bomId: string; outletId: string; qtyProduced: number; qtyWaste: number }) {
    return request<{ id: string; totalCost: number }>("/production", {
      method: "POST",
      body: JSON.stringify({
        blueprintId: payload.bomId,
        quantityToProduce: payload.qtyProduced,
        quantityProduced: payload.qtyProduced,
        quantityWasted: payload.qtyWaste
      })
    });
  },
  pushSync(payload: { deviceId: string; mutations: SyncMutation[] }) {
    return request<{ accepted: number; conflicts: SyncConflict[] }>("/sync/push", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  resolveConflict(id: string) {
    return request<{ ok: boolean }>(`/sync/conflicts/${id}/resolve`, { method: "POST" });
  },
  createBackup() {
    return request<BackupSnapshot>("/backup", { method: "POST" });
  }
};
