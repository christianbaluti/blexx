import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/login-screen";
import { TopBar } from "@/components/top-bar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!isAuthenticated) return <LoginScreen />;

  const isPos = pathname === "/pos";

  if (isPos) {
    // POS uses a full-screen layout (no sidebar) for cashier focus
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar trigger={<SidebarTrigger className="-ml-1" />} />
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
