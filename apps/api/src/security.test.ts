import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

test("public health routes stay open", async () => {
  const app = await createApp();
  await app.ready();
  try {
    const root = await app.inject({ method: "GET", url: "/" });
    assert.equal(root.statusCode, 200);

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("core routes require JWT authentication", async () => {
  const app = await createApp();
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/dashboard" });
    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("wrong role cannot access admin routes", async () => {
  const app = await createApp();
  await app.ready();
  try {
    const token = app.jwt.sign({ sub: "00000000-0000-0000-0000-000000000001", role: "pos_cashier" });
    const response = await app.inject({
      method: "GET",
      url: "/users",
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("login route is public and validates input instead of requiring JWT", async () => {
  const app = await createApp();
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {}
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});
