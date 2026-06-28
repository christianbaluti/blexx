import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, CommandButton, EmptyPanel, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

export default function Transfers() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers"], queryFn: api.transfers });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });

  const selectedProduct = products.find((product) => product.id === productId);

  const create = useMutation({
    mutationFn: () => api.createTransfer({ productId, quantity: Number(qty || 0), note }),
    onSuccess: async () => {
      setOpen(false);
      setQty("");
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "send" | "receive" | "cancel" }) => (
      action === "send" ? api.sendTransfer(id) : action === "receive" ? api.receiveTransfer(id) : api.cancelTransfer(id)
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });

  function openNew() {
    setProductId(products[0]?.id ?? "");
    setQty("");
    setNote("");
    setOpen(true);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Inventory"
          title="Transfers"
          description="Move finished products from Warehouse stock into Shop stock for POS sales."
          actions={<CommandButton icon="plus" label="New transfer" primary onPress={openNew} />}
        />
        {transfers.length ? (
          <TableCard>
            <TableHeader columns={["Transfer", "From", "To", "Status", "Items", "Created", ""]} />
            {transfers.map((transfer) => (
              <View key={transfer.id} style={styles.row}>
                <Text style={styles.cellText}>{transfer.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.cellText}>{transfer.fromOutletName ?? transfer.fromOutletId}</Text>
                <Text style={styles.cellText}>{transfer.toOutletName ?? transfer.toOutletId}</Text>
                <View style={styles.cell}><Badge tone={transfer.status === "received" ? "success" : "warning"}>{transfer.status}</Badge></View>
                <Text style={styles.rightCell}>{transfer.totalItems}</Text>
                <Text style={styles.mutedText}>{new Date(transfer.createdAt).toLocaleString()}</Text>
                <View style={styles.actionCell}>
                  {transfer.status === "draft" ? (
                    <Pressable style={styles.smallAction} onPress={() => transition.mutate({ id: transfer.id, action: "send" })} disabled={transition.isPending}>
                      <Text style={styles.smallActionText}>Send</Text>
                    </Pressable>
                  ) : null}
                  {transfer.status === "sent" ? (
                    <Pressable style={styles.smallAction} onPress={() => transition.mutate({ id: transfer.id, action: "receive" })} disabled={transition.isPending}>
                      <Text style={styles.smallActionText}>Receive</Text>
                    </Pressable>
                  ) : null}
                  {["draft", "sent"].includes(transfer.status) ? (
                    <Pressable style={[styles.smallAction, styles.cancelAction]} onPress={() => transition.mutate({ id: transfer.id, action: "cancel" })} disabled={transition.isPending}>
                      <Text style={[styles.smallActionText, styles.cancelActionText]}>Cancel</Text>
                    </Pressable>
                  ) : (
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color={transfer.status === "received" ? colors.success : colors.muted} />
                  )}
                </View>
              </View>
            ))}
          </TableCard>
        ) : <EmptyPanel icon="swap-horizontal" title="No transfers yet" body="Create a transfer to move stock from a warehouse into a shop, or between shops." action={<CommandButton icon="plus" label="New transfer" primary onPress={openNew} />} />}
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.modalTitle}>New transfer</Text>
            <View style={styles.routePanel}>
              <Text style={styles.routeText}>Main Warehouse</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.accent} />
              <Text style={styles.routeText}>Main Shop</Text>
            </View>
            <PickerRail label="Product" items={products.map((product) => ({ id: product.id, name: product.name }))} value={productId} onChange={setProductId} />
            <Field value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="Quantity" />
            <Field value={note} onChangeText={setNote} placeholder="Transfer note" />
            <Text style={styles.summary}>{Number((selectedProduct as typeof selectedProduct & { warehouseStock?: number })?.warehouseStock ?? 0)} units currently available in Warehouse.</Text>
            {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "Transfer failed"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={() => create.mutate()} disabled={!productId || !Number(qty) || create.isPending}>Create draft</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function PickerRail({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRail}>
        {items.map((item) => {
          const active = value === item.id;
          return (
            <Pressable key={item.id} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => onChange(item.id)}>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  cell: { flex: 1, minWidth: 100 },
  cellText: { flex: 1, minWidth: 130, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 140, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 80, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  actionCell: { flex: 1.2, minWidth: 190, flexDirection: "row", alignItems: "center", gap: 8 },
  smallAction: { minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.accent, paddingHorizontal: 10 },
  smallActionText: { color: "#FFF7EF", fontSize: 12, fontWeight: "900" },
  cancelAction: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cancelActionText: { color: colors.ink },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 14 },
  panel: { width: "100%", maxWidth: 560, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700" },
  routePanel: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12 },
  routeText: { color: colors.ink, fontWeight: "900" },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  optionRail: { gap: 8 },
  optionChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  optionChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  optionTextActive: { color: colors.sidebarText },
  summary: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
