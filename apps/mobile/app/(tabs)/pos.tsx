import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Product, Sale } from "@blex/shared";
import { formatMwk } from "@blex/shared";
import { Button, Field, Screen } from "../../src/components/ui";
import { Login } from "../../src/components/login";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, typography } from "../../src/lib/theme";
import { createOfflineMutation } from "../../src/lib/syncEngine";
import { enqueueMutation } from "../../src/lib/localDb";
import { useNetworkStatus } from "../../src/lib/network";
import { shareReceipt } from "../../src/lib/receiptService";

type CartLine = { product: Product; qty: number };
type CheckoutResult = { id: string; refNo: string; total: number; queued?: boolean };
type SalePayload = Parameters<typeof api.createSale>[0];

export default function Pos() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const online = useNetworkStatus();
  const compact = width < 940;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [compactPane, setCompactPane] = useState<"items" | "cart">("items");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products, enabled: auth.isAuthenticated });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.categories, enabled: auth.isAuthenticated });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.customers, enabled: auth.isAuthenticated });

  const chips = useMemo(() => [{ id: "all", name: "All" }, ...categories], [categories]);
  const sellable = useMemo(
    () =>
      products.filter((product) => {
        const searchable = [product.name, product.sku, product.barcode ?? "", product.categoryName ?? ""].join(" ").toLowerCase();
        return product.isSellable && product.price > 0 && (category === "all" || product.categoryId === category) && (!search || searchable.includes(search.toLowerCase()));
      }),
    [category, products, search]
  );

  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const discountAmount = Math.min(Number(discount || 0), subtotal);
  const total = Math.max(0, subtotal - discountAmount);

  const checkout = useMutation({
    mutationFn: async (payment: Sale["payment"]): Promise<CheckoutResult> => {
      const payload = {
        cashierId: auth.user!.id,
        customerId: customerId || null,
        payment,
        discount: discountAmount,
        lines: cart.map((line) => ({ productId: line.product.id, qty: line.qty, price: line.product.price, discount: 0 }))
      };
      if (!online) return queueOfflineSale(payment, payload);
      try {
        return await api.createSale(payload);
      } catch (error) {
        if (isNetworkError(error)) return queueOfflineSale(payment, payload);
        throw error;
      }
    },
    onSuccess: async (sale, payment) => {
      if (sale.queued) {
        applyLocalStockDeduction(cart);
        Alert.alert("Sale queued", "The sale was saved on this device and will sync when the backend is reachable.");
      } else {
        await shareReceipt({
          refNo: sale.refNo,
          total: sale.total,
          subtotal,
          discount: discountAmount,
          payment,
          customerName: customers.find((customer) => customer.id === customerId)?.name ?? "Walk-in customer",
          lines: cart.map((line) => ({ productId: line.product.id, name: line.product.name, qty: line.qty, price: line.product.price, discount: 0 }))
        }).catch(() => undefined);
      }
      setCart([]);
      setDiscount("0");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] })
      ]);
    },
    onError: (error) => {
      Alert.alert("Could not complete sale", error instanceof Error ? error.message : "Please check the sale and try again.");
    }
  });

  async function queueOfflineSale(payment: Sale["payment"], payload: SalePayload): Promise<CheckoutResult> {
    if (payment === "credit") {
      throw new Error("Credit sales need a live backend connection so the customer limit can be checked.");
    }
    const mutation = createOfflineMutation("sale", "create", {
      ...payload,
      paymentMethod: payment === "voucher" ? "cash" : payment,
      subtotal,
      total
    });
    await enqueueMutation(mutation);
    return {
      id: mutation.id,
      refNo: `PENDING-${mutation.id.slice(0, 8).toUpperCase()}`,
      total,
      queued: true
    };
  }

  function applyLocalStockDeduction(lines: CartLine[]) {
    queryClient.setQueryData<Product[]>(["products"], (current) =>
      current?.map((product) => {
        const line = lines.find((entry) => entry.product.id === product.id);
        if (!line) return product;
        const nextStock = Math.max(0, product.stock - line.qty);
        return {
          ...product,
          stock: nextStock,
          shopStock: Math.max(0, Number((product as Product & { shopStock?: number }).shopStock ?? product.stock) - line.qty)
        } as Product;
      }) ?? current
    );
  }

  if (!auth.isAuthenticated) return <Login />;

  function add(product: Product) {
    if (product.stock <= 0) {
      Alert.alert("Out of stock", `${product.name} has no stock available.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          Alert.alert("Stock limit reached", `Only ${product.stock} ${product.unit} available for ${product.name}.`);
          return current;
        }
        return current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line);
      }
      const next = [...current, { product, qty: 1 }];
      if (compact) setCompactPane("cart");
      return next;
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      if (qty <= 0) return [];
      return [{ ...line, qty: Math.min(qty, line.product.stock) }];
    }));
  }

  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.posHeader}>
          <Pressable style={styles.exitButton} onPress={() => router.push("/dashboard" as never)}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={colors.ink} />
            <Text style={styles.exitText}>Exit POS</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.lane}>Lane 01</Text>
            <Text style={styles.cashier}>Cashier: {auth.user?.name}</Text>
          </View>
          <Pressable style={styles.headerPill} onPress={() => compact && setCompactPane(compactPane === "items" ? "cart" : "items")}>
            <MaterialCommunityIcons name={online ? "cloud-check-outline" : "cloud-off-outline"} size={17} color={colors.ink} />
            <Text style={styles.headerPillText}>{online ? (compact ? `${cart.length} cart` : "Online") : "Offline"}</Text>
          </Pressable>
          <Pressable style={styles.holdButton} onPress={() => setCart([])}>
            <MaterialCommunityIcons name="content-save-outline" size={17} color="#FFF7EF" />
            <Text style={styles.holdText}>Hold</Text>
          </Pressable>
        </View>

        {compact ? (
          <View style={styles.mobileTabs}>
            <Pressable style={[styles.mobileTab, compactPane === "items" && styles.mobileTabActive]} onPress={() => setCompactPane("items")}>
              <MaterialCommunityIcons name="tag-multiple-outline" size={16} color={compactPane === "items" ? "#FFF7EF" : colors.ink} />
              <Text style={[styles.mobileTabText, compactPane === "items" && styles.mobileTabTextActive]}>Items</Text>
            </Pressable>
            <Pressable style={[styles.mobileTab, compactPane === "cart" && styles.mobileTabActive]} onPress={() => setCompactPane("cart")}>
              <MaterialCommunityIcons name="cart-outline" size={16} color={compactPane === "cart" ? "#FFF7EF" : colors.ink} />
              <Text style={[styles.mobileTabText, compactPane === "cart" && styles.mobileTabTextActive]}>Cart {cart.length}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.body, compact && styles.bodyCompact]}>
          {(!compact || compactPane === "items") ? <View style={[styles.catalogue, compact && styles.catalogueCompact]}>
            <View style={styles.catalogueTop}>
              <View>
                <Text style={styles.eyebrow}>Catalogue</Text>
                <Text style={styles.title}>Touch items to sell</Text>
              </View>
              <View style={styles.scanBadge}>
                <MaterialCommunityIcons name="barcode-scan" size={18} color={colors.accent} />
                <Text style={styles.scanText}>Scanner ready</Text>
              </View>
            </View>

            <Field value={search} onChangeText={setSearch} placeholder="Scan barcode or search products, SKU, category" />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail} contentContainerStyle={styles.chips}>
              {chips.map((chip) => {
                const active = category === chip.id;
                return (
                  <Pressable key={chip.id} style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(chip.id)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <FlatList
              key={compact ? "compact" : "wide"}
              data={sellable}
              numColumns={compact ? 2 : 3}
              columnWrapperStyle={styles.tileRow}
              contentContainerStyle={styles.tileList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={[styles.tile, item.stock <= 0 && styles.tileDisabled]} onPress={() => add(item)}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.tileImage} />
                  ) : (
                    <View style={styles.tileInitialBlock}>
                      <Text style={styles.tileInitial}>{item.name.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={styles.tileSku}>{item.sku}</Text>
                  <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.tileFooter}>
                    <Text style={styles.tilePrice}>{formatMwk(item.price)}</Text>
                    <Text style={[styles.tileStock, item.stock <= item.reorder && styles.lowStock]}>{item.stock} left</Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No matching sellable products.</Text>}
            />
          </View> : null}

          {(!compact || compactPane === "cart") ? <View style={[styles.cart, compact && styles.cartCompact]}>
            <View style={styles.cartHeader}>
              <View>
                <Text style={styles.eyebrow}>Current sale</Text>
                <Text style={styles.cartTitle}>{cart.length} line{cart.length === 1 ? "" : "s"}</Text>
              </View>
              <Pressable style={styles.clearButton} onPress={() => setCart([])}>
                <MaterialCommunityIcons name="delete-outline" size={17} color={colors.danger} />
              </Pressable>
            </View>

            <ScrollView style={styles.cartLines} contentContainerStyle={{ paddingBottom: 8 }}>
              {cart.map((line) => (
                <View key={line.product.id} style={styles.cartLine}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cartName} numberOfLines={1}>{line.product.name}</Text>
                    <Text style={styles.cartMeta}>{formatMwk(line.product.price)} each</Text>
                    <View style={styles.qtyStepper}>
                      <Pressable style={styles.qtyButton} onPress={() => setQty(line.product.id, line.qty - 1)}>
                        <MaterialCommunityIcons name="minus" size={15} color={colors.ink} />
                      </Pressable>
                      <Text style={styles.qtyText}>{line.qty}</Text>
                      <Pressable style={styles.qtyButton} onPress={() => setQty(line.product.id, line.qty + 1)}>
                        <MaterialCommunityIcons name="plus" size={15} color={colors.ink} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>{formatMwk(line.qty * line.product.price)}</Text>
                </View>
              ))}
              {!cart.length ? (
                <View style={styles.cartEmpty}>
                  <MaterialCommunityIcons name="cart-outline" size={30} color={colors.line} />
                  <Text style={styles.empty}>Tap a product to start a sale.</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.customerPanel}>
              <Text style={styles.customerLabel}>Customer</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerRail}>
                {[{ id: "", name: "Walk-in customer" }, ...customers].map((customer) => {
                  const active = customerId === customer.id;
                  return (
                    <Pressable key={customer.id || "walk-in"} style={[styles.customerChip, active && styles.customerChipActive]} onPress={() => setCustomerId(customer.id)}>
                      <Text style={[styles.customerChipText, active && styles.customerChipTextActive]}>{customer.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.totals}>
              <Field value={discount} onChangeText={setDiscount} keyboardType="numeric" placeholder="Sale discount" />
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{formatMwk(subtotal)}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={styles.totalValue}>{formatMwk(discountAmount)}</Text></View>
              <View style={styles.grandRow}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{formatMwk(total)}</Text></View>
            </View>

            <View style={styles.payments}>
              <Button onPress={() => checkout.mutate("cash")} disabled={!cart.length || checkout.isPending}>Cash</Button>
              <Button variant="outline" onPress={() => checkout.mutate("card")} disabled={!cart.length || checkout.isPending}>Card</Button>
              <Button variant="outline" onPress={() => checkout.mutate("mobile")} disabled={!cart.length || checkout.isPending}>Mobile</Button>
              <Button variant="outline" onPress={() => checkout.mutate("credit")} disabled={!cart.length || checkout.isPending || !customerId || !online}>Credit</Button>
            </View>
          </View> : null}
        </View>
      </View>
    </Screen>
  );
}

function isNetworkError(error: unknown) {
  return error instanceof Error && error.message.includes("Cannot reach Blex API");
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  posHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface },
  exitButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  exitText: { color: colors.ink, fontWeight: "800" },
  lane: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 22, fontWeight: "700" },
  cashier: { color: colors.muted, fontSize: 12, marginTop: 1 },
  headerPill: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt },
  headerPillText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  holdButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, borderRadius: 7, backgroundColor: colors.accent },
  holdText: { color: "#FFF7EF", fontWeight: "900" },
  body: { flex: 1, flexDirection: "row", gap: 14, padding: 14 },
  bodyCompact: { flexDirection: "column", paddingTop: 8 },
  mobileTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  mobileTab: { flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface },
  mobileTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  mobileTabText: { color: colors.ink, fontWeight: "900" },
  mobileTabTextActive: { color: "#FFF7EF" },
  catalogue: { flex: 1, minWidth: 0, gap: 10 },
  catalogueCompact: { flex: 1, minHeight: 0 },
  catalogueTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 28, fontWeight: "700" },
  scanBadge: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 },
  scanText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  chipRail: { maxHeight: 38, flexGrow: 0 },
  chips: { gap: 8, alignItems: "center", paddingVertical: 1 },
  chip: { height: 34, justifyContent: "center", alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 13 },
  chipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  chipText: { color: colors.muted, fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: colors.sidebarText },
  tileList: { gap: 10, paddingBottom: 20 },
  tileRow: { gap: 10 },
  tile: { flex: 1, minHeight: 166, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  tileDisabled: { opacity: 0.55 },
  tileInitialBlock: { height: 48, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, marginBottom: 10 },
  tileImage: { height: 58, borderRadius: 6, backgroundColor: colors.surfaceAlt, marginBottom: 10 },
  tileInitial: { color: colors.accent, fontFamily: typography.displayBold, fontSize: 26, fontWeight: "700" },
  tileSku: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  tileName: { color: colors.ink, fontSize: 14, fontWeight: "900", marginTop: 5, minHeight: 36 },
  tileFooter: { marginTop: "auto", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  tilePrice: { color: colors.accent, fontSize: 14, fontWeight: "900" },
  tileStock: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  lowStock: { color: colors.danger },
  cart: { width: 390, maxWidth: "42%", borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14 },
  cartCompact: { width: "100%", maxWidth: "100%", flex: 1, minHeight: 0 },
  cartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  cartTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 24, fontWeight: "700", marginTop: 2 },
  clearButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  cartLines: { flex: 1 },
  cartLine: { flexDirection: "row", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cartName: { color: colors.ink, fontWeight: "900" },
  cartMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  qtyStepper: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  qtyButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt },
  qtyText: { minWidth: 22, textAlign: "center", color: colors.ink, fontWeight: "900" },
  lineTotal: { color: colors.ink, fontWeight: "900" },
  cartEmpty: { minHeight: 170, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, paddingVertical: 18, textAlign: "center" },
  customerPanel: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 7 },
  customerLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  customerRail: { gap: 8, paddingVertical: 1 },
  customerChip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 11 },
  customerChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  customerChipText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  customerChipTextActive: { color: colors.sidebarText },
  totals: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, gap: 8 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontWeight: "700" },
  totalValue: { color: colors.ink, fontWeight: "900" },
  grandRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 8 },
  grandLabel: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  grandValue: { color: colors.accent, fontFamily: typography.displayBold, fontSize: 27, fontWeight: "700" },
  payments: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 }
});
