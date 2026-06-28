import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { AttachmentPicker } from "../../src/components/attachment-picker";
import { AttachmentActions } from "../../src/components/attachment-actions";
import { DatePickerField } from "../../src/components/date-picker-field";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type ReceiveMode = "po" | "direct";
type ExtraCost = { description: string; amount: string };
type GrnLine = {
  purchaseOrderItemId?: string | null;
  itemId: string;
  itemName: string;
  unit: string;
  orderedQty?: number;
  remainingQty?: number;
  quantity: string;
  unitCost: string;
  expiryDate: string;
  createNew?: boolean;
  newName?: string;
  newUnit?: string;
};
type GrnForm = {
  supplierId: string;
  locationId: string;
  receiveMode: ReceiveMode;
  purchaseOrderId: string;
  note: string;
  createInvoice: boolean;
  invoiceDueDate: string;
  invoiceAttachmentName: string;
  invoiceAttachmentMime: string;
  invoiceAttachmentData: string;
  extraCosts: ExtraCost[];
  lines: GrnLine[];
};

const emptyLine: GrnLine = { itemId: "", itemName: "", unit: "each", quantity: "1", unitCost: "0", expiryDate: "" };
const emptyForm: GrnForm = { supplierId: "", locationId: "", receiveMode: "po", purchaseOrderId: "", note: "", createInvoice: false, invoiceDueDate: "", invoiceAttachmentName: "", invoiceAttachmentMime: "", invoiceAttachmentData: "", extraCosts: [], lines: [{ ...emptyLine }] };

function numberValue(value: string) {
  return Number(value || 0);
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
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ["purchase-orders"], queryFn: api.purchaseOrders });
  const detail = useQuery({ queryKey: ["grn-detail", detailId], queryFn: () => api.grnDetail(detailId!), enabled: Boolean(detailId) });
  const poDetail = useQuery({ queryKey: ["purchase-order-detail", form.purchaseOrderId], queryFn: () => api.purchaseOrderDetail(form.purchaseOrderId), enabled: formOpen && form.receiveMode === "po" && Boolean(form.purchaseOrderId) });

  const locations = outlets.filter((outlet) => ["warehouse", "shop"].includes(String(outlet.type)));
  const activePurchaseOrders = purchaseOrders.filter((po) => po.supplierId === form.supplierId && !["received", "cancelled"].includes(String(po.status)));
  const filtered = useMemo(() => grns.filter((grn) => {
    const text = [grn.refNo, grn.poRefNo ?? "", grn.supplierName ?? "", grn.outletName ?? "", grn.note ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (supplierFilter === "all" || grn.supplierId === supplierFilter);
  }), [grns, query, supplierFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalValue = filtered.reduce((sum, grn) => sum + Number(grn.total ?? 0), 0);
  const exportRows = filtered.map((grn) => ({
    grn: grn.refNo,
    purchaseOrder: grn.poRefNo ?? "",
    supplier: grn.supplierName ?? "",
    receivingPoint: grn.outletName ?? "",
    items: grn.totalItems,
    total: grn.total ?? 0,
    received: grn.receivedAt,
    note: grn.note ?? ""
  }));

  useEffect(() => {
    if (!poDetail.data || form.receiveMode !== "po") return;
    const lines = Array.isArray(poDetail.data.items) ? poDetail.data.items as Record<string, unknown>[] : [];
    setForm((current) => ({
      ...current,
      lines: lines
        .filter((line) => Number(line.remainingQty ?? line.quantity ?? 0) > 0)
        .map((line) => ({
          purchaseOrderItemId: String(line.id),
          itemId: String(line.itemId),
          itemName: String(line.name ?? "Item"),
          unit: String(line.unit ?? "each"),
          orderedQty: Number(line.quantity ?? 0),
          remainingQty: Number(line.remainingQty ?? line.quantity ?? 0),
          quantity: String(Number(line.remainingQty ?? line.quantity ?? 0)),
          unitCost: String(Number(line.unitCost ?? 0)),
          expiryDate: ""
        }))
    }));
  }, [poDetail.data, form.receiveMode]);

  const create = useMutation({
    mutationFn: () => api.createGrn({
      supplierId: form.supplierId,
      locationId: form.locationId,
      purchaseOrderId: form.receiveMode === "po" ? form.purchaseOrderId || null : null,
      note: form.note || null,
      createInvoice: form.createInvoice,
      invoiceDueDate: form.invoiceDueDate || null,
      invoiceAttachmentName: form.invoiceAttachmentName || null,
      invoiceAttachmentMime: form.invoiceAttachmentMime || null,
      invoiceAttachmentData: form.invoiceAttachmentData || null,
      invoiceExtraCosts: form.extraCosts.filter((cost) => cost.description.trim() && numberValue(cost.amount) > 0).map((cost) => ({ description: cost.description.trim(), amount: numberValue(cost.amount) })),
      items: form.lines.map((line) => ({
        purchaseOrderItemId: form.receiveMode === "po" ? line.purchaseOrderItemId ?? null : null,
        itemId: line.createNew ? null : line.itemId || null,
        name: line.createNew ? line.newName?.trim() : undefined,
        unit: line.createNew ? line.newUnit || "each" : line.unit || "each",
        quantity: numberValue(line.quantity),
        unitCost: numberValue(line.unitCost),
        expiryDate: line.expiryDate || null
      }))
    }),
    onSuccess: async (created) => {
      setFormOpen(false);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grn"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] })
      ]);
      setDetailId(created.id);
    },
    onError: (error) => Alert.alert("Could not save GRN", error instanceof Error ? error.message : "Please check the form and try again.")
  });

  function openNew() {
    const supplierId = suppliers.find((supplier) => (supplier.status ?? "active") === "active")?.id ?? suppliers[0]?.id ?? "";
    const locationId = String(locations.find((location) => Boolean(location.isDefault) && String(location.type) === "warehouse")?.id ?? locations[0]?.id ?? "");
    setForm({ ...emptyForm, supplierId, locationId, lines: [{ ...emptyLine, itemId: String(items[0]?.id ?? ""), itemName: String(items[0]?.name ?? ""), unit: String(items[0]?.unit ?? "each") }] });
    setFormOpen(true);
  }

  function saveGrn() {
    if (!form.supplierId || !form.locationId) return Alert.alert("Missing information", "Choose a supplier and receiving point.");
    if (form.receiveMode === "po" && !form.purchaseOrderId) return Alert.alert("Missing purchase order", "Choose the PO this delivery belongs to, or switch to direct delivery.");
    const invalid = form.lines.find((line) => {
      if (numberValue(line.quantity) <= 0 || numberValue(line.unitCost) < 0) return true;
      if (form.receiveMode === "po" && numberValue(line.quantity) > Number(line.remainingQty ?? 0)) return true;
      if (line.createNew) return !line.newName?.trim();
      return !line.itemId;
    });
    if (invalid) return Alert.alert("Check goods", "Every received line needs a valid item, quantity, and cost. PO deliveries cannot receive above the remaining quantity.");
    create.mutate();
  }

  if (detailId) {
    return <GrnDetail data={detail.data} loading={detail.isLoading} onBack={() => setDetailId(null)} />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Receiving" title="Goods Received Notes" description="Record supplier deliveries, match them to purchase orders, and create supplier invoices when required." actions={<CommandButton icon="plus" label="New GRN" primary onPress={openNew} />} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsLine}>
          <MetricCard label="GRNs" value={filtered.length} icon="package-variant-closed-check" />
          <MetricCard label="Received value" value={formatMwk(totalValue)} tone="accent" icon="cash" />
          <MetricCard label="Against PO" value={filtered.filter((grn) => grn.poId).length} icon="file-document-check-outline" />
          <MetricCard label="Direct" value={filtered.filter((grn) => !grn.poId).length} icon="truck-delivery-outline" />
        </ScrollView>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search GRN, PO, supplier, receiving point" style={styles.search} />
          <Picker items={[{ id: "all", name: "All suppliers" }, ...suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))]} value={supplierFilter} onChange={(value) => { setSupplierFilter(value); setPage(1); }} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="grns" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard minWidth={900}>
          <TableHeader columns={["GRN", "PO", "Supplier", "Location", "Items", "Total", "Received", "Status"]} />
          {isLoading ? <LoadingRow label="Loading GRNs..." /> : null}
          {!isLoading && rows.map((grn) => (
            <Pressable key={grn.id} style={styles.row} onPress={() => setDetailId(grn.id)}>
              <Text style={styles.refCell}>{grn.refNo}</Text>
              <Text style={styles.refCell}>{grn.poRefNo ?? "Direct"}</Text>
              <Text style={styles.nameCell}>{grn.supplierName ?? "-"}</Text>
              <Text style={styles.locationCell}>{grn.outletName ?? "-"}</Text>
              <Text style={styles.countCell}>{grn.totalItems}</Text>
              <Text style={styles.moneyCell}>{formatMwk(Number(grn.total ?? 0))}</Text>
              <Text style={styles.dateCell}>{new Date(grn.receivedAt).toLocaleString()}</Text>
              <View style={styles.statusCell}><Badge tone="success">Received</Badge></View>
            </Pressable>
          ))}
          {!isLoading && !rows.length ? <EmptyPanel icon="package-variant-closed-check" title="No GRNs found" body="Receive supplier goods to create the first GRN." /> : null}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <GrnModal
        open={formOpen}
        form={form}
        setForm={setForm}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        locations={locations.map((location) => ({ id: String(location.id), name: `${String(location.name)} (${String(location.type)})` }))}
        items={items.map((item) => ({ id: String(item.id), name: `${String(item.name)} (${String(item.unit ?? "each")})`, unit: String(item.unit ?? "each") }))}
        purchaseOrders={activePurchaseOrders.map((po) => ({ id: po.id, name: `${String(po.refNo ?? po.id).slice(0, 18)} - ${formatMwk(Number(po.total ?? 0))}` }))}
        poLoading={poDetail.isFetching}
        saving={create.isPending}
        onClose={() => setFormOpen(false)}
        onSave={saveGrn}
      />
    </Screen>
  );
}

function GrnModal({ open, form, setForm, suppliers, locations, items, purchaseOrders, poLoading, saving, onClose, onSave }: {
  open: boolean;
  form: GrnForm;
  setForm: (form: GrnForm) => void;
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  items: { id: string; name: string; unit: string }[];
  purchaseOrders: { id: string; name: string }[];
  poLoading: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  function updateLine(index: number, patch: Partial<GrnLine>) {
    setForm({ ...form, lines: form.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) });
  }

  function addLine() {
    const item = items[0];
    setForm({ ...form, lines: [...form.lines, { ...emptyLine, itemId: item?.id ?? "", itemName: item?.name ?? "", unit: item?.unit ?? "each" }] });
  }

  function removeLine(index: number) {
    if (form.lines.length === 1) return;
    setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) });
  }

  function updateCost(index: number, patch: Partial<ExtraCost>) {
    setForm({ ...form, extraCosts: form.extraCosts.map((cost, costIndex) => costIndex === index ? { ...cost, ...patch } : cost) });
  }

  const goodsTotal = form.lines.reduce((sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitCost), 0);
  const extrasTotal = form.extraCosts.reduce((sum, cost) => sum + numberValue(cost.amount), 0);

  return (
    <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>Add GRN</Text>
                <Text style={styles.modalSub}>Batch numbers are generated automatically after save.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.ink} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <LabeledPicker label="Supplier" items={suppliers} value={form.supplierId} onChange={(supplierId) => setForm({ ...form, supplierId, purchaseOrderId: "", lines: [{ ...emptyLine, itemId: items[0]?.id ?? "", itemName: items[0]?.name ?? "", unit: items[0]?.unit ?? "each" }] })} />
              <LabeledPicker label="Received point" items={locations} value={form.locationId} onChange={(locationId) => setForm({ ...form, locationId })} />
              <View style={styles.modeRow}>
                <ModeButton label="For purchase order" active={form.receiveMode === "po"} onPress={() => setForm({ ...form, receiveMode: "po", lines: [] })} />
                <ModeButton label="Direct delivery" active={form.receiveMode === "direct"} onPress={() => setForm({ ...form, receiveMode: "direct", purchaseOrderId: "", lines: [{ ...emptyLine, itemId: items[0]?.id ?? "", itemName: items[0]?.name ?? "", unit: items[0]?.unit ?? "each" }] })} />
              </View>
              {form.receiveMode === "po" ? (
                <>
                  <LabeledPicker label="Purchase order" items={purchaseOrders} value={form.purchaseOrderId} onChange={(purchaseOrderId) => setForm({ ...form, purchaseOrderId })} />
                  {poLoading ? <LoadingRow label="Loading PO items..." /> : null}
                  {!poLoading && form.purchaseOrderId && !form.lines.length ? <EmptyPanel icon="file-document-alert-outline" title="Nothing left to receive" body="All items on this purchase order have already been received." /> : null}
                </>
              ) : null}

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Delivered items</Text>
                {form.receiveMode === "direct" ? <CommandButton icon="plus" label="Add item" onPress={addLine} /> : null}
              </View>

              {form.lines.map((line, index) => (
                <Card key={line.purchaseOrderItemId ?? `${index}-${line.itemId}`} style={styles.lineCard}>
                  <View style={styles.lineHeader}>
                    <Text style={styles.lineTitle}>Line {index + 1}</Text>
                    {form.receiveMode === "direct" && form.lines.length > 1 ? <Pressable onPress={() => removeLine(index)}><MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} /></Pressable> : null}
                  </View>
                  {form.receiveMode === "po" ? (
                    <View style={styles.poLineBox}>
                      <Text style={styles.poLineName}>{line.itemName}</Text>
                      <Text style={styles.poLineMeta}>Ordered {line.orderedQty ?? 0} {line.unit} | Remaining {line.remainingQty ?? 0} {line.unit}</Text>
                    </View>
                  ) : (
                    <>
                      <Pressable style={styles.checkRow} onPress={() => updateLine(index, { createNew: !line.createNew })}>
                        <MaterialCommunityIcons name={line.createNew ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={line.createNew ? colors.accent : colors.muted} />
                        <Text style={styles.checkText}>Create a new raw item for this delivery</Text>
                      </Pressable>
                      {line.createNew ? (
                        <View style={styles.grid}>
                          <LabeledField label="New item name" value={line.newName ?? ""} onChangeText={(newName) => updateLine(index, { newName })} style={styles.gridField} />
                          <LabeledField label="Unit" value={line.newUnit ?? "each"} onChangeText={(newUnit) => updateLine(index, { newUnit })} style={styles.gridFieldSmall} />
                        </View>
                      ) : (
                        <LabeledPicker label="Existing raw item" items={items} value={line.itemId} onChange={(itemId) => {
                          const selected = items.find((item) => item.id === itemId);
                          updateLine(index, { itemId, itemName: selected?.name ?? "", unit: selected?.unit ?? "each" });
                        }} />
                      )}
                    </>
                  )}
                  <View style={styles.grid}>
                    <LabeledField label="Quantity received" value={line.quantity} onChangeText={(quantity) => updateLine(index, { quantity })} keyboardType="numeric" style={styles.gridField} />
                    <LabeledField label="Buying price per unit" value={line.unitCost} onChangeText={(unitCost) => updateLine(index, { unitCost })} keyboardType="numeric" style={styles.gridField} />
                  </View>
                  <DatePickerField label="Expiry date" value={line.expiryDate} onChange={(expiryDate) => updateLine(index, { expiryDate })} />
                </Card>
              ))}

              <Pressable style={styles.checkRow} onPress={() => setForm({ ...form, createInvoice: !form.createInvoice })}>
                <MaterialCommunityIcons name={form.createInvoice ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={form.createInvoice ? colors.accent : colors.muted} />
                <Text style={styles.checkText}>Create supplier invoice from this GRN</Text>
              </Pressable>
              {form.createInvoice ? (
                <Card style={styles.invoiceBox}>
                  <DatePickerField label="Invoice due date" value={form.invoiceDueDate} onChange={(invoiceDueDate) => setForm({ ...form, invoiceDueDate })} />
                  <AttachmentPicker
                    value={{ attachmentName: form.invoiceAttachmentName, attachmentMime: form.invoiceAttachmentMime, attachmentData: form.invoiceAttachmentData }}
                    onChange={(attachment) => setForm({ ...form, invoiceAttachmentName: attachment.attachmentName, invoiceAttachmentMime: attachment.attachmentMime, invoiceAttachmentData: attachment.attachmentData })}
                  />
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Related costs</Text>
                    <CommandButton icon="plus" label="Add cost" onPress={() => setForm({ ...form, extraCosts: [...form.extraCosts, { description: "", amount: "0" }] })} />
                  </View>
                  {form.extraCosts.map((cost, index) => (
                    <View key={index} style={styles.grid}>
                      <LabeledField label="Cost description" value={cost.description} onChangeText={(description) => updateCost(index, { description })} placeholder="Transport, duty, tax, handling" style={styles.gridField} />
                      <LabeledField label="Amount" value={cost.amount} onChangeText={(amount) => updateCost(index, { amount })} keyboardType="numeric" style={styles.gridFieldSmall} />
                      <Pressable style={styles.deleteMini} onPress={() => setForm({ ...form, extraCosts: form.extraCosts.filter((_, costIndex) => costIndex !== index) })}><MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} /></Pressable>
                    </View>
                  ))}
                  <View style={styles.totalStrip}>
                    <Text style={styles.totalLabel}>Goods {formatMwk(goodsTotal)}</Text>
                    <Text style={styles.totalLabel}>Extras {formatMwk(extrasTotal)}</Text>
                    <Text style={styles.totalStrong}>Invoice {formatMwk(goodsTotal + extrasTotal)}</Text>
                  </View>
                </Card>
              ) : null}
              <LabeledField label="Receiving note" value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Delivery note, vehicle, condition, or remarks" multiline inputStyle={styles.textArea} />
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
  const invoices = Array.isArray(data?.invoices) ? data.invoices as Record<string, unknown>[] : [];
  const exportRows = lines.map((line) => ({
    item: line.itemName ?? line.item_name,
    batchNo: line.batchNo ?? line.batch_no ?? "",
    expiryDate: line.expiryDate ?? line.expiry_date ?? "",
    orderedQty: line.orderedQty ?? "",
    receivedQty: line.quantity,
    unitCost: line.unitCost ?? line.unit_cost,
    lineTotal: line.lineTotal ?? line.line_total
  }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailTop}>
          <CommandButton icon="arrow-left" label="GRNs" onPress={onBack} />
          <ExportMenu title={`${String(data?.refNo ?? data?.ref_no ?? "grn")}-detail`} rows={exportRows} />
        </View>
        {loading || !data ? <LoadingRow label="Loading GRN..." /> : (
          <>
            <Card style={styles.hero}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle}>{String(data.refNo ?? data.ref_no ?? "GRN")}</Text>
                <Text style={styles.heroText}>Supplier: {String(data.supplierName ?? data.supplier_name ?? "-")}</Text>
                <Text style={styles.heroText}>PO: {String(data.poRefNo ?? "Direct delivery")}</Text>
                <Text style={styles.heroText}>Receiving point: {String(data.locationName ?? "-")}</Text>
                <Text style={styles.heroText}>Note: {String(data.note ?? "-")}</Text>
              </View>
              <Badge tone="success">Received</Badge>
            </Card>
            <View style={styles.metrics}>
              <MetricCard label="Lines" value={lines.length} icon="format-list-bulleted" />
              <MetricCard label="Total value" value={formatMwk(Number(data.total ?? 0))} tone="accent" icon="cash" />
              <MetricCard label="Invoices" value={invoices.length} icon="file-document-outline" />
            </View>
            {invoices.length ? (
              <Card style={styles.invoiceBox}>
                <Text style={styles.sectionTitle}>Linked supplier invoice</Text>
                {invoices.map((invoice) => (
                  <View key={String(invoice.id)} style={styles.invoiceLine}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.poLineName}>{String(invoice.refNo ?? "-")}</Text>
                      <Text style={styles.poLineMeta}>Due {String(invoice.dueDate ?? "-")} | {formatMwk(Number(invoice.total ?? 0))}</Text>
                    </View>
                    <View style={styles.invoiceActions}>
                      <Badge tone={String(invoice.status) === "paid" ? "success" : "warning"}>{String(invoice.status ?? "open")}</Badge>
                    </View>
                    <View style={styles.invoiceAttachment}>
                      <AttachmentActions
                        name={invoice.attachmentName ? String(invoice.attachmentName) : null}
                        mime={invoice.attachmentMime ? String(invoice.attachmentMime) : null}
                        data={invoice.attachmentData ? String(invoice.attachmentData) : null}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
            <TableCard minWidth={820}>
              <TableHeader columns={["Item", "Batch", "Expiry", "Ordered", "Qty", "Cost", "Total"]} />
              {lines.map((line) => (
                <View key={String(line.id)} style={styles.row}>
                  <Text style={styles.nameCell}>{String(line.itemName ?? line.item_name ?? "-")}</Text>
                  <Text style={styles.refCell}>{String(line.batchNo ?? line.batch_no ?? "-")}</Text>
                  <Text style={styles.dateCell}>{String(line.expiryDate ?? line.expiry_date ?? "-")}</Text>
                  <Text style={styles.countCell}>{String(line.orderedQty ?? "-")}</Text>
                  <Text style={styles.countCell}>{String(line.quantity ?? "0")}</Text>
                  <Text style={styles.moneyCell}>{formatMwk(Number(line.unitCost ?? line.unit_cost ?? 0))}</Text>
                  <Text style={styles.moneyCell}>{formatMwk(Number(line.lineTotal ?? line.line_total ?? 0))}</Text>
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

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.modeButton, active && styles.modeButtonActive]} onPress={onPress}><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>;
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
  loadingRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
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
  panel: { width: "100%", maxWidth: 760, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 14 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  modalSub: { color: colors.muted, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  modalBody: { gap: 12, padding: 14 },
  fieldWrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  modeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modeButton: { minHeight: 42, flexGrow: 1, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  modeButtonActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  modeText: { color: colors.muted, fontWeight: "900" },
  modeTextActive: { color: colors.sidebarText },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  lineCard: { gap: 10, padding: 12 },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineTitle: { color: colors.ink, fontWeight: "900" },
  poLineBox: { borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 10, backgroundColor: colors.surfaceAlt },
  poLineName: { color: colors.ink, fontWeight: "900" },
  poLineMeta: { color: colors.muted, marginTop: 4, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  gridField: { flexGrow: 1, flexBasis: 180 },
  gridFieldSmall: { flexGrow: 1, flexBasis: 110 },
  textArea: { minHeight: 116, textAlignVertical: "top" },
  checkRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10 },
  checkText: { color: colors.ink, fontWeight: "800", flex: 1 },
  invoiceBox: { gap: 12, padding: 12 },
  invoiceLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 10 },
  invoiceActions: { alignItems: "flex-end", gap: 8 },
  invoiceAttachment: { width: "100%", minWidth: 240 },
  totalStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  totalLabel: { color: colors.muted, fontWeight: "800" },
  totalStrong: { color: colors.accent, fontWeight: "900" },
  deleteMini: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  actions: { minHeight: 62, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 14 },
  detailTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18 },
  heroTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 34, fontWeight: "900" },
  heroText: { color: colors.muted, fontSize: 14, marginTop: 5 }
});
