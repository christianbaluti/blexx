import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BrandLockup, BrandMark } from "./brand";
import { Button, Field, Screen } from "./ui";
import { useAuth } from "../lib/auth";
import { colors, typography } from "../lib/theme";

const demoAccounts = [
  { username: "admin", password: "admin", role: "Super Administrator" },
  { username: "inventory", password: "demo", role: "Inventory Officer" },
  { username: "production", password: "demo", role: "Production Officer" },
  { username: "cashier", password: "demo", role: "POS Cashier" },
  { username: "finance", password: "demo", role: "Finance User" },
  { username: "cro", password: "demo", role: "Customer Relationship Officer" }
];

export function Login() {
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 940;
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
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
              <Text style={styles.brandEyebrow}>v1 pilot release</Text>
              <Text style={styles.brandHeadline}>One ledger for stock, sales and the shop floor.</Text>
              <Text style={styles.brandCopy}>Inventory, production, POS, finance and customer relationships, built for how real shops move.</Text>
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
                <Text style={styles.mobileBrandText}>ModernTech</Text>
              </View>
            ) : null}
            <Text style={styles.formEyebrow}>Sign in</Text>
            <Text style={styles.brand}>Open the shop</Text>
            <Text style={styles.title}>Use your role credentials to continue.</Text>
            <Field autoCapitalize="none" value={username} onChangeText={setUsername} placeholder="Username or email" />
            <Field secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : "Continue"}</Button>
            <View style={styles.demoBox}>
              <View style={styles.demoTitleRow}>
                <MaterialCommunityIcons name="lock-outline" size={14} color={colors.muted} />
                <Text style={styles.demoTitle}>Demo accounts</Text>
              </View>
              {demoAccounts.map((account) => (
                <Pressable
                  key={account.username}
                  style={styles.demoRow}
                  onPress={() => {
                    setUsername(account.username);
                    setPassword(account.password);
                  }}
                >
                  <Text style={styles.demoUser}>{account.username}</Text>
                  <Text style={styles.demoRole}>{account.role}</Text>
                </Pressable>
              ))}
            </View>
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
  demoBox: { gap: 4, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.55)", padding: 10, marginTop: 8 },
  demoTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  demoTitle: { color: colors.muted, fontFamily: typography.sansBlack, fontSize: 10, textTransform: "uppercase" },
  demoRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 5, paddingHorizontal: 6 },
  demoUser: { color: colors.accent, fontFamily: typography.monoMedium, fontSize: 12 },
  demoRole: { color: colors.muted, flex: 1, textAlign: "right", fontFamily: typography.sansMedium, fontSize: 11 }
});
