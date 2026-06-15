import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMwk } from "@/data/mock";

export const Route = createFileRoute("/_app/finance")({ component: Finance });

function Finance() {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.listSuppliers });
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: api.listSales });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.listExpenses });

  const ar = customers.reduce((s, c) => s + c.balance, 0);
  const ap = suppliers.reduce((s, c) => s + c.balance, 0);
  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const totalExp = expenses.reduce((s, x) => s + x.amount, 0);
  const profit = revenue - totalExp;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Finance" title="Books" description="Accounts receivable, payable, ledgers and statements." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Revenue · 14d",        v: formatMwk(revenue) },
          { l: "Expenses · 14d",       v: formatMwk(totalExp) },
          { l: "Net profit",           v: formatMwk(profit), tone: profit >= 0 ? "text-success" : "text-destructive" },
          { l: "AR / AP",              v: `${formatMwk(ar)} · ${formatMwk(ap)}` },
        ].map((k) => (
          <Card key={k.l} className="border-border/70 shadow-none"><CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
            <div className={`mt-1 font-serif text-xl ${k.tone ?? ""}`}>{k.v}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="ar">
        <TabsList>
          <TabsTrigger value="ar">Receivable</TabsTrigger>
          <TabsTrigger value="ap">Payable</TabsTrigger>
          <TabsTrigger value="ledger">General ledger</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="bs">Balance sheet</TabsTrigger>
        </TabsList>
        <TabsContent value="ar" className="mt-4">
          <Card className="border-border/70 shadow-none">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Customer</th><th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2 text-right font-medium">Credit limit</th></tr></thead>
              <tbody>
                {customers.filter((c) => c.balance > 0).map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-destructive">{formatMwk(c.balance)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMwk(c.creditLimit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="ap" className="mt-4">
          <Card className="border-border/70 shadow-none">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Supplier</th><th className="px-4 py-2 text-right font-medium">Balance</th></tr></thead>
              <tbody>
                {suppliers.filter((s) => s.balance > 0).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-accent">{formatMwk(s.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-6">
              <h3 className="font-serif text-lg">Profit &amp; Loss · last 14 days</h3>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  <tr className="border-b border-border"><td className="py-2">Sales revenue</td><td className="py-2 text-right font-mono">{formatMwk(revenue)}</td></tr>
                  <tr className="border-b border-border"><td className="py-2 pl-4 text-muted-foreground">Less: VAT collected</td><td className="py-2 text-right font-mono text-muted-foreground">({formatMwk(Math.round(revenue * 0.165 / 1.165))})</td></tr>
                  <tr className="border-b border-border"><td className="py-2">Operating expenses</td><td className="py-2 text-right font-mono">({formatMwk(totalExp)})</td></tr>
                  <tr className="border-t-2 border-foreground"><td className="py-3 font-serif text-base">Net result</td><td className={`py-3 text-right font-mono text-base font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{formatMwk(profit)}</td></tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        {(["ledger", "bs"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card className="grid place-items-center border-border/70 py-16 text-center shadow-none">
              <div className="font-serif text-lg">Generated from posting rules in MySQL</div>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Backed by <code className="font-mono">gl_accounts</code>, <code className="font-mono">gl_entries</code> and triggers; rendered here once the database is connected.</p>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
