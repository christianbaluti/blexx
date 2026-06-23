import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

export default function Permissions() {
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState("all");
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: api.roles });
  const rows = useMemo(() => roles.flatMap((role) => role.permissions.map((permission) => ({
    id: permission.id,
    label: permission.label,
    roleId: role.id,
    roleLabel: role.label
  }))), [roles]);
  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = [row.id, row.label, row.roleLabel].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (roleId === "all" || row.roleId === roleId);
  }), [query, roleId, rows]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Admin" title="Permissions" description="Search role capabilities and export the access matrix." />
        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search permissions or roles" style={styles.searchField} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {[{ id: "all", label: "All roles" }, ...roles].map((role) => (
                <Text key={role.id} onPress={() => setRoleId(role.id)} style={[styles.filterChip, roleId === role.id && styles.filterChipActive]}>
                  {role.label}
                </Text>
              ))}
            </ScrollView>
            <ExportMenu title="Permissions" rows={filtered} />
          </View>
          <TableHeader columns={["Permission", "Label", "Role"]} />
          {filtered.map((row) => (
            <View key={`${row.roleId}-${row.id}`} style={styles.row}>
              <Text style={styles.idCell}>{row.id}</Text>
              <Text style={styles.cell}>{row.label}</Text>
              <View style={styles.badgeCell}><Badge tone="muted">{row.roleLabel}</Badge></View>
            </View>
          ))}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1100, alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 240, flexGrow: 1, flexBasis: 320, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  filters: { gap: 6, alignItems: "center" },
  filterChip: { minHeight: 38, textAlignVertical: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, color: colors.muted, paddingHorizontal: 10, paddingTop: 10, fontWeight: "900" },
  filterChipActive: { color: colors.sidebarText, backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  idCell: { flex: 1, minWidth: 170, color: colors.ink, fontWeight: "900" },
  cell: { flex: 1.5, minWidth: 180, color: colors.ink },
  badgeCell: { flex: 1, minWidth: 140 }
});
