import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MOCK_USERS } from "@/lib/auth";

export const Route = createFileRoute("/_app/audit")({ component: Audit });

function Audit() {
  const { data: log = [] } = useQuery({ queryKey: ["audit"], queryFn: api.listAudit });
  const uname = (id: string) => MOCK_USERS.find((u) => u.id === id)?.name ?? id;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Compliance" title="Audit trail" description="Every action, by every user, with full context." />
      <Card className="border-border/70 shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Entity</th>
              <th className="px-4 py-2 text-left font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {log.map((a) => (
              <tr key={a.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 text-muted-foreground">{new Date(a.ts).toLocaleString()}</td>
                <td className="px-4 py-2.5">{uname(a.userId)}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="font-mono text-[10px]">{a.action}</Badge></td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.entity}</td>
                <td className="px-4 py-2.5">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
