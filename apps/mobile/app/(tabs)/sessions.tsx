import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

type SessionFilter = "all" | "active" | "revoked" | "expired";

export default function Sessions() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: api.sessions });
  const revoke = useMutation({
    mutationFn: api.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] })
  });
  const filtered = useMemo(() => sessions.filter((row) => {
    const revoked = Boolean(row.revokedAt);
    const expired = row.expiresAt ? new Date(String(row.expiresAt)).getTime() < Date.now() : false;
    const status = revoked ? "revoked" : expired ? "expired" : "active";
    const haystack = [row.userName, row.deviceId, row.ip, status].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (filter === "all" || filter === status);
  }), [filter, query, sessions]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Security" title="Sessions" description="Review active devices, expiry and revoke access." />
        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search user, device or IP" style={styles.searchField} />
            </View>
            {(["all", "active", "revoked", "expired"] as SessionFilter[]).map((item) => (
              <Pressable key={item} style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => setFilter(item)}>
                <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
              </Pressable>
            ))}
            <ExportMenu title="Sessions" rows={filtered as Record<string, unknown>[]} />
          </View>
          <TableHeader columns={["User", "Device", "IP", "Status", "Expires", ""]} />
          {filtered.map((row) => {
            const id = String(row.id);
            const revoked = Boolean(row.revokedAt);
            const expired = row.expiresAt ? new Date(String(row.expiresAt)).getTime() < Date.now() : false;
            const status = revoked ? "revoked" : expired ? "expired" : "active";
            return (
              <View key={id} style={styles.row}>
                <Text style={styles.cellText}>{String(row.userName ?? row.userId)}</Text>
                <Text style={styles.mutedText}>{String(row.deviceId ?? "Unknown device")}</Text>
                <Text style={styles.mutedText}>{String(row.ip ?? "-")}</Text>
                <View style={styles.cell}><Badge tone={status === "active" ? "success" : status === "expired" ? "warning" : "danger"}>{status}</Badge></View>
                <Text style={styles.mutedText}>{row.expiresAt ? new Date(String(row.expiresAt)).toLocaleString() : "n/a"}</Text>
                <Pressable style={styles.iconButton} disabled={revoked} onPress={() => revoke.mutate(id)}>
                  <MaterialCommunityIcons name="logout" size={17} color={revoked ? colors.muted : colors.danger} />
                </Pressable>
              </View>
            );
          })}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1180, alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 240, flexGrow: 1, flexBasis: 320, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  filterChip: { minHeight: 38, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  filterChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  filterTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 110 },
  cellText: { flex: 1.2, minWidth: 150, color: colors.ink, fontWeight: "900" },
  mutedText: { flex: 1, minWidth: 130, color: colors.muted, fontSize: 12 },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line }
});
