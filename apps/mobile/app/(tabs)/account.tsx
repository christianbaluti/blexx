import { StyleSheet, Text, View } from "react-native";
import { roleLabels } from "@blex/shared";
import { Button, Card, Screen } from "../../src/components/ui";
import { Login } from "../../src/components/login";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/lib/theme";

export default function Account() {
  const auth = useAuth();
  if (!auth.isAuthenticated || !auth.user) return <Login />;

  return (
    <Screen>
      <View style={styles.content}>
        <Card>
          <Text style={styles.title}>{auth.user.name}</Text>
          <Text style={styles.meta}>{auth.user.email}</Text>
          <Text style={styles.meta}>{roleLabels[auth.user.role]}</Text>
          <Button style={{ marginTop: 18 }} onPress={auth.logout}>Sign out</Button>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", alignSelf: "center", width: "100%", maxWidth: 420, padding: 18 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "900" },
  meta: { color: colors.muted, marginTop: 8 }
});
