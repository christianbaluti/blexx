import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Screen } from "../../src/components/ui";
import { quickCreate } from "../../src/components/quick-create";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Customers() {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const loyaltyTotal = customers.reduce((sum, customer) => sum + customer.loyaltyPoints, 0);
  const receivable = customers.reduce((sum, customer) => sum + customer.balance, 0);
  const creditLimit = customers.reduce((sum, customer) => sum + customer.creditLimit, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Relationships"
          title="Customers"
          description="Profiles, loyalty programme, credit limits and purchase history."
          actions={quickCreate.customer()}
        />
        <View style={styles.metrics}>
          <MetricCard label="Customers" value={customers.length} icon="account-group-outline" />
          <MetricCard label="Loyalty points" value={loyaltyTotal} tone="warning" icon="star-circle-outline" />
          <MetricCard label="Credit limits" value={formatMwk(creditLimit)} icon="credit-card-outline" />
          <MetricCard label="Receivable" value={formatMwk(receivable)} tone={receivable ? "danger" : "default"} icon="cash-clock" />
        </View>
        <TableCard>
          <TableHeader columns={["Customer", "Contact", "Loyalty", "Credit limit", "Balance", ""]} />
          {customers.map((customer) => (
            <View key={customer.id} style={styles.row}>
              <View style={styles.customerCell}>
                <View style={styles.avatar}><MaterialCommunityIcons name="account-circle-outline" size={19} color={colors.muted} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{customer.name}</Text>
                  <Text style={styles.meta}>{customer.id}</Text>
                </View>
              </View>
              <Text style={styles.contact}>{customer.phone || "-"}{"\n"}{customer.email || ""}</Text>
              <View style={styles.cell}>{customer.loyaltyPoints ? <Badge tone="warning">{customer.loyaltyPoints}</Badge> : <Text style={styles.emptyText}>-</Text>}</View>
              <Text style={styles.rightCell}>{customer.creditLimit ? formatMwk(customer.creditLimit) : "-"}</Text>
              <Text style={[styles.rightCell, customer.balance > 0 && { color: colors.danger }]}>{customer.balance ? formatMwk(customer.balance) : "-"}</Text>
              <View style={styles.viewButton}><Text style={styles.viewText}>View</Text></View>
            </View>
          ))}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  customerCell: { flex: 1.3, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  name: { color: colors.ink, fontWeight: "900" },
  meta: { color: colors.muted, fontFamily: typography.monoMedium, fontSize: 10, marginTop: 2 },
  contact: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12, lineHeight: 18 },
  cell: { flex: 1, minWidth: 90 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  emptyText: { color: colors.muted },
  viewButton: { width: 54, minHeight: 30, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  viewText: { color: colors.ink, fontWeight: "900", fontSize: 12 }
});
