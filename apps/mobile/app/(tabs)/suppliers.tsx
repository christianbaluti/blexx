import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Supplier } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type SupplierForm = { name: string; phone: string; email: string; address: string; note: string; openingBalance: string };
const emptyForm: SupplierForm = { name: "", phone: "", email: "", address: "", note: "", openingBalance: "0" };

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Supplier | null>(null);
  const [statementFor, setStatementFor] = useState<Supplier | null>(null);
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const statement = useQuery({ queryKey: ["supplier-statement", statementFor?.id], queryFn: () => api.supplierStatement(statementFor!.id), enabled: Boolean(statementFor) });
  const pageSize = 8;

  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const text = [supplier.name, supplier.phone ?? "", supplier.email ?? "", supplier.address ?? "", supplier.note ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "all" || (supplier.status ?? "active") === status);
  }), [query, status, suppliers]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const balance = filtered.reduce((sum, supplier) => sum + supplier.balance, 0);

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, openingBalance: Number(form.openingBalance || 0) };
      return editing ? api.updateSupplier(editing.id, payload).then((result) => result as unknown) : api.createSupplier(payload).then((result) => result as unknown);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });
  const suspend = useMutation({ mutationFn: api.suspendSupplier, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }) });
  const remove = useMutation({ mutationFn: api.deleteSupplier, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }) });

  function openEdit(supplier?: Supplier) {
    setEditing(supplier ?? null);
    setForm(supplier ? {
      name: supplier.name,
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      note: supplier.note ?? "",
      openingBalance: String(supplier.balance ?? 0)
    } : emptyForm);
    setFormOpen(true);
  }

  function confirmDelete(supplier: Supplier) {
    Alert.alert("Delete supplier", "Delete only works if this supplier is not linked to activity. Otherwise suspend it.", [
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Relationships" title="Suppliers" description="Registration, statements, purchase history and payable balances." actions={<CommandButton icon="plus" label="New supplier" primary onPress={() => openEdit()} />} />
        <View style={styles.metrics}>
          <MetricCard label="Suppliers" value={filtered.length} icon="truck-outline" />
          <MetricCard label="Payable balance" value={formatMwk(balance)} tone={balance ? "accent" : "default"} icon="cash-clock" />
          <MetricCard label="Suspended" value={suppliers.filter((item) => item.status === "archived").length} icon="account-cancel-outline" />
        </View>
        <TableCard>
          <View style={styles.toolbar}>
            <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search suppliers" style={styles.search} />
            <Filter value={status} setValue={(value) => { setStatus(value); setPage(1); }} />
            <ExportMenu title="suppliers" rows={exportRows} />
          </View>
          <TableHeader columns={["Supplier", "Contact", "Address", "Status", "Balance", ""]} />
          {rows.map((supplier) => (
            <View key={supplier.id} style={styles.row}>
              <View style={styles.supplierCell}>
                <Text style={styles.name}>{supplier.name}</Text>
                <Text style={styles.note} numberOfLines={1}>{supplier.note || "No note"}</Text>
              </View>
              <Text style={styles.contact}>{supplier.phone || "-"}{"\n"}{supplier.email || ""}</Text>
              <Text style={styles.address} numberOfLines={2}>{supplier.address || "-"}</Text>
              <View style={styles.cell}><Badge tone={(supplier.status ?? "active") === "active" ? "success" : "warning"}>{supplier.status ?? "active"}</Badge></View>
              <Text style={styles.rightCell}>{formatMwk(supplier.balance)}</Text>
              <Pressable style={styles.iconButton} onPress={() => setMenuFor(supplier)}>
                <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.ink} />
              </Pressable>
            </View>
          ))}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>

      <SupplierFormModal open={formOpen} editing={editing} form={form} setForm={setForm} saving={save.isPending} error={save.error} onClose={() => setFormOpen(false)} onSave={() => save.mutate()} />
      <ActionMenu supplier={menuFor} onClose={() => setMenuFor(null)} onEdit={(supplier) => { setMenuFor(null); openEdit(supplier); }} onStatement={(supplier) => { setMenuFor(null); setStatementFor(supplier); }} onSuspend={(supplier) => { setMenuFor(null); suspend.mutate(supplier.id); }} onDelete={(supplier) => { setMenuFor(null); confirmDelete(supplier); }} />
      <StatementModal supplier={statementFor} data={statement.data} loading={statement.isLoading} onClose={() => setStatementFor(null)} />
    </Screen>
  );
}

function Filter({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return (
    <View style={styles.filterRow}>
      {["all", "active", "archived"].map((item) => (
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

function SupplierFormModal({ open, editing, form, setForm, saving, error, onClose, onSave }: {
  open: boolean; editing: Supplier | null; form: SupplierForm; setForm: (form: SupplierForm) => void; saving: boolean; error: unknown; onClose: () => void; onSave: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel}>
          <Text style={styles.modalTitle}>{editing ? "Edit supplier" : "New supplier"}</Text>
          <Field value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Supplier name" />
          <View style={styles.grid}>
            <Field style={styles.gridField} value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="Phone" />
            <Field style={styles.gridField} value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="Email" />
          </View>
          <Field value={form.address} onChangeText={(address) => setForm({ ...form, address })} placeholder="Address" />
          <Field value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Note" multiline />
          <Field value={form.openingBalance} onChangeText={(openingBalance) => setForm({ ...form, openingBalance })} keyboardType="numeric" placeholder="Opening balance" />
          {error ? <Text style={styles.error}>{error instanceof Error ? error.message : "Save failed"}</Text> : null}
          <View style={styles.actions}><Button variant="outline" onPress={onClose}>Cancel</Button><Button onPress={onSave} disabled={saving || !form.name.trim()}>Save</Button></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionMenu({ supplier, onClose, onEdit, onStatement, onSuspend, onDelete }: {
  supplier: Supplier | null; onClose: () => void; onEdit: (s: Supplier) => void; onStatement: (s: Supplier) => void; onSuspend: (s: Supplier) => void; onDelete: (s: Supplier) => void;
}) {
  if (!supplier) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.menuPanel}>
          <MenuButton label="View statement" icon="file-chart-outline" onPress={() => onStatement(supplier)} />
          <MenuButton label="Edit supplier" icon="pencil-outline" onPress={() => onEdit(supplier)} />
          <MenuButton label="Suspend supplier" icon="account-cancel-outline" onPress={() => onSuspend(supplier)} />
          <MenuButton label="Delete supplier" icon="delete-outline" danger onPress={() => onDelete(supplier)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuButton({ label, icon, onPress, danger }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; danger?: boolean }) {
  return <Pressable style={styles.menuButton} onPress={onPress}><MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.ink} /><Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text></Pressable>;
}

function StatementModal({ supplier, data, loading, onClose }: { supplier: Supplier | null; data: Record<string, unknown> | undefined; loading: boolean; onClose: () => void }) {
  const invoices = Array.isArray(data?.invoices) ? data.invoices as Record<string, unknown>[] : [];
  const pos = Array.isArray(data?.purchaseOrders) ? data.purchaseOrders as Record<string, unknown>[] : [];
  const grns = Array.isArray(data?.grns) ? data.grns as Record<string, unknown>[] : [];
  const exportRows = [...invoices.map((x) => ({ type: "invoice", ref: x.refNo, total: x.total, status: x.status })), ...pos.map((x) => ({ type: "purchase-order", ref: x.refNo, total: x.total, status: x.status })), ...grns.map((x) => ({ type: "grn", ref: x.refNo, total: "", status: "received" }))];
  return (
    <Modal visible={Boolean(supplier)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.statementPanel}>
          <View style={styles.statementHeader}><Text style={styles.modalTitle}>{supplier?.name} statement</Text><ExportMenu title={`${supplier?.name}-statement`} rows={exportRows} /></View>
          {loading ? <Text style={styles.mutedNote}>Loading statement...</Text> : (
            <ScrollView contentContainerStyle={styles.statementBody}>
              <Chart title="Invoice exposure" rows={invoices} />
              <Section title="Invoices" rows={invoices} />
              <Section title="Purchase orders" rows={pos} />
              <Section title="GRNs" rows={grns} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chart({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.total ?? 0)));
  return <View style={styles.chart}><Text style={styles.sectionTitle}>{title}</Text>{rows.slice(0, 6).map((row) => <View key={String(row.id ?? row.refNo)} style={styles.barRow}><Text style={styles.barLabel}>{String(row.refNo)}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, (Number(row.total ?? 0) / max) * 100)}%` }]} /></View><Text style={styles.barValue}>{formatMwk(Number(row.total ?? 0))}</Text></View>)}</View>;
}

function Section({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return <View style={styles.statementSection}><Text style={styles.sectionTitle}>{title}</Text>{rows.length ? rows.map((row) => <Text key={String(row.id ?? row.refNo)} style={styles.statementLine}>{String(row.refNo ?? row.id)} - {String(row.status ?? row.receivedAt ?? row.date ?? "")} - {row.total ? formatMwk(Number(row.total)) : ""}</Text>) : <Text style={styles.note}>No records.</Text>}</View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  search: { flexGrow: 1, flexBasis: 250 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: { minHeight: 34, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  filterChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  filterText: { color: colors.muted, fontWeight: "900", textTransform: "capitalize" },
  filterTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  supplierCell: { flex: 1.3, minWidth: 180 },
  name: { color: colors.ink, fontWeight: "900" },
  note: { color: colors.muted, fontSize: 11, marginTop: 3 },
  contact: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12, lineHeight: 18 },
  address: { flex: 1, minWidth: 150, color: colors.ink, fontSize: 12 },
  cell: { flex: 1, minWidth: 100 },
  rightCell: { flex: 1, minWidth: 100, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 560, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 180 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  menuPanel: { width: 240, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 8 },
  menuButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  menuText: { color: colors.ink, fontWeight: "900" },
  statementPanel: { width: "100%", maxWidth: 820, maxHeight: "90%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  statementHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  statementBody: { gap: 12, padding: 14 },
  chart: { gap: 8 },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 15 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 88, color: colors.muted, fontSize: 11 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barValue: { width: 100, textAlign: "right", color: colors.ink, fontFamily: typography.monoMedium, fontSize: 11 },
  statementSection: { gap: 7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  statementLine: { color: colors.ink, fontSize: 12 },
  mutedNote: { color: colors.muted, fontSize: 12 }
});
