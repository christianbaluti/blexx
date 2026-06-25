import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Supplier } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type SupplierForm = { name: string; phone: string; email: string; address: string; note: string };
const emptyForm: SupplierForm = { name: "", phone: "", email: "", address: "", note: "" };

function validEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: suppliers = [], isLoading, isFetching } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const detail = useQuery({ queryKey: ["supplier-detail", detailFor?.id], queryFn: () => api.supplierStatement(detailFor!.id), enabled: Boolean(detailFor) });
  const pageSize = 8;

  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const text = [supplier.name, supplier.phone ?? "", supplier.email ?? "", supplier.address ?? "", supplier.note ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "all" || (supplier.status ?? "active") === status);
  }), [query, status, suppliers]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const balance = filtered.reduce((sum, supplier) => sum + supplier.balance, 0);
  const suspendedCount = suppliers.filter((item) => item.status === "suspended" || item.status === "disabled").length;

  const save = useMutation<unknown>({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        note: form.note.trim() || null
      };
      return editing ? api.updateSupplier(editing.id, payload) : api.createSupplier(payload);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });
  const suspend = useMutation({
    mutationFn: api.suspendSupplier,
    onSuccess: async () => {
      setMenuFor(null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });
  const remove = useMutation({
    mutationFn: api.deleteSupplier,
    onSuccess: async () => {
      setMenuFor(null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });

  function openForm(supplier?: Supplier) {
    setEditing(supplier ?? null);
    setForm(supplier ? {
      name: supplier.name,
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      note: supplier.note ?? ""
    } : emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    if (!validEmail(form.email)) {
      setFormError("Enter a valid email address or leave it empty.");
      return;
    }
    save.mutate();
  }

  function confirmDelete(supplier: Supplier) {
    Alert.alert("Delete supplier", "Delete only works if this supplier has no purchase, invoice or GRN activity. Otherwise suspend them.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(supplier.id) }
    ]);
  }

  const exportRows = filtered.map((supplier) => ({
    name: supplier.name,
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    note: supplier.note ?? "",
    status: supplier.status ?? "active",
    balance: supplier.balance
  }));

  if (detailFor) {
    return <SupplierDetail supplier={detailFor} data={detail.data} loading={detail.isLoading} onBack={() => setDetailFor(null)} />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Purchasing"
          title="Suppliers"
          description="Supplier records, purchase history, GRNs, invoices and payable balances."
          actions={<CommandButton icon="plus" label="New supplier" primary onPress={() => openForm()} />}
        />
        <View style={styles.metrics}>
          <MetricCard label="Suppliers" value={filtered.length} icon="truck-outline" />
          <MetricCard label="Payable balance" value={formatMwk(balance)} tone={balance ? "accent" : "default"} icon="cash-clock" />
          <MetricCard label="Suspended" value={suspendedCount} icon="account-cancel-outline" />
        </View>

        {formOpen ? (
          <SupplierFormCard
            editing={editing}
            form={form}
            setForm={setForm}
            error={formError ?? (save.error instanceof Error ? save.error.message : null)}
            saving={save.isPending}
            onCancel={() => { setFormOpen(false); setEditing(null); setForm(emptyForm); setFormError(null); }}
            onSave={submit}
          />
        ) : null}

        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search suppliers" style={styles.search} />
          <Filter value={status} setValue={(value) => { setStatus(value); setPage(1); }} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="suppliers" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard minWidth={742}>
          <TableHeader columns={["Supplier", "Contact", "Address", "Status", "Balance", ""]} />
          {isLoading ? <LoadingRow /> : null}
          {!isLoading && rows.map((supplier) => (
            <View key={supplier.id} style={styles.row}>
              <View style={styles.supplierCell}>
                <Text style={styles.name}>{supplier.name}</Text>
                <Text style={styles.note} numberOfLines={1}>{supplier.note || "No note"}</Text>
              </View>
              <Text style={styles.contact}>{supplier.phone || "-"}{"\n"}{supplier.email || ""}</Text>
              <Text style={styles.address} numberOfLines={2}>{supplier.address || "-"}</Text>
              <View style={styles.statusCell}><Badge tone={(supplier.status ?? "active") === "active" ? "success" : "warning"}>{supplier.status ?? "active"}</Badge></View>
              <Text style={styles.balanceCell}>{formatMwk(supplier.balance)}</Text>
              <View style={styles.actionCell}>
                <Pressable style={styles.iconButton} onPress={() => setMenuFor(menuFor === supplier.id ? null : supplier.id)}>
                  <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.ink} />
                </Pressable>
                {menuFor === supplier.id ? (
                  <View style={styles.popover}>
                    <MenuButton label="View supplier" icon="file-chart-outline" onPress={() => { setMenuFor(null); setDetailFor(supplier); }} />
                    <MenuButton label="Edit" icon="pencil-outline" onPress={() => { setMenuFor(null); openForm(supplier); }} />
                    <MenuButton label="Suspend" icon="account-cancel-outline" onPress={() => suspend.mutate(supplier.id)} />
                    <MenuButton label="Delete" icon="delete-outline" danger onPress={() => confirmDelete(supplier)} />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
          {!isLoading && !rows.length ? <Text style={styles.empty}>No suppliers match the current filters.</Text> : null}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

function SupplierFormCard({ editing, form, setForm, saving, error, onCancel, onSave }: {
  editing: Supplier | null;
  form: SupplierForm;
  setForm: (form: SupplierForm) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Card style={styles.formCard}>
      <View style={styles.formHeader}>
        <View>
          <Text style={styles.formTitle}>{editing ? "Edit supplier" : "New supplier"}</Text>
          <Text style={styles.formHint}>Balances are calculated from invoices and payments, not entered manually.</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={onCancel}>
          <MaterialCommunityIcons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.formGrid}>
        <LabeledField label="Supplier name" required value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="e.g. ABC Chemicals" />
        <LabeledField label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="+265..." keyboardType="phone-pad" />
        <LabeledField label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="accounts@supplier.com" autoCapitalize="none" keyboardType="email-address" />
        <LabeledField label="Address" value={form.address} onChangeText={(address) => setForm({ ...form, address })} placeholder="Street, city, country" />
      </View>
      <LabeledField label="Note" value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Payment terms, contact person, delivery notes..." multiline style={styles.noteField} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button variant="outline" onPress={onCancel}>Cancel</Button>
        <Button onPress={onSave} disabled={saving}>{saving ? "Saving..." : "Save supplier"}</Button>
      </View>
    </Card>
  );
}

function LabeledField({ label, required, style, ...props }: ComponentProps<typeof Field> & { label: string; required?: boolean }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <Field {...props} />
    </View>
  );
}

function SupplierDetail({ supplier, data, loading, onBack }: { supplier: Supplier; data: Record<string, unknown> | undefined; loading: boolean; onBack: () => void }) {
  const invoices = Array.isArray(data?.invoices) ? data.invoices as Record<string, unknown>[] : [];
  const purchaseOrders = Array.isArray(data?.purchaseOrders) ? data.purchaseOrders as Record<string, unknown>[] : [];
  const grns = Array.isArray(data?.grns) ? data.grns as Record<string, unknown>[] : [];
  const payments = Array.isArray(data?.payments) ? data.payments as Record<string, unknown>[] : [];
  const invoiceTotal = invoices.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const paid = payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const exportRows = [
    ...invoices.map((row) => ({ type: "invoice", ref: row.ref_no ?? row.refNo, amount: row.total, status: row.status })),
    ...purchaseOrders.map((row) => ({ type: "purchase_order", ref: row.ref_no ?? row.refNo, amount: row.total, status: row.status })),
    ...grns.map((row) => ({ type: "grn", ref: row.ref_no ?? row.refNo, amount: row.total, status: "received" })),
    ...payments.map((row) => ({ type: "payment", ref: row.reference ?? row.id, amount: row.amount, status: row.method }))
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailHeader}>
          <CommandButton icon="arrow-left" label="Suppliers" onPress={onBack} />
          <ExportMenu title={`${supplier.name}-activity`} rows={exportRows} />
        </View>
        <Card style={styles.hero}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroTitle}>{supplier.name}</Text>
            <Text style={styles.heroText}>{supplier.address || "No address recorded"}</Text>
            <Text style={styles.heroText}>{supplier.phone || "-"} {supplier.email ? `- ${supplier.email}` : ""}</Text>
          </View>
          <Badge tone={(supplier.status ?? "active") === "active" ? "success" : "warning"}>{supplier.status ?? "active"}</Badge>
        </Card>
        <View style={styles.metrics}>
          <MetricCard label="Invoice total" value={formatMwk(invoiceTotal)} icon="file-document-outline" />
          <MetricCard label="Paid" value={formatMwk(paid)} tone="success" icon="cash-check" />
          <MetricCard label="Balance" value={formatMwk(Math.max(0, invoiceTotal - paid))} tone={invoiceTotal - paid ? "warning" : "default"} icon="cash-clock" />
          <MetricCard label="GRNs" value={grns.length} icon="package-variant-closed-check" />
        </View>
        {loading ? <ActivityIndicator color={colors.accent} /> : (
          <View style={styles.detailGrid}>
            <ActivityPanel title="Supplier invoices" rows={invoices} empty="No supplier invoices yet." />
            <ActivityPanel title="Purchase orders" rows={purchaseOrders} empty="No purchase orders yet." />
            <ActivityPanel title="GRNs" rows={grns} empty="No received goods yet." />
            <ActivityPanel title="Payments" rows={payments} empty="No payments recorded yet." />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function ActivityPanel({ title, rows, empty }: { title: string; rows: Record<string, unknown>[]; empty: string }) {
  return (
    <Card style={styles.activityPanel}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length ? rows.slice(0, 8).map((row) => (
        <View key={String(row.id ?? row.ref_no ?? row.refNo)} style={styles.activityRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.activityTitle}>{String(row.ref_no ?? row.refNo ?? row.reference ?? row.id)}</Text>
            <Text style={styles.activityMeta}>{String(row.status ?? row.method ?? row.received_at ?? row.order_date ?? "")}</Text>
          </View>
          <Text style={styles.activityAmount}>{row.total || row.amount ? formatMwk(Number(row.total ?? row.amount)) : ""}</Text>
        </View>
      )) : <Text style={styles.emptyPanelText}>{empty}</Text>}
    </Card>
  );
}

function Filter({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return (
    <View style={styles.filterRow}>
      {["all", "active", "suspended", "disabled"].map((item) => (
        <Pressable key={item} style={[styles.filterChip, value === item && styles.filterChipActive]} onPress={() => setValue(item)}>
          <Text style={[styles.filterText, value === item && styles.filterTextActive]}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.pagination}>
      <Button variant="outline" onPress={onPrev}>Prev</Button>
      <Text style={styles.pageText}>Page {page} of {pages}</Text>
      <Button variant="outline" onPress={onNext}>Next</Button>
    </View>
  );
}

function MenuButton({ label, icon, onPress, danger }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={styles.menuButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={17} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

function LoadingRow() {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.loadingText}>Loading suppliers...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 14, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolbar: { gap: 8, padding: 10 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  search: { width: "100%" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: { minHeight: 34, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  filterChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  filterTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11, overflow: "visible", zIndex: 1 },
  supplierCell: { width: 170, minWidth: 170 },
  name: { color: colors.ink, fontWeight: "900" },
  note: { color: colors.muted, fontSize: 11, marginTop: 3 },
  contact: { width: 170, minWidth: 170, color: colors.muted, fontSize: 12, lineHeight: 18 },
  address: { width: 170, minWidth: 170, color: colors.ink, fontSize: 12 },
  statusCell: { width: 100, minWidth: 100 },
  balanceCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  actionCell: { width: 42, minWidth: 42, alignItems: "center", position: "relative", zIndex: 20 },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  popover: { position: "absolute", right: 34, top: 0, width: 190, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 6, zIndex: 100, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  menuButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, paddingHorizontal: 8 },
  menuText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  empty: { color: colors.muted, fontWeight: "700", padding: 18, textAlign: "center" },
  formCard: { gap: 12 },
  formHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  formTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 22, fontWeight: "700" },
  formHint: { color: colors.muted, fontSize: 12, marginTop: 3 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fieldWrap: { flexGrow: 1, flexBasis: 230, gap: 5 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  required: { color: colors.danger },
  noteField: { flexBasis: "100%" },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  hero: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 30, fontWeight: "700" },
  heroText: { color: colors.muted, marginTop: 4 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  activityPanel: { flexGrow: 1, flexBasis: 360, minWidth: 280, gap: 8 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 15 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 9 },
  activityTitle: { color: colors.ink, fontWeight: "900" },
  activityMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  activityAmount: { color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  emptyPanelText: { color: colors.muted, fontSize: 12 }
});
