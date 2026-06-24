import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Boms() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [name, setName] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [componentQty, setComponentQty] = useState("1");
  const [laborCost, setLaborCost] = useState("0");
  const [overhead, setOverhead] = useState("0");
  const { data: boms = [] } = useQuery({ queryKey: ["boms"], queryFn: api.boms });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: api.items });

  const create = useMutation({
    mutationFn: () => api.createBom({
      productId,
      name: name.trim(),
      outputQty: Number(outputQty || 1),
      laborCost: Number(laborCost || 0),
      overheadCost: Number(overhead || 0),
      items: [{ itemId: materialId, quantity: Number(componentQty || 1) }]
    }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["boms"] });
    }
  });

  function openNew() {
    setProductId(products.find((product) => product.isSellable)?.id ?? products[0]?.id ?? "");
    setMaterialId(String(items[0]?.id ?? ""));
    setName("");
    setOutputQty("1");
    setComponentQty("1");
    setLaborCost("0");
    setOverhead("0");
    setOpen(true);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Manufacturing"
          title="Bills of Materials"
          description="Blueprints that turn raw materials into finished products, including expected output and waste tracking."
          actions={<CommandButton icon="plus" label="New BOM" primary onPress={openNew} />}
        />
        {boms.length ? (
          <TableCard>
            <TableHeader columns={["BOM", "Finished product", "Output", "Components", "Labour", "Overhead"]} />
            {boms.map((bom) => (
              <View key={bom.id} style={styles.row}>
                <Text style={styles.cellText}>{bom.name}</Text>
                <Text style={styles.cellText}>{bom.productName ?? bom.productId}</Text>
                <Text style={styles.rightCell}>{bom.outputQty ?? 1}</Text>
                <View style={styles.componentCell}>
                  {(bom.components ?? []).map((component) => (
                    <Badge key={`${bom.id}-${component.productId}`} tone="muted">{component.productName ?? component.productId}: {component.qty}</Badge>
                  ))}
                </View>
                <Text style={styles.rightCell}>{formatMwk(bom.laborCost)}</Text>
                <Text style={styles.rightCell}>{formatMwk(bom.overhead)}</Text>
              </View>
            ))}
          </TableCard>
        ) : <EmptyPanel icon="file-tree-outline" title="No BOMs yet" body="Create a build blueprint before running production." action={<CommandButton icon="plus" label="New BOM" primary onPress={openNew} />} />}
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>New build blueprint</Text>
            <Field value={name} onChangeText={setName} placeholder="BOM name" />
            <PickerRail label="Finished product" items={products.map((product) => ({ id: product.id, name: product.name }))} value={productId} onChange={setProductId} />
            <Field value={outputQty} onChangeText={setOutputQty} keyboardType="numeric" placeholder="Expected output quantity" />
            <PickerRail label="Raw material component" items={items.map((item) => ({ id: String(item.id), name: String(item.name) }))} value={materialId} onChange={setMaterialId} />
            <Field value={componentQty} onChangeText={setComponentQty} keyboardType="numeric" placeholder="Material quantity per output" />
            <View style={styles.grid}>
              <Field style={styles.gridField} value={laborCost} onChangeText={setLaborCost} keyboardType="numeric" placeholder="Labour cost" />
              <Field style={styles.gridField} value={overhead} onChangeText={setOverhead} keyboardType="numeric" placeholder="Overhead cost" />
            </View>
            {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "BOM failed"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => create.mutate()} disabled={!name.trim() || !productId || !materialId || productId === materialId || create.isPending}>Save BOM</Button>
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
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cellText: { flex: 1, minWidth: 140, color: colors.ink, fontWeight: "800" },
  componentCell: { flex: 1.5, minWidth: 220, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  optionRail: { gap: 8 },
  optionChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  optionChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  optionTextActive: { color: colors.sidebarText },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 180 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
