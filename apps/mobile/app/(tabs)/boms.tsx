import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type ComponentRow = { key: string; itemId: string; quantity: string };

export default function Boms() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [components, setComponents] = useState<ComponentRow[]>([]);
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
      items: components
        .filter((component) => component.itemId && Number(component.quantity || 0) > 0)
        .map((component) => ({ itemId: component.itemId, quantity: Number(component.quantity || 0) }))
    }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["boms"] });
    }
  });

  function openNew() {
    setProductId(products.find((product) => product.isSellable)?.id ?? products[0]?.id ?? "");
    setName("");
    setOutputQty("1");
    setComponents([{ key: String(Date.now()), itemId: String(items[0]?.id ?? ""), quantity: "1" }]);
    setLaborCost("0");
    setOverhead("0");
    setOpen(true);
  }

  function updateComponent(key: string, patch: Partial<ComponentRow>) {
    setComponents((current) => current.map((component) => component.key === key ? { ...component, ...patch } : component));
  }

  function addComponent() {
    setComponents((current) => [...current, { key: `${Date.now()}-${current.length}`, itemId: String(items[0]?.id ?? ""), quantity: "1" }]);
  }

  function removeComponent(key: string) {
    setComponents((current) => current.length <= 1 ? current : current.filter((component) => component.key !== key));
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
            <View style={styles.componentsBlock}>
              <View style={styles.componentsHeader}>
                <Text style={styles.sectionLabel}>Raw material components</Text>
                <Pressable style={styles.smallAdd} onPress={addComponent}>
                  <Text style={styles.smallAddText}>Add item</Text>
                </Pressable>
              </View>
              {components.map((component, index) => (
                <View key={component.key} style={styles.componentEditor}>
                  <PickerRail
                    label={`Component ${index + 1}`}
                    items={items.map((item) => ({ id: String(item.id), name: String(item.name) }))}
                    value={component.itemId}
                    onChange={(itemId) => updateComponent(component.key, { itemId })}
                  />
                  <View style={styles.componentQtyRow}>
                    <Field style={{ flex: 1 }} value={component.quantity} onChangeText={(quantity) => updateComponent(component.key, { quantity })} keyboardType="numeric" placeholder="Quantity per output" />
                    <Pressable style={styles.removeButton} onPress={() => removeComponent(component.key)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.grid}>
              <Field style={styles.gridField} value={laborCost} onChangeText={setLaborCost} keyboardType="numeric" placeholder="Labour cost" />
              <Field style={styles.gridField} value={overhead} onChangeText={setOverhead} keyboardType="numeric" placeholder="Overhead cost" />
            </View>
            {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "BOM failed"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => create.mutate()} disabled={!name.trim() || !productId || !components.some((component) => component.itemId && Number(component.quantity || 0) > 0) || create.isPending}>Save BOM</Button>
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
  componentsBlock: { gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 10, backgroundColor: colors.surfaceAlt },
  componentsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  smallAdd: { minHeight: 30, justifyContent: "center", borderRadius: 6, backgroundColor: colors.accent, paddingHorizontal: 10 },
  smallAddText: { color: "#FFF7EF", fontSize: 12, fontWeight: "900" },
  componentEditor: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 10 },
  componentQtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeButton: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 10 },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: "900" },
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
