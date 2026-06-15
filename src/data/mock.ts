// Mock data layer — mirrors the MySQL schema in /db/mysql.
// Swap src/lib/api/client.ts to point at a real API later; call sites won't change.

export type ID = string;

export interface Category { id: ID; name: string; }
export interface Product {
  id: ID; sku: string; barcode: string; name: string; categoryId: ID;
  unit: string; cost: number; price: number; stock: number; reorder: number; image?: string;
}
export interface Supplier {
  id: ID; name: string; phone: string; email: string; address: string;
  balance: number; openingBalance: number;
}
export interface Customer {
  id: ID; name: string; phone: string; email: string;
  loyaltyPoints: number; creditLimit: number; balance: number;
}
export interface SaleLine { productId: ID; qty: number; price: number; discount: number; }
export interface Sale {
  id: ID; date: string; cashierId: ID; customerId?: ID;
  lines: SaleLine[]; subtotal: number; discount: number; tax: number; total: number;
  payment: "cash" | "card" | "mobile" | "credit"; status: "completed" | "held" | "returned";
}
export interface PurchaseOrder {
  id: ID; supplierId: ID; date: string; status: "draft" | "ordered" | "received" | "cancelled";
  total: number;
}
export interface Bom {
  id: ID; productId: ID; name: string;
  components: { materialId: ID; qty: number }[];
  laborCost: number; overhead: number;
}
export interface Expense {
  id: ID; date: string; category: string; description: string; amount: number; recurring: boolean;
}
export interface AuditEntry {
  id: ID; ts: string; userId: ID; action: string; entity: string; detail: string;
}
export interface NotificationItem {
  id: ID; ts: string; type: "low_stock" | "expiry" | "info"; title: string; body: string; read: boolean;
}

export const categories: Category[] = [
  { id: "c1", name: "Beverages" }, { id: "c2", name: "Bakery" },
  { id: "c3", name: "Dairy" }, { id: "c4", name: "Household" },
  { id: "c5", name: "Raw Materials" },
];

export const products: Product[] = [
  { id: "p1", sku: "BEV-001", barcode: "6001001000019", name: "Maheu 500ml",     categoryId: "c1", unit: "btl", cost: 280,  price: 450,  stock: 124, reorder: 30 },
  { id: "p2", sku: "BEV-002", barcode: "6001001000026", name: "Cola 330ml",      categoryId: "c1", unit: "can", cost: 320,  price: 550,  stock: 18,  reorder: 24 },
  { id: "p3", sku: "BAK-001", barcode: "6001002000013", name: "White Loaf",      categoryId: "c2", unit: "ea",  cost: 700,  price: 1100, stock: 42,  reorder: 20 },
  { id: "p4", sku: "BAK-002", barcode: "6001002000020", name: "Brown Loaf",      categoryId: "c2", unit: "ea",  cost: 750,  price: 1200, stock: 9,   reorder: 20 },
  { id: "p5", sku: "DAI-001", barcode: "6001003000017", name: "Milk 1L",         categoryId: "c3", unit: "ea",  cost: 1100, price: 1650, stock: 60,  reorder: 25 },
  { id: "p6", sku: "DAI-002", barcode: "6001003000024", name: "Yoghurt 250g",    categoryId: "c3", unit: "ea",  cost: 480,  price: 800,  stock: 88,  reorder: 30 },
  { id: "p7", sku: "HSE-001", barcode: "6001004000011", name: "Dish Soap 500ml", categoryId: "c4", unit: "ea",  cost: 950,  price: 1500, stock: 53,  reorder: 15 },
  { id: "p8", sku: "RAW-001", barcode: "6001005000018", name: "Flour 50kg",      categoryId: "c5", unit: "bag", cost: 38000,price: 0,    stock: 14,  reorder: 5 },
  { id: "p9", sku: "RAW-002", barcode: "6001005000025", name: "Sugar 50kg",      categoryId: "c5", unit: "bag", cost: 42000,price: 0,    stock: 8,   reorder: 5 },
];

export const suppliers: Supplier[] = [
  { id: "s1", name: "Lilongwe Mills Ltd", phone: "+265 999 111 222", email: "sales@llmills.mw", address: "Area 6, Lilongwe", balance: 1_250_000, openingBalance: 0 },
  { id: "s2", name: "Blantyre Beverages",  phone: "+265 999 333 444", email: "orders@bb.mw",     address: "Limbe, Blantyre",  balance: 320_000,   openingBalance: 0 },
  { id: "s3", name: "Mzuzu Dairy Co-op",   phone: "+265 999 555 666", email: "hello@mzdairy.mw", address: "Mzuzu",            balance: 78_500,    openingBalance: 0 },
];

export const customers: Customer[] = [
  { id: "cu1", name: "Walk-in",          phone: "",                 email: "",                 loyaltyPoints: 0,    creditLimit: 0,       balance: 0 },
  { id: "cu2", name: "Sana Restaurant",  phone: "+265 888 100 200", email: "sana@example.mw",  loyaltyPoints: 1240, creditLimit: 500_000, balance: 125_000 },
  { id: "cu3", name: "Lakeview Lodge",   phone: "+265 888 300 400", email: "ops@lakeview.mw",  loyaltyPoints: 540,  creditLimit: 300_000, balance: 0 },
  { id: "cu4", name: "Daniel Mhango",    phone: "+265 999 700 800", email: "dm@example.mw",    loyaltyPoints: 80,   creditLimit: 0,       balance: 0 },
];

const today = new Date();
const d = (offset: number) => new Date(today.getTime() - offset * 86400000).toISOString();

export const sales: Sale[] = Array.from({ length: 24 }).map((_, i) => {
  const line1 = { productId: "p1", qty: 2 + (i % 3), price: 450, discount: 0 };
  const line2 = { productId: "p3", qty: 1 + (i % 2), price: 1100, discount: 0 };
  const sub = line1.qty * line1.price + line2.qty * line2.price;
  return {
    id: `sl${1000 + i}`, date: d(i), cashierId: "u4",
    customerId: i % 4 === 0 ? "cu2" : "cu1",
    lines: [line1, line2],
    subtotal: sub, discount: 0, tax: Math.round(sub * 0.165), total: Math.round(sub * 1.165),
    payment: (["cash", "card", "mobile"] as const)[i % 3],
    status: "completed",
  };
});

export const purchaseOrders: PurchaseOrder[] = [
  { id: "po1", supplierId: "s1", date: d(2), status: "received",  total: 1_900_000 },
  { id: "po2", supplierId: "s2", date: d(5), status: "ordered",   total: 480_000 },
  { id: "po3", supplierId: "s3", date: d(8), status: "draft",     total: 156_000 },
];

export const boms: Bom[] = [
  { id: "b1", productId: "p3", name: "White Loaf — batch of 100",
    components: [{ materialId: "p8", qty: 8 }, { materialId: "p9", qty: 1 }],
    laborCost: 12000, overhead: 6500 },
];

export const expenses: Expense[] = [
  { id: "e1", date: d(1), category: "Rent",     description: "Outlet rent — Sept",     amount: 850_000, recurring: true  },
  { id: "e2", date: d(2), category: "Salaries", description: "Payroll — Sept (part)",  amount: 2_400_000, recurring: true },
  { id: "e3", date: d(3), category: "Utilities",description: "ESCOM electricity",      amount: 178_000, recurring: true  },
  { id: "e4", date: d(4), category: "Transport",description: "Delivery fuel",          amount: 92_500,  recurring: false },
  { id: "e5", date: d(6), category: "Marketing",description: "Radio spot — Capital FM",amount: 320_000, recurring: false },
  { id: "e6", date: d(7), category: "Packaging",description: "Bread bags 5000ct",      amount: 145_000, recurring: false },
];

export const auditLog: AuditEntry[] = [
  { id: "a1", ts: d(0), userId: "u1", action: "user.create",    entity: "user:u6",   detail: "Created Tamanda Kaunda (CRO)" },
  { id: "a2", ts: d(0), userId: "u4", action: "sale.complete",  entity: "sale:sl1000",detail: "Cash sale MWK 2,330" },
  { id: "a3", ts: d(1), userId: "u2", action: "stock.adjust",   entity: "product:p2",detail: "Damage adjustment -3 units" },
  { id: "a4", ts: d(1), userId: "u5", action: "expense.create", entity: "exp:e3",    detail: "Logged ESCOM utility 178,000" },
  { id: "a5", ts: d(2), userId: "u3", action: "production.run", entity: "bom:b1",    detail: "Produced 100 loaves" },
];

export const notifications: NotificationItem[] = [
  { id: "n1", ts: d(0), type: "low_stock", title: "Cola 330ml below reorder",     body: "Stock 18 / reorder 24",  read: false },
  { id: "n2", ts: d(0), type: "low_stock", title: "Brown Loaf below reorder",      body: "Stock 9 / reorder 20",   read: false },
  { id: "n3", ts: d(1), type: "expiry",    title: "Milk 1L batch expires in 3d",   body: "Batch MB-09-22, 24 units", read: true  },
];

export const formatMwk = (n: number) =>
  "MWK " + n.toLocaleString("en-MW", { maximumFractionDigits: 0 });
