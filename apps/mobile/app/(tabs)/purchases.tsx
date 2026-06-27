import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { type ComponentProps, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { saveBase64File } from "../../src/lib/exportData";
import { colors, typography } from "../../src/lib/theme";

type PoLine = { name: string; description: string; imageData: string | null; unit: string; quantity: string; unitCost: string };
const emptyLine: PoLine = { name: "", description: "", imageData: null, unit: "ea", quantity: "1", unitCost: "0" };

function statusTone(status: string) {
  if (["received", "paid", "closed"].includes(status)) return "success" as const;
  if (["cancelled", "void"].includes(status)) return "danger" as const;
  if (["ordered", "partial", "open"].includes(status)) return "warning" as const;
  return "muted" as const;
}

function cell(value: unknown) {
  return value == null ? "" : String(value);
}

export default function Purchases() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"supplier" | "items">("supplier");
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<PoLine[]>([{ ...emptyLine }]);
  const [landedCost, setLandedCost] = useState("0");
  const [note, setNote] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: purchaseOrders = [], isLoading, isFetching } = useQuery({ queryKey: ["purchase-orders"], queryFn: api.purchaseOrders });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const detail = useQuery({ queryKey: ["purchase-order-detail", detailId], queryFn: () => api.purchaseOrderDetail(detailId!), enabled: Boolean(detailId) });

  const filtered = useMemo(() => purchaseOrders.filter((po) => {
    const text = [cell((po as unknown as Record<string, unknown>).ref_no), po.supplierName ?? "", po.status].join(" ").toLowerCase();
    return !query || text.includes(query.toLowerCase());
  }), [purchaseOrders, query]);
  const ordered = filtered.filter((po) => po.status === "ordered").length;
  const totalValue = filtered.reduce((sum, po) => sum + Number(po.total ?? 0), 0);
  const exportRows = filtered.map((po) => ({
    ref: cell((po as unknown as Record<string, unknown>).ref_no ?? po.id),
    supplier: po.supplierName ?? po.supplierId,
    date: cell((po as unknown as Record<string, unknown>).order_date ?? po.date),
    status: po.status,
    lines: cell((po as unknown as Record<string, unknown>).lineCount ?? ""),
    total: po.total
  }));

  const create = useMutation({
    mutationFn: () => api.createPurchaseOrder({
      supplierId,
      landedCost: Number(landedCost || 0),
      note,
      items: lines.map((line) => ({
        name: line.name.trim(),
        description: line.description.trim() || null,
        imageData: line.imageData,
        unit: line.unit.trim() || "ea",
        quantity: Number(line.quantity || 0),
        unitCost: Number(line.unitCost || 0)
      }))
    }),
    onSuccess: async (created) => {
      setOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setDetailId(created.id);
    },
    onError: (error) => Alert.alert("Could not create purchase order", error instanceof Error ? error.message : "Please check the form and try again.")
  });

  function resetForm() {
    setStep("supplier");
    setSupplierId("");
    setLines([{ ...emptyLine }]);
    setLandedCost("0");
    setNote("");
  }

  function openNew() {
    resetForm();
    setSupplierId(suppliers.find((supplier) => (supplier.status ?? "active") === "active")?.id ?? suppliers[0]?.id ?? "");
    setOpen(true);
  }

  function updateLine(index: number, patch: Partial<PoLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function removeLine(index: number) {
    setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function pickLineImage(index: number) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Photo library permission is required to attach an item picture.");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      let quality = 0.45;
      let dataUrl = "";
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const converted = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 900 } }],
          { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        dataUrl = `data:image/jpeg;base64,${converted.base64 ?? ""}`;
        if (dataUrl.length <= 140_000) break;
        quality = Math.max(0.18, quality - 0.1);
      }
      if (!dataUrl || dataUrl.length > 140_000) {
        Alert.alert("Image too large", "Choose a smaller image. Order item images must stay under about 100 KB after optimization.");
        return;
      }
      updateLine(index, { imageData: dataUrl });
    } catch {
      Alert.alert("Could not attach image", "This image could not be converted. Try a JPG or PNG screenshot/photo.");
    }
  }

  function validateAndContinue() {
    if (!supplierId) {
      Alert.alert("Choose supplier", "Select the supplier for this purchase order first.");
      return;
    }
    setStep("items");
  }

  function submit() {
    const invalid = lines.find((line) => !line.name.trim() || !Number(line.quantity) || Number(line.quantity) <= 0);
    if (invalid) {
      Alert.alert("Check items", "Each line needs an item name and quantity greater than zero.");
      return;
    }
    create.mutate();
  }

  if (detailId) {
    return <PurchaseOrderDetail id={detailId} data={detail.data} loading={detail.isLoading} onBack={() => setDetailId(null)} />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Purchasing"
          title="Purchase Orders"
          description="Create supplier purchase orders, export a PDF, and send order details to the supplier."
          actions={<CommandButton icon="plus" label="New PO" primary onPress={openNew} />}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsLine}>
          <MetricCard label="Purchase orders" value={filtered.length} icon="cart-arrow-down" />
          <MetricCard label="Ordered" value={ordered} tone={ordered ? "warning" : "default"} icon="clock-outline" />
          <MetricCard label="Total value" value={formatMwk(totalValue)} tone="accent" icon="cash-multiple" />
          <MetricCard label="Suppliers" value={suppliers.length} icon="truck-outline" />
        </ScrollView>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={setQuery} placeholder="Search purchase orders" style={styles.search} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="purchase-orders" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard>
          <TableHeader columns={["Ref", "Supplier", "Date", "Status", "Items", "Total", ""]} />
          {isLoading ? <LoadingRow label="Loading purchase orders..." /> : null}
          {!isLoading && filtered.map((po) => (
            <Pressable key={po.id} style={styles.row} onPress={() => setDetailId(po.id)}>
              <Text style={styles.monoCell}>{cell((po as unknown as Record<string, unknown>).ref_no ?? po.id.slice(0, 8).toUpperCase())}</Text>
              <Text style={styles.cellText}>{po.supplierName ?? po.supplierId}</Text>
              <Text style={styles.mutedText}>{new Date(cell((po as unknown as Record<string, unknown>).order_date ?? po.date)).toLocaleDateString()}</Text>
              <View style={styles.cell}><Badge tone={statusTone(po.status)}>{po.status}</Badge></View>
              <Text style={styles.rightCell}>{cell((po as unknown as Record<string, unknown>).lineCount ?? "-")}</Text>
              <Text style={styles.rightCell}>{formatMwk(po.total)}</Text>
              <View style={styles.docButton}><MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} /></View>
            </Pressable>
          ))}
          {!isLoading && !filtered.length ? <EmptyPanel icon="cart-arrow-down" title="No purchase orders" body="Create the first purchase order for a supplier." /> : null}
        </TableCard>
      </ScrollView>
      <PurchaseOrderModal
        open={open}
        step={step}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, email: supplier.email ?? "", status: supplier.status ?? "active" }))}
        supplierId={supplierId}
        setSupplierId={setSupplierId}
        lines={lines}
        landedCost={landedCost}
        note={note}
        saving={create.isPending}
        setLandedCost={setLandedCost}
        setNote={setNote}
        setStep={setStep}
        updateLine={updateLine}
        removeLine={removeLine}
        addLine={() => setLines((current) => [...current, { ...emptyLine }])}
        pickLineImage={pickLineImage}
        onClose={() => { setOpen(false); resetForm(); }}
        onContinue={validateAndContinue}
        onSave={submit}
      />
    </Screen>
  );
}

function PurchaseOrderModal({
  open,
  step,
  suppliers,
  supplierId,
  setSupplierId,
  lines,
  landedCost,
  note,
  saving,
  setLandedCost,
  setNote,
  setStep,
  updateLine,
  removeLine,
  addLine,
  pickLineImage,
  onClose,
  onContinue,
  onSave
}: {
  open: boolean;
  step: "supplier" | "items";
  suppliers: { id: string; name: string; email: string; status: string }[];
  supplierId: string;
  setSupplierId: (value: string) => void;
  lines: PoLine[];
  landedCost: string;
  note: string;
  saving: boolean;
  setLandedCost: (value: string) => void;
  setNote: (value: string) => void;
  setStep: (value: "supplier" | "items") => void;
  updateLine: (index: number, patch: Partial<PoLine>) => void;
  removeLine: (index: number) => void;
  addLine: () => void;
  pickLineImage: (index: number) => void;
  onClose: () => void;
  onContinue: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>New purchase order</Text>
                <Text style={styles.modalSub}>{step === "supplier" ? "Step 1 of 2: choose supplier" : "Step 2 of 2: add order items"}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {step === "supplier" ? (
                <View style={styles.selectorList}>
                  {suppliers.map((supplier) => {
                    const active = supplier.id === supplierId;
                    return (
                      <Pressable key={supplier.id} style={[styles.supplierOption, active && styles.supplierOptionActive]} onPress={() => setSupplierId(supplier.id)}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{supplier.name}</Text>
                          <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{supplier.email || "No email recorded"} - {supplier.status}</Text>
                        </View>
                        {active ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.accent} /> : null}
                      </Pressable>
                    );
                  })}
                  {!suppliers.length ? <Text style={styles.emptyText}>Create a supplier first before making a purchase order.</Text> : null}
                </View>
              ) : (
                <View style={styles.formStack}>
                  {lines.map((line, index) => (
                    <Card key={index} style={styles.lineCard}>
                      <View style={styles.lineHeader}>
                        <Text style={styles.lineTitle}>Item {index + 1}</Text>
                        {lines.length > 1 ? <Pressable onPress={() => removeLine(index)}><MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} /></Pressable> : null}
                      </View>
                      <LabeledField label="Item name" required value={line.name} onChangeText={(name) => updateLine(index, { name })} placeholder="e.g. Glycerine" />
                      <LabeledField label="Description" value={line.description} onChangeText={(description) => updateLine(index, { description })} placeholder="Grade, brand, packaging, or other details" multiline inputStyle={styles.textArea} />
                      <View style={styles.grid}>
                        <LabeledField label="Unit" value={line.unit} onChangeText={(unit) => updateLine(index, { unit })} placeholder="L, kg, ea" style={styles.gridField} />
                        <LabeledField label="Quantity" required value={line.quantity} onChangeText={(quantity) => updateLine(index, { quantity })} keyboardType="numeric" style={styles.gridField} />
                        <LabeledField label="Unit cost" value={line.unitCost} onChangeText={(unitCost) => updateLine(index, { unitCost })} keyboardType="numeric" style={styles.gridField} />
                      </View>
                      <Pressable style={styles.imageButton} onPress={() => pickLineImage(index)}>
                        <MaterialCommunityIcons name={line.imageData ? "image-check-outline" : "image-plus-outline"} size={18} color={colors.ink} />
                        <Text style={styles.imageButtonText}>{line.imageData ? "Picture attached" : "Attach picture if needed"}</Text>
                      </Pressable>
                    </Card>
                  ))}
                  <CommandButton icon="plus" label="Add another item" onPress={addLine} />
                  <View style={styles.grid}>
                    <LabeledField label="Transport / tax / duty / handling" value={landedCost} onChangeText={setLandedCost} keyboardType="numeric" style={styles.gridFieldWide} />
                  </View>
                  <LabeledField label="Order note" value={note} onChangeText={setNote} placeholder="Delivery instructions, terms, or special requirements" multiline inputStyle={styles.textArea} />
                </View>
              )}
            </ScrollView>
            <View style={styles.actions}>
              {step === "items" ? <Button variant="outline" onPress={() => setStep("supplier")}>Back</Button> : <Button variant="outline" onPress={onClose}>Cancel</Button>}
              {step === "supplier" ? <Button onPress={onContinue} disabled={!supplierId}>Next</Button> : <Button onPress={onSave} disabled={saving}>{saving ? "Saving..." : "Save purchase order"}</Button>}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledField({ label, required, style, inputStyle, ...props }: ComponentProps<typeof Field> & { label: string; required?: boolean; inputStyle?: ComponentProps<typeof Field>["style"] }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <Field {...props} style={inputStyle} />
    </View>
  );
}

function PurchaseOrderDetail({ id, data, loading, onBack }: { id: string; data: Record<string, unknown> | undefined; loading: boolean; onBack: () => void }) {
  const email = useMutation({
    mutationFn: () => api.emailPurchaseOrder(id),
    onSuccess: (result) => Alert.alert("Purchase order email", result.message ?? "Email queued."),
    onError: (error) => Alert.alert("Could not email purchase order", error instanceof Error ? error.message : "Download the PDF and send it manually.")
  });
  const download = useMutation({
    mutationFn: () => api.purchaseOrderPdf(id),
    onSuccess: async (file) => {
      await saveBase64File(file.filename, file.data, file.mimeType);
    },
    onError: (error) => Alert.alert("Could not download purchase order", error instanceof Error ? error.message : "Please try again.")
  });
  const items = Array.isArray(data?.items) ? data.items as Record<string, unknown>[] : [];
  const title = cell(data?.refNo ?? data?.ref_no ?? "Purchase order");

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailHeader}>
          <CommandButton icon="arrow-left" label="Purchases" onPress={onBack} />
          <View style={styles.detailActions}>
            <CommandButton icon="file-pdf-box" label={download.isPending ? "Preparing..." : "Download PDF"} onPress={() => download.mutate()} />
            <CommandButton icon="email-outline" label={email.isPending ? "Sending..." : "Email supplier"} primary onPress={() => email.mutate()} />
          </View>
        </View>
        {loading || !data ? <ActivityIndicator color={colors.accent} /> : (
          <>
            <Card style={styles.hero}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle}>{title}</Text>
                <Text style={styles.heroText}>{cell(data.supplierName)} {data.supplierEmail ? `- ${cell(data.supplierEmail)}` : ""}</Text>
                <Text style={styles.heroText}>{cell(data.note || "No note")}</Text>
              </View>
              <Badge tone={statusTone(cell(data.status))}>{cell(data.status)}</Badge>
            </Card>
            <View style={styles.metrics}>
              <MetricCard label="Items" value={items.length} icon="format-list-bulleted" />
              <MetricCard label="Subtotal" value={formatMwk(Number(data.subtotal ?? 0))} icon="cash" />
              <MetricCard label="Landed costs" value={formatMwk(Number(data.landedCost ?? data.landed_cost ?? 0))} icon="truck-delivery-outline" />
              <MetricCard label="Total" value={formatMwk(Number(data.total ?? 0))} tone="accent" icon="cash-multiple" />
            </View>
            <TableCard>
              <TableHeader columns={["Item", "Unit", "Qty", "Cost", "Total"]} />
              {items.map((line) => (
                <View key={cell(line.id)} style={styles.row}>
                  <Text style={styles.cellText}>{cell(line.name)}</Text>
                  <Text style={styles.mutedText}>{cell(line.unit)}</Text>
                  <Text style={styles.rightCell}>{cell(line.quantity)}</Text>
                  <Text style={styles.rightCell}>{formatMwk(Number(line.unitCost ?? 0))}</Text>
                  <Text style={styles.rightCell}>{formatMwk(Number(line.lineTotal ?? 0))}</Text>
                </View>
              ))}
            </TableCard>
          </>
        )}
      </ScrollView>
    </Screen>
  );
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
  cell: { width: 100, minWidth: 100 },
  cellText: { width: 170, minWidth: 170, color: colors.ink, fontWeight: "800" },
  monoCell: { width: 130, minWidth: 130, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  mutedText: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  docButton: { width: 42, minWidth: 42, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(26,22,17,0.42)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 680, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 14 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  modalSub: { color: colors.muted, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  modalBody: { gap: 12, padding: 14 },
  selectorList: { gap: 8 },
  supplierOption: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12 },
  supplierOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionTitle: { color: colors.ink, fontWeight: "900" },
  optionTitleActive: { color: colors.accentDark },
  optionMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  optionMetaActive: { color: colors.accentDark },
  emptyText: { color: colors.muted, textAlign: "center", padding: 18 },
  formStack: { gap: 12 },
  lineCard: { gap: 10, padding: 12 },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineTitle: { color: colors.ink, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flexGrow: 1, flexBasis: 130 },
  gridFieldWide: { flexGrow: 1, flexBasis: 260 },
  fieldWrap: { gap: 5 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  required: { color: colors.danger },
  textArea: { minHeight: 82, paddingTop: 10, textAlignVertical: "top" },
  imageButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 10 },
  imageButtonText: { color: colors.ink, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.line, padding: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  detailActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hero: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 30, fontWeight: "700" },
  heroText: { color: colors.muted, marginTop: 4 }
});
