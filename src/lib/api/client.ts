// Single-point API client. Today returns local mock data with a small latency
// to mimic real fetches. To go live: replace these implementations with calls
// to your MySQL-backed API. Call sites in the app do not change.

import {
  products, categories, suppliers, customers, sales, purchaseOrders,
  boms, expenses, auditLog, notifications,
} from "@/data/mock";

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const api = {
  async listProducts() { await wait(); return products; },
  async listCategories() { await wait(); return categories; },
  async listSuppliers() { await wait(); return suppliers; },
  async listCustomers() { await wait(); return customers; },
  async listSales() { await wait(); return sales; },
  async listPurchaseOrders() { await wait(); return purchaseOrders; },
  async listBoms() { await wait(); return boms; },
  async listExpenses() { await wait(); return expenses; },
  async listAudit() { await wait(); return auditLog; },
  async listNotifications() { await wait(); return notifications; },
};
