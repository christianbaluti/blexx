import { formatMwk } from "@blex/shared";
import { Text, View } from "react-native";
import { DataModuleScreen, OfflineActionButton } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Returns() {
  return (
    <DataModuleScreen
      title="Returns"
      subtitle="Sale returns, refund tracking and stock reversal workflows."
      queryKey="returns"
      queryFn={api.returns}
      primaryAction={<OfflineActionButton entity="return" label="Queue return" payload={{ reason: "customer_return" }} />}
      columns={["Sale", "Reason", "Total"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.saleRef)}</Text>
          <Text>{String(row.reason ?? "Return")} - {String(row.createdAt)}</Text>
          <Text>{formatMwk(Number(row.total ?? 0))}</Text>
        </View>
      )}
    />
  );
}
