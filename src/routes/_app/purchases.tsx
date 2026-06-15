import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatMwk } from "@/data/mock";
import { Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/purchases")({ component: Purchases });

const STATUS_TONE: Record<string, string> = {
  draft: "bg-secondary text-foreground/60",
  ordered: "bg-warning/20 text-warning-foreground border-warning/30",
  received: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

function Purchases() {
  const { data: pos = [] } = useQuery({ queryKey: ["po"], queryFn: api.listPurchaseOrders });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.listSuppliers });
  const supName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Purchases" description="Purchase orders, goods received, supplier invoices and returns."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />New PO</Button>} />
      <Tabs defaultValue="po">
        <TabsList>
          <TabsTrigger value="po">Purchase orders</TabsTrigger>
          <TabsTrigger value="grn">Goods received</TabsTrigger>
          <TabsTrigger value="inv">Supplier invoices</TabsTrigger>
          <TabsTrigger value="ret">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="po" className="mt-4">
          <Card className="border-border/70 shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Ref</th>
                  <th className="px-4 py-2 text-left font-medium">Supplier</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.id.toUpperCase()}</td>
                    <td className="px-4 py-2.5 font-medium">{supName(p.supplierId)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMwk(p.total)}</td>
                    <td className="px-4 py-2.5 text-right"><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        {(["grn", "inv", "ret"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card className="grid place-items-center border-border/70 py-16 text-center shadow-none">
              <div className="font-serif text-lg">No records yet</div>
              <p className="mt-1 text-sm text-muted-foreground">Create a PO and receive it to populate this view.</p>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
