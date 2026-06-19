import { Text, View } from "react-native";
import { DataModuleScreen, OfflineActionButton } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";
import { quickCreate } from "../../src/components/quick-create";

export default function StockCounts() {
  return (
    <DataModuleScreen
      title="Stock Counts"
      subtitle="Physical stock counts, expected quantities, variances and closing workflow."
      queryKey="stock-counts"
      queryFn={api.stockCounts as never}
      primaryAction={quickCreate.stockCount("10000000-0000-0000-0000-000000000001")}
      columns={["Outlet", "Status", "Variance"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.outletName)}</Text>
          <Text>{String(row.status)} - {String(row.createdAt)}</Text>
          <Text>Variance {String(row.variance ?? 0)}</Text>
        </View>
      )}
    />
  );
}
