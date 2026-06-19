import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SyncMutation } from "@blex/shared";

const CACHE_PREFIX = "blex.cache.";
const OUTBOX_KEY = "blex.outbox";

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

export function enqueueMutation(input: Omit<SyncMutation, "attempts" | "status">) {
  AsyncStorage.getItem(OUTBOX_KEY)
    .then((raw) => {
      const current = raw ? JSON.parse(raw) as SyncMutation[] : [];
      const next: SyncMutation[] = [
        ...current.filter((item) => item.id !== input.id),
        { ...input, attempts: 0, status: "pending" }
      ];
      return AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
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
  AsyncStorage.getItem(OUTBOX_KEY)
    .then((raw) => {
      const current = raw ? JSON.parse(raw) as SyncMutation[] : [];
      const next = current.map((item) => ids.includes(item.id) ? { ...item, status: "synced" as const } : item);
      return AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
    })
    .catch(() => undefined);
}

export function outboxCounts() {
  return { pending: 0, failed: 0, conflict: 0 };
}
