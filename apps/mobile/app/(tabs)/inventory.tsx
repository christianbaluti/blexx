import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Product } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { AlertPanel, Badge, CommandButton, EmptyPanel, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type InventoryTab = "stock" | "batches" | "adjustments" | "transfers" | "counts";

export default function Inventory() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<InventoryTab>("stock");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reason, setReason] = useState<"adjust" | "damage">("adjust");
  const [productId, setProductId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [stockOutletId, setStockOutletId] = useState("all");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  const { data: inventory = [], isLoading: loadingInventory, isFetching: fetchingInventory } = useQuery({ queryKey: ["inventory"], queryFn: api.inventory });
  const { data: outlets = [] } = useQuery({ queryKey: ["outlets"], queryFn: api.outlets });
  const { data: batches = [], isLoading: loadingBatches, isFetching: fetchingBatches } = useQuery({ queryKey: ["inventory-batches"], queryFn: api.batches });
  const { data: movements = [], isLoading: loadingMovements, isFetching: fetchingMovements } = useQuery({ queryKey: ["inventory-movements"], queryFn: api.movements });
  const { data: transfers = [], isLoading: loadingTransfers, isFetching: fetchingTransfers } = useQuery({ queryKey: ["transfers"], queryFn: api.transfers });
  const { data: counts = [], isLoading: loadingCounts, isFetching: fetchingCounts } = useQuery({ queryKey: ["stock-counts"], queryFn: api.stockCounts });
  const lowStock = products.filter((product) => product.stock <= product.reorder);
  const stockRows = inventory.filter((row) => stockOutletId === "all" || String(row.outletId) === stockOutletId);
  const lowOutletStock = stockRows.filter((row) => Number(row.quantity ?? 0) <= Number(row.reorder ?? 0));
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedOutlet = outlets.find((outlet) => String(outlet.id) === outletId);
  const activeLoading = tab === "stock" ? loadingInventory : tab === "batches" ? loadingBatches : tab === "adjustments" ? loadingMovements : tab === "transfers" ? loadingTransfers : loadingCounts;
  const activeFetching = tab === "stock" ? fetchingInventory : tab === "batches" ? fetchingBatches : tab === "adjustments" ? fetchingMovements : tab === "transfers" ? fetchingTransfers : fetchingCounts;
  const exportRows = useMemo(() => {
    if (tab === "stock") return stockRows.map((row) => ({ item: row.productName, location: row.outletName, onHand: row.quantity, reorder: row.reorder, unitCost: row.cost, value: Number(row.quantity ?? 0) * Number(row.cost ?? 0) }));
    if (tab === "batches") return batches.map((batch) => ({ batch: batch.batchNo, product: batch.productName, expiry: batch.expiryDate ?? "", qty: batch.quantity, cost: batch.cost }));
    if (tab === "adjustments") return movements.map((movement) => ({ item: movement.productName, movement: movement.movement, qty: movement.qty, reference: movement.refType ?? "", created: movement.createdAt }));
    if (tab === "transfers") return transfers.map((transfer) => ({ transfer: transfer.id, status: transfer.status, items: transfer.totalItems, created: transfer.createdAt }));
    return counts.map((count) => ({ outlet: count.outletName, status: count.status, variance: count.variance, created: count.createdAt, closed: count.closedAt ?? "" }));
  }, [batches, counts, movements, stockRows, tab, transfers]);

  const adjustStock = useMutation({
    mutationFn: () =>
      api.adjustInventory({
        productId,
        outletId,
        qty: reason === "damage" ? -Math.abs(Number(qty || 0)) : Number(qty || 0),
        reason,
        note
      }),
    onSuccess: async () => {
      setAdjustOpen(false);
      setQty("");
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  function openAdjustment(nextReason: "adjust" | "damage" = "adjust", product?: Product) {
    setReason(nextReason);
    setProductId(product?.id ?? products[0]?.id ?? "");
    setOutletId(String(outlets[0]?.id ?? ""));
    setQty("");
    setNote(nextReason === "damage" ? "Damaged stock" : "Stock received");
    setAdjustOpen(true);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          description="Stock items, batches, adjustments, transfers and counts across all outlets."
          actions={
            <>
              <CommandButton icon="clipboard-edit-outline" label="Adjustment" onPress={() => openAdjustment("damage")} />
              <CommandButton icon="plus" label="Receive stock" primary onPress={() => openAdjustment("adjust")} />
            </>
          }
        />
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "stock", label: "Stock on hand" },
            { key: "batches", label: "Batches" },
            { key: "adjustments", label: "Adjustments" },
            { key: "transfers", label: "Transfers" },
            { key: "counts", label: "Physical counts" }
          ]}
        />
        <Card style={styles.toolbar}>
          <ExportMenu title={`inventory-${tab}`} rows={exportRows} />
          {activeFetching ? <ActivityIndicator color={colors.accent} /> : null}
        </Card>

        {tab === "stock" ? (
          <>
            {lowOutletStock.length ? (
              <AlertPanel
                title={`${lowOutletStock.length} stock row${lowOutletStock.length > 1 ? "s" : ""} below reorder point`}
                body={lowOutletStock.map((row) => `${String(row.productName)} at ${String(row.outletName)}`).slice(0, 8).join(", ")}
              />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRail}>
              {[{ id: "all", name: "All warehouses and shops" }, ...outlets.map((outlet) => ({ id: String(outlet.id), name: String(outlet.name) }))].map((outlet) => {
                const active = stockOutletId === outlet.id;
                return (
                  <Pressable key={outlet.id} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => setStockOutletId(outlet.id)}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{outlet.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TableCard>
              <TableHeader columns={["Item", "Location", "On hand", "Reorder", "Unit cost", "Value", "Status"]} />
              {activeLoading ? <LoadingRow label="Loading stock..." /> : null}
              {stockRows.map((row) => {
                const product = products.find((item) => item.id === row.productId);
                const quantity = Number(row.quantity ?? 0);
                const reorderQty = Number(row.reorder ?? product?.reorder ?? 0);
                const cost = Number(row.cost ?? product?.cost ?? 0);
                const reorder = quantity <= reorderQty;
                return (
                  <View key={`${String(row.productId)}-${String(row.outletId)}`} style={styles.row}>
                    <View style={styles.itemCell}>
                      <Text style={styles.rowTitle}>{String(row.productName)}</Text>
                      <Text style={styles.rowMeta}>{String(row.sku)}</Text>
                    </View>
                    <Text style={styles.cellText}>{String(row.outletName)}</Text>
                    <Text style={styles.rightCell}>{quantity} {String(row.unit ?? product?.unit ?? "")}</Text>
                    <Text style={styles.rightMuted}>{reorderQty}</Text>
                    <Text style={styles.rightCell}>{formatMwk(cost)}</Text>
                    <Text style={styles.rightCell}>{formatMwk(cost * quantity)}</Text>
                    <View style={styles.cell}>
                      <Pressable onPress={() => openAdjustment(reorder ? "adjust" : "damage", product)}>
                        <Badge tone={reorder ? "danger" : "success"}>{reorder ? "Reorder" : "In stock"}</Badge>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </TableCard>
          </>
        ) : null}

        {tab === "batches" ? (
          activeLoading || batches.length ? (
            <TableCard>
              <TableHeader columns={["Batch", "Product", "Expiry", "Qty", "Cost"]} />
              {activeLoading ? <LoadingRow label="Loading batches..." /> : null}
              {batches.map((batch) => (
                <View key={batch.id} style={styles.row}>
                  <Text style={styles.cellText}>{batch.batchNo}</Text>
                  <Text style={styles.cellText}>{batch.productName}</Text>
                  <Text style={styles.mutedText}>{batch.expiryDate ?? "-"}</Text>
                  <Text style={styles.rightCell}>{batch.quantity}</Text>
                  <Text style={styles.rightCell}>{formatMwk(batch.cost)}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="package-variant" title="No batches yet" body="Receiving stock with batch or expiry information will populate this view." action={<CommandButton icon="plus" label="New batch" primary />} />
        ) : null}

        {tab === "adjustments" ? (
          activeLoading || movements.length ? (
            <TableCard>
              <TableHeader columns={["Item", "Movement", "Qty", "Reference", "Created"]} />
              {activeLoading ? <LoadingRow label="Loading adjustments..." /> : null}
              {movements.slice(0, 40).map((movement) => (
                <View key={movement.id} style={styles.row}>
                  <Text style={styles.cellText}>{movement.productName}</Text>
                  <View style={styles.cell}><Badge tone={movement.movement === "damage" ? "danger" : "accent"}>{movement.movement}</Badge></View>
                  <Text style={styles.rightCell}>{movement.qty}</Text>
                  <Text style={styles.mutedText}>{movement.refType ?? "-"}</Text>
                  <Text style={styles.mutedText}>{new Date(movement.createdAt).toLocaleString()}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="clipboard-edit-outline" title="No adjustments yet" body="Damage, corrections and manual adjustments will show here." action={<CommandButton icon="plus" label="New adjustment" primary onPress={() => openAdjustment("adjust")} />} />
        ) : null}

        {tab === "transfers" ? (
          activeLoading || transfers.length ? (
            <TableCard>
              <TableHeader columns={["Transfer", "Status", "Items", "Created"]} />
              {activeLoading ? <LoadingRow label="Loading transfers..." /> : null}
              {transfers.map((transfer) => (
                <View key={transfer.id} style={styles.row}>
                  <Text style={styles.cellText}>{transfer.id.slice(0, 8).toUpperCase()}</Text>
                  <View style={styles.cell}><Badge tone={transfer.status === "received" ? "success" : transfer.status === "cancelled" ? "danger" : "warning"}>{transfer.status}</Badge></View>
                  <Text style={styles.rightCell}>{transfer.totalItems}</Text>
                  <Text style={styles.mutedText}>{new Date(transfer.createdAt).toLocaleString()}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="swap-horizontal" title="No transfers yet" body="Move stock between outlets and track sent/received states." action={<CommandButton icon="plus" label="New transfer" primary />} />
        ) : null}

        {tab === "counts" ? (
          activeLoading || counts.length ? (
            <TableCard>
              <TableHeader columns={["Outlet", "Status", "Variance", "Created", "Closed"]} />
              {activeLoading ? <LoadingRow label="Loading counts..." /> : null}
              {counts.map((count) => (
                <View key={count.id} style={styles.row}>
                  <Text style={styles.cellText}>{count.outletName}</Text>
                  <View style={styles.cell}><Badge tone={count.status === "closed" ? "success" : "warning"}>{count.status}</Badge></View>
                  <Text style={[styles.rightCell, count.variance < 0 && { color: colors.danger }]}>{count.variance}</Text>
                  <Text style={styles.mutedText}>{new Date(count.createdAt).toLocaleString()}</Text>
                  <Text style={styles.mutedText}>{count.closedAt ? new Date(count.closedAt).toLocaleString() : "-"}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="clipboard-check-outline" title="No physical counts yet" body="Run stock counts to reconcile system stock with shelf stock." action={<CommandButton icon="plus" label="New count" primary />} />
        ) : null}

        {!inventory.length && tab === "stock" && lowStock.length ? <Text style={styles.hint}>Outlet-level inventory is empty; product master stock is still available in Products.</Text> : null}
      </ScrollView>

      <Modal visible={adjustOpen} transparent animationType="fade" onRequestClose={() => setAdjustOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdjustOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>{reason === "damage" ? "Record stock damage" : "Receive or adjust stock"}</Text>
            <Text style={styles.sectionLabel}>Product</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRail}>
              {products.map((product) => (
                <Pressable key={product.id} style={[styles.optionChip, productId === product.id && styles.optionChipActive]} onPress={() => setProductId(product.id)}>
                  <Text style={[styles.optionText, productId === product.id && styles.optionTextActive]}>{product.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.sectionLabel}>Outlet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRail}>
              {outlets.map((outlet) => {
                const id = String(outlet.id);
                return (
                  <Pressable key={id} style={[styles.optionChip, outletId === id && styles.optionChipActive]} onPress={() => setOutletId(id)}>
                    <Text style={[styles.optionText, outletId === id && styles.optionTextActive]}>{String(outlet.name)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.reasonRow}>
              <Pressable style={[styles.reasonButton, reason === "adjust" && styles.reasonButtonActive]} onPress={() => setReason("adjust")}>
                <Text style={[styles.reasonText, reason === "adjust" && styles.reasonTextActive]}>Receive</Text>
              </Pressable>
              <Pressable style={[styles.reasonButton, reason === "damage" && styles.reasonButtonActive]} onPress={() => setReason("damage")}>
                <Text style={[styles.reasonText, reason === "damage" && styles.reasonTextActive]}>Damage</Text>
              </Pressable>
            </View>
            <Field value={qty} onChangeText={setQty} keyboardType="numeric" placeholder={reason === "damage" ? "Quantity damaged" : "Quantity to add"} />
            <Field value={note} onChangeText={setNote} placeholder="Note or reference" />
            <Text style={styles.summaryText}>
              {selectedProduct?.name ?? "Select product"} at {String(selectedOutlet?.name ?? "selected outlet")}
            </Text>
            {adjustStock.error ? <Text style={styles.error}>{adjustStock.error instanceof Error ? adjustStock.error.message : "Adjustment failed"}</Text> : null}
            <View style={styles.modalActions}>
              <Button variant="outline" onPress={() => setAdjustOpen(false)}>Cancel</Button>
              <Button onPress={() => adjustStock.mutate()} disabled={!productId || !outletId || !Number(qty) || adjustStock.isPending}>
                {adjustStock.isPending ? "Saving..." : "Save"}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function LoadingRow({ label }: { label: string }) {
  return <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  toolbar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  itemCell: { width: 170, minWidth: 170 },
  cell: { width: 100, minWidth: 100 },
  rowTitle: { color: colors.ink, fontWeight: "900" },
  rowMeta: { color: colors.muted, fontFamily: typography.monoMedium, fontSize: 11, marginTop: 3 },
  cellText: { width: 150, minWidth: 150, color: colors.ink, fontWeight: "800" },
  mutedText: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  rightMuted: { width: 110, minWidth: 110, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  hint: { color: colors.muted, textAlign: "center", fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 520, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  optionRail: { gap: 8, paddingVertical: 1 },
  optionChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  optionChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  optionTextActive: { color: colors.sidebarText },
  reasonRow: { flexDirection: "row", gap: 8 },
  reasonButton: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  reasonButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  reasonText: { color: colors.ink, fontWeight: "900" },
  reasonTextActive: { color: "#FFF7EF" },
  summaryText: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontWeight: "800" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
