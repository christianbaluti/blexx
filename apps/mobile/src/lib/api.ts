import type {
  AuditEntry,
  AppBranding,
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
  headers.set("content-type", "application/json");
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
  branding: () => cached<AppBranding>("branding", "/settings/branding", defaultAppBranding),
  updateBranding(payload: AppBranding) {
    return request<AppBranding>("/settings/branding", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  dashboard: () => cached<DashboardSummary>("dashboard", "/dashboard", {
    revenue14d: 0,
    stockValue: 0,
    transactionCount14d: 0,
    lowStockCount: 0,
    revenueTrend: [],
    topProducts: []
  }),
  products: () => cached<Product[]>("products", "/products", []),
  categories: () => cached<Category[]>("categories", "/categories", []),
  suppliers: () => cached<Supplier[]>("suppliers", "/suppliers", []),
  customers: () => cached<Customer[]>("customers", "/customers", []),
  sales: () => cached<Sale[]>("sales", "/sales", []),
  purchaseOrders: () => cached<PurchaseOrder[]>("purchase-orders", "/purchase-orders", []),
  returns: () => cached<Record<string, unknown>[]>("returns", "/returns", []),
  receipts: () => cached<Record<string, unknown>[]>("receipts", "/receipts", []),
  expenses: () => cached<Expense[]>("expenses", "/expenses", []),
  audit: () => cached<AuditEntry[]>("audit", "/audit", []),
  notifications: () => cached<NotificationItem[]>("notifications", "/notifications", []),
  users: () => cached<UserAccount[]>("users", "/users", []),
  roles: () => cached<RoleDetail[]>("roles", "/roles", []),
  inventory: () => cached<Record<string, unknown>[]>("inventory", "/inventory", []),
  batches: () => cached<InventoryBatch[]>("inventory-batches", "/inventory/batches", []),
  movements: () => cached<StockMovement[]>("inventory-movements", "/inventory/movements", []),
  stockCounts: () => cached<StockCount[]>("stock-counts", "/stock-counts", []),
  transfers: () => cached<Transfer[]>("transfers", "/transfers", []),
  boms: () => cached<Bom[]>("boms", "/boms", []),
  production: () => cached<ProductionBatch[]>("production", "/production", []),
  grn: () => cached<GoodsReceivedNote[]>("grn", "/grn", []),
  supplierInvoices: () => cached<SupplierInvoice[]>("supplier-invoices", "/supplier-invoices", []),
  loyalty: () => cached<Record<string, unknown>[]>("loyalty", "/loyalty", []),
  credit: () => cached<Record<string, unknown>[]>("credit", "/credit", []),
  permissions: () => cached<Record<string, unknown>[]>("permissions", "/permissions", []),
  sessions: () => cached<Record<string, unknown>[]>("sessions", "/sessions", []),
  glAccounts: () => cached<GlAccount[]>("gl-accounts", "/finance/accounts", []),
  ledger: () => cached<GlEntry[]>("ledger", "/finance/ledger", []),
  statements: () => cached<FinancialStatement>("statements", "/finance/statements", {
    period: "Offline",
    income: 0,
    expenses: 0,
    grossProfit: 0,
    netProfit: 0,
    assets: 0,
    liabilities: 0,
    equity: 0
  }),
  reports: () => cached<ReportSummary[]>("reports", "/reports", []),
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
      body: JSON.stringify(payload)
    });
  },
  createProduct(payload: Record<string, unknown>) {
    return request<{ id: string }>("/products", { method: "POST", body: JSON.stringify(payload) });
  },
  createSupplier(payload: Record<string, unknown>) {
    return request<{ id: string }>("/suppliers", { method: "POST", body: JSON.stringify(payload) });
  },
  createCustomer(payload: Record<string, unknown>) {
    return request<{ id: string }>("/customers", { method: "POST", body: JSON.stringify(payload) });
  },
  createExpense(payload: Record<string, unknown>) {
    return request<{ id: string }>("/expenses", { method: "POST", body: JSON.stringify(payload) });
  },
  createPurchaseOrder(payload: Record<string, unknown>) {
    return request<{ id: string; refNo: string }>("/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
  },
  createReturn(payload: Record<string, unknown>) {
    return request<{ id: string }>("/returns", { method: "POST", body: JSON.stringify(payload) });
  },
  createStockCount(payload: Record<string, unknown>) {
    return request<{ id: string }>("/stock-counts", { method: "POST", body: JSON.stringify(payload) });
  },
  createTransfer(payload: Record<string, unknown>) {
    return request<{ id: string }>("/transfers", { method: "POST", body: JSON.stringify(payload) });
  },
  createUser(payload: Record<string, unknown>) {
    return request<{ id: string }>("/users", { method: "POST", body: JSON.stringify(payload) });
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
      body: JSON.stringify(payload)
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
