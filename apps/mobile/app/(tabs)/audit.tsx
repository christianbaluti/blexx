import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuditEntry } from "@blex/shared";
import { Badge, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Audit() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const { data: log = [] } = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name ?? id ?? "System";
  const filtered = useMemo(() => log.filter((entry) => {
    const haystack = [entry.action, entry.entity, entry.detail, userName(entry.userId)].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [log, query, users]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Compliance" title="Audit trail" description="Every action, by every user, with full context." />
        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search action, user, entity or detail" style={styles.searchField} />
            </View>
            <ExportMenu title="Audit trail" rows={filtered.map((entry) => ({ ...entry, user: userName(entry.userId) }))} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.tableMin}>
              <TableHeader columns={["When", "User", "Action", "Entity", "Detail"]} />
              {filtered.map((entry) => (
                <Pressable key={entry.id} style={styles.row} onPress={() => setSelected(entry)}>
                  <Text style={styles.mutedText}>{new Date(entry.ts).toLocaleString()}</Text>
                  <Text style={styles.cellText}>{userName(entry.userId)}</Text>
                  <View style={styles.cell}><Badge tone="muted">{entry.action}</Badge></View>
                  <Text style={styles.monoCell}>{entry.entity}</Text>
                  <Text style={styles.detail} numberOfLines={2}>{entry.detail ?? "-"}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </TableCard>
      </ScrollView>
      <AuditDetail entry={selected} userName={userName} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function AuditDetail({ entry, userName, onClose }: { entry: AuditEntry | null; userName: (id: string | null) => string; onClose: () => void }) {
  return (
    <Modal visible={Boolean(entry)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{entry?.action}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.detailLine}>When: {entry ? new Date(entry.ts).toLocaleString() : ""}</Text>
          <Text style={styles.detailLine}>User: {entry ? userName(entry.userId) : ""}</Text>
          <Text style={styles.detailLine}>Entity: {entry?.entity}</Text>
          <Text style={styles.detailBody}>{entry?.detail ?? "No additional detail."}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 240, flexGrow: 1, flexBasis: 340, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  tableMin: { minWidth: 900 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 130 },
  mutedText: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12 },
  cellText: { flex: 1, minWidth: 140, color: colors.ink, fontWeight: "800" },
  monoCell: { flex: 1, minWidth: 130, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 11 },
  detail: { flex: 1.8, minWidth: 220, color: colors.ink, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { width: "100%", maxWidth: 540, gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, padding: 16 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  panelTitle: { flex: 1, color: colors.ink, fontSize: 20, fontWeight: "900" },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  detailLine: { color: colors.muted, fontSize: 12 },
  detailBody: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 8 }
});
