import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Button, Card, Kpi, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";
import { useAuth } from "../../src/lib/auth";
import { Login } from "../../src/components/login";

export default function Dashboard() {
  const auth = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, enabled: auth.isAuthenticated });
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications, enabled: auth.isAuthenticated });
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: api.sales, enabled: auth.isAuthenticated });

  if (auth.loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!auth.isAuthenticated) return <Login />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={styles.eyebrow}>Overview</Text>
            <Text style={styles.title}>Good day at the shop</Text>
            <Text style={styles.subtitle}>Revenue, stock pressure, sales lane activity and sync health for the current business day.</Text>
          </View>
          <View style={styles.headerActions}>
            <Button variant="outline">Last 14 days</Button>
            <Button>Export</Button>
          </View>
        </View>

        {isLoading || !data ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <View style={styles.kpis}>
              <Kpi label="Revenue 14d" value={formatMwk(data.revenue14d)} tone="good" />
              <Kpi label="Stock value" value={formatMwk(data.stockValue)} />
              <Kpi label="Transactions" value={String(data.transactionCount14d)} />
              <Kpi label="Low stock" value={String(data.lowStockCount)} tone={data.lowStockCount ? "danger" : "neutral"} />
            </View>

            <View style={styles.grid}>
              <Card style={styles.wideCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Revenue trend</Text>
                    <Text style={styles.sectionSub}>Daily POS totals from the last two weeks</Text>
                  </View>
                  <MaterialCommunityIcons name="chart-bar" size={21} color={colors.accent} />
                </View>
                {data.revenueTrend.length ? data.revenueTrend.map((point) => {
                  const max = Math.max(...data.revenueTrend.map((entry) => entry.revenue), 1);
                  return (
                    <View key={point.day} style={styles.barRow}>
                      <Text style={styles.day}>{point.day}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.max(5, (point.revenue / max) * 100)}%` }]} />
                      </View>
                      <Text style={styles.value}>{formatMwk(point.revenue)}</Text>
                    </View>
                  );
                }) : <Text style={styles.empty}>No revenue posted yet.</Text>}
              </Card>

              <Card style={styles.sideCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Stock focus</Text>
                    <Text style={styles.sectionSub}>Top inventory movers</Text>
                  </View>
                  <MaterialCommunityIcons name="warehouse" size={21} color={colors.blue} />
                </View>
                {data.topProducts.map((product, index) => (
                  <View key={`${product.name}-${index}`} style={styles.stockRow}>
                    <View style={styles.stockRank}><Text style={styles.stockRankText}>{index + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{product.name}</Text>
                      <Text style={styles.alertBody}>{product.stock} units on hand</Text>
                    </View>
                  </View>
                ))}
                {!data.topProducts.length ? <Text style={styles.empty}>Products will appear after sales activity.</Text> : null}
              </Card>
            </View>

            <View style={styles.grid}>
              <Card style={styles.wideCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Recent sales</Text>
                    <Text style={styles.sectionSub}>Latest completed receipts</Text>
                  </View>
                  <MaterialCommunityIcons name="receipt-text-outline" size={21} color={colors.accent} />
                </View>
                {sales.slice(0, 6).map((sale) => (
                  <View key={sale.id} style={styles.saleRow}>
                    <View>
                      <Text style={styles.alertTitle}>{sale.refNo}</Text>
                      <Text style={styles.alertBody}>{sale.payment} payment</Text>
                    </View>
                    <Text style={styles.saleValue}>{formatMwk(sale.total)}</Text>
                  </View>
                ))}
                {!sales.length ? <Text style={styles.empty}>No receipts yet. Complete a POS sale to populate this table.</Text> : null}
              </Card>

              <Card style={styles.sideCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Alerts</Text>
                    <Text style={styles.sectionSub}>Unread operational notices</Text>
                  </View>
                  <MaterialCommunityIcons name="bell-outline" size={21} color={colors.danger} />
                </View>
                {notifications.slice(0, 6).map((item) => (
                  <View key={item.id} style={styles.alert}>
                    <View style={[styles.dot, { backgroundColor: item.read ? colors.line : colors.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{item.title}</Text>
                      <Text style={styles.alertBody}>{item.body}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  pageHeader: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 2 },
  headerActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  eyebrow: { color: colors.accent, fontFamily: typography.sansExtraBold, fontSize: 12, textTransform: "uppercase" },
  title: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 34 },
  subtitle: { color: colors.muted, fontFamily: typography.sansRegular, fontSize: 14, marginTop: 5, maxWidth: 680 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  wideCard: { flex: 2, minWidth: 320 },
  sideCard: { flex: 1, minWidth: 280 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  sectionTitle: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 17 },
  sectionSub: { color: colors.muted, fontFamily: typography.sansRegular, fontSize: 12, marginTop: 3 },
  barRow: { alignItems: "center", flexDirection: "row", gap: 10, marginVertical: 6 },
  day: { width: 44, color: colors.muted, fontFamily: typography.monoRegular, fontSize: 12 },
  barTrack: { flex: 1, height: 11, backgroundColor: colors.surfaceAlt, borderRadius: 5, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 5 },
  value: { width: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  stockRank: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  stockRankText: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 12 },
  saleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  saleValue: { color: colors.ink, fontFamily: typography.sansBlack },
  alert: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  alertTitle: { color: colors.ink, fontFamily: typography.sansBold },
  alertBody: { color: colors.muted, fontFamily: typography.sansRegular, marginTop: 3 },
  empty: { color: colors.muted, fontFamily: typography.sansMedium, paddingVertical: 18, textAlign: "center" }
});
