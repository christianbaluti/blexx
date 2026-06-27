import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ComponentProps, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type GrnLine = { itemId: string; quantity: string; unitCost: string };
type GrnForm = { supplierId: string; locationId: string; note: string; createInvoice: boolean; invoiceDueDate: string; lines: GrnLine[] };

const emptyLine: GrnLine = { itemId: "", quantity: "1", unitCost: "0" };
const emptyForm: GrnForm = { supplierId: "", locationId: "", note: "", createInvoice: false, invoiceDueDate: "", lines: [{ ...emptyLine }] };

function cell(value: unknown) {
  return value == null ? "" : String(value);
}

export default function Grn() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<GrnForm>(emptyForm);
  const [detailId, setDetailId] = useState<string | null>(null);
  const pageSize = 8;

  const { data: grns = [], isLoading, isFetching } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: outlets = [] } = useQuery({ queryKey: ["outlets"], queryFn: api.outlets });
  const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: api.items });
  const detail = useQuery({ queryKey: ["grn-detail", detailId], queryFn: () => api.grnDetail(detailId!), enabled: Boolean(detailId) });

  const warehouses = outlets.filter((outlet) => String(outlet.type) === "warehouse");
  const filtered = useMemo(() => grns.filter((grn) => {
    const text = [grn.refNo, grn.supplierName ?? "", grn.outletName ?? "", grn.note ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (supplierFilter === "all" || grn.supplierId === supplierFilter);
  }), [grns, query, supplierFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalValue = filtered.reduce((sum, grn) => sum + Number(grn.total ?? 0), 0);
  const totalItems = filtered.reduce((sum, grn) => sum + Number(grn.totalItems ?? 0), 0);
  const exportRows = filtered.map((grn) => ({
    grn: grn.refNo,
    supplier: grn.supplierName ?? "",
    warehouse: grn.outletName ?? "",
    items: grn.totalItems,
    value: grn.total ?? 0,
    received: grn.receivedAt,
    note: grn.note ?? ""
  }));

  const create = useMutation({
    mutationFn: () => api.createGrn({
      supplierId: form.supplierId,
      locationId: form.locationId,
      note: form.note || null,
      createInvoice: form.createInvoice,
      invoiceDueDate: form.invoiceDueDate || null,
      items: form.lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity || 0), unitCost: Number(line.unitCost || 0) }))
    }),
    onSuccess: async (created) => {
      setFormOpen(false);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grn"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] })
      ]);
      setDetailId(created.id);
    },
    onError: (error) => Alert.alert("Could not save GRN", error instanceof Error ? error.message : "Please check the form and try again.")
  });

  function openNew() {
    setForm({
      ...emptyForm,
      supplierId: suppliers.find((supplier) => (supplier.status ?? "active") === "active")?.id ?? suppliers[0]?.id ?? "",
      locationId: String(warehouses.find((warehouse) => Boolean(warehouse.isDefault))?.id ?? warehouses[0]?.id ?? ""),
      lines: [{ ...emptyLine, itemId: String(items[0]?.id ?? "") }]
    });
    setFormOpen(true);
  }

  function saveGrn() {
    if (!form.supplierId || !form.locationId) {
      Alert.alert("Missing information", "Choose a supplier and receiving warehouse.");
      return;
    }
    const invalid = form.lines.find((line) => !line.itemId || !Number(line.quantity) || Number(line.quantity) <= 0);
    if (invalid) {
      Alert.alert("Check goods", "Each received line needs an item and quantity greater than zero.");
      return;
    }
    create.mutate();
  }

  if (detailId) {
    return <GrnDetail data={detail.data} loading={detail.isLoading} onBack={() => setDetailId(null)} />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Receiving" title="Goods Received Notes" description="Record supplier deliveries into warehouse stock and optionally create the supplier invoice at the same time." actions={<CommandButton icon="plus" label="New GRN" primary onPress={openNew} />} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsLine}>
          <MetricCard label="GRNs" value={filtered.length} icon="package-variant-closed-check" />
          <MetricCard label="Received value" value={formatMwk(totalValue)} tone="accent" icon="cash" />
          <MetricCard label="Items received" value={totalItems} icon="format-list-numbered" />
          <MetricCard label="Warehouses" value={warehouses.length} icon="warehouse" />
        </ScrollView>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search GRN, supplier, warehouse" style={styles.search} />
          <Picker items={[{ id: "all", name: "All suppliers" }, ...suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))]} value={supplierFilter} onChange={(value) => { setSupplierFilter(value); setPage(1); }} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="grns" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard>
          <TableHeader columns={["GRN", "Supplier", "Location", "Items", "Value", "Received", "Status"]} />
          {isLoading ? <LoadingRow label="Loading GRNs..." /> : null}
          {!isLoading && rows.map((grn) => (
            <Pressable key={grn.id} style={styles.row} onPress={() => setDetailId(grn.id)}>
              <Text style={styles.refCell}>{grn.refNo}</Text>
              <Text style={styles.nameCell}>{grn.supplierName ?? "-"}</Text>
              <Text style={styles.locationCell}>{grn.outletName ?? "-"}</Text>
              <Text style={styles.countCell}>{grn.totalItems}</Text>
              <Text style={styles.moneyCell}>{formatMwk(Number(grn.total ?? 0))}</Text>
              <Text style={styles.dateCell}>{new Date(grn.receivedAt).toLocaleString()}</Text>
              <View style={styles.statusCell}><Badge tone="success">Received</Badge></View>
            </Pressable>
          ))}
          {!isLoading && !rows.length ? <EmptyPanel icon="package-variant-closed-check" title="No GRNs found" body="Receive supplier goods into a warehouse to create the first GRN." /> : null}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <GrnModal
        open={formOpen}
        form={form}
        setForm={setForm}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        warehouses={warehouses.map((warehouse) => ({ id: String(warehouse.id), name: String(warehouse.name) }))}
        items={items.map((item) => ({ id: String(item.id), name: `${String(item.name)} (${String(item.unit ?? "ea")})` }))}
        saving={create.isPending}
        onClose={() => setFormOpen(false)}
        onSave={saveGrn}
      />
    </Screen>
  );
}

function GrnModal({ open, form, setForm, suppliers, warehouses, items, saving, onClose, onSave }: {
  open: boolean;
  form: GrnForm;
  setForm: (form: GrnForm) => void;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  items: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  function updateLine(index: number, patch: Partial<GrnLine>) {
    setForm({ ...form, lines: form.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) });
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { ...emptyLine, itemId: items[0]?.id ?? "" }] });
  }

  function removeLine(index: number) {
    if (form.lines.length === 1) return;
    setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) });
  }

  return (
    <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>Receive goods</Text>
                <Text style={styles.modalSub}>Supplier delivery into warehouse stock</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.ink} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <LabeledPicker label="Supplier" items={suppliers} value={form.supplierId} onChange={(supplierId) => setForm({ ...form, supplierId })} />
              <LabeledPicker label="Receiving warehouse" items={warehouses} value={form.locationId} onChange={(locationId) => setForm({ ...form, locationId })} />
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Goods in this batch</Text>
                <CommandButton icon="plus" label="Add item" onPress={addLine} />
              </View>
              {form.lines.map((line, index) => (
                <Card key={index} style={styles.lineCard}>
                  <View style={styles.lineHeader}>
                    <Text style={styles.lineTitle}>Line {index + 1}</Text>
                    {form.lines.length > 1 ? <Pressable onPress={() => removeLine(index)}><MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} /></Pressable> : null}
                  </View>
                  <LabeledPicker label="Raw item" items={items} value={line.itemId} onChange={(itemId) => updateLine(index, { itemId })} />
                  <View style={styles.grid}>
                    <LabeledField label="Quantity received" value={line.quantity} onChangeText={(quantity) => updateLine(index, { quantity })} keyboardType="numeric" style={styles.gridField} />
                    <LabeledField label="Buying price per unit" value={line.unitCost} onChangeText={(unitCost) => updateLine(index, { unitCost })} keyboardType="numeric" style={styles.gridField} />
                  </View>
                </Card>
              ))}
              <Pressable style={styles.checkRow} onPress={() => setForm({ ...form, createInvoice: !form.createInvoice })}>
                <MaterialCommunityIcons name={form.createInvoice ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={form.createInvoice ? colors.accent : colors.muted} />
                <Text style={styles.checkText}>Create supplier invoice from this GRN</Text>
              </Pressable>
              {form.createInvoice ? <LabeledField label="Invoice due date" value={form.invoiceDueDate} onChangeText={(invoiceDueDate) => setForm({ ...form, invoiceDueDate })} placeholder="YYYY-MM-DD" /> : null}
              <LabeledField label="Receiving note" value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Batch condition, delivery note number, or remarks" multiline inputStyle={styles.textArea} />
            </ScrollView>
            <View style={styles.actions}>
              <Button variant="outline" onPress={onClose}>Cancel</Button>
              <Button onPress={onSave} disabled={saving}>{saving ? "Saving..." : "Save GRN"}</Button>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function GrnDetail({ data, loading, onBack }: { data: Record<string, unknown> | undefined; loading: boolean; onBack: () => void }) {
  const lines = Array.isArray(data?.items) ? data.items as Record<string, unknown>[] : [];
  const exportRows = lines.map((line) => ({
    item: line.item_name,
    sku: line.sku ?? "",
    quantity: line.quantity,
    unitCost: line.unit_cost,
    landedUnitCost: line.landed_unit_cost,
    lineTotal: line.line_total
  }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailTop}>
          <CommandButton icon="arrow-left" label="GRNs" onPress={onBack} />
          <ExportMenu title={`${String(data?.ref_no ?? data?.refNo ?? "grn")}-detail`} rows={exportRows} />
        </View>
        {loading || !data ? <LoadingRow label="Loading GRN..." /> : (
          <>
            <Card style={styles.hero}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle}>{String(data.ref_no ?? data.refNo ?? "GRN")}</Text>
                <Text style={styles.heroText}>Supplier: {String(data.supplier_name ?? data.supplierName ?? "-")}</Text>
                <Text style={styles.heroText}>Note: {String(data.note ?? "-")}</Text>
              </View>
              <Badge tone="success">Received</Badge>
            </Card>
            <View style={styles.metrics}>
              <MetricCard label="Lines" value={lines.length} icon="format-list-bulleted" />
              <MetricCard label="Total value" value={formatMwk(Number(data.total ?? 0))} tone="accent" icon="cash" />
            </View>
            <View style={styles.detailActions}>
              <CommandButton icon="file-document-plus-outline" label="Record invoice" primary onPress={() => router.push("/supplier-invoices" as never)} />
            </View>
            <TableCard>
              <TableHeader columns={["Item", "Reference", "Qty", "Cost", "Total"]} />
              {lines.map((line) => (
                <View key={String(line.id)} style={styles.row}>
                  <Text style={styles.nameCell}>{String(line.item_name ?? "-")}</Text>
                  <Text style={styles.refCell}>{String(line.sku ?? "-")}</Text>
                  <Text style={styles.countCell}>{String(line.quantity ?? "0")}</Text>
                  <Text style={styles.moneyCell}>{formatMwk(Number(line.unit_cost ?? 0))}</Text>
                  <Text style={styles.moneyCell}>{formatMwk(Number(line.line_total ?? 0))}</Text>
                </View>
              ))}
            </TableCard>
          </>
        )}
      </ScrollView>
    </Screen>
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

function LabeledPicker({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <Picker items={items} value={value} onChange={onChange} />
    </View>
  );
}

function Picker({ items, value, onChange }: { items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {items.map((item) => (
        <Pressable key={item.id || "none"} style={[styles.chip, value === item.id && styles.chipActive]} onPress={() => onChange(item.id)}>
          <Text style={[styles.chipText, value === item.id && styles.chipTextActive]}>{item.name}</Text>
        </Pressable>
      ))}
      {!items.length ? <Text style={styles.emptyInline}>Nothing available</Text> : null}
    </ScrollView>
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
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricsLine: { gap: 10, paddingRight: 18 },
  toolbar: { gap: 8, padding: 10 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  search: { width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  refCell: { width: 130, minWidth: 130, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  nameCell: { width: 170, minWidth: 170, color: colors.ink, fontWeight: "800" },
  locationCell: { width: 150, minWidth: 150, color: colors.ink, fontWeight: "800" },
  countCell: { width: 100, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  moneyCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  dateCell: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  statusCell: { width: 100, minWidth: 100 },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 38, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "900" },
  chipTextActive: { color: colors.sidebarText },
  emptyInline: { color: colors.muted, fontWeight: "700", paddingVertical: 8 },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(26,22,17,0.42)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 700, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 14 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  modalSub: { color: colors.muted, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  modalBody: { gap: 12, padding: 14 },
  fieldWrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  lineCard: { gap: 10, padding: 12 },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineTitle: { color: colors.ink, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flexGrow: 1, flexBasis: 180 },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  checkRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10 },
  checkText: { color: colors.ink, fontWeight: "800", flex: 1 },
  actions: { minHeight: 62, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 14 },
  detailTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  detailActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18 },
  heroTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 34, fontWeight: "900" },
  heroText: { color: colors.muted, fontSize: 14, marginTop: 5 }
});
