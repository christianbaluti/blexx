import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BrandLockup, BrandMark } from "./brand";
import { Button, Field, Screen } from "./ui";
import { useAuth } from "../lib/auth";
import { colors, typography } from "../lib/theme";

export function Login() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 940;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      setBusy(true);
      setError(null);
      await auth.login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={[styles.shell, !wide && styles.shellCompact]}>
        {wide ? (
          <View style={styles.brandPanel}>
            <View style={styles.brandTop}>
              <BrandLockup inverse />
            </View>
            <View style={styles.brandStory}>
              <Text style={styles.brandEyebrow}>production workspace</Text>
              <Text style={styles.brandHeadline}>One system for selling, stock and operations.</Text>
              <Text style={styles.brandCopy}>Run POS, inventory, purchasing, finance and reporting from a single connected workspace.</Text>
            </View>
            <View style={styles.brandStats}>
              <View><Text style={styles.statValue}>99.9%</Text><Text style={styles.statLabel}>uptime SLA</Text></View>
              <View><Text style={styles.statValue}>6</Text><Text style={styles.statLabel}>roles</Text></View>
              <View><Text style={styles.statValue}>19</Text><Text style={styles.statLabel}>modules</Text></View>
            </View>
          </View>
        ) : null}

        <View style={styles.formWrap}>
          <View style={styles.formPanel}>
            {!wide ? (
              <View style={styles.mobileBrand}>
                <BrandMark size={48} />
                <Text style={styles.mobileBrandText}>POS & Inventory +</Text>
              </View>
            ) : null}
            <Text style={styles.formEyebrow}>Sign in</Text>
            <Text style={styles.brand}>Sign in to continue</Text>
            <Text style={styles.title}>Use your assigned account credentials.</Text>
            <Field autoCapitalize="none" value={username} onChangeText={setUsername} placeholder="Username or email" />
            <Field secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : "Continue"}</Button>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.paper },
  shellCompact: { justifyContent: "center" },
  brandPanel: { flex: 1, justifyContent: "space-between", backgroundColor: colors.sidebar, padding: 40, overflow: "hidden" },
  brandTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandStory: { maxWidth: 470, gap: 12 },
  brandEyebrow: { color: colors.accent, fontFamily: typography.sansBlack, fontSize: 11, textTransform: "uppercase" },
  brandHeadline: { color: colors.sidebarText, fontFamily: typography.displayBold, fontSize: 42, lineHeight: 46 },
  brandCopy: { color: colors.sidebarMuted, fontFamily: typography.sansRegular, fontSize: 15, lineHeight: 23 },
  brandStats: { flexDirection: "row", gap: 36 },
  statValue: { color: colors.sidebarText, fontFamily: typography.monoMedium, fontSize: 22 },
  statLabel: { color: colors.sidebarMuted, fontFamily: typography.sansMedium, fontSize: 11, marginTop: 2 },
  formWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  formPanel: { width: "100%", maxWidth: 390, gap: 12 },
  mobileBrand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  mobileBrandText: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 21 },
  formEyebrow: { color: colors.accent, fontFamily: typography.sansBlack, fontSize: 10, textTransform: "uppercase" },
  brand: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 34 },
  title: { color: colors.muted, fontFamily: typography.sansRegular, fontSize: 14, marginBottom: 10 },
  error: { color: colors.danger, fontFamily: typography.sansBold },
  formFooter: { color: colors.muted, fontFamily: typography.sansMedium, fontSize: 11, textAlign: "center" }
});
