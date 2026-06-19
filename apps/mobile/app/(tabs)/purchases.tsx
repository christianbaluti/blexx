import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type PurchaseTab = "po" | "grn" | "inv" | "ret";

function statusTone(status: string) {
  if (["received", "paid", "closed"].includes(status)) return "success" as const;
  if (["cancelled", "void"].includes(status)) return "danger" as const;
  if (["ordered", "partial", "open"].includes(status)) return "warning" as const;
  return "muted" as const;
}

export default function Purchases() {
  const [tab, setTab] = useState<PurchaseTab>("po");
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ["purchase-orders"], queryFn: api.purchaseOrders });
  const { data: grn = [] } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const { data: invoices = [] } = useQuery({ queryKey: ["supplier-invoices"], queryFn: api.supplierInvoices });
  const { data: returns = [] } = useQuery({ queryKey: ["returns"], queryFn: api.returns });
  const openPayables = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Operations"
          title="Purchases"
          description="Purchase orders, goods received notes, supplier invoices and supplier returns."
          actions={<CommandButton icon="plus" label="New PO" primary />}
        />
        <View style={styles.metrics}>
          <MetricCard label="Purchase orders" value={purchaseOrders.length} icon="cart-arrow-down" />
          <MetricCard label="GRNs" value={grn.length} icon="package-variant-closed-check" />
          <MetricCard label="Supplier invoices" value={invoices.length} icon="file-document-outline" />
          <MetricCard label="Open payables" value={formatMwk(openPayables)} tone={openPayables ? "warning" : "default"} icon="cash-clock" />
        </View>
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "po", label: "Purchase orders" },
            { key: "grn", label: "Goods received" },
            { key: "inv", label: "Supplier invoices" },
            { key: "ret", label: "Returns" }
          ]}
        />

        {tab === "po" ? (
          <TableCard>
            <TableHeader columns={["Ref", "Supplier", "Date", "Status", "Total", ""]} />
            {purchaseOrders.map((po) => (
              <View key={po.id} style={styles.row}>
                <Text style={styles.monoCell}>{po.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.cellText}>{po.supplierName ?? po.supplierId}</Text>
                <Text style={styles.mutedText}>{new Date(po.date).toLocaleDateString()}</Text>
                <View style={styles.cell}><Badge tone={statusTone(po.status)}>{po.status}</Badge></View>
                <Text style={styles.rightCell}>{formatMwk(po.total)}</Text>
                <View style={styles.docButton}><MaterialCommunityIcons name="file-document-outline" size={16} color={colors.muted} /></View>
              </View>
            ))}
          </TableCard>
        ) : null}

        {tab === "grn" ? (
          grn.length ? (
            <TableCard>
              <TableHeader columns={["Ref", "PO", "Received", "Items", "By"]} />
              {grn.map((note) => (
                <View key={note.id} style={styles.row}>
                  <Text style={styles.monoCell}>{note.refNo}</Text>
                  <Text style={styles.mutedText}>{note.poId ?? "-"}</Text>
                  <Text style={styles.mutedText}>{new Date(note.receivedAt).toLocaleString()}</Text>
                  <Text style={styles.rightCell}>{note.totalItems}</Text>
                  <Text style={styles.mutedText}>{note.receivedBy ?? "-"}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="package-variant-closed-check" title="No goods received yet" body="Create a PO and receive stock to populate this view." action={<CommandButton icon="plus" label="Receive stock" primary />} />
        ) : null}

        {tab === "inv" ? (
          invoices.length ? (
            <TableCard>
              <TableHeader columns={["Invoice", "Supplier", "Due", "Status", "Total", "Paid"]} />
              {invoices.map((invoice) => (
                <View key={invoice.id} style={styles.row}>
                  <Text style={styles.monoCell}>{invoice.refNo}</Text>
                  <Text style={styles.cellText}>{invoice.supplierName}</Text>
                  <Text style={styles.mutedText}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "-"}</Text>
                  <View style={styles.cell}><Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge></View>
                  <Text style={styles.rightCell}>{formatMwk(invoice.total)}</Text>
                  <Text style={styles.rightCell}>{formatMwk(invoice.paid)}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="file-document-outline" title="No supplier invoices yet" body="Supplier invoices are created from received purchase documents." />
        ) : null}

        {tab === "ret" ? (
          returns.length ? (
            <TableCard>
              <TableHeader columns={["Return", "Reason", "Status", "Created"]} />
              {returns.map((item, index) => (
                <View key={String(item.id ?? index)} style={styles.row}>
                  <Text style={styles.monoCell}>{String(item.refNo ?? item.id ?? "RET")}</Text>
                  <Text style={styles.cellText}>{String(item.reason ?? "Supplier return")}</Text>
                  <View style={styles.cell}><Badge tone="warning">{String(item.status ?? "open")}</Badge></View>
                  <Text style={styles.mutedText}>{String(item.createdAt ?? item.date ?? "-")}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="backup-restore" title="No supplier returns yet" body="Damaged or rejected supplier items will show here." action={<CommandButton icon="plus" label="New return" primary />} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 100 },
  cellText: { flex: 1, minWidth: 140, color: colors.ink, fontWeight: "800" },
  monoCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  mutedText: { flex: 1, minWidth: 120, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  docButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 6 }
});
