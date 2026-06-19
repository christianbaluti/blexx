import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { quickCreate } from "../../src/components/quick-create";
import { api } from "../../src/lib/api";

export default function Users() {
  return (
    <DataModuleScreen
      title="Users/Roles"
      subtitle="Create users, assign permissions, suspend users, manage roles and session access."
      queryKey="users"
      queryFn={api.users as never}
      primaryAction={quickCreate.user()}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.name)}</Text>
          <Text>{String(row.username)} - {String(row.email)}</Text>
          <Text>{String(row.role)} - {String(row.status)} - 2FA {row.twoFactorEnabled ? "On" : "Off"}</Text>
        </View>
      )}
    />
  );
}
