import { Text, View } from "react-native";
import { DataModuleScreen, OfflineActionButton } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";
import { quickCreate } from "../../src/components/quick-create";

export default function Transfers() {
  return (
    <DataModuleScreen
      title="Transfers"
      subtitle="Outlet-to-outlet and warehouse stock transfers with sent and received states."
      queryKey="transfers"
      queryFn={api.transfers as never}
      primaryAction={quickCreate.transfer("10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000001", "30000000-0000-0000-0000-000000000001")}
      columns={["Transfer", "Status", "Items"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.id)}</Text>
          <Text>{String(row.status)} - {String(row.createdAt)}</Text>
          <Text>{String(row.totalItems ?? 0)} items</Text>
        </View>
      )}
    />
  );
}
