import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, PageHeader, TableCard } from "../../src/components/feature-ui";
import { Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

function notificationIcon(type: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (type === "low_stock") return "alert-circle-outline";
  if (type === "expiry") return "calendar-clock-outline";
  if (type === "system") return "cog-outline";
  return "information-outline";
}

function notificationTone(type: string) {
  if (type === "low_stock") return { bg: "#F7E0DE", color: colors.danger };
  if (type === "expiry") return { bg: "#F9EDD0", color: "#815F16" };
  return { bg: colors.surfaceAlt, color: colors.muted };
}

export default function Notifications() {
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Alerts" title="Notifications" description="Low stock, expiry, system messages and broadcast delivery tracking." />
        <TableCard>
          {notifications.map((item) => {
            const tone = notificationTone(item.type);
            return (
              <View key={item.id} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                  <MaterialCommunityIcons name={notificationIcon(item.type)} size={18} color={tone.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{item.title}</Text>
                    {!item.read ? <Badge tone="accent">New</Badge> : null}
                  </View>
                  <Text style={styles.body}>{item.body ?? ""}</Text>
                  <Text style={styles.time}>{new Date(item.ts).toLocaleString()} - {item.channel ?? "in_app"} - {item.status ?? "pending"}</Text>
                </View>
              </View>
            );
          })}
        </TableCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 980, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, padding: 14 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { color: colors.ink, fontWeight: "900" },
  body: { color: colors.muted, marginTop: 4 },
  time: { color: colors.muted, fontSize: 10, marginTop: 5 }
});
