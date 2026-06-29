import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, EmptyPanel, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { shareReceipt } from "../../src/lib/receiptService";
import { colors, typography } from "../../src/lib/theme";

type ReceiptRow = Awaited<ReturnType<typeof api.receipts>>[number];
type ReceiptLine = { productId?: string; sku?: string; name?: string; qty?: number; quantity?: number; price?: number; unitPrice?: number; discount?: number; total?: number };
type ReceiptPayload = { items?: ReceiptLine[]; subtotal?: number; discount?: number; tax?: number; total?: number; paymentMethod?: string };

export default function Receipts() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const [actionReason, setActionReason] = useState("");
  const { data: receipts = [], isLoading, isFetching } = useQuery({ queryKey: ["receipts"], queryFn: api.receipts });

  const refreshAfterMutation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({ queryKey: ["returns"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["ledger"] }),
      queryClient.invalidateQueries({ queryKey: ["statements"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
  };

  const returnSale = useMutation({
    mutationFn: async (receipt: ReceiptRow) => {
      const saleId = String((receipt as ReceiptRow & { saleId?: string }).saleId ?? "");
      const lines = linesFor(receipt).filter((line) => line.productId && line.qty > 0);
      if (!saleId) throw new Error("This receipt is missing the linked sale id.");
      if (!lines.length) throw new Error("This receipt has no returnable product lines.");
      return api.createReturn({
        saleId,
        reason: actionReason.trim() || "Customer return",
        refundMethod: receipt.payment === "credit" ? "credit" : receipt.payment || "cash",
        items: lines.map((line) => ({ productId: line.productId, quantity: line.qty }))
      });
    },
    onSuccess: async () => {
      await refreshAfterMutation();
      setSelected(null);
      setActionReason("");
    }
  });

  const voidSale = useMutation({
    mutationFn: (receipt: ReceiptRow) => {
      const saleId = String((receipt as ReceiptRow & { saleId?: string }).saleId ?? "");
      if (!saleId) throw new Error("This receipt is missing the linked sale id.");
      return api.voidSale(saleId, actionReason.trim() || "Voided from receipt");
    },
    onSuccess: async () => {
      await refreshAfterMutation();
      setSelected(null);
      setActionReason("");
    }
  });

  const filtered = useMemo(
    () => receipts.filter((receipt) => [receipt.refNo, receipt.saleRefNo, receipt.customerName, receipt.payment].join(" ").toLowerCase().includes(query.toLowerCase())),
    [query, receipts]
  );
  const exportRows = filtered.map((receipt) => ({
    receipt: receipt.refNo,
    sale: receipt.saleRefNo,
    customer: receipt.customerName,
    payment: receipt.payment,
    lines: receipt.lineCount,
    total: receipt.total,
    createdAt: receipt.createdAt
  }));

  async function share(row: ReceiptRow) {
    const payload = payloadFor(row);
    await shareReceipt({
      refNo: row.refNo,
      customerName: row.customerName,
      payment: row.payment,
      subtotal: Number(payload.subtotal ?? row.subtotal ?? row.total),
      discount: Number(payload.discount ?? row.discount ?? 0),
      total: row.total,
      lines: linesFor(row)
    });
  }

  function confirmReturn(row: ReceiptRow) {
    Alert.alert("Return sale", "Return all receipt lines and restock them into the shop?", [
      { text: "Cancel", style: "cancel" },
      { text: "Return", style: "destructive", onPress: () => returnSale.mutate(row) }
    ]);
  }

  function confirmVoid(row: ReceiptRow) {
    Alert.alert("Void sale", "Void this sale, restock the items and reverse the finance entries?", [
      { text: "Cancel", style: "cancel" },
      { text: "Void", style: "destructive", onPress: () => voidSale.mutate(row) }
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="POS" title="Receipts" description="Completed POS receipts that can be viewed, exported, printed or shared." />
        <TableCard>
          <View style={styles.toolbar}>
            <Field value={query} onChangeText={setQuery} placeholder="Search receipt, sale, customer or payment method" style={styles.search} />
            <ExportMenu title="receipts" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
          {isLoading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading receipts...</Text></View>
          ) : filtered.length ? (
            <>
              <TableHeader columns={["Receipt", "Customer", "Payment", "Lines", "Total", "Created", ""]} />
              {filtered.map((receipt) => (
                <Pressable key={receipt.id} style={styles.row} onPress={() => { setSelected(receipt); setActionReason(""); }}>
                  <View style={styles.receiptCell}>
                    <Text style={styles.rowTitle}>{receipt.refNo}</Text>
                    <Text style={styles.rowMeta}>{receipt.saleRefNo}</Text>
                  </View>
                  <Text style={styles.cellText}>{receipt.customerName}</Text>
                  <View style={styles.cell}><Badge tone="muted">{receipt.payment}</Badge></View>
                  <Text style={styles.rightCell}>{receipt.lineCount}</Text>
                  <Text style={styles.rightCell}>{formatMwk(receipt.total)}</Text>
                  <Text style={styles.mutedCell}>{receipt.createdAt ? new Date(receipt.createdAt).toLocaleString() : "-"}</Text>
                  <Pressable style={styles.iconButton} onPress={() => share(receipt)}>
                    <MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.accent} />
                  </Pressable>
                </Pressable>
              ))}
            </>
          ) : (
            <EmptyPanel icon="receipt-text-outline" title="No receipts found" body="Complete a POS sale and the receipt will appear here." />
          )}
        </TableCard>
      </ScrollView>

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          {selected ? (
            <Pressable style={styles.panel}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selected.refNo}</Text>
                  <Text style={styles.muted}>{selected.customerName} - {selected.payment}</Text>
                </View>
                <Pressable style={styles.iconButton} onPress={() => setSelected(null)}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
                {linesFor(selected).map((line, index) => (
                  <View key={`${line.productId}-${index}`} style={styles.lineRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle}>{line.name ?? line.productId}</Text>
                      <Text style={styles.rowMeta}>{line.qty} x {formatMwk(line.price)}</Text>
                    </View>
                    <Text style={styles.rightCell}>{formatMwk(line.total ?? line.qty * line.price - line.discount)}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.totalBox}>
                <TotalLine label="Subtotal" value={Number(payloadFor(selected).subtotal ?? selected.subtotal ?? selected.total)} />
                <TotalLine label="Discount" value={Number(payloadFor(selected).discount ?? selected.discount ?? 0)} />
                <TotalLine label="Tax" value={Number(payloadFor(selected).tax ?? (selected as ReceiptRow & { tax?: number }).tax ?? 0)} />
                <View style={styles.grandRow}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{formatMwk(selected.total)}</Text></View>
              </View>
              <Field value={actionReason} onChangeText={setActionReason} placeholder="Reason for return or void" multiline style={styles.reasonField} />
              {returnSale.error || voidSale.error ? (
                <Text style={styles.error}>{(returnSale.error ?? voidSale.error) instanceof Error ? (returnSale.error ?? voidSale.error)?.message : "Action failed"}</Text>
              ) : null}
              <View style={styles.actions}>
                {selected.status !== "void" && selected.status !== "returned" ? (
                  <>
                    <Button variant="outline" onPress={() => confirmReturn(selected)} disabled={returnSale.isPending || voidSale.isPending}>
                      {returnSale.isPending ? "Returning..." : "Return"}
                    </Button>
                    <Button variant="outline" onPress={() => confirmVoid(selected)} disabled={returnSale.isPending || voidSale.isPending}>
                      {voidSale.isPending ? "Voiding..." : "Void"}
                    </Button>
                  </>
                ) : null}
                <Button variant="outline" onPress={() => setSelected(null)}>Close</Button>
                <Button onPress={() => share(selected)}>Share / Print</Button>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function payloadFor(row: ReceiptRow) {
  return ((row as ReceiptRow & { payload?: ReceiptPayload }).payload ?? {}) as ReceiptPayload;
}

function linesFor(row: ReceiptRow) {
  const payload = payloadFor(row);
  return (payload.items ?? []).map((line) => ({
    productId: String(line.productId ?? ""),
    sku: line.sku,
    name: line.name,
    qty: Number(line.qty ?? line.quantity ?? 0),
    price: Number(line.price ?? line.unitPrice ?? 0),
    discount: Number(line.discount ?? 0),
    total: Number(line.total ?? (Number(line.qty ?? line.quantity ?? 0) * Number(line.price ?? line.unitPrice ?? 0) - Number(line.discount ?? 0)))
  }));
}

function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{formatMwk(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  search: { flexGrow: 1, flexBasis: 280 },
  loading: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  receiptCell: { flex: 1.2, minWidth: 140 },
  cell: { flex: 1, minWidth: 100 },
  cellText: { flex: 1, minWidth: 140, color: colors.ink, fontWeight: "800" },
  mutedCell: { flex: 1, minWidth: 155, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 88, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  rowTitle: { color: colors.ink, fontWeight: "900" },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  muted: { color: colors.muted },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 560, maxHeight: "92%", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, padding: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 24, fontWeight: "700" },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 10 },
  totalBox: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  totalLabel: { color: colors.muted, fontWeight: "800" },
  totalValue: { color: colors.ink, fontFamily: typography.monoMedium, fontWeight: "900" },
  grandRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 2, borderTopColor: colors.ink, paddingTop: 10 },
  grandLabel: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  grandValue: { color: colors.accent, fontFamily: typography.monoMedium, fontSize: 16, fontWeight: "900" },
  reasonField: { minHeight: 76 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }
});
