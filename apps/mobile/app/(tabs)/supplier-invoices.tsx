import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GoodsReceivedNote, Supplier, SupplierInvoice } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { AttachmentPicker } from "../../src/components/attachment-picker";
import { AttachmentActions } from "../../src/components/attachment-actions";
import { DatePickerField } from "../../src/components/date-picker-field";
import { Badge, CommandButton, EmptyPanel, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type InvoiceForm = {
  supplierId: string;
  dueDate: string;
  total: string;
  paid: string;
  grnId: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentData: string;
  paymentMethod: "cash" | "card" | "mobile" | "bank" | "credit";
  paymentReference: string;
  paymentNote: string;
  paymentAttachmentName: string;
  paymentAttachmentMime: string;
  paymentAttachmentData: string;
};
type PaymentForm = {
  amount: string;
  method: "cash" | "card" | "mobile" | "bank" | "credit";
  reference: string;
  note: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentData: string;
};

const emptyForm: InvoiceForm = {
  supplierId: "",
  dueDate: "",
  total: "0",
  paid: "0",
  grnId: "",
  attachmentName: "",
  attachmentMime: "",
  attachmentData: "",
  paymentMethod: "bank",
  paymentReference: "",
  paymentNote: "",
  paymentAttachmentName: "",
  paymentAttachmentMime: "",
  paymentAttachmentData: ""
};
const emptyPayment: PaymentForm = { amount: "", method: "bank", reference: "", note: "", attachmentName: "", attachmentMime: "", attachmentData: "" };

function numeric(value: string) {
  return Number(value || 0);
}

export default function SupplierInvoices() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [detailFor, setDetailFor] = useState<SupplierInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPayment);
  const [menuFor, setMenuFor] = useState<SupplierInvoice | null>(null);
  const pageSize = 8;

  const { data: invoices = [], isLoading, isFetching } = useQuery({ queryKey: ["supplier-invoices"], queryFn: api.supplierInvoices });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: grns = [] } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const detail = useQuery({ queryKey: ["supplier-invoice", detailFor?.id], queryFn: () => api.supplierInvoiceDetail(detailFor!.id), enabled: Boolean(detailFor) });

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const text = [invoice.refNo, invoice.supplierName, invoice.dueDate ?? "", invoice.grnRefNo ?? "", invoice.attachmentName ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "all" || invoice.status === status);
  }), [invoices, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const outstanding = filtered.reduce((sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0), 0);
  const overdue = filtered.filter((invoice) => invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== "paid" && invoice.status !== "void").length;
  const exportRows = filtered.map((invoice) => ({
    invoice: invoice.refNo,
    supplier: invoice.supplierName,
    grn: invoice.grnRefNo ?? "",
    dueDate: invoice.dueDate ?? "",
    total: invoice.total,
    paid: invoice.paid,
    balance: invoice.total - invoice.paid,
    status: invoice.status,
    attachment: invoice.attachmentName ?? ""
  }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        supplierId: form.supplierId,
        dueDate: form.dueDate || null,
        total: numeric(form.total),
        paid: numeric(form.paid),
        grnId: form.grnId || null,
        attachmentName: form.attachmentName || null,
        attachmentMime: form.attachmentMime || null,
        attachmentData: form.attachmentData || null,
        paymentMethod: form.paymentMethod,
        paymentReference: form.paymentReference || null,
        paymentNote: form.paymentNote || null,
        paymentAttachmentName: form.paymentAttachmentName || null,
        paymentAttachmentMime: form.paymentAttachmentMime || null,
        paymentAttachmentData: form.paymentAttachmentData || null
      };
      if (editing) {
        return api.updateSupplierInvoice(editing.id, {
          dueDate: payload.dueDate,
          total: payload.total,
          paid: payload.paid,
          attachmentName: payload.attachmentName,
          attachmentMime: payload.attachmentMime,
          attachmentData: payload.attachmentData
        }).then((result) => result as unknown);
      }
      return api.createSupplierInvoice(payload).then((result) => result as unknown);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
    },
    onError: (error) => Alert.alert("Could not save invoice", error instanceof Error ? error.message : "Please check the form and try again.")
  });
  const remove = useMutation({
    mutationFn: api.deleteSupplierInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] }),
    onError: (error) => Alert.alert("Could not delete invoice", error instanceof Error ? error.message : "Void the invoice if it already has payments.")
  });
  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.updateSupplierInvoice(id, { status: "void" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] })
  });
  const pay = useMutation({
    mutationFn: () => api.recordSupplierInvoicePayment(detailFor!.id, {
      amount: numeric(paymentForm.amount),
      method: paymentForm.method,
      reference: paymentForm.reference || null,
      attachmentName: paymentForm.attachmentName || null,
      attachmentMime: paymentForm.attachmentMime || null,
      attachmentData: paymentForm.attachmentData || null,
      note: paymentForm.note || null
    }),
    onSuccess: async () => {
      setPaymentForm(emptyPayment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-invoice", detailFor?.id] })
      ]);
    },
    onError: (error) => Alert.alert("Could not record payment", error instanceof Error ? error.message : "Please try again.")
  });

  function openNew(seed?: Partial<InvoiceForm>) {
    setEditing(null);
    setForm({ ...emptyForm, supplierId: suppliers[0]?.id ?? "", ...seed });
    setFormOpen(true);
  }

  function openEdit(invoice: SupplierInvoice) {
    setEditing(invoice);
    setForm({
      supplierId: invoice.supplierId,
      dueDate: invoice.dueDate ?? "",
      total: String(invoice.total),
      paid: String(invoice.paid),
      grnId: invoice.grnId ?? "",
      attachmentName: invoice.attachmentName ?? "",
      attachmentMime: invoice.attachmentMime ?? "",
      attachmentData: invoice.attachmentData ?? "",
      paymentMethod: "bank",
      paymentReference: "",
      paymentNote: "",
      paymentAttachmentName: "",
      paymentAttachmentMime: "",
      paymentAttachmentData: ""
    });
    setFormOpen(true);
  }

  if (detailFor) {
    return (
      <InvoiceDetail
        invoice={detailFor}
        data={detail.data}
        loading={detail.isLoading}
        paymentForm={paymentForm}
        setPaymentForm={setPaymentForm}
        paying={pay.isPending}
        onPay={() => pay.mutate()}
        onBack={() => setDetailFor(null)}
      />
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Accounts payable" title="Supplier Invoices" description="Track supplier invoices, files, due dates, payments and outstanding balances." actions={<CommandButton icon="plus" label="New invoice" primary onPress={() => openNew()} />} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsLine}>
          <MetricCard label="Invoices" value={filtered.length} icon="file-document-outline" />
          <MetricCard label="Outstanding" value={formatMwk(outstanding)} tone={outstanding ? "danger" : "default"} icon="cash-clock" />
          <MetricCard label="Overdue" value={overdue} tone={overdue ? "warning" : "default"} icon="calendar-alert" />
          <MetricCard label="From GRN" value={filtered.filter((item) => item.grnId).length} icon="package-variant-closed-check" />
        </ScrollView>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search invoice, supplier, GRN, due date" style={styles.search} />
          <Filter value={status} setValue={(value) => { setStatus(value); setPage(1); }} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="supplier-invoices" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard minWidth={1030}>
          <TableHeader columns={["Invoice", "Supplier", "GRN", "Due", "Status", "Total", "Paid", "Balance", "Attachment", ""]} />
          {isLoading ? <LoadingRow label="Loading invoices..." /> : null}
          {!isLoading && rows.map((invoice) => (
            <Pressable key={invoice.id} style={styles.row} onPress={() => setDetailFor(invoice)}>
              <Text style={styles.refCell}>{invoice.refNo}</Text>
              <Text style={styles.nameCell}>{invoice.supplierName}</Text>
              <Text style={styles.refCell}>{invoice.grnRefNo ?? "-"}</Text>
              <Text style={styles.dateCell}>{invoice.dueDate ?? "-"}</Text>
              <View style={styles.statusCell}><Badge tone={invoice.status === "paid" ? "success" : invoice.status === "void" ? "danger" : "warning"}>{invoice.status}</Badge></View>
              <Text style={styles.moneyCell}>{formatMwk(invoice.total)}</Text>
              <Text style={styles.moneyCell}>{formatMwk(invoice.paid)}</Text>
              <Text style={styles.moneyCell}>{formatMwk(invoice.total - invoice.paid)}</Text>
              <Text style={styles.attachmentCell}>{invoice.attachmentName ?? "-"}</Text>
              <Pressable style={styles.iconButton} onPress={(event) => { event.stopPropagation(); setMenuFor(invoice); }}><MaterialCommunityIcons name="dots-vertical" size={18} color={colors.ink} /></Pressable>
            </Pressable>
          ))}
          {!isLoading && !rows.length ? <EmptyPanel icon="file-document-outline" title="No supplier invoices" body="Record supplier invoices manually or create them from GRNs." /> : null}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <InvoiceModal open={formOpen} editing={editing} form={form} setForm={setForm} suppliers={suppliers} grns={grns} saving={save.isPending} onClose={() => setFormOpen(false)} onSave={() => save.mutate()} />
      <ActionMenu invoice={menuFor} onClose={() => setMenuFor(null)} onView={(invoice) => { setMenuFor(null); setDetailFor(invoice); }} onEdit={(invoice) => { setMenuFor(null); openEdit(invoice); }} onVoid={(invoice) => { setMenuFor(null); voidInvoice.mutate(invoice.id); }} onDelete={(invoice) => { setMenuFor(null); Alert.alert("Delete invoice", "Delete only works when no payment activity exists.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate(invoice.id) }]); }} />
    </Screen>
  );
}

function InvoiceModal({ open, editing, form, setForm, suppliers, grns, saving, onClose, onSave }: {
  open: boolean; editing: SupplierInvoice | null; form: InvoiceForm; setForm: (f: InvoiceForm) => void; suppliers: Supplier[]; grns: GoodsReceivedNote[]; saving: boolean; onClose: () => void; onSave: () => void;
}) {
  const selectedGrn = grns.find((grn) => grn.id === form.grnId);
  return (
    <Modal visible={open} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>{editing ? "Edit supplier invoice" : "Record supplier invoice"}</Text>
                <Text style={styles.modalSub}>Attach the invoice file and set payment tracking.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.ink} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {!editing ? <Picker label="Supplier" items={suppliers.map((s) => ({ id: s.id, name: s.name }))} value={form.supplierId} onChange={(supplierId) => setForm({ ...form, supplierId, grnId: "" })} /> : null}
              {!editing ? <Picker label="From GRN" items={[{ id: "", name: "No GRN" }, ...grns.filter((grn) => !form.supplierId || grn.supplierId === form.supplierId).map((g) => ({ id: String(g.id), name: `${String(g.refNo)} - ${String(g.supplierName ?? "")}` }))]} value={form.grnId} onChange={(grnId) => setForm({ ...form, grnId, total: grns.find((grn) => grn.id === grnId)?.total ? String(grns.find((grn) => grn.id === grnId)?.total) : form.total })} /> : null}
              {selectedGrn ? <Text style={styles.helperText}>Linked to {selectedGrn.refNo}. The invoice will show on that GRN detail page.</Text> : null}
              <DatePickerField label="Invoice due date" value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
              <View style={styles.grid}>
                <LabeledField label="Invoice total" value={form.total} onChangeText={(total) => setForm({ ...form, total })} keyboardType="numeric" style={styles.gridField} />
                <LabeledField label="Paid so far" value={form.paid} onChangeText={(paid) => setForm({ ...form, paid })} keyboardType="numeric" style={styles.gridField} />
              </View>
              <AttachmentPicker label="Invoice file" value={form} onChange={(attachment) => setForm({ ...form, ...attachment })} />
              {numeric(form.paid) > 0 ? (
                <Card style={styles.paymentBox}>
                  <Text style={styles.sectionTitle}>Initial payment</Text>
                  <Picker label="Payment method" items={["cash", "card", "mobile", "bank", "credit"].map((method) => ({ id: method, name: method }))} value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod: paymentMethod as InvoiceForm["paymentMethod"] })} />
                  <View style={styles.grid}>
                    <LabeledField label="Payment reference" value={form.paymentReference} onChangeText={(paymentReference) => setForm({ ...form, paymentReference })} style={styles.gridField} />
                    <LabeledField label="Payment note" value={form.paymentNote} onChangeText={(paymentNote) => setForm({ ...form, paymentNote })} style={styles.gridField} />
                  </View>
                  <AttachmentPicker
                    label="Proof of payment"
                    helper="PDF or image POP, 5 MB max"
                    value={{ attachmentName: form.paymentAttachmentName, attachmentMime: form.paymentAttachmentMime, attachmentData: form.paymentAttachmentData }}
                    onChange={(attachment) => setForm({ ...form, paymentAttachmentName: attachment.attachmentName, paymentAttachmentMime: attachment.attachmentMime, paymentAttachmentData: attachment.attachmentData })}
                  />
                </Card>
              ) : null}
            </ScrollView>
            <View style={styles.actions}>
              <Button variant="outline" onPress={onClose}>Cancel</Button>
              <Button onPress={onSave} disabled={saving || !form.supplierId || numeric(form.total) <= 0}>{saving ? "Saving..." : "Save invoice"}</Button>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function InvoiceDetail({ invoice, data, loading, paymentForm, setPaymentForm, paying, onPay, onBack }: {
  invoice: SupplierInvoice;
  data: Record<string, unknown> | undefined;
  loading: boolean;
  paymentForm: PaymentForm;
  setPaymentForm: (form: PaymentForm) => void;
  paying: boolean;
  onPay: () => void;
  onBack: () => void;
}) {
  const expenses = Array.isArray(data?.expenses) ? data.expenses as Record<string, unknown>[] : [];
  const payments = Array.isArray(data?.payments) ? data.payments as Record<string, unknown>[] : [];
  const attachmentName = String(data?.attachmentName ?? data?.attachment_name ?? invoice.attachmentName ?? "");
  const attachmentMime = String(data?.attachmentMime ?? data?.attachment_mime ?? invoice.attachmentMime ?? "");
  const attachmentData = String(data?.attachmentData ?? data?.attachment_data ?? invoice.attachmentData ?? "");
  const total = Number(data?.total ?? invoice.total);
  const paid = Number(data?.paid ?? invoice.paid);
  const balance = Math.max(total - paid, 0);
  const historyRows = [
    { type: "invoice", ref: invoice.refNo, amount: total, note: "Supplier invoice" },
    ...payments.map((payment) => ({
      type: "payment",
      ref: payment.reference ?? payment.id,
      amount: payment.amount,
      note: payment.note ?? "",
      attachmentName: payment.attachmentName ?? payment.attachment_name ?? "",
      attachmentMime: payment.attachmentMime ?? payment.attachment_mime ?? "",
      attachmentData: payment.attachmentData ?? payment.attachment_data ?? ""
    })),
    ...expenses.map((expense) => ({ type: "expense", ref: expense.category ?? expense.id, amount: expense.amount, note: expense.description ?? "" }))
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailTop}>
          <CommandButton icon="arrow-left" label="Invoices" onPress={onBack} />
          <ExportMenu title={`${invoice.refNo}-history`} rows={historyRows} />
        </View>
        {loading ? <LoadingRow label="Loading invoice..." /> : (
          <>
            <Card style={styles.hero}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle}>{invoice.refNo}</Text>
                <Text style={styles.heroText}>Supplier: {String(data?.supplierName ?? invoice.supplierName)}</Text>
                <Text style={styles.heroText}>GRN: {String(data?.grnRefNo ?? invoice.grnRefNo ?? "-")}</Text>
                <Text style={styles.heroText}>Due: {String(data?.dueDate ?? data?.due_date ?? invoice.dueDate ?? "-")}</Text>
              </View>
              <Badge tone={String(data?.status ?? invoice.status) === "paid" ? "success" : String(data?.status ?? invoice.status) === "void" ? "danger" : "warning"}>{String(data?.status ?? invoice.status)}</Badge>
            </Card>
            <View style={styles.metrics}>
              <MetricCard label="Total" value={formatMwk(total)} icon="cash" />
              <MetricCard label="Paid" value={formatMwk(paid)} tone="success" icon="cash-check" />
              <MetricCard label="Balance" value={formatMwk(balance)} tone={balance ? "danger" : "default"} icon="cash-clock" />
            </View>
            <Card style={styles.detailCard}>
              <View style={styles.detailCardHeader}>
                <Text style={styles.sectionTitle}>Invoice file</Text>
              </View>
              <AttachmentActions name={attachmentName || null} mime={attachmentMime || null} data={attachmentData || null} />
            </Card>
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Record payment</Text>
              <View style={styles.grid}>
                <LabeledField label="Amount" value={paymentForm.amount} onChangeText={(amount) => setPaymentForm({ ...paymentForm, amount })} keyboardType="numeric" style={styles.gridField} />
                <Picker label="Method" items={["cash", "card", "mobile", "bank", "credit"].map((method) => ({ id: method, name: method }))} value={paymentForm.method} onChange={(method) => setPaymentForm({ ...paymentForm, method: method as PaymentForm["method"] })} />
              </View>
              <View style={styles.grid}>
                <LabeledField label="Reference" value={paymentForm.reference} onChangeText={(reference) => setPaymentForm({ ...paymentForm, reference })} style={styles.gridField} />
                <LabeledField label="Note" value={paymentForm.note} onChangeText={(note) => setPaymentForm({ ...paymentForm, note })} style={styles.gridField} />
              </View>
              <AttachmentPicker
                label="Proof of payment"
                helper="PDF or image POP, 5 MB max"
                value={paymentForm}
                onChange={(attachment) => setPaymentForm({ ...paymentForm, ...attachment })}
              />
              <View style={styles.actions}><Button onPress={onPay} disabled={paying || numeric(paymentForm.amount) <= 0 || balance <= 0}>{paying ? "Saving..." : "Record payment"}</Button></View>
            </Card>
            <TableCard minWidth={930}>
              <TableHeader columns={["Type", "Reference", "Amount", "POP", "Note"]} />
              {historyRows.map((row, index) => (
                <View key={`${row.type}-${index}`} style={styles.row}>
                  <Text style={styles.refCell}>{String(row.type)}</Text>
                  <Text style={styles.nameCell}>{String(row.ref ?? "-")}</Text>
                  <Text style={styles.moneyCell}>{formatMwk(Number(row.amount ?? 0))}</Text>
                  <View style={styles.popCell}>
                    {row.type === "payment" ? (
                      <AttachmentActions
                        name={String((row as Record<string, unknown>).attachmentName ?? "") || null}
                        mime={String((row as Record<string, unknown>).attachmentMime ?? "") || null}
                        data={String((row as Record<string, unknown>).attachmentData ?? "") || null}
                      />
                    ) : <Text style={styles.attachmentCell}>-</Text>}
                  </View>
                  <Text style={styles.attachmentCell}>{String(row.note ?? "")}</Text>
                </View>
              ))}
            </TableCard>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function LabeledField({ label, style, inputStyle, ...props }: React.ComponentProps<typeof Field> & { label: string; inputStyle?: React.ComponentProps<typeof Field>["style"] }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <Field {...props} style={inputStyle} />
    </View>
  );
}

function Picker({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {items.map((item) => <Pressable key={item.id || "none"} style={[styles.chip, value === item.id && styles.chipActive]} onPress={() => onChange(item.id)}><Text style={[styles.chipText, value === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}
        {!items.length ? <Text style={styles.helperText}>Nothing available</Text> : null}
      </ScrollView>
    </View>
  );
}

function Filter({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return <View style={styles.filterRow}>{["all", "open", "partial", "paid", "void"].map((item) => <Pressable key={item} style={[styles.chip, value === item && styles.chipActive]} onPress={() => setValue(item)}><Text style={[styles.chipText, value === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>;
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return <View style={styles.pagination}><Button variant="outline" onPress={onPrev} disabled={page <= 1}>Prev</Button><Text style={styles.pageText}>Page {page} of {pages}</Text><Button variant="outline" onPress={onNext} disabled={page >= pages}>Next</Button></View>;
}

function ActionMenu({ invoice, onClose, onView, onEdit, onVoid, onDelete }: { invoice: SupplierInvoice | null; onClose: () => void; onView: (i: SupplierInvoice) => void; onEdit: (i: SupplierInvoice) => void; onVoid: (i: SupplierInvoice) => void; onDelete: (i: SupplierInvoice) => void }) {
  if (!invoice) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.menuPanel}><MenuButton label="View" icon="eye-outline" onPress={() => onView(invoice)} /><MenuButton label="Edit" icon="pencil-outline" onPress={() => onEdit(invoice)} /><MenuButton label="Void" icon="cancel" onPress={() => onVoid(invoice)} /><MenuButton label="Delete" icon="delete-outline" danger onPress={() => onDelete(invoice)} /></Pressable></Pressable></Modal>;
}

function MenuButton({ label, icon, onPress, danger }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; danger?: boolean }) {
  return <Pressable style={styles.menuButton} onPress={onPress}><MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.ink} /><Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text></Pressable>;
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
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  refCell: { width: 130, minWidth: 130, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  nameCell: { width: 170, minWidth: 170, color: colors.ink, fontWeight: "800" },
  dateCell: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  statusCell: { width: 100, minWidth: 100 },
  moneyCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  attachmentCell: { width: 150, minWidth: 150, color: colors.muted, fontSize: 12 },
  iconButton: { width: 42, minWidth: 42, height: 34, alignItems: "center", justifyContent: "center" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
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
  helperText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flexGrow: 1, flexBasis: 180 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 38, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "900", textTransform: "capitalize" },
  chipTextActive: { color: colors.sidebarText },
  actions: { minHeight: 62, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 14 },
  menuPanel: { width: 220, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 8 },
  menuButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  menuText: { color: colors.ink, fontWeight: "900" },
  detailTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  detailCard: { gap: 10, padding: 14 },
  detailCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  detailLine: { color: colors.ink, fontSize: 13 },
  paymentBox: { gap: 10, padding: 12 },
  popCell: { width: 220, minWidth: 220 },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18 },
  heroTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 34, fontWeight: "900" },
  heroText: { color: colors.muted, fontSize: 14, marginTop: 5 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 13 }
});
