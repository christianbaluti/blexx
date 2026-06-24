import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Slot, usePathname } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLockup, StartupScreen } from "./brand";
import { useAuth } from "../lib/auth";
import { colors, typography } from "../lib/theme";

type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const sections: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [
    { label: "Dashboard", route: "/dashboard", icon: "view-dashboard-outline" },
    { label: "POS", route: "/pos", icon: "barcode-scan" },
    { label: "Receipts", route: "/receipts", icon: "receipt" }
  ] },
  { title: "Purchasing", items: [
    { label: "Suppliers", route: "/suppliers", icon: "truck-outline" },
    { label: "Purchases", route: "/purchases", icon: "cart-arrow-down" },
    { label: "GRNs", route: "/grn", icon: "package-variant-closed-check" },
    { label: "Supplier Invoices", route: "/supplier-invoices", icon: "file-document-outline" }
  ] },
  { title: "Inventory", items: [
    { label: "Raw Materials", route: "/items", icon: "beaker-outline" },
    { label: "Finished Products", route: "/products", icon: "tag-multiple-outline" },
    { label: "Product Blueprints", route: "/boms", icon: "file-tree-outline" },
    { label: "Production", route: "/production", icon: "factory" },
    { label: "Warehouse Stock", route: "/inventory", icon: "warehouse" },
    { label: "Shop Stock", route: "/transfers", icon: "storefront-outline" },
    { label: "Stock Transfers", route: "/transfers", icon: "swap-horizontal" }
  ] },
  { title: "Sales", items: [
    { label: "Customers", route: "/customers", icon: "account-group-outline" },
    { label: "POS Sales", route: "/pos", icon: "cart-check" },
    { label: "Receipts", route: "/receipts", icon: "receipt-text-outline" }
  ] },
  { title: "Finance", items: [
    { label: "Finance", route: "/finance", icon: "finance" },
    { label: "Reports", route: "/reports", icon: "chart-box-outline" }
  ] },
  { title: "Admin", items: [
    { label: "Users/Roles", route: "/users", icon: "account-key-outline" },
    { label: "Settings", route: "/settings", icon: "cog-outline" }
  ] }
];

const routeTitles = Object.fromEntries(
  sections.flatMap((section) => section.items.map((item) => [item.route, item.label]))
) as Record<string, string>;

export function AppShell() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 820;
  const compactTopInset = isCompact ? Math.max(insets.top, 54) : 0;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const auth = useAuth();
  const pathname = usePathname().replace("/(tabs)", "");

  if (auth.loading) return <StartupScreen label="Restoring your secure session" />;
  if (!auth.isAuthenticated) return <Slot />;
  const nav = <Navigation onNavigate={() => setDrawerOpen(false)} />;
  const title = routeTitles[pathname] ?? "Dashboard";

  return (
    <View style={styles.root}>
      {!isCompact ? <View style={styles.sidebar}>{nav}</View> : null}
      <View style={styles.main}>
        <View style={[styles.header, isCompact && { minHeight: 62 + compactTopInset, paddingTop: compactTopInset }]}>
          {isCompact ? (
            <Pressable style={styles.iconButton} onPress={() => setDrawerOpen(true)}>
              <MaterialCommunityIcons name="menu" size={22} color={colors.ink} />
            </Pressable>
          ) : null}
          <View style={styles.headerTitle}>
            <Text style={styles.crumb} numberOfLines={1}>POS & Inventory + / {title}</Text>
            <Text style={styles.user} numberOfLines={1}>{auth.user?.name}</Text>
          </View>
          {!isCompact ? (
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
              <TextInput placeholder="Search products, sales, customers" placeholderTextColor={colors.muted} style={styles.searchInput} />
            </View>
          ) : null}
        </View>
        <Slot />
      </View>
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDrawerOpen(false)}>
          <Pressable style={styles.drawer}>{nav}</Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Navigation({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname().replace("/(tabs)", "");
  const auth = useAuth();
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.logoBlock}>
        <BrandLockup compact inverse />
      </View>
      <ScrollView contentContainerStyle={styles.navContent}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              const active = pathname === item.route || pathname.endsWith(item.route);
              return (
                <Pressable
                  key={item.route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => {
                    router.push(item.route as never);
                    onNavigate();
                  }}
                >
                  <MaterialCommunityIcons name={item.icon} size={18} color={active ? colors.sidebarText : colors.sidebarMuted} />
                  <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
                  {active ? <View style={styles.activeDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.sidebarFooter}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account-circle-outline" size={18} color={colors.sidebarText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.footerName} numberOfLines={1}>{auth.user?.name ?? "Admin"}</Text>
          <Text style={styles.footerRole} numberOfLines={1}>{auth.user?.role ?? "local session"}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={() => auth.logout()}>
          <MaterialCommunityIcons name="logout" size={16} color={colors.sidebarMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: colors.paper },
  sidebar: { width: 272, borderRightColor: colors.sidebarBorder, borderRightWidth: 1, backgroundColor: colors.sidebar },
  main: { flex: 1, minWidth: 0 },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, borderBottomColor: colors.line, borderBottomWidth: 1, backgroundColor: "rgba(255,255,255,0.88)" },
  headerTitle: { flex: 1, minWidth: 0 },
  crumb: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 15 },
  user: { color: colors.muted, fontFamily: typography.sansMedium, fontSize: 12, marginTop: 2 },
  searchBox: { width: 330, maxWidth: "34%", minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, color: colors.ink, fontFamily: typography.sansRegular, fontSize: 13, outlineStyle: "none" as never },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  notificationDot: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger, paddingHorizontal: 4 },
  notificationDotText: { color: "#fff", fontFamily: typography.sansBlack, fontSize: 9 },
  logoBlock: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomColor: colors.sidebarBorder, borderBottomWidth: 1 },
  navContent: { padding: 10, paddingBottom: 28 },
  section: { marginBottom: 12 },
  sectionTitle: { color: colors.sidebarMuted, fontFamily: typography.sansBlack, fontSize: 10, textTransform: "uppercase", marginHorizontal: 8, marginBottom: 5, marginTop: 4 },
  navItem: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 7, paddingHorizontal: 10 },
  navItemActive: { backgroundColor: colors.sidebarActive },
  navText: { color: colors.sidebarMuted, flex: 1, fontFamily: typography.sansBold, fontSize: 13 },
  navTextActive: { color: colors.sidebarText },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  sidebarFooter: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderTopWidth: 1, borderTopColor: colors.sidebarBorder },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sidebarActive, alignItems: "center", justifyContent: "center" },
  footerName: { color: colors.sidebarText, fontFamily: typography.sansBold, fontSize: 12 },
  footerRole: { color: colors.sidebarMuted, fontFamily: typography.sansMedium, fontSize: 10, marginTop: 1 },
  logoutButton: { width: 30, height: 30, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  syncPill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontFamily: typography.sansBold, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)" },
  drawer: { width: 292, maxWidth: "84%", height: "100%", backgroundColor: colors.sidebar },
  notificationPanel: { width: 390, maxWidth: "92%", maxHeight: "78%", alignSelf: "flex-end", marginTop: 76, marginRight: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden" },
  notificationHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  notificationTitle: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 16 },
  notificationList: { padding: 10, gap: 8 },
  notificationItem: { borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 11, backgroundColor: colors.surface },
  notificationItemUnread: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  notificationItemTitle: { color: colors.ink, fontFamily: typography.sansBlack, fontSize: 13 },
  notificationBody: { color: colors.muted, fontFamily: typography.sansRegular, fontSize: 12, marginTop: 4 },
  notificationMeta: { color: colors.muted, fontFamily: typography.sansMedium, fontSize: 10, marginTop: 7 },
  viewAllButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.line },
  viewAllText: { color: colors.accent, fontFamily: typography.sansBlack, fontSize: 13 }
});
