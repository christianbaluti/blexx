import { formatMwk } from "@blex/shared";
import { Text, View } from "react-native";
import { DataModuleScreen, OfflineActionButton } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Boms() {
  return (
    <DataModuleScreen
      title="Bills of Materials"
      subtitle="Finished goods recipes, material requirements, labour, overhead and output quantities."
      queryKey="boms"
      queryFn={api.boms as never}
      primaryAction={<OfflineActionButton entity="bom" label="Queue BOM" payload={{ outputQty: 1 }} />}
      columns={["BOM", "Output", "Costs"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.name)}</Text>
          <Text>{String(row.productName)} - Output {String(row.outputQty ?? 1)}</Text>
          <Text>Labour {formatMwk(Number(row.laborCost ?? 0))} - Overhead {formatMwk(Number(row.overhead ?? 0))}</Text>
        </View>
      )}
    />
  );
}
