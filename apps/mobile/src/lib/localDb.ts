import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SyncMutation } from "@blex/shared";

const CACHE_PREFIX = "blex.cache.";
const OUTBOX_KEY = "blex.outbox";
const DEVICE_ID_KEY = "blex.deviceId";

let fallbackDeviceId: string | null = null;

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

function localStorageSafe() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function initLocalDb() {
  return undefined;
}

export async function initLocalDbAsync() {
  return undefined;
}

export function saveCache<T>(key: string, value: T) {
  AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({
    value,
    updatedAt: new Date().toISOString()
  })).catch(() => undefined);
}

export function readCache<T>(_key: string, fallback: T): T {
  return fallback;
}

export async function readCacheAsync<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw).value as T;
  } catch {
    return fallback;
  }
}

export async function enqueueMutation(input: Omit<SyncMutation, "attempts" | "status">) {
  return AsyncStorage.getItem(OUTBOX_KEY)
    .then((raw) => {
      const current = raw ? JSON.parse(raw) as SyncMutation[] : [];
      const next: SyncMutation[] = [
        ...current.filter((item) => item.id !== input.id),
        { ...input, attempts: 0, status: "pending" }
      ];
      const serialized = JSON.stringify(next);
      localStorageSafe()?.setItem(OUTBOX_KEY, serialized);
      return AsyncStorage.setItem(OUTBOX_KEY, serialized);
    })
    .catch(() => undefined);
}

export function listOutbox(): SyncMutation[] {
  return [];
}

export async function listOutboxAsync(): Promise<SyncMutation[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  return raw ? JSON.parse(raw) as SyncMutation[] : [];
}

export function markOutboxSynced(ids: string[]) {
  updateOutbox(ids, "synced");
}

export function markOutboxConflicted(ids: string[]) {
  updateOutbox(ids, "conflict");
}

export function markOutboxFailed(ids: string[]) {
  updateOutbox(ids, "failed");
}

function updateOutbox(ids: string[], status: SyncMutation["status"]) {
  if (!ids.length) return;
  AsyncStorage.getItem(OUTBOX_KEY)
    .then((raw) => {
      const current = raw ? JSON.parse(raw) as SyncMutation[] : [];
      const next = current.map((item) => ids.includes(item.id) ? { ...item, status, attempts: status === "failed" ? item.attempts + 1 : item.attempts } : item);
      const serialized = JSON.stringify(next);
      localStorageSafe()?.setItem(OUTBOX_KEY, serialized);
      return AsyncStorage.setItem(OUTBOX_KEY, serialized);
    })
    .catch(() => undefined);
}

export async function outboxCountsAsync() {
  const rows = await listAllOutboxAsync();
  return summarize(rows);
}

export function outboxCounts() {
  const raw = localStorageSafe()?.getItem(OUTBOX_KEY);
  if (!raw) return { pending: 0, failed: 0, conflict: 0 };
  try {
    return summarize(JSON.parse(raw) as SyncMutation[]);
  } catch {
    return { pending: 0, failed: 0, conflict: 0 };
  }
}

async function listAllOutboxAsync(): Promise<SyncMutation[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY) ?? localStorageSafe()?.getItem(OUTBOX_KEY);
  return raw ? JSON.parse(raw) as SyncMutation[] : [];
}

function summarize(rows: SyncMutation[]) {
  return rows.reduce(
    (counts, row) => {
      if (row.status === "pending" || row.status === "failed" || row.status === "conflict") counts[row.status] += 1;
      return counts;
    },
    { pending: 0, failed: 0, conflict: 0 }
  );
}

export function getDeviceId() {
  const storage = localStorageSafe();
  const existing = storage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  if (!fallbackDeviceId) fallbackDeviceId = randomUuid();
  storage?.setItem(DEVICE_ID_KEY, fallbackDeviceId);
  AsyncStorage.setItem(DEVICE_ID_KEY, fallbackDeviceId).catch(() => undefined);
  return fallbackDeviceId;
}

export async function getDeviceIdAsync() {
  const sync = getDeviceId();
  if (sync) return sync;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = randomUuid();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  fallbackDeviceId = id;
  return id;
}
