import { formatMwk } from "@blex/shared";
import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function SupplierInvoices() {
  return (
    <DataModuleScreen
      title="Supplier Invoices"
      subtitle="Accounts payable, invoice due dates, paid amounts and supplier balances."
      queryKey="supplier-invoices"
      queryFn={api.supplierInvoices as never}
      columns={["Invoice", "Supplier", "Balance"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.refNo)}</Text>
          <Text>{String(row.supplierName)} - {String(row.status)} - Due {String(row.dueDate ?? "n/a")}</Text>
          <Text>{formatMwk(Number(row.total ?? 0) - Number(row.paid ?? 0))}</Text>
        </View>
      )}
    />
  );
}
