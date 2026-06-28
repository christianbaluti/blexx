import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { downloadDataAttachment, openDataAttachment } from "../lib/attachments";
import { colors, typography } from "../lib/theme";

export function AttachmentActions({
  name,
  mime,
  data,
  emptyLabel = "No file attached"
}: {
  name?: string | null;
  mime?: string | null;
  data?: string | null;
  emptyLabel?: string;
}) {
  const canPreviewImage = Boolean(data && (mime?.startsWith("image/") || data.startsWith("data:image/")));

  return (
    <View style={styles.wrap}>
      {canPreviewImage ? (
        <Image source={{ uri: data! }} style={styles.preview} resizeMode="cover" />
      ) : (
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name={data ? "file-document-outline" : "file-alert-outline"} size={24} color={colors.muted} />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>{name || emptyLabel}</Text>
        {mime ? <Text style={styles.mime}>{mime}</Text> : null}
        {data ? (
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={() => openDataAttachment(name || "attachment", data, mime || undefined)}>
              <MaterialCommunityIcons name="eye-outline" size={16} color={colors.ink} />
              <Text style={styles.actionText}>View</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => downloadDataAttachment(name || "attachment", data, mime || undefined)}>
              <MaterialCommunityIcons name="download-outline" size={16} color={colors.ink} />
              <Text style={styles.actionText}>Download</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surfaceAlt, padding: 10 },
  preview: { width: 74, height: 74, borderRadius: 7, backgroundColor: colors.surface },
  iconBox: { width: 74, height: 74, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  meta: { flex: 1, minWidth: 0, gap: 5 },
  name: { color: colors.ink, fontFamily: typography.sansBold, fontSize: 13 },
  mime: { color: colors.muted, fontSize: 11 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
  action: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 10 },
  actionText: { color: colors.ink, fontWeight: "900", fontSize: 12 }
});
