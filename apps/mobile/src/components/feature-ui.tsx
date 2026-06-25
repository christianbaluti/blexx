import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { colors, typography } from "../lib/theme";
import { Button, Card } from "./ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, minWidth: 250 }}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  tone = "default",
  icon
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "danger" | "warning";
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const color = tone === "success" ? colors.success : tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : tone === "accent" ? colors.accent : colors.ink;
  return (
    <Card style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        {icon ? <MaterialCommunityIcons name={icon} size={17} color={color} /> : null}
      </View>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact, { color }]} numberOfLines={2} adjustsFontSizeToFit>{value}</Text>
    </Card>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "success" | "danger" | "warning" | "muted" }) {
  const palette = {
    default: { bg: colors.surfaceAlt, fg: colors.ink, border: colors.line },
    accent: { bg: colors.accentSoft, fg: colors.accentDark, border: colors.accentSoft },
    success: { bg: "#E4F4EC", fg: colors.success, border: "#C6E9D8" },
    danger: { bg: "#F7E0DE", fg: colors.danger, border: "#EFCCC8" },
    warning: { bg: "#F9EDD0", fg: "#815F16", border: "#ECD89A" },
    muted: { bg: colors.surface, fg: colors.muted, border: colors.line }
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable key={tab.key} style={[styles.tab, selected && styles.tabActive]} onPress={() => onChange(tab.key)}>
            <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CommandButton({
  icon,
  label,
  primary,
  onPress
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  primary?: boolean;
  onPress?: () => void;
}) {
  if (primary) {
    return (
      <Button onPress={onPress}>
        <View style={styles.commandContent}>
          <MaterialCommunityIcons name={icon} size={17} color="#FFF7EF" />
          <Text style={styles.primaryCommandText}>{label}</Text>
        </View>
      </Button>
    );
  }
  return (
    <Pressable style={styles.commandButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={17} color={colors.ink} />
      <Text style={styles.commandText}>{label}</Text>
    </Pressable>
  );
}

export function TableCard({ children, style, minWidth = 760 }: { children: ReactNode; style?: StyleProp<ViewStyle>; minWidth?: number }) {
  return (
    <Card style={[styles.tableCard, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.tableScrollContent, { minWidth }]}>
        <View style={{ minWidth, flex: 1 }}>{children}</View>
      </ScrollView>
    </Card>
  );
}

export function TableHeader({ columns }: { columns: string[] }) {
  return (
    <View style={styles.tableHeader}>
      {columns.map((column, index) => (
        <Text key={`${column}-${index}`} style={[styles.tableHeaderText, columnWidthStyle(column)]}>{column}</Text>
      ))}
    </View>
  );
}

function columnWidthStyle(column: string): TextStyle {
  const key = column.toLowerCase();
  if (!column) return { width: 42, minWidth: 42, flex: 0 };
  if (["status", "unit", "items", "qty", "by"].includes(key)) return { width: 100, minWidth: 100, flex: 0 };
  if (["balance", "total", "paid", "value", "cost", "price", "sales", "stock", "reorder"].some((word) => key.includes(word))) {
    return { width: 110, minWidth: 110, flex: 0, textAlign: "right" };
  }
  if (["contact", "address", "supplier", "customer", "product", "item", "email"].some((word) => key.includes(word))) {
    return { width: 170, minWidth: 170, flex: 0 };
  }
  if (["received", "created", "date", "due", "last login"].some((word) => key.includes(word))) {
    return { width: 145, minWidth: 145, flex: 0 };
  }
  if (["attachment", "reference", "location"].some((word) => key.includes(word))) return { width: 150, minWidth: 150, flex: 0 };
  return { width: 130, minWidth: 130, flex: 0 };
}

export function EmptyPanel({
  icon = "archive-outline",
  title,
  body,
  action
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.emptyPanel}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </Card>
  );
}

export function AlertPanel({
  title,
  body,
  tone = "danger"
}: {
  title: string;
  body: string;
  tone?: "danger" | "warning" | "success";
}) {
  const color = tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.danger;
  return (
    <View style={[styles.alertPanel, { borderColor: color }]}>
      <MaterialCommunityIcons name={tone === "success" ? "check-circle-outline" : "alert-octagon-outline"} size={18} color={color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.alertTitle, { color }]}>{title}</Text>
        <Text style={styles.alertBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 14, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 15, marginBottom: 2 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  title: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 32, fontWeight: "700", marginTop: 4 },
  description: { color: colors.muted, fontSize: 14, marginTop: 5, maxWidth: 720 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  metricCard: { flexGrow: 1, flexBasis: 180, minWidth: 160, padding: 12 },
  metricCardCompact: { flexBasis: "47%", minWidth: 142, padding: 10 },
  metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { fontFamily: typography.displayBold, fontSize: 23, fontWeight: "700", marginTop: 8 },
  metricValueCompact: { fontSize: 17, marginTop: 5 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "900", textTransform: "capitalize" },
  tabs: { gap: 7, paddingVertical: 2 },
  tab: { minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12 },
  tabActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  tabTextActive: { color: colors.sidebarText },
  commandButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 12, backgroundColor: colors.surface },
  commandContent: { flexDirection: "row", alignItems: "center", gap: 7 },
  commandText: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  primaryCommandText: { color: "#FFF7EF", fontSize: 13, fontWeight: "900" },
  tableCard: { padding: 0, overflow: "hidden" },
  tableScrollContent: { flexGrow: 1 },
  tableHeader: { flexDirection: "row", gap: 10, backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 10 },
  tableHeaderText: { color: colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  emptyPanel: { minHeight: 210, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.surfaceAlt, marginBottom: 10 },
  emptyTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 19, fontWeight: "700" },
  emptyBody: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 420, marginTop: 5 },
  alertPanel: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 7, backgroundColor: colors.surface, padding: 12 },
  alertTitle: { fontWeight: "900" },
  alertBody: { color: colors.muted, fontSize: 12, marginTop: 2 }
});
