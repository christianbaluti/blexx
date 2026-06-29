import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

const clientReferencedRoutes = [
  ["GET", "/returns"],
  ["POST", "/returns"],
  ["GET", "/audit"],
  ["GET", "/permissions"],
  ["GET", "/sessions"],
  ["POST", "/sessions/:id/revoke"],
  ["GET", "/sync/health"],
  ["POST", "/sync/push"],
  ["GET", "/sync/pull"],
  ["GET", "/sync/conflicts"],
  ["POST", "/sync/conflicts/:id/resolve"],
  ["GET", "/backup"],
  ["POST", "/backup"],
  ["GET", "/backup/:id"],
  ["GET", "/categories"],
  ["POST", "/expenses"],
  ["GET", "/stock-counts"],
  ["POST", "/stock-counts"],
  ["GET", "/stock-counts/:id"],
  ["PATCH", "/stock-counts/:id"],
  ["POST", "/stock-counts/:id/submit"],
  ["POST", "/stock-counts/:id/cancel"],
  ["POST", "/stock-counts/:id/close"],
  ["DELETE", "/items/:id"],
  ["POST", "/transfers/:id/send"],
  ["POST", "/transfers/:id/receive"],
  ["POST", "/transfers/:id/cancel"],
  ["POST", "/sales/:id/void"],
  ["GET", "/settings/branding"],
  ["PATCH", "/settings/branding"],
  ["PATCH", "/blueprints/:id"],
  ["POST", "/blueprints/:id/archive"],
  ["POST", "/production/plans"],
  ["POST", "/production/:id/start"],
  ["POST", "/production/:id/complete"],
  ["POST", "/production/:id/cancel"],
  ["GET", "/finance/transactions"],
  ["GET", "/customer-invoices"],
  ["GET", "/customer-invoices/:id"],
  ["POST", "/customer-invoices/:id/payments"],
  ["GET", "/supplier-returns"],
  ["GET", "/supplier-returns/:id"],
  ["POST", "/supplier-returns"]
] as const;

test("backend implements client-referenced endpoints", async () => {
  const app = await createApp();
  await app.ready();
  try {
    for (const [method, url] of clientReferencedRoutes) {
      assert.equal(app.hasRoute({ method, url }), true, `${method} ${url} is not registered`);
    }
  } finally {
    await app.close();
  }
});
