import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type AttachmentValue = {
  attachmentName: string;
  attachmentMime: string;
  attachmentData: string;
};

type WebDocumentAsset = DocumentPicker.DocumentPickerAsset & { file?: Blob };

function bytesFromDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

function readWebFile(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function AttachmentPicker({
  value,
  onChange,
  label = "Invoice file",
  helper = "PDF or image, 5 MB max",
  maxBytes = MAX_ATTACHMENT_BYTES
}: {
  value: AttachmentValue;
  onChange: (value: AttachmentValue) => void;
  label?: string;
  helper?: string;
  maxBytes?: number;
}) {
  async function pick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["application/pdf", "image/*"]
      });
      if (result.canceled) return;
      const asset = result.assets[0] as WebDocumentAsset;
      const mime = asset.mimeType || "application/octet-stream";
      const size = asset.size ?? asset.file?.size;
      if (size && size > maxBytes) {
        Alert.alert("File too large", `Choose a file up to ${formatSize(maxBytes)}. This file is ${formatSize(size)}.`);
        return;
      }
      const dataUrl =
        Platform.OS === "web" && asset.file
          ? await readWebFile(asset.file)
          : `data:${mime};base64,${await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })}`;
      if (bytesFromDataUrl(dataUrl) > maxBytes) {
        Alert.alert("File too large", `Choose a file up to ${formatSize(maxBytes)}.`);
        return;
      }
      onChange({
        attachmentName: asset.name || "invoice",
        attachmentMime: mime,
        attachmentData: dataUrl.startsWith("data:") ? dataUrl : `data:${mime};base64,${dataUrl}`
      });
    } catch (error) {
      Alert.alert("Could not attach file", error instanceof Error ? error.message : "Choose a PDF or image and try again.");
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
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
      <Text style={styles.meta}>{value.attachmentMime || helper}</Text>
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
