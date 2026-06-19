import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { EmptyPanel, MetricCard, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Card, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type FinanceTab = "ar" | "ap" | "ledger" | "pnl" | "bs";

export default function Finance() {
  const [tab, setTab] = useState<FinanceTab>("ar");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: api.sales });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.expenses });
  const { data: ledger = [] } = useQuery({ queryKey: ["ledger"], queryFn: api.ledger });
  const { data: statements } = useQuery({ queryKey: ["statements"], queryFn: api.statements });
  const ar = customers.reduce((sum, customer) => sum + customer.balance, 0);
  const ap = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0);
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const profit = revenue - totalExpenses;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Finance" title="Books" description="Accounts receivable, payable, ledgers and financial statements." />
        <View style={styles.metrics}>
          <MetricCard label="Revenue" value={formatMwk(revenue)} tone="accent" icon="chart-line" />
          <MetricCard label="Expenses" value={formatMwk(totalExpenses)} tone="danger" icon="receipt-text-outline" />
          <MetricCard label="Net profit" value={formatMwk(profit)} tone={profit >= 0 ? "success" : "danger"} icon="finance" />
          <MetricCard label="AR / AP" value={`${formatMwk(ar)} / ${formatMwk(ap)}`} icon="scale-balance" />
        </View>
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "ar", label: "Receivable" },
            { key: "ap", label: "Payable" },
            { key: "ledger", label: "General ledger" },
            { key: "pnl", label: "P&L" },
            { key: "bs", label: "Balance sheet" }
          ]}
        />

        {tab === "ar" ? (
          <TableCard>
            <TableHeader columns={["Customer", "Balance", "Credit limit"]} />
            {customers.filter((customer) => customer.balance > 0).map((customer) => (
              <View key={customer.id} style={styles.row}>
                <Text style={styles.cellText}>{customer.name}</Text>
                <Text style={[styles.rightCell, { color: colors.danger }]}>{formatMwk(customer.balance)}</Text>
                <Text style={styles.rightCell}>{formatMwk(customer.creditLimit)}</Text>
              </View>
            ))}
          </TableCard>
        ) : null}

        {tab === "ap" ? (
          <TableCard>
            <TableHeader columns={["Supplier", "Balance"]} />
            {suppliers.filter((supplier) => supplier.balance > 0).map((supplier) => (
              <View key={supplier.id} style={styles.row}>
                <Text style={styles.cellText}>{supplier.name}</Text>
                <Text style={[styles.rightCell, { color: colors.accent }]}>{formatMwk(supplier.balance)}</Text>
              </View>
            ))}
          </TableCard>
        ) : null}

        {tab === "ledger" ? (
          ledger.length ? (
            <TableCard>
              <TableHeader columns={["Posted", "Account", "Memo", "Debit", "Credit"]} />
              {ledger.slice(0, 80).map((entry) => (
                <View key={entry.id} style={styles.row}>
                  <Text style={styles.mutedText}>{new Date(entry.postedAt).toLocaleString()}</Text>
                  <Text style={styles.cellText}>{entry.accountCode} - {entry.accountName}</Text>
                  <Text style={styles.mutedText}>{entry.memo ?? entry.refType ?? "-"}</Text>
                  <Text style={styles.rightCell}>{formatMwk(entry.debit)}</Text>
                  <Text style={styles.rightCell}>{formatMwk(entry.credit)}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="book-open-page-variant-outline" title="No ledger entries yet" body="Sales, purchases and expenses will post into the ledger automatically." />
        ) : null}

        {tab === "pnl" ? (
          <Card style={styles.statement}>
            <Text style={styles.statementTitle}>Profit and Loss</Text>
            <Text style={styles.statementSub}>{statements?.period ?? "Current period"}</Text>
            <Line label="Sales revenue" value={revenue || statements?.income || 0} />
            <Line label="VAT collected" value={-Math.round((revenue * 0.165) / 1.165)} muted />
            <Line label="Operating expenses" value={-(totalExpenses || statements?.expenses || 0)} />
            <View style={styles.statementTotal}><Text style={styles.statementTotalLabel}>Net result</Text><Text style={[styles.statementTotalValue, profit < 0 && { color: colors.danger }]}>{formatMwk(profit || statements?.netProfit || 0)}</Text></View>
          </Card>
        ) : null}

        {tab === "bs" ? (
          <Card style={styles.statement}>
            <Text style={styles.statementTitle}>Balance sheet</Text>
            <Text style={styles.statementSub}>{statements?.period ?? "Current period"}</Text>
            <Line label="Assets" value={statements?.assets ?? ar} />
            <Line label="Liabilities" value={statements?.liabilities ?? ap} />
            <View style={styles.statementTotal}><Text style={styles.statementTotalLabel}>Equity</Text><Text style={styles.statementTotalValue}>{formatMwk(statements?.equity ?? ar - ap)}</Text></View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={styles.statementLine}>
      <Text style={[styles.statementLabel, muted && { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statementValue, muted && { color: colors.muted }]}>{value < 0 ? `(${formatMwk(Math.abs(value))})` : formatMwk(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cellText: { flex: 1, minWidth: 150, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  statement: { maxWidth: 760, width: "100%", alignSelf: "flex-start", gap: 0, padding: 20 },
  statementTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 22, fontWeight: "700" },
  statementSub: { color: colors.muted, marginTop: 3, marginBottom: 12 },
  statementLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 10 },
  statementLabel: { color: colors.ink, fontWeight: "700" },
  statementValue: { color: colors.ink, fontFamily: typography.monoMedium, fontWeight: "900" },
  statementTotal: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 2, borderTopColor: colors.ink, paddingTop: 12, marginTop: 4 },
  statementTotalLabel: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 17, fontWeight: "700" },
  statementTotalValue: { color: colors.success, fontFamily: typography.monoMedium, fontSize: 16, fontWeight: "900" }
});
