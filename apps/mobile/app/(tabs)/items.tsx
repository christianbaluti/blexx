import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { type ComponentProps, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type RawItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock: number;
  shopStock: number;
  averageCost: number;
  reorderLevel: number;
  imageData: string | null;
  status: string;
};
type ItemForm = { sku: string; name: string; unit: string; reorderLevel: string; imageData: string | null };

const emptyForm: ItemForm = { sku: "", name: "", unit: "ea", reorderLevel: "0", imageData: null };
const pageSize = 8;
const MAX_IMAGE_BYTES = 100 * 1024;

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function itemToForm(item: RawItem): ItemForm {
  return {
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    reorderLevel: String(item.reorderLevel),
    imageData: item.imageData
  };
}

async function optimizeImage(uri: string) {
  const attempts = [
    { width: 512, compress: 0.45 },
    { width: 384, compress: 0.35 },
    { width: 280, compress: 0.25 },
    { width: 220, compress: 0.18 }
  ];
  for (const attempt of attempts) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: attempt.width } }],
      { base64: true, compress: attempt.compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    if (!result.base64) continue;
    const dataUrl = `data:image/jpeg;base64,${result.base64}`;
    if (dataUrlBytes(dataUrl) <= MAX_IMAGE_BYTES) return dataUrl;
  }
  return null;
}

export default function Items() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawItem | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const { data: itemRows = [], isLoading, isFetching } = useQuery({ queryKey: ["items"], queryFn: api.items });
  const items = itemRows as RawItem[];

  const filtered = useMemo(() => items.filter((item) => [item.sku, item.name, item.unit, item.status].join(" ").toLowerCase().includes(query.toLowerCase())), [items, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const stockValue = filtered.reduce((sum, item) => sum + Number(item.stock ?? 0) * Number(item.averageCost ?? 0), 0);
  const lowCount = filtered.filter((item) => Number(item.stock ?? 0) <= Number(item.reorderLevel ?? 0)).length;
  const exportRows = filtered.map((item) => ({
    sku: item.sku,
    item: item.name,
    unit: item.unit,
    warehouseStock: item.stock,
    shopStock: item.shopStock,
    reorderLevel: item.reorderLevel,
    averageCost: item.averageCost,
    value: item.stock * item.averageCost,
    status: item.stock <= item.reorderLevel ? "low stock" : "ok"
  }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit.trim() || "ea",
        reorderLevel: Number(form.reorderLevel || 0),
        imageData: form.imageData
      };
      if (editing) return api.updateItem(editing.id, payload).then((result) => result as unknown);
      return api.createItem(payload).then((result) => result as unknown);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => Alert.alert("Could not save item", error instanceof Error ? error.message : "Please check the form and try again.")
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: RawItem) {
    setEditing(item);
    setForm(itemToForm(item));
    setOpen(true);
  }

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const imageData = await optimizeImage(result.assets[0].uri);
      if (!imageData) {
        Alert.alert("Image too large", "The optimized image is still above 100 KB. Please choose a smaller image.");
        return;
      }
      setForm((current) => ({ ...current, imageData }));
    } catch (error) {
      Alert.alert("Could not read image", error instanceof Error ? error.message : "Choose another image and try again.");
    }
  }

  function saveItem() {
    if (!form.sku.trim() || !form.name.trim()) {
      Alert.alert("Missing information", "Enter the SKU and item name.");
      return;
    }
    if (Number(form.reorderLevel || 0) < 0) {
      Alert.alert("Invalid reorder level", "Reorder level cannot be negative.");
      return;
    }
    save.mutate();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Raw stock"
          title="Items / Raw Materials"
          description="Inputs used by product blueprints, purchasing, GRNs and production."
          actions={<CommandButton icon="plus" label="New item" primary onPress={openNew} />}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsLine}>
          <MetricCard label="Items" value={filtered.length} icon="beaker-outline" />
          <MetricCard label="Warehouse value" value={formatMwk(stockValue)} tone="accent" icon="warehouse" />
          <MetricCard label="Low stock" value={lowCount} tone={lowCount ? "danger" : "default"} icon="alert-outline" />
          <MetricCard label="With images" value={filtered.filter((item) => item.imageData).length} icon="image-outline" />
        </ScrollView>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search SKU, item, unit or status" style={styles.search} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="raw-materials" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard minWidth={980}>
          <TableHeader columns={["Item", "SKU", "Unit", "Warehouse stock", "Shop stock", "Reorder", "Average cost", "Value", "Status", ""]} />
          {isLoading ? <LoadingRow label="Loading raw materials..." /> : null}
          {!isLoading && rows.map((item) => {
            const qty = Number(item.stock ?? 0);
            const shopQty = Number(item.shopStock ?? 0);
            const cost = Number(item.averageCost ?? 0);
            const low = qty <= Number(item.reorderLevel ?? 0);
            return (
              <Pressable key={String(item.id)} style={[styles.row, low && styles.lowRow]} onPress={() => openEdit(item)}>
                <View style={styles.itemCell}>
                  {item.imageData ? (
                    <Image source={{ uri: item.imageData }} style={styles.itemImage} />
                  ) : (
                    <View style={styles.letterIcon}><Text style={styles.letterText}>{item.name.slice(0, 1).toUpperCase() || "I"}</Text></View>
                  )}
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.monoCell}>{item.sku}</Text>
                <Text style={styles.unitCell}>{item.unit}</Text>
                <Text style={[styles.rightCell, low && styles.lowText]}>{qty}</Text>
                <Text style={styles.rightCell}>{shopQty}</Text>
                <Text style={styles.rightCell}>{item.reorderLevel}</Text>
                <Text style={styles.rightCell}>{formatMwk(cost)}</Text>
                <Text style={styles.rightCell}>{formatMwk(qty * cost)}</Text>
                <View style={styles.statusCell}><Badge tone={low ? "danger" : "success"}>{low ? "Low" : "OK"}</Badge></View>
                <View style={styles.editButton}><MaterialCommunityIcons name="pencil-outline" size={17} color={colors.muted} /></View>
              </Pressable>
            );
          })}
          {!isLoading && !rows.length ? <EmptyPanel icon="beaker-outline" title="No raw items found" body="Create raw materials or receive them through a GRN." /> : null}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <ItemModal
        open={open}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={save.isPending}
        onPickImage={pickImage}
        onClose={() => setOpen(false)}
        onSave={saveItem}
      />
    </Screen>
  );
}

function ItemModal({ open, editing, form, setForm, saving, onPickImage, onClose, onSave }: {
  open: boolean;
  editing: RawItem | null;
  form: ItemForm;
  setForm: (form: ItemForm) => void;
  saving: boolean;
  onPickImage: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>{editing ? "Edit raw material" : "New raw material"}</Text>
                <Text style={styles.modalSub}>Images are optimized and must be under 100 KB.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.ink} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Pressable style={styles.imagePicker} onPress={onPickImage}>
                {form.imageData ? <Image source={{ uri: form.imageData }} style={styles.largeImage} /> : <MaterialCommunityIcons name="image-plus" size={28} color={colors.muted} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.imagePickerText}>{form.imageData ? "Change item image" : "Add item image"}</Text>
                  <Text style={styles.helperText}>Optional JPG image, optimized to 100 KB max.</Text>
                </View>
              </Pressable>
              <View style={styles.grid}>
                <LabeledField label="SKU" value={form.sku} onChangeText={(sku) => setForm({ ...form, sku })} placeholder="RAW-GLY" style={styles.gridField} />
                <LabeledField label="Unit" value={form.unit} onChangeText={(unit) => setForm({ ...form, unit })} placeholder="L, kg, ea" style={styles.gridFieldSmall} />
              </View>
              <LabeledField label="Item name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Glycerine" />
              <LabeledField label="Reorder level" value={form.reorderLevel} onChangeText={(reorderLevel) => setForm({ ...form, reorderLevel })} keyboardType="numeric" placeholder="0" />
            </ScrollView>
            <View style={styles.actions}>
              <Button variant="outline" onPress={onClose}>Cancel</Button>
              <Button onPress={onSave} disabled={saving || !form.sku.trim() || !form.name.trim()}>{saving ? "Saving..." : "Save item"}</Button>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledField({ label, style, inputStyle, ...props }: ComponentProps<typeof Field> & { label: string; inputStyle?: ComponentProps<typeof Field>["style"] }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <Field {...props} style={inputStyle} />
    </View>
  );
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return <View style={styles.pagination}><Button variant="outline" onPress={onPrev} disabled={page <= 1}>Prev</Button><Text style={styles.pageText}>Page {page} of {pages}</Text><Button variant="outline" onPress={onNext} disabled={page >= pages}>Next</Button></View>;
}

function LoadingRow({ label }: { label: string }) {
  return <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metricsLine: { gap: 10, paddingRight: 18 },
  toolbar: { gap: 8, padding: 10 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  search: { width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  lowRow: { backgroundColor: "#fff8f2" },
  itemCell: { width: 190, minWidth: 190, flexDirection: "row", alignItems: "center", gap: 9 },
  itemImage: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  letterIcon: { width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  letterText: { color: colors.accent, fontFamily: typography.sansBlack, fontSize: 14 },
  itemName: { color: colors.ink, flex: 1, fontWeight: "900" },
  monoCell: { width: 120, minWidth: 120, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  unitCell: { width: 80, minWidth: 80, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  lowText: { color: colors.danger, fontWeight: "900" },
  statusCell: { width: 85, minWidth: 85 },
  editButton: { width: 34, minWidth: 34, height: 34, alignItems: "center", justifyContent: "center" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(26,22,17,0.42)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 14 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  modalSub: { color: colors.muted, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  modalBody: { gap: 12, padding: 14 },
  fieldWrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  helperText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flexGrow: 1, flexBasis: 190 },
  gridFieldSmall: { flexGrow: 1, flexBasis: 120 },
  imagePicker: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surfaceAlt, padding: 10 },
  largeImage: { width: 58, height: 58, borderRadius: 7, backgroundColor: colors.surface },
  imagePickerText: { color: colors.ink, fontWeight: "900" },
  actions: { minHeight: 62, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 14 }
});
