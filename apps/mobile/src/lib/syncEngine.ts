import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { SyncHealth, SyncMutation } from "@blex/shared";
import { api } from "./api";
import { listOutboxAsync, markOutboxSynced, outboxCounts } from "./localDb";
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
      if (!mutations.length) return { accepted: 0, conflicts: [] };
      const result = await api.pushSync({ deviceId: getDeviceId(), mutations });
      markOutboxSynced(mutations.map((item) => item.id));
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
    id: `${entity}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entity,
    operation,
    payload,
    deviceId: getDeviceId(),
    clientTs: new Date().toISOString()
  };
}

function getDeviceId() {
  return "local-device";
}
