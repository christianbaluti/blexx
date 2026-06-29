import * as SQLite from "expo-sqlite";
import type { SyncMutation } from "@blex/shared";

const db = SQLite.openDatabaseSync("blex-local.db");

let initialized = false;

function randomUuid() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function initLocalDb() {
  if (initialized) return;
  db.execSync(`
    create table if not exists cache (
      key text primary key not null,
      value text not null,
      updated_at text not null
    );
    create table if not exists outbox (
      id text primary key not null,
      entity text not null,
      operation text not null,
      payload text not null,
      base_version integer,
      device_id text not null,
      client_ts text not null,
      attempts integer not null default 0,
      status text not null default 'pending'
    );
    create table if not exists conflicts (
      id text primary key not null,
      entity text not null,
      entity_id text not null,
      local_payload text not null,
      remote_payload text not null,
      reason text not null,
      created_at text not null
    );
    create table if not exists settings (
      key text primary key not null,
      value text not null,
      updated_at text not null
    );
  `);
  initialized = true;
}

export function saveCache<T>(key: string, value: T) {
  initLocalDb();
  db.runSync(
    "insert or replace into cache (key, value, updated_at) values (?, ?, ?)",
    key,
    JSON.stringify(value),
    new Date().toISOString()
  );
}

export function readCache<T>(key: string, fallback: T): T {
  initLocalDb();
  const row = db.getFirstSync<{ value: string }>("select value from cache where key = ?", key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function readCacheAsync<T>(key: string, fallback: T): Promise<T> {
  return readCache(key, fallback);
}

export function enqueueMutation(input: Omit<SyncMutation, "attempts" | "status">) {
  initLocalDb();
  db.runSync(
    `insert or replace into outbox
      (id, entity, operation, payload, base_version, device_id, client_ts, attempts, status)
     values (?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
    input.id,
    input.entity,
    input.operation,
    JSON.stringify(input.payload),
    input.baseVersion ?? null,
    input.deviceId,
    input.clientTs
  );
}

export function listOutbox(): SyncMutation[] {
  initLocalDb();
  const rows = db.getAllSync<{
    id: string;
    entity: string;
    operation: "create" | "update" | "delete";
    payload: string;
    base_version: number | null;
    device_id: string;
    client_ts: string;
    attempts: number;
    status: "synced" | "pending" | "conflict" | "failed";
  }>("select * from outbox where status in ('pending', 'failed') order by client_ts asc");
  return rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    operation: row.operation,
    payload: JSON.parse(row.payload),
    baseVersion: row.base_version ?? undefined,
    deviceId: row.device_id,
    clientTs: row.client_ts,
    attempts: row.attempts,
    status: row.status
  }));
}

export async function listOutboxAsync(): Promise<SyncMutation[]> {
  return listOutbox();
}

export function markOutboxSynced(ids: string[]) {
  updateOutboxStatus(ids, "synced");
}

export function markOutboxConflicted(ids: string[]) {
  updateOutboxStatus(ids, "conflict");
}

export function markOutboxFailed(ids: string[]) {
  updateOutboxStatus(ids, "failed");
}

function updateOutboxStatus(ids: string[], status: SyncMutation["status"]) {
  initLocalDb();
  for (const id of ids) {
    db.runSync("update outbox set status = ?, attempts = attempts + ? where id = ?", status, status === "failed" ? 1 : 0, id);
  }
}

export function outboxCounts() {
  initLocalDb();
  const rows = db.getAllSync<{ status: string; count: number }>("select status, count(*) as count from outbox group by status");
  const base = { pending: 0, failed: 0, conflict: 0 };
  for (const row of rows) {
    if (row.status === "pending" || row.status === "failed" || row.status === "conflict") {
      base[row.status] = Number(row.count);
    }
  }
  return base;
}

export async function outboxCountsAsync() {
  return outboxCounts();
}

export function getDeviceId() {
  initLocalDb();
  const row = db.getFirstSync<{ value: string }>("select value from settings where key = 'device_id'");
  if (row?.value) return row.value;
  const id = randomUuid();
  db.runSync(
    "insert or replace into settings (key, value, updated_at) values ('device_id', ?, ?)",
    id,
    new Date().toISOString()
  );
  return id;
}

export async function getDeviceIdAsync() {
  return getDeviceId();
}
