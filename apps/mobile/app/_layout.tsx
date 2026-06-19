import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium
} from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StartupScreen } from "../src/components/brand";
import { AuthProvider } from "../src/lib/auth";
import { BrandProvider } from "../src/lib/branding";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium
  });

  if (!fontsLoaded) return <StartupScreen label="Loading brand system" />;

  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </BrandProvider>
    </QueryClientProvider>
  );
}
