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
  ["GET", "/categories"],
  ["POST", "/expenses"],
  ["GET", "/stock-counts"],
  ["POST", "/stock-counts"],
  ["POST", "/transfers/:id/send"],
  ["POST", "/transfers/:id/receive"],
  ["POST", "/transfers/:id/cancel"],
  ["POST", "/sales/:id/void"],
  ["GET", "/settings/branding"],
  ["PATCH", "/settings/branding"]
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
