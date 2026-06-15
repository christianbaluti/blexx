import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, Info } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({ component: Notifs });

const ICONS = { low_stock: AlertTriangle, expiry: CalendarClock, info: Info } as const;

function Notifs() {
  const { data: notifs = [] } = useQuery({ queryKey: ["notifs"], queryFn: api.listNotifications });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Alerts" title="Notifications" description="Low stock, expiry, system messages and broadcast channels." />
      <Card className="border-border/70 shadow-none">
        <ul className="divide-y divide-border/60">
          {notifs.map((n) => {
            const Icon = ICONS[n.type];
            return (
              <li key={n.id} className="flex items-start gap-3 p-4">
                <div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-md ${
                  n.type === "low_stock" ? "bg-destructive/10 text-destructive" :
                  n.type === "expiry" ? "bg-warning/20 text-warning-foreground" : "bg-secondary"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{n.title}</div>
                    {!n.read && <Badge className="bg-accent text-accent-foreground">New</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">{n.body}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(n.ts).toLocaleString()}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
