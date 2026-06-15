import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BarChart3, Boxes, Users, Truck, Wallet } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({ component: Reports });

const REPORTS = [
  { icon: BarChart3, name: "Sales reports",     desc: "Daily, weekly, by cashier, by product, by payment method." },
  { icon: Boxes,     name: "Inventory reports", desc: "Stock valuation, movement, ageing and slow-movers." },
  { icon: Wallet,    name: "Finance reports",   desc: "P&L, balance sheet, trial balance, tax summary." },
  { icon: Users,     name: "Customer reports",  desc: "Top customers, loyalty earnings, credit ageing." },
  { icon: Truck,     name: "Supplier reports",  desc: "Purchase history, balances and payment due ageing." },
];

function Reports() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Reports & analytics" description="Exportable views over every module." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.name} className="group cursor-pointer border-border/70 shadow-none transition hover:-translate-y-0.5 hover:border-accent">
            <CardContent className="p-5">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-md bg-accent/10 text-accent"><r.icon className="h-4 w-4" /></div>
              <div className="flex items-center justify-between">
                <div className="font-serif text-lg font-semibold">{r.name}</div>
                <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground transition group-hover:translate-x-0 group-hover:text-accent" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
