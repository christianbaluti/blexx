import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Customer } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type CustomerForm = { name: string; phone: string; email: string; address: string; loyaltyPoints: string; creditLimit: string; openingBalance: string };
const emptyForm: CustomerForm = { name: "", phone: "", email: "", address: "", loyaltyPoints: "0", creditLimit: "0", openingBalance: "0" };

export default function Customers() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [menuFor, setMenuFor] = useState<Customer | null>(null);
  const [detailFor, setDetailFor] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const detail = useQuery({ queryKey: ["customer-statement", detailFor?.id], queryFn: () => api.customerStatement(detailFor!.id), enabled: Boolean(detailFor) });
  const pageSize = 8;
  const filtered = useMemo(() => customers.filter((customer) => {
    const text = [customer.name, customer.phone ?? "", customer.email ?? "", customer.address ?? ""].join(" ").toLowerCase();
    const credit = customer.balance > 0 || customer.creditLimit > 0;
    const loyalty = customer.loyaltyPoints > 0;
    return (!query || text.includes(query.toLowerCase())) && (filter === "all" || (filter === "credit" && credit) || (filter === "loyalty" && loyalty) || (customer.status ?? "active") === filter);
  }), [customers, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const loyaltyTotal = filtered.reduce((sum, customer) => sum + customer.loyaltyPoints, 0);
  const receivable = filtered.reduce((sum, customer) => sum + customer.balance, 0);
  const creditLimit = filtered.reduce((sum, customer) => sum + customer.creditLimit, 0);

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, loyaltyPoints: Number(form.loyaltyPoints || 0), creditLimit: Number(form.creditLimit || 0), openingBalance: Number(form.openingBalance || 0) };
      return editing ? api.updateCustomer(editing.id, payload).then((result) => result as unknown) : api.createCustomer(payload).then((result) => result as unknown);
    },
    onSuccess: async () => { setFormOpen(false); setEditing(null); setForm(emptyForm); await queryClient.invalidateQueries({ queryKey: ["customers"] }); }
  });
  const suspend = useMutation({ mutationFn: api.suspendCustomer, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }) });
  const remove = useMutation({ mutationFn: api.deleteCustomer, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }) });
  const payment = useMutation({ mutationFn: () => api.recordCustomerPayment(detailFor!.id, { amount: Number(paymentAmount || 0), note: "Customer credit payment" }), onSuccess: async () => { setPaymentAmount(""); await Promise.all([queryClient.invalidateQueries({ queryKey: ["customers"] }), queryClient.invalidateQueries({ queryKey: ["customer-statement", detailFor?.id] })]); } });

  function openEdit(customer?: Customer) {
    setEditing(customer ?? null);
    setForm(customer ? { name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "", loyaltyPoints: String(customer.loyaltyPoints), creditLimit: String(customer.creditLimit), openingBalance: String(customer.balance) } : emptyForm);
    setFormOpen(true);
  }

  const exportRows = filtered.map((customer) => ({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "", loyaltyPoints: customer.loyaltyPoints, creditLimit: customer.creditLimit, balance: customer.balance, status: customer.status ?? "active" }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Relationships" title="Customers" description="Customer profiles, sales interactions, loyalty, credit, balances and payments." actions={<CommandButton icon="plus" label="New customer" primary onPress={() => openEdit()} />} />
        <View style={styles.metrics}>
          <MetricCard label="Customers" value={filtered.length} icon="account-group-outline" />
          <MetricCard label="Loyalty points" value={loyaltyTotal} tone="warning" icon="star-circle-outline" />
          <MetricCard label="Credit limits" value={formatMwk(creditLimit)} icon="credit-card-outline" />
          <MetricCard label="Receivable" value={formatMwk(receivable)} tone={receivable ? "danger" : "default"} icon="cash-clock" />
        </View>
        <TableCard>
          <View style={styles.toolbar}>
            <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search customers" style={styles.search} />
            <Filter value={filter} setValue={(value) => { setFilter(value); setPage(1); }} />
            <ExportMenu title="customers" rows={exportRows} />
          </View>
          <TableHeader columns={["Customer", "Contact", "Loyalty", "Credit limit", "Balance", "Status", ""]} />
          {rows.map((customer) => (
            <Pressable key={customer.id} style={styles.row} onPress={() => setDetailFor(customer)}>
              <View style={styles.customerCell}><Text style={styles.name}>{customer.name}</Text><Text style={styles.meta}>{customer.address || customer.id}</Text></View>
              <Text style={styles.contact}>{customer.phone || "-"}{"\n"}{customer.email || ""}</Text>
              <View style={styles.cell}>{customer.loyaltyPoints ? <Badge tone="warning">{customer.loyaltyPoints}</Badge> : <Text style={styles.emptyText}>-</Text>}</View>
              <Text style={styles.rightCell}>{customer.creditLimit ? formatMwk(customer.creditLimit) : "-"}</Text>
              <Text style={[styles.rightCell, customer.balance > 0 && { color: colors.danger }]}>{customer.balance ? formatMwk(customer.balance) : "-"}</Text>
              <View style={styles.cell}><Badge tone={(customer.status ?? "active") === "active" ? "success" : "warning"}>{customer.status ?? "active"}</Badge></View>
              <Pressable style={styles.iconButton} onPress={() => setMenuFor(customer)}><MaterialCommunityIcons name="dots-vertical" size={18} color={colors.ink} /></Pressable>
            </Pressable>
          ))}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <CustomerModal open={formOpen} editing={editing} form={form} setForm={setForm} saving={save.isPending} error={save.error} onClose={() => setFormOpen(false)} onSave={() => save.mutate()} />
      <ActionMenu customer={menuFor} onClose={() => setMenuFor(null)} onEdit={(c) => { setMenuFor(null); openEdit(c); }} onView={(c) => { setMenuFor(null); setDetailFor(c); }} onSuspend={(c) => { setMenuFor(null); suspend.mutate(c.id); }} onDelete={(c) => { setMenuFor(null); Alert.alert("Delete customer", "Delete only works when no sales are linked. Otherwise suspend.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate(c.id) }]); }} />
      <DetailModal customer={detailFor} data={detail.data} loading={detail.isLoading} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} onPayment={() => payment.mutate()} onClose={() => setDetailFor(null)} />
    </Screen>
  );
}

function Filter({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return <View style={styles.filterRow}>{["all", "active", "archived", "credit", "loyalty"].map((item) => <Pressable key={item} style={[styles.chip, value === item && styles.chipActive]} onPress={() => setValue(item)}><Text style={[styles.chipText, value === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>;
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return <View style={styles.pagination}><Button variant="outline" onPress={onPrev}>Prev</Button><Text style={styles.pageText}>Page {page} of {pages}</Text><Button variant="outline" onPress={onNext}>Next</Button></View>;
}

function CustomerModal({ open, editing, form, setForm, saving, error, onClose, onSave }: { open: boolean; editing: Customer | null; form: CustomerForm; setForm: (f: CustomerForm) => void; saving: boolean; error: unknown; onClose: () => void; onSave: () => void }) {
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.panel}><Text style={styles.modalTitle}>{editing ? "Edit customer" : "New customer"}</Text><Field value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Customer name" /><View style={styles.grid}><Field style={styles.gridField} value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="Phone" /><Field style={styles.gridField} value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="Email" /></View><Field value={form.address} onChangeText={(address) => setForm({ ...form, address })} placeholder="Address" /><View style={styles.grid}><Field style={styles.gridField} value={form.loyaltyPoints} onChangeText={(loyaltyPoints) => setForm({ ...form, loyaltyPoints })} keyboardType="numeric" placeholder="Loyalty points" /><Field style={styles.gridField} value={form.creditLimit} onChangeText={(creditLimit) => setForm({ ...form, creditLimit })} keyboardType="numeric" placeholder="Credit limit" /><Field style={styles.gridField} value={form.openingBalance} onChangeText={(openingBalance) => setForm({ ...form, openingBalance })} keyboardType="numeric" placeholder="Balance" /></View>{error ? <Text style={styles.error}>{error instanceof Error ? error.message : "Save failed"}</Text> : null}<View style={styles.actions}><Button variant="outline" onPress={onClose}>Cancel</Button><Button onPress={onSave} disabled={saving || !form.name.trim()}>Save</Button></View></Pressable></Pressable></Modal>;
}

function ActionMenu({ customer, onClose, onEdit, onView, onSuspend, onDelete }: { customer: Customer | null; onClose: () => void; onEdit: (c: Customer) => void; onView: (c: Customer) => void; onSuspend: (c: Customer) => void; onDelete: (c: Customer) => void }) {
  if (!customer) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.menuPanel}><MenuButton label="View customer" icon="account-eye-outline" onPress={() => onView(customer)} /><MenuButton label="Edit customer" icon="pencil-outline" onPress={() => onEdit(customer)} /><MenuButton label="Suspend" icon="account-cancel-outline" onPress={() => onSuspend(customer)} /><MenuButton label="Delete" icon="delete-outline" danger onPress={() => onDelete(customer)} /></Pressable></Pressable></Modal>;
}

function MenuButton({ label, icon, onPress, danger }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; danger?: boolean }) {
  return <Pressable style={styles.menuButton} onPress={onPress}><MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.ink} /><Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text></Pressable>;
}

function DetailModal({ customer, data, loading, paymentAmount, setPaymentAmount, onPayment, onClose }: { customer: Customer | null; data: Record<string, unknown> | undefined; loading: boolean; paymentAmount: string; setPaymentAmount: (v: string) => void; onPayment: () => void; onClose: () => void }) {
  const sales = Array.isArray(data?.sales) ? data.sales as Record<string, unknown>[] : [];
  const loyalty = Array.isArray(data?.loyalty) ? data.loyalty as Record<string, unknown>[] : [];
  const exportRows = [...sales.map((x) => ({ type: "sale", ref: x.refNo, total: x.total, status: x.status })), ...loyalty.map((x) => ({ type: "loyalty", ref: x.id, points: x.points, status: x.refType }))];
  return <Modal visible={Boolean(customer)} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.detailPanel}><View style={styles.detailHeader}><Text style={styles.modalTitle}>{customer?.name}</Text><ExportMenu title={`${customer?.name}-history`} rows={exportRows} /></View>{loading ? <Text style={styles.mutedText}>Loading...</Text> : <ScrollView contentContainerStyle={styles.detailBody}><Chart rows={sales} /><Text style={styles.sectionTitle}>Record payment</Text><View style={styles.paymentRow}><Field value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="numeric" placeholder="Payment amount" style={{ flex: 1 }} /><Button onPress={onPayment} disabled={!Number(paymentAmount)}>Save payment</Button></View><Section title="Sales and orders" rows={sales} /><Section title="Loyalty activity" rows={loyalty} /></ScrollView>}</Pressable></Pressable></Modal>;
}

function Chart({ rows }: { rows: Record<string, unknown>[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.total ?? 0)));
  return <View style={styles.chart}><Text style={styles.sectionTitle}>Customer sales graph</Text>{rows.slice(0, 6).map((row) => <View key={String(row.id)} style={styles.barRow}><Text style={styles.barLabel}>{String(row.refNo)}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, (Number(row.total ?? 0) / max) * 100)}%` }]} /></View><Text style={styles.barValue}>{formatMwk(Number(row.total ?? 0))}</Text></View>)}</View>;
}

function Section({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return <View style={styles.statementSection}><Text style={styles.sectionTitle}>{title}</Text>{rows.length ? rows.map((row) => <Text key={String(row.id)} style={styles.detailLine}>{String(row.refNo ?? row.refType ?? row.id)} - {row.total ? formatMwk(Number(row.total)) : `${String(row.points ?? "")} points`} - {String(row.status ?? row.note ?? "")}</Text>) : <Text style={styles.mutedText}>No records.</Text>}</View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  search: { flexGrow: 1, flexBasis: 260 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "900", textTransform: "capitalize" },
  chipTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  customerCell: { flex: 1.3, minWidth: 180 },
  name: { color: colors.ink, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  contact: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12, lineHeight: 18 },
  cell: { flex: 1, minWidth: 90 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  emptyText: { color: colors.muted },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 160 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  menuPanel: { width: 220, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 8 },
  menuButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  menuText: { color: colors.ink, fontWeight: "900" },
  detailPanel: { width: "100%", maxWidth: 760, maxHeight: "88%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  detailHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailBody: { gap: 12, padding: 14 },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 14 },
  chart: { gap: 8 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 90, color: colors.muted, fontSize: 11 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barValue: { width: 100, textAlign: "right", color: colors.ink, fontFamily: typography.monoMedium, fontSize: 11 },
  statementSection: { gap: 7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  detailLine: { color: colors.ink, fontSize: 12 },
  mutedText: { color: colors.muted, fontSize: 12 }
});
