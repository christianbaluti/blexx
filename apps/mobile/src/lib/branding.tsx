import { defaultAppBranding, type AppBranding } from "@blex/shared";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { Platform } from "react-native";
import { api } from "./api";

const BrandingContext = createContext<AppBranding>(defaultAppBranding);

export function BrandProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: api.branding,
    staleTime: 5 * 60 * 1000
  });
  const branding = data ?? defaultAppBranding;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = `${branding.appName} - ${branding.appSubtitle}`;
    const favicon = branding.iconDataUrl ?? branding.logoDataUrl;
    if (!favicon) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
