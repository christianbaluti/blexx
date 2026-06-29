import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { SyncHealth, SyncMutation } from "@blex/shared";
import { api } from "./api";
import { getDeviceId, getDeviceIdAsync, listOutboxAsync, markOutboxConflicted, markOutboxFailed, markOutboxSynced, outboxCounts, saveCache } from "./localDb";
import { useNetworkStatus } from "./network";

export function useSyncEngine() {
  const queryClient = useQueryClient();
  const online = useNetworkStatus();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const localCounts = outboxCounts();
  const health = useQuery({ queryKey: ["sync-health"], queryFn: api.syncHealth, enabled: online, refetchInterval: 15_000 });

  const sync = useMutation({
    mutationFn: async () => {
      const mutations = await listOutboxAsync();
      const result = mutations.length
        ? await api.pushSync({ deviceId: await getDeviceIdAsync(), mutations })
        : { accepted: 0, acceptedIds: [], conflicts: [] };
      const acceptedIds = result.acceptedIds ?? [];
      const conflictIds = result.conflicts.map((conflict) => conflict.entityId).filter(Boolean);
      const unresolvedIds = mutations
        .map((mutation) => mutation.id)
        .filter((id) => !acceptedIds.includes(id) && !conflictIds.includes(id));
      markOutboxSynced(acceptedIds);
      markOutboxConflicted(conflictIds);
      markOutboxFailed(unresolvedIds);
      const pulled = await api.pullSync();
      saveCache("sync-pull", pulled);
      saveCache("customers", pulled.customers);
      saveCache("products", pulled.products);
      saveCache("shop-stock", pulled.shopStock);
      return result;
    },
    onSuccess: async () => {
      setLastSyncedAt(new Date().toISOString());
      await queryClient.invalidateQueries();
    }
  });

  useEffect(() => {
    if (online && localCounts.pending > 0 && !sync.isPending) {
      sync.mutate();
    }
  }, [online, localCounts.pending, sync]);

  const status = useMemo(() => {
    if (!online) return "offline";
    if (sync.isPending) return "syncing";
    if ((health.data?.conflicts ?? localCounts.conflict) > 0) return "conflicts";
    if ((health.data?.failed ?? localCounts.failed) > 0) return "failed";
    if (localCounts.pending > 0) return "pending";
    return "online";
  }, [health.data, localCounts.conflict, localCounts.failed, localCounts.pending, online, sync.isPending]);

  const summary: SyncHealth = {
    online,
    pending: localCounts.pending + (health.data?.pending ?? 0),
    conflicts: localCounts.conflict + (health.data?.conflicts ?? 0),
    failed: localCounts.failed + (health.data?.failed ?? 0),
    lastSyncedAt: lastSyncedAt ?? health.data?.lastSyncedAt ?? null
  };

  return { status, summary, syncNow: sync.mutate, syncing: sync.isPending };
}

export function createOfflineMutation(entity: string, operation: SyncMutation["operation"], payload: unknown): Omit<SyncMutation, "attempts" | "status"> {
  return {
    id: randomUuid(),
    entity,
    operation,
    payload,
    deviceId: getDeviceId(),
    clientTs: new Date().toISOString()
  };
}

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
