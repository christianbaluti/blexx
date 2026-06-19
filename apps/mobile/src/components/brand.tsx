import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { useBranding } from "../lib/branding";
import { colors, shadow, typography } from "../lib/theme";

export const brandMarkSource = require("../../assets/brand/adaptive-icon.png") as ImageSourcePropType;
export const brandSplashSource = require("../../assets/brand/splash-logo.png") as ImageSourcePropType;

export function BrandMark({ size = 44 }: { size?: number }) {
  const branding = useBranding();
  const source = branding.logoDataUrl ? { uri: branding.logoDataUrl } : brandMarkSource;
  return (
    <Image
      source={source}
      resizeMode="contain"
      style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors
    />
  );
}

export function BrandLockup({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  const branding = useBranding();
  return (
    <View style={styles.lockup}>
      <BrandMark size={compact ? 40 : 48} />
      <View>
        <Text style={[styles.name, compact && styles.nameCompact, inverse && styles.inverseText]}>{branding.appName}</Text>
        <Text style={[styles.sub, inverse && styles.inverseSub]}>{branding.appSubtitle}</Text>
      </View>
    </View>
  );
}

export function StartupScreen({ label = "Opening the shop" }: { label?: string }) {
  const branding = useBranding();
  const splashSource = branding.logoDataUrl ? { uri: branding.logoDataUrl } : brandSplashSource;
  return (
    <View style={styles.startup}>
      <Image source={splashSource} resizeMode="contain" style={branding.logoDataUrl ? styles.dynamicSplash : styles.splash} accessibilityIgnoresInvertColors />
      <Text style={styles.loading}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  name: {
    color: colors.ink,
    fontFamily: typography.displayBold,
    fontSize: 20,
    lineHeight: 23
  },
  nameCompact: {
    fontSize: 18,
    lineHeight: 21
  },
  sub: {
    color: colors.muted,
    fontFamily: typography.sansBlack,
    fontSize: 10,
    lineHeight: 13,
    textTransform: "uppercase"
  },
  inverseText: {
    color: colors.sidebarText
  },
  inverseSub: {
    color: colors.sidebarMuted
  },
  startup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    padding: 28
  },
  splash: {
    width: "86%",
    maxWidth: 520,
    height: 184
  },
  dynamicSplash: {
    width: 136,
    height: 136,
    borderRadius: 28
  },
  loading: {
    marginTop: 12,
    color: colors.muted,
    fontFamily: typography.sansBold,
    fontSize: 13
  }
});
