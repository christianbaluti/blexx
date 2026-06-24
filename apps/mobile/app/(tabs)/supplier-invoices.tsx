import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GoodsReceivedNote, Supplier, SupplierInvoice } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type InvoiceForm = { supplierId: string; dueDate: string; total: string; paid: string; grnId: string; attachmentName: string; attachmentMime: string; attachmentData: string };
const emptyForm: InvoiceForm = { supplierId: "", dueDate: "", total: "0", paid: "0", grnId: "", attachmentName: "", attachmentMime: "", attachmentData: "" };

export default function SupplierInvoices() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [detailFor, setDetailFor] = useState<SupplierInvoice | null>(null);
  const [menuFor, setMenuFor] = useState<SupplierInvoice | null>(null);
  const { data: invoices = [] } = useQuery({ queryKey: ["supplier-invoices"], queryFn: api.supplierInvoices });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: grns = [] } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const detail = useQuery({ queryKey: ["supplier-invoice", detailFor?.id], queryFn: () => api.supplierInvoiceDetail(detailFor!.id), enabled: Boolean(detailFor) });
  const pageSize = 8;

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const text = [invoice.refNo, invoice.supplierName, invoice.dueDate ?? "", invoice.attachmentName ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "all" || invoice.status === status);
  }), [invoices, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const outstanding = filtered.reduce((sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0), 0);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        supplierId: form.supplierId,
        dueDate: form.dueDate || null,
        total: Number(form.total || 0),
        paid: Number(form.paid || 0),
        grnId: form.grnId || null,
        attachmentName: form.attachmentName || null,
        attachmentMime: form.attachmentMime || null,
        attachmentData: form.attachmentData || null
      };
      return editing ? api.updateSupplierInvoice(editing.id, { dueDate: payload.dueDate, total: payload.total, paid: payload.paid }).then((result) => result as unknown) : api.createSupplierInvoice(payload).then((result) => result as unknown);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
    }
  });
  const remove = useMutation({ mutationFn: api.deleteSupplierInvoice, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] }) });
  const voidInvoice = useMutation({ mutationFn: (id: string) => api.updateSupplierInvoice(id, { status: "void" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] }) });

  function openNew(seed?: Partial<InvoiceForm>) {
    setEditing(null);
    setForm({ ...emptyForm, supplierId: suppliers[0]?.id ?? "", ...seed });
    setFormOpen(true);
  }

  function openEdit(invoice: SupplierInvoice) {
    setEditing(invoice);
    setForm({ supplierId: invoice.supplierId, dueDate: invoice.dueDate ?? "", total: String(invoice.total), paid: String(invoice.paid), grnId: invoice.grnId ?? "", attachmentName: invoice.attachmentName ?? "", attachmentMime: "", attachmentData: "" });
    setFormOpen(true);
  }

  const exportRows = filtered.map((invoice) => ({ refNo: invoice.refNo, supplier: invoice.supplierName, dueDate: invoice.dueDate ?? "", total: invoice.total, paid: invoice.paid, balance: invoice.total - invoice.paid, status: invoice.status, grnId: invoice.grnId ?? "", attachment: invoice.attachmentName ?? "" }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Accounts payable" title="Supplier Invoices" description="Record supplier invoices, attached documents, due dates and payment history." actions={<CommandButton icon="plus" label="New invoice" primary onPress={() => openNew()} />} />
        <View style={styles.metrics}>
          <MetricCard label="Invoices" value={filtered.length} icon="file-document-outline" />
          <MetricCard label="Outstanding" value={formatMwk(outstanding)} tone={outstanding ? "danger" : "default"} icon="cash-clock" />
          <MetricCard label="From GRN" value={invoices.filter((item) => item.grnId).length} icon="package-variant-closed-check" />
        </View>
        <TableCard>
          <View style={styles.toolbar}>
            <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search invoice, supplier, due date" style={styles.search} />
            <Filter value={status} setValue={(value) => { setStatus(value); setPage(1); }} />
            <ExportMenu title="supplier-invoices" rows={exportRows} />
          </View>
          <TableHeader columns={["Invoice", "Supplier", "Due", "Status", "Total", "Paid", "Attachment", ""]} />
          {rows.map((invoice) => (
            <Pressable key={invoice.id} style={styles.row} onPress={() => setDetailFor(invoice)}>
              <Text style={styles.cellText}>{invoice.refNo}</Text>
              <Text style={styles.cellText}>{invoice.supplierName}</Text>
              <Text style={styles.mutedText}>{invoice.dueDate ?? "-"}</Text>
              <View style={styles.cell}><Badge tone={invoice.status === "paid" ? "success" : invoice.status === "void" ? "danger" : "warning"}>{invoice.status}</Badge></View>
              <Text style={styles.rightCell}>{formatMwk(invoice.total)}</Text>
              <Text style={styles.rightCell}>{formatMwk(invoice.paid)}</Text>
              <Text style={styles.mutedText}>{invoice.attachmentName ?? (invoice.grnId ? "From GRN" : "-")}</Text>
              <Pressable style={styles.iconButton} onPress={() => setMenuFor(invoice)}><MaterialCommunityIcons name="dots-vertical" size={18} color={colors.ink} /></Pressable>
            </Pressable>
          ))}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <InvoiceModal open={formOpen} editing={editing} form={form} setForm={setForm} suppliers={suppliers} grns={grns} saving={save.isPending} error={save.error} onClose={() => setFormOpen(false)} onSave={() => save.mutate()} />
      <ActionMenu invoice={menuFor} onClose={() => setMenuFor(null)} onEdit={(invoice) => { setMenuFor(null); openEdit(invoice); }} onVoid={(invoice) => { setMenuFor(null); voidInvoice.mutate(invoice.id); }} onDelete={(invoice) => { setMenuFor(null); Alert.alert("Delete invoice", "Delete only works when no payment activity exists.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate(invoice.id) }]); }} />
      <DetailModal invoice={detailFor} data={detail.data} loading={detail.isLoading} onClose={() => setDetailFor(null)} />
    </Screen>
  );
}

function InvoiceModal({ open, editing, form, setForm, suppliers, grns, saving, error, onClose, onSave }: {
  open: boolean; editing: SupplierInvoice | null; form: InvoiceForm; setForm: (f: InvoiceForm) => void; suppliers: Supplier[]; grns: GoodsReceivedNote[]; saving: boolean; error: unknown; onClose: () => void; onSave: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text style={styles.modalTitle}>{editing ? "Edit invoice" : "Record supplier invoice"}</Text>
            {!editing ? <Picker label="Supplier" items={suppliers.map((s) => ({ id: s.id, name: s.name }))} value={form.supplierId} onChange={(supplierId) => setForm({ ...form, supplierId })} /> : null}
            {!editing ? <Picker label="From GRN" items={[{ id: "", name: "No GRN" }, ...grns.map((g) => ({ id: String(g.id), name: `${String(g.refNo)} ${String(g.supplierName ?? "")}` }))]} value={form.grnId} onChange={(grnId) => setForm({ ...form, grnId })} /> : null}
            <View style={styles.grid}><Field style={styles.gridField} value={form.dueDate} onChangeText={(dueDate) => setForm({ ...form, dueDate })} placeholder="Due date YYYY-MM-DD" /><Field style={styles.gridField} value={form.total} onChangeText={(total) => setForm({ ...form, total })} keyboardType="numeric" placeholder="Invoice total" /><Field style={styles.gridField} value={form.paid} onChangeText={(paid) => setForm({ ...form, paid })} keyboardType="numeric" placeholder="Paid so far" /></View>
            {!editing ? <>
              <Text style={styles.sectionTitle}>Attachment</Text>
              <Field value={form.attachmentName} onChangeText={(attachmentName) => setForm({ ...form, attachmentName })} placeholder="File name, e.g. invoice.pdf" />
              <Field value={form.attachmentMime} onChangeText={(attachmentMime) => setForm({ ...form, attachmentMime })} placeholder="MIME type, e.g. application/pdf" />
              <Field value={form.attachmentData} onChangeText={(attachmentData) => setForm({ ...form, attachmentData })} placeholder="Base64/data URL payload" multiline />
            </> : null}
            {error ? <Text style={styles.error}>{error instanceof Error ? error.message : "Save failed"}</Text> : null}
            <View style={styles.actions}><Button variant="outline" onPress={onClose}>Cancel</Button><Button onPress={onSave} disabled={saving || !form.supplierId || !Number(form.total)}>Save</Button></View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Picker({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return <View style={{ gap: 7 }}><Text style={styles.sectionTitle}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{items.map((item) => <Pressable key={item.id || "none"} style={[styles.chip, value === item.id && styles.chipActive]} onPress={() => onChange(item.id)}><Text style={[styles.chipText, value === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></View>;
}

function Filter({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return <View style={styles.filterRow}>{["all", "open", "partial", "paid", "void"].map((item) => <Pressable key={item} style={[styles.chip, value === item && styles.chipActive]} onPress={() => setValue(item)}><Text style={[styles.chipText, value === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>;
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return <View style={styles.pagination}><Button variant="outline" onPress={onPrev}>Prev</Button><Text style={styles.pageText}>Page {page} of {pages}</Text><Button variant="outline" onPress={onNext}>Next</Button></View>;
}

function ActionMenu({ invoice, onClose, onEdit, onVoid, onDelete }: { invoice: SupplierInvoice | null; onClose: () => void; onEdit: (i: SupplierInvoice) => void; onVoid: (i: SupplierInvoice) => void; onDelete: (i: SupplierInvoice) => void }) {
  if (!invoice) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.menuPanel}><MenuButton label="Edit" icon="pencil-outline" onPress={() => onEdit(invoice)} /><MenuButton label="Void" icon="cancel" onPress={() => onVoid(invoice)} /><MenuButton label="Delete" icon="delete-outline" danger onPress={() => onDelete(invoice)} /></Pressable></Pressable></Modal>;
}

function MenuButton({ label, icon, onPress, danger }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; danger?: boolean }) {
  return <Pressable style={styles.menuButton} onPress={onPress}><MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.ink} /><Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text></Pressable>;
}

function DetailModal({ invoice, data, loading, onClose }: { invoice: SupplierInvoice | null; data: Record<string, unknown> | undefined; loading: boolean; onClose: () => void }) {
  const expenses = Array.isArray(data?.expenses) ? data.expenses as Record<string, unknown>[] : [];
  const exportRows = [{ type: "invoice", ref: data?.refNo, total: data?.total, paid: data?.paid }, ...expenses.map((x) => ({ type: "payment", ref: x.id, total: x.amount, paid: x.amount }))];
  return <Modal visible={Boolean(invoice)} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.detailPanel}><View style={styles.detailHeader}><Text style={styles.modalTitle}>{invoice?.refNo}</Text><ExportMenu title={`${invoice?.refNo}-history`} rows={exportRows} /></View>{loading ? <Text style={styles.mutedText}>Loading...</Text> : <ScrollView contentContainerStyle={styles.detailBody}><Text style={styles.detailLine}>Supplier: {String(data?.supplierName ?? invoice?.supplierName)}</Text><Text style={styles.detailLine}>Due: {String(data?.dueDate ?? "-")}</Text><Text style={styles.detailLine}>Attachment: {String(data?.attachmentName ?? "No attachment")}</Text>{data?.grnId ? <Button variant="outline" onPress={() => router.push("/grn" as never)}>Open linked GRN</Button> : null}<Text style={styles.sectionTitle}>Payments / expenses</Text>{expenses.length ? expenses.map((expense) => <Text key={String(expense.id)} style={styles.detailLine}>{String(expense.date)} - {formatMwk(Number(expense.amount ?? 0))} - {String(expense.description ?? "")}</Text>) : <Button onPress={() => router.push("/expenses" as never)}>Open expense payment</Button>}</ScrollView>}</Pressable></Pressable></Modal>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  search: { flexGrow: 1, flexBasis: 260 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 100 },
  cellText: { flex: 1, minWidth: 130, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 120, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 160 },
  chips: { gap: 8 },
  chip: { minHeight: 34, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "900", textTransform: "capitalize" },
  chipTextActive: { color: colors.sidebarText },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  menuPanel: { width: 220, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 8 },
  menuButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  menuText: { color: colors.ink, fontWeight: "900" },
  detailPanel: { width: "100%", maxWidth: 720, maxHeight: "88%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  detailHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailBody: { gap: 10, padding: 14 },
  detailLine: { color: colors.ink, fontSize: 12 }
});
