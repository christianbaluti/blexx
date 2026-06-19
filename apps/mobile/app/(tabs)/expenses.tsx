import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Card, Screen } from "../../src/components/ui";
import { quickCreate } from "../../src/components/quick-create";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

const iconByCategory: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Rent: "office-building-outline",
  Transport: "truck-outline",
  Salaries: "account-group-outline",
  Marketing: "bullhorn-outline",
  Packaging: "package-variant",
  Utilities: "lightning-bolt-outline",
  Logistics: "truck-delivery-outline",
  Payroll: "account-cash-outline"
};

export default function Expenses() {
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.expenses });
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = expenses.reduce<Record<string, number>>((acc, expense) => {
    acc[expense.category] = (acc[expense.category] ?? 0) + expense.amount;
    return acc;
  }, {});

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Finance"
          title="Expenses"
          description="Rent, transport, salaries, marketing, packaging, utilities and custom categories."
          actions={quickCreate.expense("60000000-0000-0000-0000-000000000002", "10000000-0000-0000-0000-000000000001")}
        />
        <View style={styles.categoryGrid}>
          {Object.entries(byCategory).map(([category, amount]) => {
            const pct = total ? Math.max(4, (amount / total) * 100) : 0;
            return (
              <Card key={category} style={styles.categoryCard}>
                <MaterialCommunityIcons name={iconByCategory[category] ?? "receipt-text-outline"} size={20} color={colors.accent} />
                <Text style={styles.categoryLabel}>{category}</Text>
                <Text style={styles.categoryAmount}>{formatMwk(amount)}</Text>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View>
              </Card>
            );
          })}
        </View>
        <TableCard>
          <TableHeader columns={["Date", "Category", "Description", "Type", "Amount"]} />
          {expenses.map((expense) => (
            <View key={expense.id} style={styles.row}>
              <Text style={styles.mutedText}>{new Date(expense.date).toLocaleDateString()}</Text>
              <View style={styles.cell}><Badge tone="muted">{expense.category}</Badge></View>
              <Text style={styles.cellText}>{expense.description ?? "-"}</Text>
              <View style={styles.cell}>
                <View style={styles.typeRow}>
                  {expense.recurring ? <MaterialCommunityIcons name="repeat" size={14} color={colors.muted} /> : null}
                  <Text style={styles.mutedText}>{expense.recurring ? "Recurring" : "One-off"}</Text>
                </View>
              </View>
              <Text style={styles.rightCell}>{formatMwk(expense.amount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMwk(total)}</Text>
          </View>
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryCard: { flexGrow: 1, flexBasis: 170, minWidth: 150, gap: 6 },
  categoryLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  categoryAmount: { color: colors.ink, fontFamily: typography.monoMedium, fontWeight: "900" },
  progressTrack: { height: 5, borderRadius: 999, overflow: "hidden", backgroundColor: colors.surfaceAlt, marginTop: 4 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.accent },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 110 },
  cellText: { flex: 1.6, minWidth: 180, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 110, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 18, backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 12 },
  totalLabel: { color: colors.ink, fontWeight: "900" },
  totalValue: { color: colors.ink, fontFamily: typography.monoMedium, fontSize: 15, fontWeight: "900" }
});
