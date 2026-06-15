import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMwk } from "@/data/mock";
import { Plus, Star, CircleUserRound } from "lucide-react";

export const Route = createFileRoute("/_app/customers")({ component: Customers });

function Customers() {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Relationships" title="Customers" description="Profiles, loyalty programme and credit limits."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />Add customer</Button>} />
      <Card className="border-border/70 shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Customer</th>
              <th className="px-4 py-2 text-left font-medium">Contact</th>
              <th className="px-4 py-2 text-right font-medium">Loyalty</th>
              <th className="px-4 py-2 text-right font-medium">Credit limit</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-foreground/40"><CircleUserRound className="h-4 w-4" /></div>
                    <div><div className="font-medium">{c.name}</div><div className="font-mono text-[10px] text-muted-foreground">{c.id}</div></div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.phone || "—"}<div>{c.email}</div></td>
                <td className="px-4 py-2.5 text-right">
                  {c.loyaltyPoints > 0
                    ? <Badge variant="outline" className="border-warning/40 font-mono text-warning-foreground"><Star className="mr-1 h-3 w-3 fill-warning text-warning" />{c.loyaltyPoints}</Badge>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{c.creditLimit ? formatMwk(c.creditLimit) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono">{c.balance ? <span className="text-destructive">{formatMwk(c.balance)}</span> : "—"}</td>
                <td className="px-4 py-2.5 text-right"><Button size="sm" variant="ghost">View</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
