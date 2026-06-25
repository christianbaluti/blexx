import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type GrnForm = { supplierId: string; outletId: string; productId: string; qty: string; unitCost: string; batchNo: string; expiryDate: string; note: string };
const emptyForm: GrnForm = { supplierId: "", outletId: "", productId: "", qty: "1", unitCost: "0", batchNo: "", expiryDate: "", note: "" };

export default function Grn() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<GrnForm>(emptyForm);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: grns = [], isLoading, isFetching } = useQuery({ queryKey: ["grn"], queryFn: api.grn });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const { data: outlets = [] } = useQuery({ queryKey: ["outlets"], queryFn: api.outlets });
  const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: api.items });
  const detail = useQuery({ queryKey: ["grn-detail", detailId], queryFn: () => api.grnDetail(detailId!), enabled: Boolean(detailId) });
  const pageSize = 8;

  const filtered = useMemo(() => grns.filter((grn) => {
    const text = [grn.refNo, grn.supplierName ?? "", grn.outletName ?? "", grn.note ?? ""].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (supplierFilter === "all" || grn.supplierId === supplierFilter);
  }), [grns, query, supplierFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalValue = filtered.reduce((sum, grn) => sum + Number(grn.total ?? 0), 0);

  const create = useMutation({
    mutationFn: () => api.createGrn({
      supplierId: form.supplierId,
      locationId: form.outletId,
      note: form.note,
      items: [{ itemId: form.productId, quantity: Number(form.qty || 0), unitCost: Number(form.unitCost || 0) }]
    }),
    onSuccess: async () => {
      setFormOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grn"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });

  function openNew() {
    setForm({ ...emptyForm, supplierId: suppliers[0]?.id ?? "", outletId: String(outlets.find((outlet) => String(outlet.type) === "warehouse")?.id ?? outlets[0]?.id ?? ""), productId: String(items[0]?.id ?? "") });
    setFormOpen(true);
  }

  const exportRows = filtered.map((grn) => ({ refNo: grn.refNo, supplier: grn.supplierName ?? "", outlet: grn.outletName ?? "", receivedAt: grn.receivedAt, totalItems: grn.totalItems, total: grn.total ?? 0 }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Receiving" title="Goods Received Notes" description="Record supplier deliveries into a warehouse or shop and connect them to supplier invoices." actions={<CommandButton icon="plus" label="New GRN" primary onPress={openNew} />} />
        <View style={styles.metrics}>
          <MetricCard label="GRNs" value={filtered.length} icon="package-variant-closed-check" />
          <MetricCard label="Received value" value={formatMwk(totalValue)} tone="accent" icon="cash" />
          <MetricCard label="Linked invoices" value={grns.filter((g) => g.poId || g.supplierId).length} icon="file-document-outline" />
        </View>
        <Card style={styles.toolbar}>
          <Field value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search GRN, supplier, outlet" style={styles.search} />
          <Picker items={[{ id: "all", name: "All suppliers" }, ...suppliers.map((s) => ({ id: s.id, name: s.name }))]} value={supplierFilter} onChange={(value) => { setSupplierFilter(value); setPage(1); }} />
          <View style={styles.toolbarActions}>
            <ExportMenu title="grns" rows={exportRows} />
            {isFetching ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        </Card>

        <TableCard>
          <TableHeader columns={["GRN", "Supplier", "Outlet", "Items", "Value", "Received", "Status"]} />
          {isLoading ? <LoadingRow label="Loading GRNs..." /> : null}
          {rows.map((grn) => (
            <Pressable key={grn.id} style={styles.row} onPress={() => setDetailId(grn.id)}>
              <Text style={styles.cellText}>{grn.refNo}</Text>
              <Text style={styles.cellText}>{grn.supplierName ?? "-"}</Text>
              <Text style={styles.cellText}>{grn.outletName ?? "-"}</Text>
              <Text style={styles.rightCell}>{grn.totalItems}</Text>
              <Text style={styles.rightCell}>{formatMwk(Number(grn.total ?? 0))}</Text>
              <Text style={styles.mutedText}>{new Date(grn.receivedAt).toLocaleString()}</Text>
              <View style={styles.cell}><Badge tone="success">Received</Badge></View>
            </Pressable>
          ))}
          <Pagination page={page} pages={pages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(pages, page + 1))} />
        </TableCard>
      </ScrollView>
      <GrnModal open={formOpen} form={form} setForm={setForm} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} outlets={outlets.filter((o) => String(o.type) === "warehouse").map((o) => ({ id: String(o.id), name: String(o.name) }))} products={items.map((item) => ({ id: String(item.id), name: String(item.name) }))} saving={create.isPending} error={create.error} onClose={() => setFormOpen(false)} onSave={() => create.mutate()} />
      <DetailModal data={detail.data} loading={detail.isLoading} open={Boolean(detailId)} onClose={() => setDetailId(null)} />
    </Screen>
  );
}

function GrnModal({ open, form, setForm, suppliers, outlets, products, saving, error, onClose, onSave }: { open: boolean; form: GrnForm; setForm: (f: GrnForm) => void; suppliers: { id: string; name: string }[]; outlets: { id: string; name: string }[]; products: { id: string; name: string }[]; saving: boolean; error: unknown; onClose: () => void; onSave: () => void }) {
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.panel}><ScrollView contentContainerStyle={{ gap: 12 }}><Text style={styles.modalTitle}>Receive goods</Text><Text style={styles.sectionTitle}>Supplier</Text><Picker items={suppliers} value={form.supplierId} onChange={(supplierId) => setForm({ ...form, supplierId })} /><Text style={styles.sectionTitle}>Receive into</Text><Picker items={outlets} value={form.outletId} onChange={(outletId) => setForm({ ...form, outletId })} /><Text style={styles.sectionTitle}>Goods</Text><Picker items={products} value={form.productId} onChange={(productId) => setForm({ ...form, productId })} /><View style={styles.grid}><Field style={styles.gridField} value={form.qty} onChangeText={(qty) => setForm({ ...form, qty })} keyboardType="numeric" placeholder="Qty" /><Field style={styles.gridField} value={form.unitCost} onChangeText={(unitCost) => setForm({ ...form, unitCost })} keyboardType="numeric" placeholder="Purchase value per unit" /></View><View style={styles.grid}><Field style={styles.gridField} value={form.batchNo} onChangeText={(batchNo) => setForm({ ...form, batchNo })} placeholder="Batch no" /><Field style={styles.gridField} value={form.expiryDate} onChangeText={(expiryDate) => setForm({ ...form, expiryDate })} placeholder="Expiry YYYY-MM-DD" /></View><Field value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Receiving note" />{error ? <Text style={styles.error}>{error instanceof Error ? error.message : "Save failed"}</Text> : null}<View style={styles.actions}><Button variant="outline" onPress={onClose}>Cancel</Button><Button onPress={onSave} disabled={saving || !form.outletId || !form.productId || !Number(form.qty)}>Save GRN</Button></View></ScrollView></Pressable></Pressable></Modal>;
}

function DetailModal({ open, data, loading, onClose }: { open: boolean; data: Record<string, unknown> | undefined; loading: boolean; onClose: () => void }) {
  const lines = Array.isArray(data?.items) ? data.items as Record<string, unknown>[] : [];
  const exportRows = lines.map((line) => ({ item: line.item_name, qty: line.quantity, unitCost: line.unit_cost }));
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.detailPanel}><View style={styles.detailHeader}><Text style={styles.modalTitle}>{String(data?.ref_no ?? data?.refNo ?? "GRN")}</Text><ExportMenu title={`${String(data?.ref_no ?? data?.refNo ?? "grn")}-detail`} rows={exportRows} /></View>{loading ? <Text style={styles.mutedText}>Loading...</Text> : <ScrollView contentContainerStyle={styles.detailBody}><Text style={styles.detailLine}>Supplier: {String(data?.supplier_name ?? "-")}</Text><Text style={styles.detailLine}>Note: {String(data?.note ?? "-")}</Text><Button onPress={() => router.push("/supplier-invoices" as never)}>Record invoice for this GRN</Button><Text style={styles.sectionTitle}>Lines</Text>{lines.map((line) => <Text key={String(line.id)} style={styles.detailLine}>{String(line.item_name)} - {String(line.quantity)} @ {formatMwk(Number(line.unit_cost ?? 0))}</Text>)}</ScrollView>}</Pressable></Pressable></Modal>;
}

function Picker({ items, value, onChange }: { items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{items.map((item) => <Pressable key={item.id || "none"} style={[styles.chip, value === item.id && styles.chipActive]} onPress={() => onChange(item.id)}><Text style={[styles.chipText, value === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView>;
}

function Pagination({ page, pages, onPrev, onNext }: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return <View style={styles.pagination}><Button variant="outline" onPress={onPrev}>Prev</Button><Text style={styles.pageText}>Page {page} of {pages}</Text><Button variant="outline" onPress={onNext}>Next</Button></View>;
}

function LoadingRow({ label }: { label: string }) {
  return <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { gap: 8, padding: 10 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  search: { width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { width: 100, minWidth: 100 },
  cellText: { width: 130, minWidth: 130, color: colors.ink, fontWeight: "800" },
  mutedText: { width: 145, minWidth: 145, color: colors.muted, fontSize: 12 },
  rightCell: { width: 110, minWidth: 110, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  loadingRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  loadingText: { color: colors.muted, fontWeight: "700" },
  pagination: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 12 },
  pageText: { color: colors.muted, fontWeight: "800" },
  chips: { gap: 8 },
  chip: { minHeight: 34, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "900" },
  chipTextActive: { color: colors.sidebarText },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 620, maxHeight: "92%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  sectionTitle: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridField: { flex: 1, minWidth: 160 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  detailPanel: { width: "100%", maxWidth: 720, maxHeight: "88%", borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  detailHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailBody: { gap: 10, padding: 14 },
  detailLine: { color: colors.ink, fontSize: 12 }
});
