import { MaterialCommunityIcons } from "@expo/vector-icons";
import { defaultAppBranding, type AppBranding } from "@blex/shared";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { brandMarkSource } from "../../src/components/brand";
import { Badge, CommandButton, MetricCard, PageHeader, TabBar, TableCard, TableHeader } from "../../src/components/feature-ui";
import { Card, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors, typography } from "../../src/lib/theme";

type SettingsTab = "company" | "branding" | "users" | "security" | "sync" | "integrations" | "backups";

const securityOptions = [
  { label: "Two-factor authentication", description: "Require a TOTP code on every sign-in.", enabled: true },
  { label: "Biometric unlock", description: "Allow fingerprint or face unlock on supported devices.", enabled: true },
  { label: "Session auto-lock", description: "Lock the POS lane after 15 minutes of inactivity.", enabled: true },
  { label: "Password expiry", description: "Force a password reset every quarter.", enabled: false }
];

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>("company");
  const [brandForm, setBrandForm] = useState<AppBranding>(defaultAppBranding);
  const [brandError, setBrandError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: branding = defaultAppBranding } = useQuery({ queryKey: ["branding"], queryFn: api.branding });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const { data: backups = [] } = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const { data: syncHealth } = useQuery({ queryKey: ["sync-health"], queryFn: api.syncHealth });
  const createBackup = useMutation({ mutationFn: api.createBackup, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }) });
  const saveBranding = useMutation({
    mutationFn: api.updateBranding,
    onSuccess: (updated) => {
      setBrandError(null);
      setBrandForm(updated);
      queryClient.setQueryData(["branding"], updated);
      queryClient.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (error) => setBrandError(error instanceof Error ? error.message : "Could not save branding")
  });

  useEffect(() => {
    setBrandForm(branding);
  }, [branding]);

  async function pickLogo() {
    setBrandError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setBrandError("Photo library permission is required to pick a logo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) {
      setBrandError("The selected image could not be read. Try a PNG or JPG image.");
      return;
    }
    const mime = asset.mimeType ?? "image/jpeg";
    const dataUrl = `data:${mime};base64,${asset.base64}`;
    if (dataUrl.length > 1_200_000) {
      setBrandError("That logo is too large. Choose a smaller square PNG/JPG under about 1 MB.");
      return;
    }
    setBrandForm((current) => ({
      ...current,
      logoDataUrl: dataUrl,
      iconDataUrl: dataUrl,
      logoUpdatedAt: new Date().toISOString()
    }));
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="Configuration" title="Settings" description="Company, tax, users, roles, security, integrations, sync and backups." />
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "company", label: "Company" },
            { key: "branding", label: "Branding" },
            { key: "users", label: "Users & roles" },
            { key: "security", label: "Security" },
            { key: "sync", label: "Sync & devices" },
            { key: "integrations", label: "Integrations" },
            { key: "backups", label: "Backups" }
          ]}
        />

        {tab === "company" ? (
          <Card style={styles.formCard}>
            <View style={styles.formGrid}>
              <View style={styles.fieldBlock}><Text style={styles.label}>Trading name</Text><Field defaultValue="ModernTech Innovation" /></View>
              <View style={styles.fieldBlock}><Text style={styles.label}>Currency</Text><Field defaultValue="MWK - Malawian Kwacha" /></View>
              <View style={styles.fieldBlock}><Text style={styles.label}>VAT rate (%)</Text><Field defaultValue="16.5" /></View>
              <View style={styles.fieldBlockWide}><Text style={styles.label}>Address</Text><Field defaultValue="Area 47, Lilongwe, Malawi" /></View>
            </View>
            <View style={styles.alignEnd}><CommandButton icon="content-save-outline" label="Save changes" primary /></View>
          </Card>
        ) : null}

        {tab === "branding" ? (
          <Card style={styles.formCard}>
            <View style={styles.brandingHeader}>
              <View style={styles.logoPreview}>
                <Image
                  source={brandForm.logoDataUrl ? { uri: brandForm.logoDataUrl } : brandMarkSource}
                  resizeMode="contain"
                  style={styles.logoImage}
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={styles.brandPreviewText}>
                <Text style={styles.sectionTitle}>{brandForm.appName}</Text>
                <Text style={styles.meta}>{brandForm.appSubtitle}</Text>
                <Badge tone="accent">Used across login, sidebar, splash, web favicon and packaged assets</Badge>
              </View>
            </View>
            <View style={styles.formGrid}>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>App name</Text>
                <Field value={brandForm.appName} onChangeText={(appName) => setBrandForm((current) => ({ ...current, appName }))} />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>App subtitle</Text>
                <Field value={brandForm.appSubtitle} onChangeText={(appSubtitle) => setBrandForm((current) => ({ ...current, appSubtitle }))} />
              </View>
            </View>
            <View style={styles.noticeBox}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.blue} />
              <Text style={styles.noticeText}>
                Native Android/iOS launcher icons are compiled into the app by the operating system. This logo updates the full in-app brand immediately on all devices and becomes the source icon for the next packaged mobile/desktop build.
              </Text>
            </View>
            {brandError ? <Text style={styles.errorText}>{brandError}</Text> : null}
            <View style={styles.brandActions}>
              <CommandButton icon="image-edit-outline" label="Choose logo" onPress={pickLogo} />
              <CommandButton icon="restore" label="Reset" onPress={() => {
                setBrandError(null);
                setBrandForm(defaultAppBranding);
              }} />
              <CommandButton
                icon="content-save-outline"
                label={saveBranding.isPending ? "Saving..." : "Save branding"}
                primary
                onPress={() => saveBranding.mutate(brandForm)}
              />
            </View>
          </Card>
        ) : null}

        {tab === "users" ? (
          <TableCard>
            <TableHeader columns={["User", "Email", "Role", "Status"]} />
            {users.map((user) => (
              <View key={user.id} style={styles.row}>
                <View style={styles.userCell}>
                  <View style={styles.avatar}><MaterialCommunityIcons name="account-circle-outline" size={18} color={colors.muted} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.meta}>@{user.username}</Text>
                  </View>
                </View>
                <Text style={styles.mutedText}>{user.email}</Text>
                <View style={styles.cell}><Badge tone="muted">{user.role.replaceAll("_", " ")}</Badge></View>
                <View style={styles.cell}><Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge></View>
              </View>
            ))}
          </TableCard>
        ) : null}

        {tab === "security" ? (
          <Card style={styles.formCard}>
            {securityOptions.map((option) => (
              <View key={option.label} style={styles.securityRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.userName}>{option.label}</Text>
                  <Text style={styles.meta}>{option.description}</Text>
                </View>
                <Pressable style={[styles.switch, option.enabled && styles.switchOn]}>
                  <View style={[styles.knob, option.enabled && styles.knobOn]} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {tab === "sync" ? (
          <>
            <View style={styles.metrics}>
              <MetricCard label="Pending uploads" value={syncHealth?.pending ?? 0} icon="cloud-upload-outline" />
              <MetricCard label="Conflicts" value={syncHealth?.conflicts ?? 0} tone={(syncHealth?.conflicts ?? 0) ? "danger" : "default"} icon="alert-circle-outline" />
              <MetricCard label="Failed" value={syncHealth?.failed ?? 0} tone={(syncHealth?.failed ?? 0) ? "danger" : "default"} icon="close-circle-outline" />
              <MetricCard label="Last sync" value={syncHealth?.lastSyncedAt ? new Date(syncHealth.lastSyncedAt).toLocaleTimeString() : "Never"} icon="sync" />
            </View>
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Offline synchronisation</Text>
              <Text style={styles.sectionText}>The terminal keeps a local copy of products, prices and unsynced mutations. When connectivity returns, queued changes are pushed to PostgreSQL and conflicts are routed to Sync Center.</Text>
            </Card>
          </>
        ) : null}

        {tab === "integrations" ? (
          <View style={styles.grid}>
            <IntegrationCard icon="email-outline" title="SMTP email" env="SMTP_*" status="Configured by env" />
            <IntegrationCard icon="message-text-outline" title="Africa's Talking SMS" env="AFRICASTALKING_*" status="Adapter ready" />
            <IntegrationCard icon="cellphone-message" title="Expo Push" env="EXPO_ACCESS_TOKEN" status="Adapter ready" />
            <IntegrationCard icon="database-export-outline" title="Backup directory" env="BACKUP_DIR" status="Local-first export" />
          </View>
        ) : null}

        {tab === "backups" ? (
          <>
            <View style={styles.alignEnd}><CommandButton icon="database-export-outline" label={createBackup.isPending ? "Creating..." : "Create backup"} primary onPress={() => createBackup.mutate()} /></View>
            <TableCard>
              <TableHeader columns={["Name", "Created", "Status"]} />
              {backups.map((backup) => (
                <View key={backup.id} style={styles.row}>
                  <Text style={styles.cellText}>{backup.name}</Text>
                  <Text style={styles.mutedText}>{new Date(backup.createdAt).toLocaleString()}</Text>
                  <View style={styles.cell}><Badge tone="success">{backup.status}</Badge></View>
                </View>
              ))}
            </TableCard>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function IntegrationCard({ icon, title, env, status }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; env: string; status: string }) {
  return (
    <Card style={styles.integrationCard}>
      <View style={styles.iconBox}><MaterialCommunityIcons name={icon} size={20} color={colors.accent} /></View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.meta}>{env}</Text>
      <Badge tone="success">{status}</Badge>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  formCard: { gap: 14, maxWidth: 760, width: "100%" },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldBlock: { flexGrow: 1, flexBasis: 260, gap: 6 },
  fieldBlockWide: { flexBasis: "100%", gap: 6 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  alignEnd: { flexDirection: "row", justifyContent: "flex-end" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  userCell: { flex: 1, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  userName: { color: colors.ink, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  mutedText: { flex: 1, minWidth: 170, color: colors.muted, fontSize: 12 },
  cell: { flex: 1, minWidth: 130 },
  cellText: { flex: 1, minWidth: 170, color: colors.ink, fontWeight: "900" },
  securityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 12 },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.line, padding: 3 },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  knobOn: { marginLeft: 20 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sectionTitle: { color: colors.ink, fontFamily: typography.displayBold, fontSize: 19, fontWeight: "700" },
  sectionText: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 700 },
  brandingHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 },
  logoPreview: { width: 96, height: 96, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  logoImage: { width: 86, height: 86 },
  brandPreviewText: { flex: 1, minWidth: 220, gap: 7 },
  noticeBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 7, borderWidth: 1, borderColor: "#B8D6E5", backgroundColor: "#EDF7FB", padding: 11 },
  noticeText: { flex: 1, minWidth: 0, color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  errorText: { color: colors.danger, fontFamily: typography.sansBold, fontSize: 12 },
  brandActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  integrationCard: { flexGrow: 1, flexBasis: 260, minWidth: 240, gap: 8 },
  iconBox: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.accentSoft }
});
