import { Bell, Search, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { useRouterState, Link } from "@tanstack/react-router";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pos": "Point of Sale",
  "/products": "Products",
  "/inventory": "Inventory",
  "/production": "Production",
  "/purchases": "Purchases",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/finance": "Finance",
  "/expenses": "Expenses",
  "/reports": "Reports",
  "/notifications": "Notifications",
  "/audit": "Audit Trail",
  "/settings": "Settings",
};

export function TopBar({ trigger }: { trigger: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = Object.entries(TITLES).find(([k]) => pathname.startsWith(k))?.[1] ?? "ModernTech";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
      {trigger}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">ModernTech</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">{title}</span>
      </div>

      <div className="relative ml-4 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search products, customers, orders…"
          className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-sm placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <Wifi className="h-3 w-3" /> Synced
        </span>
        <Link
          to="/notifications"
          className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </Link>
      </div>
    </header>
  );
}
