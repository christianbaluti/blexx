import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Grn() {
  return (
    <DataModuleScreen
      title="Goods Received Notes"
      subtitle="Receiving records that increase stock and connect purchases to supplier documents."
      queryKey="grn"
      queryFn={api.grn as never}
      columns={["GRN", "PO", "Items"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.refNo)}</Text>
          <Text>PO {String(row.poId ?? "Direct")} - {String(row.receivedAt)}</Text>
          <Text>{String(row.totalItems ?? 0)} items</Text>
        </View>
      )}
    />
  );
}
