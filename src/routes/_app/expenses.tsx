import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMwk } from "@/data/mock";
import { Plus, Repeat, Building, Truck, Users, Megaphone, Package, Zap } from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

const CAT_ICONS: Record<string, any> = {
  Rent: Building, Transport: Truck, Salaries: Users,
  Marketing: Megaphone, Packaging: Package, Utilities: Zap,
};

function Expenses() {
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.listExpenses });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = expenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc; }, {});

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Finance" title="Expenses" description="Rent, transport, salaries, marketing, packaging, utilities and custom categories."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />Log expense</Button>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Object.entries(byCat).map(([cat, amt]) => {
          const Icon = CAT_ICONS[cat] ?? Package;
          return (
            <Card key={cat} className="border-border/70 shadow-none"><CardContent className="p-4">
              <Icon className="mb-2 h-4 w-4 text-accent" />
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
              <div className="mt-1 font-mono text-sm font-semibold">{formatMwk(amt)}</div>
              <div className="mt-1 h-1 w-full rounded bg-secondary"><div className="h-full rounded bg-accent" style={{ width: `${(amt / total) * 100}%` }} /></div>
            </CardContent></Card>
          );
        })}
      </div>

      <Card className="border-border/70 shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 text-muted-foreground">{new Date(e.date).toLocaleDateString()}</td>
                <td className="px-4 py-2.5"><Badge variant="secondary" className="font-normal">{e.category}</Badge></td>
                <td className="px-4 py-2.5">{e.description}</td>
                <td className="px-4 py-2.5">{e.recurring ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Repeat className="h-3 w-3" />Recurring</span> : <span className="text-xs text-muted-foreground">One-off</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatMwk(e.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground bg-secondary/30 font-semibold">
              <td colSpan={4} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right font-mono text-base">{formatMwk(total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
