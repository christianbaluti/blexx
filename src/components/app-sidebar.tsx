import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ScanBarcode, Package, Boxes, Factory, Tags,
  ShoppingCart, Users, Truck, Receipt, Wallet, BarChart3, Bell,
  ShieldCheck, Settings, LogOut, CircleUserRound, Building2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: any; roles?: Role[] };

const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Point of Sale", url: "/pos", icon: ScanBarcode, roles: ["pos_cashier"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Products",   url: "/products",   icon: Tags,    roles: ["inventory_officer"] },
      { title: "Inventory",  url: "/inventory",  icon: Boxes,   roles: ["inventory_officer"] },
      { title: "Production", url: "/production", icon: Factory, roles: ["production_officer"] },
      { title: "Purchases",  url: "/purchases",  icon: ShoppingCart, roles: ["inventory_officer"] },
    ],
  },
  {
    label: "Relationships",
    items: [
      { title: "Customers", url: "/customers", icon: Users, roles: ["cro", "pos_cashier"] },
      { title: "Suppliers", url: "/suppliers", icon: Truck, roles: ["inventory_officer"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Finance",  url: "/finance",  icon: Wallet, roles: ["finance_user"] },
      { title: "Expenses", url: "/expenses", icon: Receipt, roles: ["finance_user"] },
      { title: "Reports",  url: "/reports",  icon: BarChart3, roles: ["finance_user"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Audit Trail",   url: "/audit",         icon: ShieldCheck },
      { title: "Settings",      url: "/settings",      icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, hasRole, logout } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-accent text-accent-foreground">
            <Building2 className="h-4.5 w-4.5" strokeWidth={2.25} />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-serif text-base font-semibold text-sidebar-foreground">ModernTech</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Commerce OS</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {SECTIONS.map((sec) => {
          const visible = sec.items.filter((i) => !i.roles || hasRole(...i.roles));
          if (!visible.length) return null;
          return (
            <SidebarGroup key={sec.label}>
              {!collapsed && (
                <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">
                  {sec.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = pathname === item.url || pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link
                            to={item.url}
                            className={cn(
                              "group/link flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                              active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.85} />
                            {!collapsed && <span className="truncate">{item.title}</span>}
                            {!collapsed && active && (
                              <span className="ml-auto h-1 w-1 rounded-full bg-accent" />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-2">
        {user && (
          <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", collapsed && "justify-center")}>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
              <CircleUserRound className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</div>
                <div className="truncate text-[10px] text-sidebar-foreground/55">{ROLE_LABELS[user.role]}</div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
