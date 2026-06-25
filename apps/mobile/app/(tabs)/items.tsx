import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type ItemForm = { sku: string; name: string; unit: string; reorderLevel: string };
const emptyForm: ItemForm = { sku: "", name: "", unit: "ea", reorderLevel: "0" };

export default function Items() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const { data: items = [], isLoading, isFetching } = useQuery({ queryKey: ["items"], queryFn: api.items });
  const filtered = useMemo(() => items.filter((item) => [item.sku, item.name, item.unit].join(" ").toLowerCase().includes(query.toLowerCase())), [items, query]);
  const stockValue = filtered.reduce((sum, item) => sum + Number(item.stock ?? 0) * Number(item.averageCost ?? 0), 0);
  const exportRows = filtered.map((item) => ({
    sku: item.sku,
    item: item.name,
    unit: item.unit,
    warehouseStock: item.stock ?? 0,
    averageCost: item.averageCost ?? 0,
    value: Number(item.stock ?? 0) * Number(item.averageCost ?? 0)
  }));
  const create = useMutation({
    mutationFn: () => api.createItem({
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit: form.unit.trim() || "ea",
      reorderLevel: Number(form.reorderLevel || 0)
    }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    }
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Raw stock"
          title="Items / Raw Materials"
          description="Inputs used by product blueprints, purchasing, GRNs and production."
          actions={<CommandButton icon="plus" label="New item" primary onPress={() => setOpen(true)} />}
        />
        <View style={styles.metrics}>
          <MetricCard label="Items" value={filtered.length} icon="beaker-outline" />
          <MetricCard label="Warehouse value" value={formatMwk(stockValue)} tone="accent" icon="warehouse" />
          <MetricCard label="Below reorder" value={filtered.filter((item) => Number(item.stock ?? 0) <= Number(item.reorderLevel ?? 0)).length} icon="alert-outline" />
        </View>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={setQuery} placeholder="Search raw materials" style={styles.search} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="raw-materials" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard>
          <TableHeader columns={["SKU", "Item", "Unit", "Warehouse stock", "Average cost", "Value"]} />
          {isLoading ? <LoadingRow label="Loading raw materials..." /> : null}
          {filtered.map((item) => {
            const qty = Number(item.stock ?? 0);
            const cost = Number(item.averageCost ?? 0);
            return (
              <View key={String(item.id)} style={styles.row}>
                <Text style={styles.monoCell}>{String(item.sku)}</Text>
                <Text style={styles.cellText}>{String(item.name)}</Text>
                <Text style={styles.mutedText}>{String(item.unit)}</Text>
                <Text style={styles.rightCell}>{qty}</Text>
                <Text style={styles.rightCell}>{formatMwk(cost)}</Text>
                <Text style={styles.rightCell}>{formatMwk(qty * cost)}</Text>
              </View>
            );
          })}
        </TableCard>
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>New raw material</Text>
            <Field value={form.sku} onChangeText={(sku) => setForm({ ...form, sku })} placeholder="SKU" />
            <Field value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Item name" />
            <View style={styles.grid}>
              <Field style={styles.gridField} value={form.unit} onChangeText={(unit) => setForm({ ...form, unit })} placeholder="Unit, e.g. L, kg, ea" />
              <Field style={styles.gridField} value={form.reorderLevel} onChangeText={(reorderLevel) => setForm({ ...form, reorderLevel })} keyboardType="numeric" placeholder="Reorder level" />
            </View>
            {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "Save failed"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => create.mutate()} disabled={!form.sku.trim() || !form.name.trim() || create.isPending}>Save</Button>
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
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { gap: 8, padding: 10 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  search: { width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  monoCell: { width: 130, minWidth: 130, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  cellText: { width: 170, minWidth: 170, color: colors.ink, fontWeight: "800" },
  mutedText: { width: 100, minWidth: 100, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 520, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 160 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
