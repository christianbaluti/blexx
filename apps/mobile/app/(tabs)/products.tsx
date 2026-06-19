import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMwk } from "@blex/shared";
import { Badge, CommandButton, MetricCard, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Field, Screen } from "../../src/components/ui";
import { Login } from "../../src/components/login";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, typography } from "../../src/lib/theme";
import { quickCreate } from "../../src/components/quick-create";

export default function Products() {
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: api.products, enabled: auth.isAuthenticated });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.categories, enabled: auth.isAuthenticated });
  const filtered = useMemo(
    () => products.filter((p) => !query || [p.name, p.sku, p.barcode ?? ""].join(" ").toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  if (!auth.isAuthenticated) return <Login />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Catalogue"
          title="Products"
          description="Manage SKUs, barcodes, variants, pricing, categories and stock thresholds."
          actions={quickCreate.product()}
        />

        <View style={styles.metrics}>
          <MetricCard label="Total SKUs" value={products.length} icon="tag-multiple-outline" />
          <MetricCard label="Categories" value={categories.length} icon="shape-outline" />
          <MetricCard label="Stock value" value={formatMwk(products.reduce((sum, item) => sum + item.stock * item.cost, 0))} icon="cash-multiple" />
          <MetricCard label="Low stock" value={products.filter((item) => item.stock <= item.reorder).length} tone="danger" icon="alert-octagon-outline" />
        </View>

        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search name, SKU or barcode" style={styles.searchField} />
            </View>
            <CommandButton icon="filter-variant" label="Filter" />
            <CommandButton icon="download-outline" label="Export" />
            {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
          <TableHeader columns={["Product", "SKU", "Barcode", "Category", "Cost", "Price", "Stock", ""]} />
          {filtered.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.productCell}>
                <View style={styles.productIcon}><MaterialCommunityIcons name="package-variant-closed" size={16} color={colors.muted} /></View>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              </View>
              <Text style={styles.monoCell}>{item.sku}</Text>
              <Text style={styles.mutedCell} numberOfLines={1}>{item.barcode ?? "-"}</Text>
              <View style={styles.cell}><Badge tone="muted">{item.categoryName ?? "Uncategorised"}</Badge></View>
              <Text style={styles.rightCell}>{formatMwk(item.cost)}</Text>
              <Text style={styles.rightCell}>{item.price ? formatMwk(item.price) : "-"}</Text>
              <Text style={[styles.rightCell, item.stock <= item.reorder && styles.lowStock]}>{item.stock} {item.unit}</Text>
              <Pressable style={styles.editButton}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 280, flexGrow: 1, flexBasis: 340, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  productCell: { flex: 1.45, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 9 },
  productIcon: { width: 32, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  name: { color: colors.ink, flex: 1, fontWeight: "900" },
  cell: { flex: 1, minWidth: 100 },
  monoCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12 },
  mutedCell: { flex: 1, minWidth: 130, color: colors.muted, fontFamily: typography.monoMedium, fontSize: 12 },
  rightCell: { flex: 1, minWidth: 90, color: colors.ink, fontFamily: typography.monoMedium, fontSize: 12, textAlign: "right" },
  lowStock: { color: colors.danger, fontWeight: "900" },
  editButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6 }
});
