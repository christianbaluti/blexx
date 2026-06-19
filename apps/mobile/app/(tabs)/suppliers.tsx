import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { MetricCard, PageHeader } from "../../src/components/feature-ui";
import { Button, Card, Screen } from "../../src/components/ui";
import { quickCreate } from "../../src/components/quick-create";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Suppliers() {
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const balance = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Relationships"
          title="Suppliers"
          description="Registration, balances, statements and purchase history."
          actions={quickCreate.supplier()}
        />
        <View style={styles.metrics}>
          <MetricCard label="Suppliers" value={suppliers.length} icon="truck-outline" />
          <MetricCard label="Payable balance" value={formatMwk(balance)} tone={balance ? "accent" : "default"} icon="cash-clock" />
          <MetricCard label="Statements" value="Ready" icon="file-document-outline" />
        </View>
        <View style={styles.grid}>
          {suppliers.map((supplier) => (
            <Card key={supplier.id} style={styles.supplierCard}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{supplier.name}</Text>
                  <View style={styles.details}>
                    <InfoLine icon="phone-outline" value={supplier.phone || "-"} />
                    <InfoLine icon="email-outline" value={supplier.email || "-"} />
                    <InfoLine icon="map-marker-outline" value={supplier.address || "-"} />
                  </View>
                </View>
              </View>
              <View style={styles.footer}>
                <View>
                  <Text style={styles.label}>Owed</Text>
                  <Text style={styles.balance}>{formatMwk(supplier.balance)}</Text>
                </View>
                <Button variant="outline">Statement</Button>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function InfoLine({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) {
  return (
    <View style={styles.infoLine}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.muted} />
      <Text style={styles.infoText} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  supplierCard: { flexGrow: 1, flexBasis: 320, minWidth: 280, gap: 15 },
  cardHead: { flexDirection: "row", gap: 12 },
  name: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 20, fontWeight: "700" },
  details: { gap: 6, marginTop: 10 },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  infoText: { color: colors.muted, flex: 1, fontSize: 12 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  label: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  balance: { color: colors.accent, fontFamily: typography.monoMedium, fontSize: 18, fontWeight: "900", marginTop: 4 }
});
