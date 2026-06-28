import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../lib/theme";

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function DatePickerField({ label, value, onChange, optional = true }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => value ? new Date(`${value}T00:00:00`) : new Date());
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [cursor]);

  function shiftMonth(amount: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.muted} />
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{value || "Choose date"}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <Pressable style={styles.iconButton} onPress={() => shiftMonth(-1)}><MaterialCommunityIcons name="chevron-left" size={22} color={colors.ink} /></Pressable>
              <Text style={styles.title}>{monthLabel(cursor)}</Text>
              <Pressable style={styles.iconButton} onPress={() => shiftMonth(1)}><MaterialCommunityIcons name="chevron-right" size={22} color={colors.ink} /></Pressable>
            </View>
            <View style={styles.weekRow}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <Text key={day} style={styles.weekText}>{day}</Text>)}</View>
            <View style={styles.grid}>
              {days.map((day) => {
                const key = iso(day);
                const inMonth = day.getMonth() === cursor.getMonth();
                const active = selected ? key === iso(selected) : false;
                return (
                  <Pressable key={key} style={[styles.day, active && styles.dayActive]} onPress={() => { onChange(key); setOpen(false); }}>
                    <Text style={[styles.dayText, !inMonth && styles.dayMuted, active && styles.dayTextActive]}>{day.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.footer}>
              {optional ? <Pressable style={styles.footerButton} onPress={() => { onChange(""); setOpen(false); }}><Text style={styles.footerText}>Clear</Text></Pressable> : null}
              <Pressable style={styles.footerButton} onPress={() => { onChange(iso(new Date())); setOpen(false); }}><Text style={styles.footerText}>Today</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  field: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderColor: colors.line, borderWidth: 1, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  fieldText: { color: colors.ink, fontFamily: typography.sansRegular, fontSize: 15 },
  placeholder: { color: colors.muted },
  backdrop: { flex: 1, backgroundColor: "rgba(26,22,17,0.42)", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { width: "100%", maxWidth: 380, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  header: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 20, fontWeight: "800" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  weekRow: { flexDirection: "row", marginTop: 8 },
  weekText: { width: `${100 / 7}%`, color: colors.muted, textAlign: "center", fontSize: 11, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  day: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  dayActive: { backgroundColor: colors.accent },
  dayText: { color: colors.ink, fontWeight: "800" },
  dayMuted: { color: colors.muted },
  dayTextActive: { color: "#FFF7EF" },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  footerButton: { minHeight: 36, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  footerText: { color: colors.ink, fontWeight: "900" }
});
