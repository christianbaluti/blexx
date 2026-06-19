import { formatMwk } from "@blex/shared";
import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Receipts() {
  return (
    <DataModuleScreen
      title="Receipts"
      subtitle="Printable and shareable receipts for completed POS transactions."
      queryKey="receipts"
      queryFn={api.receipts}
      columns={["Receipt", "Payment", "Total"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.refNo)}</Text>
          <Text>{String(row.payment)} - {String(row.lineCount)} lines - {String(row.status)}</Text>
          <Text>{formatMwk(Number(row.total ?? 0))}</Text>
        </View>
      )}
    />
  );
}
