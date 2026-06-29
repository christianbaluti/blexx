import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type ProductionTab = "bom" | "batches" | "waste";

export default function Production() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ProductionTab>("bom");
  const [open, setOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"complete" | "plan">("complete");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [bomId, setBomId] = useState("");
  const [qtyProduced, setQtyProduced] = useState("1");
  const [qtyWaste, setQtyWaste] = useState("0");
  const [extraCost, setExtraCost] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("");
  const { data: boms = [] } = useQuery({ queryKey: ["boms"], queryFn: api.boms });
  const { data: batches = [] } = useQuery({ queryKey: ["production"], queryFn: api.production });
  const totalCost = batches.reduce((sum, batch) => sum + batch.totalCost, 0);
  const totalWaste = batches.reduce((sum, batch) => sum + batch.qtyWaste, 0);
  const selectedBom = boms.find((bom) => bom.id === bomId);
  const invalidateProduction = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["production"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
  };
  const runProduction = useMutation<unknown, Error, void>({
    mutationFn: () => {
      const quantityProduced = Number(qtyProduced || 0);
      const quantityWasted = Number(qtyWaste || 0);
      const common = {
        extraCost: Number(extraCost || 0),
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined
      };
      if (batchId) {
        return api.completeProduction(batchId, {
          quantityToProduce: quantityProduced + quantityWasted,
          quantityProduced,
          quantityWasted,
          ...common
        });
      }
      if (modalMode === "plan") {
        return api.planProduction({
          bomId,
          quantityToProduce: quantityProduced + quantityWasted,
          ...common
        });
      }
      return api.createProduction({
        bomId,
        qtyProduced: quantityProduced,
        qtyWaste: quantityWasted,
        ...common
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setBatchId(null);
      await invalidateProduction();
    }
  });
  const startBatch = useMutation({
    mutationFn: (id: string) => api.startProduction(id),
    onSuccess: invalidateProduction
  });
  const cancelBatch = useMutation({
    mutationFn: (id: string) => api.cancelProduction(id, "Cancelled from production screen"),
    onSuccess: invalidateProduction
  });

  function openRun(nextBomId?: string, mode: "complete" | "plan" = "complete", existingBatch?: typeof batches[number]) {
    setBatchId(existingBatch?.id ?? null);
    setModalMode(mode);
    setBomId(nextBomId ?? boms[0]?.id ?? "");
    setQtyProduced(existingBatch ? String(existingBatch.quantityToProduce || existingBatch.qtyProduced || 1) : "1");
    setQtyWaste("0");
    setExtraCost(existingBatch?.totalCost ? String(existingBatch.totalCost) : "0");
    setSellingPrice("");
    setOpen(true);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Operations"
          title="Production"
          description="Bills of material, batches, raw material deduction, waste tracking and cost calculations."
          actions={(
            <View style={styles.headerActions}>
              <CommandButton icon="clipboard-plus-outline" label="Plan batch" onPress={() => openRun(undefined, "plan")} />
              <CommandButton icon="plus" label="Run now" primary onPress={() => openRun()} />
            </View>
          )}
        />
        <View style={styles.metrics}>
          <MetricCard label="BOMs" value={boms.length} icon="file-tree-outline" />
          <MetricCard label="Batches" value={batches.length} icon="factory" />
          <MetricCard label="Waste units" value={totalWaste} tone={totalWaste ? "warning" : "default"} icon="delete-alert-outline" />
          <MetricCard label="Production cost" value={formatMwk(totalCost)} tone="accent" icon="cash" />
        </View>
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "bom", label: "Bills of material" },
            { key: "batches", label: "Batches" },
            { key: "waste", label: "Waste tracking" }
          ]}
        />

        {tab === "bom" ? (
          <View style={styles.bomList}>
            {boms.map((bom) => {
              const batchCost = bom.laborCost + bom.overhead;
              return (
                <Card key={bom.id} style={styles.bomCard}>
                  <View style={styles.bomHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.smallLabel}>Output</Text>
                      <Text style={styles.bomTitle}>{bom.name}</Text>
                      <Text style={styles.rowMeta}>Produces {bom.productName ?? bom.productId}</Text>
                    </View>
                    <View style={styles.bomActions}>
                      <CommandButton icon="clipboard-plus-outline" label="Plan" onPress={() => openRun(bom.id, "plan")} />
                      <CommandButton icon="source-branch" label="Run" onPress={() => openRun(bom.id)} />
                    </View>
                  </View>
                  <View style={styles.bomGrid}>
                    <View style={styles.recipePanel}>
                      <Text style={styles.recipeTitle}>Recipe controls</Text>
                      <View style={styles.recipeRow}><Text style={styles.rowMeta}>Output quantity</Text><Text style={styles.valueText}>{bom.outputQty ?? 1}</Text></View>
                      <View style={styles.recipeRow}><Text style={styles.rowMeta}>Auto material deduction</Text><Badge tone="success">Enabled</Badge></View>
                      <View style={styles.recipeRow}><Text style={styles.rowMeta}>Cost method</Text><Badge tone="muted">Weighted average</Badge></View>
                    </View>
                    <View style={styles.costPanel}>
                      <View style={styles.costRow}><Text style={styles.rowMeta}>Labour</Text><Text style={styles.valueText}>{formatMwk(bom.laborCost)}</Text></View>
                      <View style={styles.costRow}><Text style={styles.rowMeta}>Overhead</Text><Text style={styles.valueText}>{formatMwk(bom.overhead)}</Text></View>
                      <View style={styles.costTotal}><Text style={styles.costTotalLabel}>Batch base cost</Text><Text style={styles.costTotalValue}>{formatMwk(batchCost)}</Text></View>
                    </View>
                  </View>
                </Card>
              );
            })}
            {!boms.length ? <EmptyPanel icon="file-tree-outline" title="No BOMs yet" body="Create recipes to convert raw materials into finished goods." action={<CommandButton icon="plus" label="New BOM" primary />} /> : null}
          </View>
        ) : null}

        {tab === "batches" ? (
          batches.length ? (
            <TableCard>
              <TableHeader columns={["Reference", "BOM", "Status", "Produced", "Waste", "Cost", "Actions"]} />
              {batches.map((batch) => (
                <View key={batch.id} style={styles.row}>
                  <Text style={styles.cellText}>{batch.refNo}</Text>
                  <View style={styles.cellBlock}>
                    <Text style={styles.cellStrong}>{batch.bomName}</Text>
                    <Text style={styles.rowMeta}>Blueprint v{batch.blueprintVersion ?? 1}</Text>
                  </View>
                  <View style={styles.cell}><Badge tone={batch.status === "completed" ? "success" : batch.status === "cancelled" ? "muted" : "warning"}>{batch.status ?? "completed"}</Badge></View>
                  <Text style={styles.rightCell}>{batch.qtyProduced}</Text>
                  <Text style={[styles.rightCell, batch.qtyWaste > 0 && { color: colors.warning }]}>{batch.qtyWaste}</Text>
                  <Text style={styles.rightCell}>{formatMwk(batch.totalCost)}</Text>
                  <View style={styles.batchActions}>
                    {batch.status === "planned" ? <CommandButton icon="play" label="Start" onPress={() => startBatch.mutate(batch.id)} /> : null}
                    {batch.status === "started" ? <CommandButton icon="check" label="Complete" onPress={() => openRun(batch.bomId, "complete", batch)} /> : null}
                    {batch.status === "planned" || batch.status === "started" ? <CommandButton icon="close" label="Cancel" onPress={() => cancelBatch.mutate(batch.id)} /> : null}
                    {batch.status === "completed" ? <Text style={styles.mutedText}>{new Date(batch.completedAt ?? batch.producedAt).toLocaleDateString()}</Text> : null}
                  </View>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="factory" title="No production batches yet" body="Run a BOM to produce finished goods and deduct raw materials." action={<CommandButton icon="plus" label="New batch" primary onPress={() => openRun()} />} />
        ) : null}

        {tab === "waste" ? (
          batches.some((batch) => batch.qtyWaste > 0) ? (
            <TableCard>
              <TableHeader columns={["Batch", "BOM", "Waste", "Cost impact", "Status"]} />
              {batches.filter((batch) => batch.qtyWaste > 0).map((batch) => (
                <View key={batch.id} style={styles.row}>
                  <Text style={styles.cellText}>{batch.refNo}</Text>
                  <Text style={styles.cellText}>{batch.bomName}</Text>
                  <Text style={styles.rightCell}>{batch.qtyWaste}</Text>
                  <Text style={styles.rightCell}>{formatMwk(Math.round(batch.totalCost * (batch.qtyWaste / Math.max(batch.qtyProduced, 1))))}</Text>
                  <View style={styles.cell}><Badge tone="warning">Review</Badge></View>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="delete-alert-outline" title="No waste recorded" body="Waste from production batches will be flagged here for finance and inventory review." />
        ) : null}
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>{batchId ? "Complete production" : modalMode === "plan" ? "Plan production" : "Run production"}</Text>
            <PickerRail label="BOM blueprint" items={boms.map((bom) => ({ id: bom.id, name: bom.name }))} value={bomId} onChange={setBomId} />
            <View style={styles.locationPill}>
              <MaterialCommunityIcons name="warehouse" size={17} color={colors.accent} />
              <Text style={styles.locationText}>Finished products will be created in Main Warehouse.</Text>
            </View>
            <View style={styles.grid}>
              <Field style={styles.gridField} value={qtyProduced} onChangeText={setQtyProduced} keyboardType="numeric" placeholder="Produced quantity" />
              <Field style={styles.gridField} value={qtyWaste} onChangeText={setQtyWaste} keyboardType="numeric" placeholder="Wasted quantity" />
              <Field style={styles.gridField} value={extraCost} onChangeText={setExtraCost} keyboardType="numeric" placeholder="Extra production cost" />
              <Field style={styles.gridField} value={sellingPrice} onChangeText={setSellingPrice} keyboardType="numeric" placeholder="Selling price after production" />
            </View>
            <Text style={styles.summaryText}>
              Expected output per build: {selectedBom?.outputQty ?? 1}. {modalMode === "plan" && !batchId ? "Planned batches check stock when started and deduct stock when completed." : "Raw items are deducted from Warehouse and finished stock is created in Warehouse."}
            </Text>
            {runProduction.error ? <Text style={styles.error}>{runProduction.error instanceof Error ? runProduction.error.message : "Production failed"}</Text> : null}
            <View style={styles.modalActions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => runProduction.mutate()} disabled={!bomId || !Number(qtyProduced) || runProduction.isPending}>{batchId ? "Complete" : modalMode === "plan" ? "Plan" : "Run"}</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function PickerRail({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
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

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bomList: { gap: 12 },
  bomCard: { gap: 14 },
  bomHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  bomActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  bomTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 21, fontWeight: "700", marginTop: 4 },
  bomGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  recipePanel: { flex: 1, minWidth: 280, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 12, gap: 9 },
  recipeTitle: { color: colors.ink, fontWeight: "900" },
  recipeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  costPanel: { width: 260, maxWidth: "100%", borderRadius: 7, backgroundColor: colors.surfaceAlt, padding: 14, gap: 9 },
  costRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  costTotal: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4 },
  costTotalLabel: { color: colors.ink, fontFamily: typography.displayBold, fontWeight: "700" },
  costTotalValue: { color: colors.accent, fontFamily: typography.monoMedium, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 100 },
  cellBlock: { flex: 1, minWidth: 130 },
  cellStrong: { color: colors.ink, fontWeight: "900" },
  cellText: { flex: 1, minWidth: 130, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 140, color: colors.muted, fontSize: 12 },
  batchActions: { flex: 1.4, minWidth: 180, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  rowMeta: { color: colors.muted, fontSize: 12 },
  valueText: { color: colors.ink, fontFamily: typography.monoMedium, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 560, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  optionRail: { gap: 8 },
  optionChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  optionChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  optionTextActive: { color: colors.sidebarText },
  locationPill: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surfaceAlt, paddingHorizontal: 11 },
  locationText: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 180 },
  summaryText: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontWeight: "800" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
