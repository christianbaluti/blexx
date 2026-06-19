import { formatMwk } from "@blex/shared";
import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Credit() {
  return (
    <DataModuleScreen
      title="Customer Credit"
      subtitle="Credit limits, outstanding balances, available credit and receivables review."
      queryKey="credit"
      queryFn={api.credit}
      columns={["Customer", "Balance", "Available"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.name)}</Text>
          <Text>Limit {formatMwk(Number(row.creditLimit ?? 0))} - Balance {formatMwk(Number(row.balance ?? 0))}</Text>
          <Text>Available {formatMwk(Number(row.availableCredit ?? 0))}</Text>
        </View>
      )}
    />
  );
}
