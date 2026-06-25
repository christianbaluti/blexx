import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type PurchaseTab = "po" | "grn" | "inv";

function statusTone(status: string) {
  if (["received", "paid", "closed"].includes(status)) return "success" as const;
  if (["cancelled", "void"].includes(status)) return "danger" as const;
  if (["ordered", "partial", "open"].includes(status)) return "warning" as const;
  return "muted" as const;
}

export default function Purchases() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PurchaseTab>("po");
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [landedCost, setLandedCost] = useState("0");
  const [note, setNote] = useState("");
  const { data: purchaseOrders = [], isLoading: loadingPurchaseOrders, isFetching: fetchingPurchaseOrders } = useQuery({ queryKey: ["purchase-orders"], queryFn: api.purchaseOrders });
  const { data: grn = [], isLoading: loadingGrn, isFetching: fetchingGrn } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const { data: invoices = [], isLoading: loadingInvoices, isFetching: fetchingInvoices } = useQuery({ queryKey: ["supplier-invoices"], queryFn: api.supplierInvoices });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: api.items });
  const openPayables = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0);
  const activeLoading = tab === "po" ? loadingPurchaseOrders : tab === "grn" ? loadingGrn : loadingInvoices;
  const activeFetching = tab === "po" ? fetchingPurchaseOrders : tab === "grn" ? fetchingGrn : fetchingInvoices;
  const exportRows = useMemo(() => {
    if (tab === "po") return purchaseOrders.map((po) => ({ ref: String((po as unknown as Record<string, unknown>).ref_no ?? po.id), supplier: po.supplierName ?? po.supplierId, date: String((po as unknown as Record<string, unknown>).order_date ?? po.date), status: po.status, total: po.total }));
    if (tab === "grn") return grn.map((note) => ({ ref: note.refNo, purchaseOrder: note.poId ?? "", receivedAt: note.receivedAt, totalItems: note.totalItems, receivedBy: note.receivedBy ?? "" }));
    return invoices.map((invoice) => ({ ref: invoice.refNo, supplier: invoice.supplierName, dueDate: invoice.dueDate ?? "", status: invoice.status, total: invoice.total, paid: invoice.paid }));
  }, [grn, invoices, purchaseOrders, tab]);
  const create = useMutation({
    mutationFn: () => api.createPurchaseOrder({
      supplierId,
      landedCost: Number(landedCost || 0),
      note,
      items: [{ itemId, quantity: Number(quantity || 0), unitCost: Number(unitCost || 0) }]
    }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    }
  });

  function openNew() {
    setSupplierId(suppliers[0]?.id ?? "");
    setItemId(String(items[0]?.id ?? ""));
    setQuantity("1");
    setUnitCost("0");
    setLandedCost("0");
    setNote("");
    setOpen(true);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Operations"
          title="Purchases"
          description="Purchase orders, goods received notes and supplier invoices."
          actions={<CommandButton icon="plus" label="New PO" primary onPress={openNew} />}
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
            { key: "inv", label: "Supplier invoices" }
          ]}
        />
        <Card style={styles.toolbar}>
          <ExportMenu title={tab === "po" ? "purchase-orders" : tab === "grn" ? "goods-received" : "supplier-invoices"} rows={exportRows} />
          {activeFetching ? <ActivityIndicator color={colors.accent} /> : null}
        </Card>

        {tab === "po" ? (
          <TableCard>
            <TableHeader columns={["Ref", "Supplier", "Date", "Status", "Total", ""]} />
            {activeLoading ? <LoadingRow label="Loading purchase orders..." /> : null}
            {purchaseOrders.map((po) => (
              <View key={po.id} style={styles.row}>
                <Text style={styles.monoCell}>{String((po as unknown as Record<string, unknown>).ref_no ?? po.id.slice(0, 8).toUpperCase())}</Text>
                <Text style={styles.cellText}>{po.supplierName ?? po.supplierId}</Text>
                <Text style={styles.mutedText}>{new Date(String((po as unknown as Record<string, unknown>).order_date ?? po.date)).toLocaleDateString()}</Text>
                <View style={styles.cell}><Badge tone={statusTone(po.status)}>{po.status}</Badge></View>
                <Text style={styles.rightCell}>{formatMwk(po.total)}</Text>
                <View style={styles.docButton}><MaterialCommunityIcons name="file-document-outline" size={16} color={colors.muted} /></View>
              </View>
            ))}
          </TableCard>
        ) : null}

        {tab === "grn" ? (
          activeLoading || grn.length ? (
            <TableCard>
              <TableHeader columns={["Ref", "PO", "Received", "Items", "By"]} />
              {activeLoading ? <LoadingRow label="Loading GRNs..." /> : null}
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
          ) : <EmptyPanel icon="package-variant-closed-check" title="No goods received yet" body="Create a PO and receive stock to populate this view." />
        ) : null}

        {tab === "inv" ? (
          activeLoading || invoices.length ? (
            <TableCard>
              <TableHeader columns={["Invoice", "Supplier", "Due", "Status", "Total", "Paid"]} />
              {activeLoading ? <LoadingRow label="Loading invoices..." /> : null}
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

      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>New purchase order</Text>
            <Picker label="Supplier" items={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))} value={supplierId} onChange={setSupplierId} />
            <Picker label="Raw item" items={items.map((item) => ({ id: String(item.id), name: String(item.name) }))} value={itemId} onChange={setItemId} />
            <View style={styles.grid}>
              <Field style={styles.gridField} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="Quantity" />
              <Field style={styles.gridField} value={unitCost} onChangeText={setUnitCost} keyboardType="numeric" placeholder="Unit cost" />
              <Field style={styles.gridField} value={landedCost} onChangeText={setLandedCost} keyboardType="numeric" placeholder="Transport/tax/duty" />
            </View>
            <Field value={note} onChangeText={setNote} placeholder="Note" />
            {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "Could not create PO"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => create.mutate()} disabled={!supplierId || !itemId || !Number(quantity) || create.isPending}>Create PO</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Picker({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRail}>
        {items.map((item) => {
          const active = value === item.id;
          return (
            <Pressable key={item.id} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => onChange(item.id)}>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function LoadingRow({ label }: { label: string }) {
  return <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { width: 100, minWidth: 100 },
  cellText: { width: 170, minWidth: 170, color: colors.ink, fontWeight: "800" },
  monoCell: { width: 130, minWidth: 130, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  mutedText: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  docButton: { width: 42, minWidth: 42, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" }
  ,backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 560, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  optionRail: { gap: 8 },
  optionChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  optionChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  optionTextActive: { color: colors.sidebarText },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 150 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
