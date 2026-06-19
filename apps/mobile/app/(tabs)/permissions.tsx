import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Permissions() {
  return (
    <DataModuleScreen
      title="Permissions"
      subtitle="Permission catalogue used by roles and guarded actions."
      queryKey="permissions"
      queryFn={api.permissions}
      columns={["Permission", "Label"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.id)}</Text>
          <Text>{String(row.label)}</Text>
        </View>
      )}
    />
  );
}
