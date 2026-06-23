import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow, typography } from "../lib/theme";

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, 8) }]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ children, variant = "primary", style, ...props }: PressableProps & { children: ReactNode; variant?: "primary" | "ghost" | "outline" }) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "outline" && styles.buttonOutline,
        variant === "ghost" && styles.buttonGhost,
        pressed && { opacity: 0.78 },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text style={[styles.buttonText, variant !== "primary" && { color: colors.ink }]}>{children}</Text>
      ) : children}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.field, props.style]} />;
}

export function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "danger" | "good" }) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={[styles.kpiValue, tone === "danger" && { color: colors.danger }, tone === "good" && { color: colors.accent }]}>{value}</Text>
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 7,
    borderWidth: 1,
    padding: 15,
    ...shadow
  },
  button: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    paddingHorizontal: 14
  },
  buttonPrimary: {
    backgroundColor: colors.accent
  },
  buttonOutline: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1
  },
  buttonGhost: {
    backgroundColor: "transparent"
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: typography.sansBold,
    fontSize: 14,
    letterSpacing: 0
  },
  field: {
    minHeight: 42,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 7,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    color: colors.ink,
    fontFamily: typography.sansRegular,
    fontSize: 15
  },
  eyebrow: {
    color: colors.muted,
    fontFamily: typography.sansExtraBold,
    fontSize: 11,
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  kpi: {
    flex: 1,
    minWidth: 160
  },
  kpiValue: {
    color: colors.ink,
    fontFamily: typography.displayBold,
    fontSize: 27,
    marginTop: 8
  }
});
