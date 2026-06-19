import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Card, Screen } from "../../src/components/ui";
import { Login } from "../../src/components/login";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/lib/theme";

export default function Operations() {
  const auth = useAuth();
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers, enabled: auth.isAuthenticated });
  const customers = useQuery({ queryKey: ["customers"], queryFn: api.customers, enabled: auth.isAuthenticated });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: api.expenses, enabled: auth.isAuthenticated });
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit, enabled: auth.isAuthenticated });

  if (!auth.isAuthenticated) return <Login />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Operations</Text>
        <View style={styles.grid}>
          <Card style={styles.panel}>
            <Text style={styles.section}>Suppliers</Text>
            {suppliers.data?.map((item) => <Text key={item.id} style={styles.line}>{item.name}</Text>)}
          </Card>
          <Card style={styles.panel}>
            <Text style={styles.section}>Customers</Text>
            {customers.data?.map((item) => <Text key={item.id} style={styles.line}>{item.name} - {formatMwk(item.creditLimit)}</Text>)}
          </Card>
          <Card style={styles.panel}>
            <Text style={styles.section}>Expenses</Text>
            {expenses.data?.map((item) => <Text key={item.id} style={styles.line}>{item.category} - {formatMwk(item.amount)}</Text>)}
          </Card>
          <Card style={styles.panel}>
            <Text style={styles.section}>Audit Trail</Text>
            {audit.data?.map((item) => <Text key={item.id} style={styles.line}>{item.action} - {item.entity}</Text>)}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 16, width: "100%", maxWidth: 1200, alignSelf: "center" },
  title: { color: colors.ink, fontSize: 30, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  panel: { flexGrow: 1, flexBasis: 320 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "900", marginBottom: 8 },
  line: { color: colors.muted, paddingVertical: 7, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }
});
