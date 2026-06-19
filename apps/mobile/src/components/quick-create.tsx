import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { colors } from "../lib/theme";
import { Button, Field } from "./ui";

type FieldDef = { key: string; label: string; numeric?: boolean; defaultValue?: string };

export function QuickCreate({
  label,
  title,
  queryKey,
  fields,
  submit
}: {
  label: string;
  title: string;
  queryKey: string;
  fields: FieldDef[];
  submit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? ""])));
  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
    }
  });

  function save() {
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      payload[field.key] = field.numeric ? Number(values[field.key] || 0) : values[field.key];
    }
    mutation.mutate(payload);
  }

  return (
    <>
      <Button onPress={() => setOpen(true)}>{label}</Button>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel}>
            <Text style={styles.title}>{title}</Text>
            {fields.map((field) => (
              <Field
                key={field.key}
                placeholder={field.label}
                value={values[field.key] ?? ""}
                onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                keyboardType={field.numeric ? "numeric" : "default"}
              />
            ))}
            {mutation.error ? <Text style={styles.error}>{mutation.error instanceof Error ? mutation.error.message : "Save failed"}</Text> : null}
            <View style={styles.actions}>
              <Button variant="outline" onPress={() => setOpen(false)}>Cancel</Button>
              <Button onPress={save} disabled={mutation.isPending}>Save</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const quickCreate = {
  product: (queryKey = "products") => (
    <QuickCreate
      label="New product"
      title="New product"
      queryKey={queryKey}
      fields={[
        { key: "sku", label: "SKU" },
        { key: "name", label: "Name" },
        { key: "unit", label: "Unit", defaultValue: "ea" },
        { key: "cost", label: "Cost", numeric: true },
        { key: "price", label: "Price", numeric: true },
        { key: "reorder", label: "Reorder quantity", numeric: true }
      ]}
      submit={(payload) => api.createProduct({ ...payload, isRaw: false, isSellable: true })}
    />
  ),
  supplier: () => (
    <QuickCreate label="New supplier" title="New supplier" queryKey="suppliers" fields={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }]} submit={api.createSupplier} />
  ),
  customer: () => (
    <QuickCreate label="New customer" title="New customer" queryKey="customers" fields={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "creditLimit", label: "Credit limit", numeric: true }]} submit={api.createCustomer} />
  ),
  user: () => (
    <QuickCreate label="New user" title="New user" queryKey="users" fields={[{ key: "username", label: "Username" }, { key: "email", label: "Email" }, { key: "name", label: "Full name" }, { key: "password", label: "Password", defaultValue: "demo" }, { key: "role", label: "Role", defaultValue: "pos_cashier" }]} submit={api.createUser} />
  ),
  expense: (categoryId: string, outletId?: string) => (
    <QuickCreate label="New expense" title="New expense" queryKey="expenses" fields={[{ key: "description", label: "Description" }, { key: "amount", label: "Amount", numeric: true }, { key: "date", label: "Date", defaultValue: new Date().toISOString().slice(0, 10) }]} submit={(payload) => api.createExpense({ ...payload, categoryId, outletId: outletId ?? null, recurring: false })} />
  ),
  stockCount: (outletId: string) => (
    <QuickCreate label="Start count" title="Start stock count" queryKey="stock-counts" fields={[]} submit={() => api.createStockCount({ outletId })} />
  ),
  transfer: (fromOutletId: string, toOutletId: string, productId: string) => (
    <QuickCreate label="New transfer" title="New transfer" queryKey="transfers" fields={[{ key: "qty", label: "Quantity", numeric: true }]} submit={(payload) => api.createTransfer({ fromOutletId, toOutletId, lines: [{ productId, qty: Number(payload.qty ?? 1) }] })} />
  )
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { width: "100%", maxWidth: 460, gap: 12, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 16 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  error: { color: colors.danger, fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }
});
