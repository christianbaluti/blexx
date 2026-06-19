import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Loyalty() {
  return (
    <DataModuleScreen
      title="Loyalty"
      subtitle="Customer loyalty points, awards, reversals and redemption history."
      queryKey="loyalty"
      queryFn={api.loyalty}
      columns={["Customer", "Points", "Reference"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.customerName ?? row.customerId)}</Text>
          <Text>{String(row.points ?? 0)} points - {String(row.refType ?? "manual")}</Text>
          <Text>{String(row.note ?? "")}</Text>
        </View>
      )}
    />
  );
}
