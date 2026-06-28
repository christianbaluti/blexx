import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export type AttachmentValue = {
  attachmentName: string;
  attachmentMime: string;
  attachmentData: string;
};

export function AttachmentPicker({ value, onChange }: { value: AttachmentValue; onChange: (value: AttachmentValue) => void }) {
  async function pick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["application/pdf", "image/*"]
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "application/octet-stream";
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      onChange({
        attachmentName: asset.name || "invoice",
        attachmentMime: mime,
        attachmentData: `data:${mime};base64,${base64}`
      });
    } catch (error) {
      Alert.alert("Could not attach file", error instanceof Error ? error.message : "Choose a PDF or image and try again.");
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Invoice file</Text>
      <View style={styles.row}>
        <Pressable style={styles.pickButton} onPress={pick}>
          <MaterialCommunityIcons name="paperclip" size={18} color={colors.ink} />
          <Text style={styles.pickText}>{value.attachmentName || "Choose PDF or image"}</Text>
        </Pressable>
        {value.attachmentData ? (
          <Pressable style={styles.clearButton} onPress={() => onChange({ attachmentName: "", attachmentMime: "", attachmentData: "" })}>
            <MaterialCommunityIcons name="close" size={18} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
      {value.attachmentMime ? <Text style={styles.meta}>{value.attachmentMime}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  pickButton: { minHeight: 42, flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderColor: colors.line, borderWidth: 1, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  pickText: { color: colors.ink, fontWeight: "800", flex: 1 },
  clearButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderColor: colors.line, borderWidth: 1, borderRadius: 7 },
  meta: { color: colors.muted, fontSize: 12 }
});
