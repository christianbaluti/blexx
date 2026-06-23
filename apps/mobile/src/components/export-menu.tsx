import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { exportRows } from "../lib/exportData";
import { colors } from "../lib/theme";
import { CommandButton } from "./feature-ui";

type Format = "csv" | "pdf" | "xlsx";

export function ExportMenu({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  async function run(format: Format) {
    setOpen(false);
    await exportRows(title, rows, format);
  }

  return (
    <>
      <CommandButton icon="download-outline" label="Export" onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.title}>Export {title}</Text>
            {(["pdf", "xlsx", "csv"] as Format[]).map((format) => (
              <Pressable key={format} style={styles.option} onPress={() => run(format)}>
                <MaterialCommunityIcons name={format === "pdf" ? "file-pdf-box" : format === "xlsx" ? "file-excel-box" : "file-delimited-outline"} size={20} color={colors.ink} />
                <Text style={styles.optionText}>{format.toUpperCase()}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { width: "100%", maxWidth: 340, gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, padding: 14 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  option: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 12 },
  optionText: { color: colors.ink, fontSize: 13, fontWeight: "900" }
});
