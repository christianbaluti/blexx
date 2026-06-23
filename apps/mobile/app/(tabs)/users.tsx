import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { roleLabels, type Role } from "@blex/shared";
import { Badge, CommandButton, PageHeader, TableCard, TableHeader } from "../../src/components/feature-ui";
import { ExportMenu } from "../../src/components/export-menu";
import { Button, Field, Screen } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

type StatusFilter = "all" | "active" | "suspended" | "disabled";

export default function Users() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: api.roles });
  const filtered = useMemo(() => users.filter((user) => {
    const haystack = [user.name, user.username, user.email, user.role, user.status].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || user.status === status);
  }), [query, status, users]);
  const updateUser = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: "active" | "suspended" | "disabled" }) => api.updateUser(id, { status: nextStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="Admin"
          title="Users & roles"
          description="Create users, assign roles, export accounts and send download instructions."
          actions={<CommandButton icon="account-plus-outline" label="New user" primary onPress={() => setCreateOpen(true)} />}
        />
        <TableCard>
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
              <Field value={query} onChangeText={setQuery} placeholder="Search users, emails or roles" style={styles.searchField} />
            </View>
            <StatusFilter active={status} onChange={setStatus} />
            <ExportMenu title="Users" rows={filtered as unknown as Record<string, unknown>[]} />
          </View>
          <TableHeader columns={["User", "Email", "Role", "Status", "Last login", ""]} />
          {filtered.map((user) => (
            <View key={user.id} style={styles.row}>
              <View style={styles.userCell}>
                <View style={styles.avatar}><MaterialCommunityIcons name="account-circle-outline" size={18} color={colors.muted} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.meta}>@{user.username}</Text>
                </View>
              </View>
              <Text style={styles.cellText} numberOfLines={1}>{user.email}</Text>
              <View style={styles.cell}><Badge tone="muted">{roleLabels[user.role] ?? user.role}</Badge></View>
              <View style={styles.cell}><Badge tone={user.status === "active" ? "success" : user.status === "suspended" ? "warning" : "danger"}>{user.status}</Badge></View>
              <Text style={styles.mutedCell}>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => updateUser.mutate({ id: user.id, status: user.status === "active" ? "suspended" : "active" })}
              >
                <MaterialCommunityIcons name={user.status === "active" ? "account-cancel-outline" : "account-check-outline"} size={17} color={colors.ink} />
              </Pressable>
            </View>
          ))}
        </TableCard>
      </ScrollView>
      <CreateUserModal visible={createOpen} roles={roles} onClose={() => setCreateOpen(false)} />
    </Screen>
  );
}

function StatusFilter({ active, onChange }: { active: StatusFilter; onChange: (status: StatusFilter) => void }) {
  return (
    <View style={styles.filterGroup}>
      {(["all", "active", "suspended", "disabled"] as StatusFilter[]).map((item) => (
        <Pressable key={item} style={[styles.filterChip, active === item && styles.filterChipActive]} onPress={() => onChange(item)}>
          <Text style={[styles.filterText, active === item && styles.filterTextActive]}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function CreateUserModal({ visible, roles, onClose }: { visible: boolean; roles: { id: Role; label: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("pos_cashier");
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "" });
  const create = useMutation({
    mutationFn: () => api.createUser({ ...form, role }),
    onSuccess: async () => {
      setForm({ username: "", email: "", name: "", password: "" });
      setRole("pos_cashier");
      onClose();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalPanel}>
          <Text style={styles.modalTitle}>New user</Text>
          <Text style={styles.modalHint}>The user will receive an in-app/email invite with username, temporary password, and app download links.</Text>
          <Field placeholder="Full name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} />
          <Field placeholder="Username" value={form.username} autoCapitalize="none" onChangeText={(username) => setForm((current) => ({ ...current, username }))} />
          <Field placeholder="Email" value={form.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(email) => setForm((current) => ({ ...current, email }))} />
          <View style={styles.passwordWrap}>
            <Field placeholder="Temporary password" value={form.password} secureTextEntry={!showPassword} onChangeText={(password) => setForm((current) => ({ ...current, password }))} style={styles.passwordField} />
            <Pressable style={styles.passwordToggle} onPress={() => setShowPassword((value) => !value)}>
              <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleGrid}>
            {roles.map((item) => (
              <Pressable key={item.id} style={[styles.roleOption, role === item.id && styles.roleOptionActive]} onPress={() => setRole(item.id)}>
                <Text style={[styles.roleText, role === item.id && styles.roleTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {create.error ? <Text style={styles.error}>{create.error instanceof Error ? create.error.message : "Could not create user"}</Text> : null}
          <View style={styles.actions}>
            <Button variant="outline" onPress={onClose}>Cancel</Button>
            <Button onPress={() => create.mutate()} disabled={create.isPending}>Create user</Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, width: "100%", maxWidth: 1240, alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, padding: 12 },
  searchWrap: { minWidth: 240, flexGrow: 1, flexBasis: 320, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingLeft: 10 },
  searchField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  filterGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: { minHeight: 38, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  filterChipActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  filterTextActive: { color: colors.sidebarText },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 14, paddingVertical: 11 },
  userCell: { flex: 1.3, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surfaceAlt },
  name: { color: colors.ink, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  cell: { flex: 1, minWidth: 120 },
  cellText: { flex: 1.2, minWidth: 160, color: colors.ink, fontSize: 12 },
  mutedCell: { flex: 1, minWidth: 150, color: colors.muted, fontSize: 12 },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalPanel: { width: "100%", maxWidth: 520, gap: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, padding: 16 },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  modalHint: { color: colors.muted, fontSize: 12 },
  passwordWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface },
  passwordField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  passwordToggle: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleOption: { minHeight: 38, justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  roleOptionActive: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
  roleText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  roleTextActive: { color: colors.sidebarText },
  error: { color: colors.danger, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
