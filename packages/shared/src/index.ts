export type Id = string;

export type Role =
  | "super_admin"
  | "inventory_officer"
  | "production_officer"
  | "pos_cashier"
  | "finance_user"
  | "cro";

export type SyncState = "synced" | "pending" | "conflict" | "failed";

export interface SyncMeta {
  version: number;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string | null;
  syncStatus: SyncState;
}

export interface AuthUser {
  id: Id;
  name: string;
  email: string;
  username: string;
  role: Role;
}

export interface UserAccount extends AuthUser {
  status: "active" | "suspended" | "disabled";
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}

export interface Permission {
  id: string;
  label: string;
}

export interface RoleDetail {
  id: Role;
  label: string;
  permissions: Permission[];
}

export interface Category {
  id: Id;
  name: string;
}

export interface Product {
  id: Id;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: Id | null;
  categoryName?: string | null;
  unit: string;
  isRaw: boolean;
  isSellable: boolean;
  cost: number;
  price: number;
  stock: number;
  reorder: number;
  imageUrl: string | null;
  version?: number;
  updatedAt?: string;
}

export interface Supplier {
  id: Id;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note?: string | null;
  balance: number;
  status?: "active" | "suspended" | "archived" | "draft" | "disabled";
}

export interface Customer {
  id: Id;
  name: string;
  phone: string | null;
  email: string | null;
  address?: string | null;
  loyaltyPoints: number;
  creditLimit: number;
  balance: number;
  status?: "active" | "archived" | "draft" | "disabled";
}

export interface InventoryBatch {
  id: Id;
  productId: Id;
  productName: string;
  outletId: Id;
  outletName: string;
  batchNo: string;
  expiryDate: string | null;
  quantity: number;
  cost: number;
}

export interface StockMovement {
  id: number;
  productId: Id;
  productName: string;
  outletId: Id;
  movement: string;
  qty: number;
  unitCost: number;
  refType: string | null;
  refId: Id | null;
  note: string | null;
  createdAt: string;
}

export interface StockCount {
  id: Id;
  outletId: Id;
  outletName: string;
  status: "open" | "submitted" | "closed";
  createdAt: string;
  closedAt: string | null;
  variance: number;
}

export interface Transfer {
  id: Id;
  fromOutletId: Id;
  toOutletId: Id;
  fromOutletName?: string;
  toOutletName?: string;
  status: "draft" | "sent" | "received" | "cancelled";
  totalItems: number;
  createdAt: string;
}

export interface SaleLineInput {
  productId: Id;
  qty: number;
  price: number;
  discount: number;
}

export interface Sale {
  id: Id;
  refNo: string;
  date: string;
  cashierId: Id;
  customerId: Id | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment: "cash" | "card" | "mobile" | "credit" | "voucher";
  status: "completed" | "held" | "returned" | "void";
}

export interface PurchaseOrder {
  id: Id;
  refNo?: string;
  supplierId: Id;
  supplierName?: string;
  date: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  total: number;
}

export interface GoodsReceivedNote {
  id: Id;
  refNo: string;
  poId: Id | null;
  poRefNo?: string | null;
  supplierId?: Id | null;
  supplierName?: string | null;
  outletId?: Id | null;
  outletName?: string | null;
  receivedAt: string;
  receivedBy: Id | null;
  totalItems: number;
  total?: number;
  note?: string | null;
}

export interface SupplierInvoice {
  id: Id;
  refNo: string;
  supplierId: Id;
  supplierName: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  paid: number;
  status: "open" | "partial" | "paid" | "void";
  grnId?: Id | null;
  grnRefNo?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentData?: string | null;
}

export interface Bom {
  id: Id;
  productId: Id;
  productName?: string;
  name: string;
  laborCost: number;
  overhead: number;
  outputQty?: number;
  components?: { productId: Id; productName?: string; qty: number }[];
}

export interface ProductionBatch {
  id: Id;
  refNo: string;
  bomId: Id;
  bomName: string;
  outletId: Id;
  qtyProduced: number;
  qtyWaste: number;
  totalCost: number;
  producedAt: string;
}

export interface Expense {
  id: Id;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  recurring: boolean;
  dueDate?: string | null;
  outletName?: string | null;
}

export interface GlAccount {
  id: Id;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
}

export interface GlEntry {
  id: number;
  postedAt: string;
  refType: string | null;
  refId: Id | null;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface FinancialStatement {
  period: string;
  income: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  assets: number;
  liabilities: number;
  equity: number;
}

export interface ReportSummary {
  id: string;
  title: string;
  description: string;
  total: number;
  trend: number;
}

export interface AuditEntry {
  id: number;
  ts: string;
  userId: Id | null;
  action: string;
  entity: string;
  detail: string | null;
}

export interface NotificationItem {
  id: Id;
  ts: string;
  type: "low_stock" | "expiry" | "info" | "system";
  title: string;
  body: string | null;
  read: boolean;
  channel?: "in_app" | "email" | "sms" | "push";
  status?: "pending" | "sent" | "failed";
}

export interface AppSettings {
  company: {
    tradingName: string;
    currency: string;
    vatRate: number;
    address: string;
  };
  downloads: {
    androidUrl: string;
    iosUrl: string;
  };
  security: {
    requireTwoFactor: boolean;
    biometricUnlock: boolean;
    sessionAutoLockMinutes: number;
    passwordExpiryDays: number;
  };
  notifications: {
    lowStockEmailEnabled: boolean;
    expiryEmailEnabled: boolean;
  };
  emailTemplates: {
    purchaseOrderSubject: string;
    purchaseOrderBody: string;
  };
}

export const defaultAppSettings: AppSettings = {
  company: {
    tradingName: "POS & Inventory +",
    currency: "MWK",
    vatRate: 16.5,
    address: ""
  },
  downloads: {
    androidUrl: "https://expo.dev/accounts/christianbaluti/projects/pos-inventory-plus",
    iosUrl: "Ask your administrator for the TestFlight invite"
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
  },
  emailTemplates: {
    purchaseOrderSubject: "Purchase order {{refNo}} from {{companyName}}",
    purchaseOrderBody: "Dear {{supplierName}},\n\nPlease find attached purchase order {{refNo}}.\n\nRegards,\n{{companyName}}"
  }
};

export interface DashboardSummary {
  revenue14d: number;
  stockValue: number;
  transactionCount14d: number;
  lowStockCount: number;
  revenueTrend: { day: string; revenue: number }[];
  topProducts: { name: string; stock: number }[];
  profit14d?: number;
  recentActivities?: AuditEntry[];
}

export interface SyncMutation {
  id: string;
  entity: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  baseVersion?: number;
  deviceId: string;
  clientTs: string;
  attempts: number;
  status: SyncState;
}

export interface SyncConflict {
  conflictId: string;
  entity: string;
  entityId: string;
  local: unknown;
  remote: unknown;
  reason: string;
  createdAt: string;
}

export interface SyncHealth {
  online: boolean;
  pending: number;
  conflicts: number;
  failed: number;
  lastSyncedAt: string | null;
}

export interface BackupSnapshot {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  status: "ready" | "running" | "failed";
}

export interface AppBranding {
  appName: string;
  appSubtitle: string;
  logoDataUrl: string | null;
  iconDataUrl: string | null;
  logoUpdatedAt: string | null;
}

export const defaultAppBranding: AppBranding = {
  appName: "POS & Inventory +",
  appSubtitle: "Sales, stock and operations",
  logoDataUrl: null,
  iconDataUrl: null,
  logoUpdatedAt: null
};

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export const roleLabels: Record<Role, string> = {
  super_admin: "Super Administrator",
  inventory_officer: "Inventory Officer",
  production_officer: "Production Officer",
  pos_cashier: "POS Cashier",
  finance_user: "Finance User",
  cro: "Customer Relationship Officer"
};

export function formatMwk(value: number) {
  return "MWK " + value.toLocaleString("en-MW", { maximumFractionDigits: 0 });
}
