import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { api } from "../lib/api";
import { enqueueMutation } from "../lib/localDb";
import { createOfflineMutation, useSyncEngine } from "../lib/syncEngine";
import { colors, typography } from "../lib/theme";
import { Button, Card, Screen } from "./ui";

type Row = Record<string, unknown>;
type AnyRow = object;

export function DataModuleScreen({
  title,
  subtitle,
  queryKey,
  queryFn,
  metrics,
  primaryAction,
  secondaryActions,
  columns,
  renderRow
}: {
  title: string;
  subtitle: string;
  queryKey: string;
  queryFn: () => Promise<AnyRow[]>;
  metrics?: { label: string; value: string | number }[];
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  columns?: string[];
  renderRow?: (row: Row) => ReactNode;
}) {
  const { data = [], isLoading, isFetching } = useQuery({ queryKey: [queryKey], queryFn });

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item, index) => {
          const row = item as Row;
          return String(row.id ?? row.refNo ?? row.name ?? index);
        }}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.eyebrow}>{queryKey}</Text>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
            </View>
            <View style={styles.commandBar}>
              <Pressable style={styles.commandButton}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.ink} />
                <Text style={styles.commandText}>Search</Text>
              </Pressable>
              <Pressable style={styles.commandButton}>
                <MaterialCommunityIcons name="filter-variant" size={18} color={colors.ink} />
                <Text style={styles.commandText}>Filter</Text>
              </Pressable>
              <Pressable style={styles.commandButton}>
                <MaterialCommunityIcons name="download-outline" size={18} color={colors.ink} />
                <Text style={styles.commandText}>Export</Text>
              </Pressable>
              {secondaryActions}
              {primaryAction}
            </View>
            {metrics?.length ? (
              <View style={styles.metrics}>
                {metrics.map((metric) => (
                  <Card key={metric.label} style={styles.metric}>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <Text style={styles.metricValue}>{metric.value}</Text>
                  </Card>
                ))}
              </View>
            ) : null}
            {columns?.length ? (
              <View style={styles.tableHead}>
                {columns.map((column) => <Text key={column} style={styles.tableHeadText}>{column}</Text>)}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No records yet. New activity will appear here and sync when online.</Text> : null}
        renderItem={({ item }) => (
          <Card style={[styles.row, columns?.length ? styles.tableRow : null]}>
            {renderRow ? renderRow(item as Row) : <DefaultRow row={item as Row} />}
          </Card>
        )}
      />
    </Screen>
  );
}

export function FinanceScreen() {
  const statements = useQuery({ queryKey: ["statements"], queryFn: api.statements });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: api.ledger });
  const data = ledger.data ?? [];
  const summary = statements.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Finance</Text>
          <Text style={styles.subtitle}>General ledger, accounts receivable/payable, profit and loss, and balance sheet.</Text>
          {summary ? (
            <View style={styles.metrics}>
              <Card style={styles.metric}><Text style={styles.metricLabel}>Income</Text><Text style={styles.metricValue}>{formatMwk(summary.income)}</Text></Card>
              <Card style={styles.metric}><Text style={styles.metricLabel}>Expenses</Text><Text style={styles.metricValue}>{formatMwk(summary.expenses)}</Text></Card>
              <Card style={styles.metric}><Text style={styles.metricLabel}>Net profit</Text><Text style={styles.metricValue}>{formatMwk(summary.netProfit)}</Text></Card>
              <Card style={styles.metric}><Text style={styles.metricLabel}>Assets</Text><Text style={styles.metricValue}>{formatMwk(summary.assets)}</Text></Card>
            </View>
          ) : null}
        </View>
        {data.map((entry) => (
          <Card key={entry.id} style={styles.row}>
            <Text style={styles.rowTitle}>{entry.accountCode} - {entry.accountName}</Text>
            <Text style={styles.rowMeta}>{entry.memo ?? entry.refType ?? "Ledger entry"}</Text>
            <Text style={styles.rowValue}>Dr {formatMwk(entry.debit)} - Cr {formatMwk(entry.credit)}</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

export function SyncCenterScreen() {
  const queryClient = useQueryClient();
  const sync = useSyncEngine();
  const conflicts = useQuery({ queryKey: ["conflicts"], queryFn: api.conflicts });
  const resolve = useMutation({
    mutationFn: api.resolveConflict,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conflicts"] })
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Sync Center</Text>
          <Text style={styles.subtitle}>Local changes, background synchronization, retries and manual conflict resolution.</Text>
          <View style={styles.metrics}>
            <Card style={styles.metric}><Text style={styles.metricLabel}>Status</Text><Text style={styles.metricValue}>{sync.status}</Text></Card>
            <Card style={styles.metric}><Text style={styles.metricLabel}>Pending</Text><Text style={styles.metricValue}>{sync.summary.pending}</Text></Card>
            <Card style={styles.metric}><Text style={styles.metricLabel}>Conflicts</Text><Text style={styles.metricValue}>{sync.summary.conflicts}</Text></Card>
            <Card style={styles.metric}><Text style={styles.metricLabel}>Failed</Text><Text style={styles.metricValue}>{sync.summary.failed}</Text></Card>
          </View>
          <Button onPress={() => sync.syncNow()}>Sync now</Button>
        </View>
        {(conflicts.data ?? []).map((conflict) => (
          <Card key={conflict.conflictId} style={styles.row}>
            <Text style={styles.rowTitle}>{conflict.entity} conflict</Text>
            <Text style={styles.rowMeta}>{conflict.reason}</Text>
            <View style={styles.actionRow}>
              <Button variant="outline" onPress={() => resolve.mutate(conflict.conflictId)}>Keep server</Button>
              <Button variant="outline" onPress={() => resolve.mutate(conflict.conflictId)}>Keep local</Button>
              <Button onPress={() => resolve.mutate(conflict.conflictId)}>Mark merged</Button>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

export function BackupSettingsScreen() {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const create = useMutation({ mutationFn: api.createBackup, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }) });

  return (
    <DataModuleScreen
      title="Settings"
      subtitle="Business settings, backup snapshots, notification providers, security and local-first configuration."
      queryKey="backups"
      queryFn={api.backups}
      primaryAction={<Button onPress={() => create.mutate()}>Create backup</Button>}
      metrics={[{ label: "Backups", value: backups.data?.length ?? 0 }, { label: "Email", value: "SMTP" }, { label: "SMS", value: "Africa's Talking" }, { label: "Push", value: "Expo" }]}
      columns={["Name", "Created", "Status"]}
      renderRow={(row) => (
        <View>
          <Text style={styles.rowTitle}>{String(row.name)}</Text>
          <Text style={styles.rowMeta}>{String(row.createdAt)} - {String(row.status)}</Text>
        </View>
      )}
    />
  );
}

export function OfflineActionButton({ entity, label, payload }: { entity: string; label: string; payload: unknown }) {
  return (
    <Pressable
      style={styles.smallAction}
      onPress={() => enqueueMutation(createOfflineMutation(entity, "create", payload))}
    >
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function DefaultRow({ row }: { row: Row }) {
  const title = String(row.name ?? row.title ?? row.refNo ?? row.productName ?? row.username ?? row.action ?? row.id ?? "Record");
  const meta = Object.entries(row)
    .filter(([key]) => !["id", "name", "title"].includes(key))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" - ");
  return (
    <View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowMeta}>{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  header: { gap: 12, marginBottom: 4 },
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroText: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.accent, fontFamily: typography.sansBlack, fontSize: 11, textTransform: "uppercase" },
  title: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 31 },
  subtitle: { color: colors.muted, fontFamily: typography.sansRegular, fontSize: 14, marginTop: 4, maxWidth: 720 },
  commandBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  commandButton: { minHeight: 37, borderColor: colors.line, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface },
  commandText: { color: colors.ink, fontFamily: typography.sansBold, fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: 180, shadowOpacity: 0.03, elevation: 1 },
  metricLabel: { color: colors.muted, fontFamily: typography.sansBlack, fontSize: 11, textTransform: "uppercase" },
  metricValue: { color: colors.ink, fontFamily: typography.displayBold, marginTop: 6, fontSize: 23 },
  row: { gap: 5, borderRadius: 6, shadowOpacity: 0.03, elevation: 1 },
  tableRow: { paddingVertical: 14 },
  rowTitle: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 16 },
  rowMeta: { color: colors.muted, fontFamily: typography.sansRegular, marginTop: 4 },
  rowValue: { color: colors.accent, fontFamily: typography.sansBlack, marginTop: 5 },
  empty: { color: colors.muted, fontFamily: typography.sansMedium, textAlign: "center", padding: 32 },
  tableHead: { flexDirection: "row", gap: 12, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 12 },
  tableHeadText: { flex: 1, color: colors.muted, fontFamily: typography.sansBlack, fontSize: 11, textTransform: "uppercase" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  smallAction: { minHeight: 37, borderColor: colors.line, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center", backgroundColor: colors.accent },
  smallActionText: { color: "#fff", fontFamily: typography.sansBold }
});
