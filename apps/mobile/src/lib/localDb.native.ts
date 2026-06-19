import * as SQLite from "expo-sqlite";
import type { SyncMutation } from "@blex/shared";

const db = SQLite.openDatabaseSync("blex-local.db");

let initialized = false;

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
  initLocalDb();
  for (const id of ids) {
    db.runSync("update outbox set status = 'synced' where id = ?", id);
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
