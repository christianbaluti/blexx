import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { AlertPanel, Badge, CommandButton, EmptyPanel, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type InventoryTab = "stock" | "batches" | "adjustments" | "transfers" | "counts";

export default function Inventory() {
  const [tab, setTab] = useState<InventoryTab>("stock");
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  const { data: inventory = [] } = useQuery({ queryKey: ["inventory"], queryFn: api.inventory });
  const { data: batches = [] } = useQuery({ queryKey: ["inventory-batches"], queryFn: api.batches });
  const { data: movements = [] } = useQuery({ queryKey: ["inventory-movements"], queryFn: api.movements });
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers"], queryFn: api.transfers });
  const { data: counts = [] } = useQuery({ queryKey: ["stock-counts"], queryFn: api.stockCounts });
  const lowStock = products.filter((product) => product.stock <= product.reorder);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          description="Stock items, batches, adjustments, transfers and counts across all outlets."
          actions={
            <>
              <CommandButton icon="swap-horizontal" label="Transfer" />
              <CommandButton icon="plus" label="Receive stock" primary />
            </>
          }
        />
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "stock", label: "Stock on hand" },
            { key: "batches", label: "Batches" },
            { key: "adjustments", label: "Adjustments" },
            { key: "transfers", label: "Transfers" },
            { key: "counts", label: "Physical counts" }
          ]}
        />

        {tab === "stock" ? (
          <>
            {lowStock.length ? (
              <AlertPanel
                title={`${lowStock.length} SKU${lowStock.length > 1 ? "s" : ""} below reorder point`}
                body={lowStock.map((product) => product.name).join(", ")}
              />
            ) : null}
            <TableCard>
              <TableHeader columns={["Item", "On hand", "Reorder", "Unit cost", "Value", "Status"]} />
              {products.map((product) => {
                const reorder = product.stock <= product.reorder;
                return (
                  <View key={product.id} style={styles.row}>
                    <View style={styles.itemCell}>
                      <Text style={styles.rowTitle}>{product.name}</Text>
                      <Text style={styles.rowMeta}>{product.sku}</Text>
                    </View>
                    <Text style={styles.rightCell}>{product.stock} {product.unit}</Text>
                    <Text style={styles.rightMuted}>{product.reorder}</Text>
                    <Text style={styles.rightCell}>{formatMwk(product.cost)}</Text>
                    <Text style={styles.rightCell}>{formatMwk(product.cost * product.stock)}</Text>
                    <View style={styles.cell}><Badge tone={reorder ? "danger" : "success"}>{reorder ? "Reorder" : "In stock"}</Badge></View>
                  </View>
                );
              })}
            </TableCard>
          </>
        ) : null}

        {tab === "batches" ? (
          batches.length ? (
            <TableCard>
              <TableHeader columns={["Batch", "Product", "Expiry", "Qty", "Cost"]} />
              {batches.map((batch) => (
                <View key={batch.id} style={styles.row}>
                  <Text style={styles.cellText}>{batch.batchNo}</Text>
                  <Text style={styles.cellText}>{batch.productName}</Text>
                  <Text style={styles.mutedText}>{batch.expiryDate ?? "-"}</Text>
                  <Text style={styles.rightCell}>{batch.quantity}</Text>
                  <Text style={styles.rightCell}>{formatMwk(batch.cost)}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="package-variant" title="No batches yet" body="Receiving stock with batch or expiry information will populate this view." action={<CommandButton icon="plus" label="New batch" primary />} />
        ) : null}

        {tab === "adjustments" ? (
          movements.length ? (
            <TableCard>
              <TableHeader columns={["Item", "Movement", "Qty", "Reference", "Created"]} />
              {movements.slice(0, 40).map((movement) => (
                <View key={movement.id} style={styles.row}>
                  <Text style={styles.cellText}>{movement.productName}</Text>
                  <View style={styles.cell}><Badge tone={movement.movement === "damage" ? "danger" : "accent"}>{movement.movement}</Badge></View>
                  <Text style={styles.rightCell}>{movement.qty}</Text>
                  <Text style={styles.mutedText}>{movement.refType ?? "-"}</Text>
                  <Text style={styles.mutedText}>{new Date(movement.createdAt).toLocaleString()}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="clipboard-edit-outline" title="No adjustments yet" body="Damage, corrections and manual adjustments will show here." action={<CommandButton icon="plus" label="New adjustment" primary />} />
        ) : null}

        {tab === "transfers" ? (
          transfers.length ? (
            <TableCard>
              <TableHeader columns={["Transfer", "Status", "Items", "Created"]} />
              {transfers.map((transfer) => (
                <View key={transfer.id} style={styles.row}>
                  <Text style={styles.cellText}>{transfer.id.slice(0, 8).toUpperCase()}</Text>
                  <View style={styles.cell}><Badge tone={transfer.status === "received" ? "success" : transfer.status === "cancelled" ? "danger" : "warning"}>{transfer.status}</Badge></View>
                  <Text style={styles.rightCell}>{transfer.totalItems}</Text>
                  <Text style={styles.mutedText}>{new Date(transfer.createdAt).toLocaleString()}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="swap-horizontal" title="No transfers yet" body="Move stock between outlets and track sent/received states." action={<CommandButton icon="plus" label="New transfer" primary />} />
        ) : null}

        {tab === "counts" ? (
          counts.length ? (
            <TableCard>
              <TableHeader columns={["Outlet", "Status", "Variance", "Created", "Closed"]} />
              {counts.map((count) => (
                <View key={count.id} style={styles.row}>
                  <Text style={styles.cellText}>{count.outletName}</Text>
                  <View style={styles.cell}><Badge tone={count.status === "closed" ? "success" : "warning"}>{count.status}</Badge></View>
                  <Text style={[styles.rightCell, count.variance < 0 && { color: colors.danger }]}>{count.variance}</Text>
                  <Text style={styles.mutedText}>{new Date(count.createdAt).toLocaleString()}</Text>
                  <Text style={styles.mutedText}>{count.closedAt ? new Date(count.closedAt).toLocaleString() : "-"}</Text>
                </View>
              ))}
            </TableCard>
          ) : <EmptyPanel icon="clipboard-check-outline" title="No physical counts yet" body="Run stock counts to reconcile system stock with shelf stock." action={<CommandButton icon="plus" label="New count" primary />} />
        ) : null}

        {!inventory.length && tab === "stock" ? <Text style={styles.hint}>Outlet-level inventory is empty; product master stock is shown above.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  itemCell: { flex: 1.4, minWidth: 170 },
  cell: { flex: 1, minWidth: 100 },
  rowTitle: { color: colors.ink, fontWeight: "900" },
  rowMeta: { color: colors.muted, fontFamily: typography.monoMedium, fontSize: 11, marginTop: 3 },
  cellText: { flex: 1, minWidth: 110, color: colors.ink, fontWeight: "800" },
  mutedText: { flex: 1, minWidth: 120, color: colors.muted, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  rightMuted: { flex: 1, minWidth: 90, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  hint: { color: colors.muted, textAlign: "center", fontSize: 12 }
});
