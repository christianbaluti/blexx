import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Product } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Field, Screen, Button } from "../../src/components/ui";
import { Login } from "../../src/components/login";
import { ExportMenu } from "../../src/components/export-menu";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, typography } from "../../src/lib/theme";

type ProductForm = {
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  unit: string;
  cost: string;
  price: string;
  reorder: string;
  imageUrl: string | null;
  isSellable: boolean;
  isRaw: boolean;
};

const emptyForm: ProductForm = {
  sku: "",
  barcode: "",
  name: "",
  categoryId: "",
  unit: "ea",
  cost: "0",
  price: "0",
  reorder: "0",
  imageUrl: null,
  isSellable: true,
  isRaw: false
};
const MAX_IMAGE_BYTES = 100 * 1024;

function productToForm(product: Product): ProductForm {
  return {
    sku: product.sku,
    barcode: product.barcode ?? "",
    name: product.name,
    categoryId: product.categoryId ?? "",
    unit: product.unit,
    cost: String(product.cost),
    price: String(product.price),
    reorder: String(product.reorder),
    imageUrl: product.imageUrl,
    isSellable: product.isSellable,
    isRaw: product.isRaw
  };
}

export default function Products() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: api.products, enabled: auth.isAuthenticated });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.categories, enabled: auth.isAuthenticated });

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const text = [p.name, p.sku, p.barcode ?? "", p.categoryName ?? ""].join(" ").toLowerCase();
        return (!query || text.includes(query.toLowerCase())) && (categoryFilter === "all" || p.categoryId === categoryFilter);
      }),
    [categoryFilter, products, query]
  );

  const saveProduct = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        name: form.name.trim(),
        categoryId: form.categoryId || null,
        unit: form.unit.trim() || "ea",
        cost: Number(form.cost || 0),
        price: Number(form.price || 0),
        reorder: Number(form.reorder || 0),
        imageUrl: form.imageUrl,
        isSellable: form.isSellable,
        isRaw: form.isRaw
      };
      if (editing) return api.updateProduct(editing.id, payload);
      return api.createProduct(payload);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });
  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  if (!auth.isAuthenticated) return <Login />;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm(productToForm(product));
    setFormOpen(true);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.18,
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const imageUrl = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    if (dataUrlBytes(imageUrl) > MAX_IMAGE_BYTES) {
      Alert.alert("Image too large", "The optimized image is still above 100 KB. Please choose a smaller square image.");
      return;
    }
    setForm((current) => ({ ...current, imageUrl }));
  }

  const exportRows = filtered.map((product) => ({
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? "",
    category: product.categoryName ?? "Uncategorised",
    cost: product.cost,
    price: product.price,
    stock: product.stock,
    reorder: product.reorder,
    unit: product.unit
  }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Catalogue"
          title="Products"
          description="Manage SKUs, barcodes, product photos, pricing, categories and stock thresholds."
          actions={<CommandButton icon="plus" label="New product" primary onPress={openNew} />}
        />

        <View style={styles.metrics}>
          <MetricCard label="Total SKUs" value={products.length} icon="tag-multiple-outline" />
          <MetricCard label="Categories" value={categories.length} icon="shape-outline" />
          <MetricCard label="Stock value" value={formatMwk(products.reduce((sum, item) => sum + item.stock * item.cost, 0))} icon="cash-multiple" />
          <MetricCard label="Low stock" value={products.filter((item) => item.stock <= item.reorder).length} tone="danger" icon="alert-octagon-outline" />
        </View>

        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search name, SKU, barcode or category" style={styles.searchField} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
              {[{ id: "all", name: "All" }, ...categories].map((category) => {
                const active = categoryFilter === category.id;
                return (
                  <Pressable key={category.id} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setCategoryFilter(category.id)}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ExportMenu title="products" rows={exportRows} />
            {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
          <TableHeader columns={["Product", "SKU", "Barcode", "Category", "Cost", "Price", "Stock", ""]} />
          {filtered.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => openEdit(item)}>
              <View style={styles.productCell}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.productImage} />
                ) : (
                  <View style={styles.productIcon}><MaterialCommunityIcons name="package-variant-closed" size={16} color={colors.muted} /></View>
                )}
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              </View>
              <Text style={styles.monoCell}>{item.sku}</Text>
              <Text style={styles.mutedCell} numberOfLines={1}>{item.barcode ?? "-"}</Text>
              <View style={styles.cell}><Badge tone="muted">{item.categoryName ?? "Uncategorised"}</Badge></View>
              <Text style={styles.rightCell}>{formatMwk(item.cost)}</Text>
              <Text style={styles.rightCell}>{item.price ? formatMwk(item.price) : "-"}</Text>
              <Text style={[styles.rightCell, item.stock <= item.reorder && styles.lowStock]}>{item.stock} {item.unit}</Text>
              <View style={styles.editButton}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.muted} />
              </View>
            </Pressable>
          ))}
        </TableCard>
      </ScrollView>

      <ProductModal
        open={formOpen}
        editing={editing}
        form={form}
        categories={categories}
        saving={saveProduct.isPending}
        error={saveProduct.error instanceof Error ? saveProduct.error.message : null}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onPickImage={pickImage}
        onClose={() => setFormOpen(false)}
        onSave={() => saveProduct.mutate()}
        onDelete={editing ? () => {
          Alert.alert("Delete product", "This will permanently delete this product and its linked stock/BOM rows from the database.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => deleteProduct.mutate(editing.id) }
          ]);
        } : undefined}
      />
    </Screen>
  );
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function ProductModal({
  open,
  editing,
  form,
  categories,
  saving,
  error,
  onChange,
  onPickImage,
  onClose,
  onSave,
  onDelete
}: {
  open: boolean;
  editing: Product | null;
  form: ProductForm;
  categories: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<ProductForm>) => void;
  onPickImage: () => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel}>
          <ScrollView contentContainerStyle={styles.panelContent}>
            <Text style={styles.modalTitle}>{editing ? "Edit product" : "New product"}</Text>
            <Pressable style={styles.imagePicker} onPress={onPickImage}>
              {form.imageUrl ? <Image source={{ uri: form.imageUrl }} style={styles.largeImage} /> : <MaterialCommunityIcons name="image-plus" size={28} color={colors.muted} />}
              <Text style={styles.imagePickerText}>{form.imageUrl ? "Change product image" : "Add product image"}</Text>
            </Pressable>
            <View style={styles.grid}>
              <Field style={styles.gridField} placeholder="SKU" value={form.sku} onChangeText={(sku) => onChange({ sku })} />
              <Field style={styles.gridField} placeholder="Barcode" value={form.barcode} onChangeText={(barcode) => onChange({ barcode })} />
              <Field style={styles.gridFieldWide} placeholder="Product name" value={form.name} onChangeText={(name) => onChange({ name })} />
              <Field style={styles.gridField} placeholder="Unit" value={form.unit} onChangeText={(unit) => onChange({ unit })} />
              <Field style={styles.gridField} placeholder="Cost" value={form.cost} keyboardType="numeric" onChangeText={(cost) => onChange({ cost })} />
              <Field style={styles.gridField} placeholder="Price" value={form.price} keyboardType="numeric" onChangeText={(price) => onChange({ price })} />
              <Field style={styles.gridField} placeholder="Reorder quantity" value={form.reorder} keyboardType="numeric" onChangeText={(reorder) => onChange({ reorder })} />
            </View>
            <Text style={styles.sectionLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
              {[{ id: "", name: "Uncategorised" }, ...categories].map((category) => {
                const active = form.categoryId === category.id;
                return (
                  <Pressable key={category.id || "none"} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => onChange({ categoryId: category.id })}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.switchRow}>
              <Toggle label="Sellable" active={form.isSellable} onPress={() => onChange({ isSellable: !form.isSellable })} />
              <Toggle label="Raw item" active={form.isRaw} onPress={() => onChange({ isRaw: !form.isRaw })} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              {onDelete ? <Button variant="ghost" onPress={onDelete}>Delete</Button> : null}
              <Button variant="outline" onPress={onClose}>Cancel</Button>
              <Button onPress={onSave} disabled={saving || !form.sku.trim() || !form.name.trim()}>{saving ? "Saving..." : "Save product"}</Button>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.toggle, active && styles.toggleActive]} onPress={onPress}>
      <MaterialCommunityIcons name={active ? "check-circle" : "circle-outline"} size={17} color={active ? "#FFF7EF" : colors.muted} />
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 260, flexGrow: 1, flexBasis: 320, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  filterRail: { gap: 8, alignItems: "center", paddingVertical: 1 },
  filterChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  filterChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  filterTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  productCell: { flex: 1.45, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 9 },
  productIcon: { width: 32, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  productImage: { width: 32, height: 32, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  name: { color: colors.ink, flex: 1, fontWeight: "900" },
  cell: { flex: 1, minWidth: 100 },
  monoCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  mutedCell: { flex: 1, minWidth: 130, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  lowStock: { color: colors.danger, fontWeight: "900" },
  editButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  panelContent: { gap: 12, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 24, fontWeight: "700" },
  imagePicker: { minHeight: 112, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  largeImage: { width: "100%", height: 150 },
  imagePickerText: { color: colors.ink, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flexGrow: 1, flexBasis: 180 },
  gridFieldWide: { flexGrow: 1, flexBasis: 380 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  switchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  toggleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleText: { color: colors.ink, fontWeight: "900" },
  toggleTextActive: { color: "#FFF7EF" },
  error: { color: colors.danger, fontWeight: "800" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
