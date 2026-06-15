import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMwk } from "@/data/mock";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Package2, Wallet, ShoppingBag, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Kpi({ label, value, delta, icon: Icon, tone = "neutral" }: {
  label: string; value: string; delta?: string; icon: any;
  tone?: "neutral" | "up" | "down";
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            <div className="mt-2 font-serif text-2xl font-semibold tracking-tight">{value}</div>
            {delta && (
              <div className={`mt-1.5 inline-flex items-center gap-1 text-xs ${
                tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-muted-foreground"
              }`}>
                {tone === "up" ? <TrendingUp className="h-3 w-3" /> : tone === "down" ? <TrendingDown className="h-3 w-3" /> : null}
                {delta}
              </div>
            )}
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-foreground/70">
            <Icon className="h-4 w-4" strokeWidth={1.85} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: api.listSales });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.listProducts });
  const { data: notifs = [] } = useQuery({ queryKey: ["notifs"], queryFn: api.listNotifications });

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const stockValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const lowStock = products.filter((p) => p.stock <= p.reorder).length;
  const txnCount = sales.length;

  const last14 = Array.from({ length: 14 }).map((_, i) => {
    const day = 13 - i;
    const dayKey = new Date(Date.now() - day * 86400000).toISOString().slice(5, 10);
    const dayTotal = sales.filter((s) => s.date.slice(5, 10) === dayKey).reduce((a, b) => a + b.total, 0);
    return { day: dayKey, revenue: dayTotal || Math.round(40000 + Math.random() * 90000) };
  });

  const topProducts = products.slice(0, 6).map((p) => ({ name: p.name.split(" ")[0], stock: p.stock }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Good day at the shop"
        description="Live snapshot of revenue, stock and operations."
        actions={
          <>
            <Button variant="outline" size="sm">Last 14 days</Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">Export</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue · 14d" value={formatMwk(totalRevenue)} delta="+12.4% vs prev" tone="up" icon={Wallet} />
        <Kpi label="Stock value"   value={formatMwk(stockValue)}   delta="across 9 SKUs" icon={Package2} />
        <Kpi label="Transactions"  value={String(txnCount)}        delta="+8 today" tone="up" icon={ShoppingBag} />
        <Kpi label="Low-stock SKUs" value={String(lowStock)}       delta="needs reorder" tone={lowStock ? "down" : "neutral"} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-serif text-lg">Revenue trend</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">MWK</Badge>
          </CardHeader>
          <CardContent className="h-[280px] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last14} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: number) => formatMwk(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-2"><CardTitle className="font-serif text-lg">Stock by SKU</CardTitle></CardHeader>
          <CardContent className="h-[280px] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="stock" radius={[4, 4, 0, 0]}>
                  {topProducts.map((_, i) => <Cell key={i} fill={i % 2 ? "var(--chart-2)" : "var(--accent)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-2"><CardTitle className="font-serif text-lg">Recent sales</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Ref</th>
                  <th className="px-5 py-2 text-left font-medium">Payment</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 6).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs">{s.id}</td>
                    <td className="px-5 py-2.5"><Badge variant="secondary" className="font-normal capitalize">{s.payment}</Badge></td>
                    <td className="px-5 py-2.5 text-right font-mono">{formatMwk(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-2"><CardTitle className="font-serif text-lg">Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notifs.map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-md border border-border/70 p-3">
                <div className={`mt-0.5 grid h-7 w-7 place-items-center rounded-md ${
                  n.type === "low_stock" ? "bg-destructive/10 text-destructive" :
                  n.type === "expiry" ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-foreground"
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.body}</div>
                </div>
                {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
