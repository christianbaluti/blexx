import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { CommandButton, PageHeader } from "../../src/components/feature-ui";
import { Card, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

const defaults = [
  { icon: "chart-bar", title: "Sales reports", description: "Daily, weekly, by cashier, product and payment method." },
  { icon: "warehouse", title: "Inventory reports", description: "Stock valuation, movement, ageing and slow movers." },
  { icon: "finance", title: "Finance reports", description: "P&L, balance sheet, trial balance and tax summary." },
  { icon: "account-group-outline", title: "Customer reports", description: "Top customers, loyalty earnings and credit ageing." },
  { icon: "truck-outline", title: "Supplier reports", description: "Purchase history, balances and payment due ageing." },
  { icon: "factory", title: "Production reports", description: "Batch output, waste, material usage and cost variances." }
] as const;

export default function Reports() {
  const { data: reports = [] } = useQuery({ queryKey: ["reports"], queryFn: api.reports });
  const cards = defaults.map((item) => {
    const match = reports.find((report) => report.title.toLowerCase().includes(item.title.split(" ")[0].toLowerCase()));
    return { ...item, total: match?.total, trend: match?.trend };
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Insights"
          title="Reports & analytics"
          description="Exportable views over sales, inventory, finance, customers, suppliers, audit and production."
          actions={<CommandButton icon="download-outline" label="Export pack" primary />}
        />
        <View style={styles.grid}>
          {cards.map((report) => (
            <Card key={report.title} style={styles.card}>
              <View style={styles.iconBox}>
                <MaterialCommunityIcons name={report.icon} size={20} color={colors.accent} />
              </View>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle}>{report.title}</Text>
                <MaterialCommunityIcons name="arrow-right" size={17} color={colors.muted} />
              </View>
              <Text style={styles.cardText}>{report.description}</Text>
              {typeof report.total === "number" ? (
                <View style={styles.reportMeta}>
                  <Text style={styles.reportValue}>{report.total > 999 ? formatMwk(report.total) : report.total}</Text>
                  <Text style={[styles.trend, (report.trend ?? 0) < 0 && { color: colors.danger }]}>{report.trend ?? 0}%</Text>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexGrow: 1, flexBasis: 310, minWidth: 270, gap: 10 },
  iconBox: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.accentSoft },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 20, fontWeight: "700" },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  reportMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4 },
  reportValue: { color: colors.ink, fontFamily: typography.monoMedium, fontWeight: "900" },
  trend: { color: colors.success, fontWeight: "900" }
});
