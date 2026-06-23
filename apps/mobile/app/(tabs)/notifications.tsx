import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NotificationItem } from "@blex/shared";
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
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const markRead = useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  function open(item: NotificationItem) {
    setSelected(item);
    if (!item.read) markRead.mutate(item.id);
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Alerts" title="Notifications" description="Low stock, expiry, system messages and broadcast delivery tracking." />
        <TableCard>
          {notifications.map((item) => {
            const tone = notificationTone(item.type);
            return (
              <Pressable key={item.id} style={[styles.row, !item.read && styles.unreadRow]} onPress={() => open(item)}>
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
              </Pressable>
            );
          })}
        </TableCard>
      </ScrollView>
      <NotificationDetail item={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function NotificationDetail({ item, onClose }: { item: NotificationItem | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{item?.title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.body}>{item?.body ?? ""}</Text>
          <Text style={styles.time}>{item ? new Date(item.ts).toLocaleString() : ""}</Text>
          <Text style={styles.time}>Channel: {item?.channel ?? "in_app"} - Status: {item?.status ?? "pending"}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 980, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, padding: 14 },
  unreadRow: { backgroundColor: colors.accentSoft },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { color: colors.ink, fontWeight: "900" },
  body: { color: colors.muted, marginTop: 4 },
  time: { color: colors.muted, fontSize: 10, marginTop: 5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { width: "100%", maxWidth: 520, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, padding: 16 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  panelTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", flex: 1 },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line }
});
