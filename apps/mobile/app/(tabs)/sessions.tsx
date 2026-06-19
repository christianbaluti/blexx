import { Text, View } from "react-native";
import { DataModuleScreen } from "../../src/components/module-screen";
import { api } from "../../src/lib/api";

export default function Sessions() {
  return (
    <DataModuleScreen
      title="Sessions"
      subtitle="Active and historical device sessions for security and audit review."
      queryKey="sessions"
      queryFn={api.sessions}
      columns={["User", "Device", "Expires"]}
      renderRow={(row) => (
        <View>
          <Text style={{ fontWeight: "900" }}>{String(row.userName ?? row.userId)}</Text>
          <Text>{String(row.deviceId ?? "Unknown device")} - {String(row.ip ?? "No IP")}</Text>
          <Text>Expires {String(row.expiresAt ?? "n/a")}</Text>
        </View>
      )}
    />
  );
}
