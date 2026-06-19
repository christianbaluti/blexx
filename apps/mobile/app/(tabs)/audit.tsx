import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Audit() {
  const { data: log = [] } = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name ?? id ?? "System";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Compliance" title="Audit trail" description="Every action, by every user, with full context." />
        <TableCard>
          <TableHeader columns={["When", "User", "Action", "Entity", "Detail"]} />
          {log.map((entry) => (
            <View key={entry.id} style={styles.row}>
              <Text style={styles.mutedText}>{new Date(entry.ts).toLocaleString()}</Text>
              <Text style={styles.cellText}>{userName(entry.userId)}</Text>
              <View style={styles.cell}><Badge tone="muted">{entry.action}</Badge></View>
              <Text style={styles.monoCell}>{entry.entity}</Text>
              <Text style={styles.detail}>{entry.detail ?? "-"}</Text>
            </View>
          ))}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 130 },
  mutedText: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12 },
  cellText: { flex: 1, minWidth: 140, color: colors.ink, fontWeight: "800" },
  monoCell: { flex: 1, minWidth: 130, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 11 },
  detail: { flex: 1.8, minWidth: 220, color: colors.ink, fontSize: 12 }
});
