import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatMwk } from "@/data/mock";
import { Plus, ArrowLeftRight, ClipboardCheck, AlertOctagon, Boxes } from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

function Inventory() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.listProducts });
  const lowStock = products.filter((p) => p.stock <= p.reorder);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Stock items, batches, adjustments, transfers and counts."
        actions={
          <>
            <Button variant="outline" size="sm"><ArrowLeftRight className="mr-1.5 h-4 w-4" />Transfer</Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />Receive stock</Button>
          </>
        }
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock on hand</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="counts">Physical counts</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4 space-y-4">
          {lowStock.length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertOctagon className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <div className="font-medium text-destructive">{lowStock.length} SKU{lowStock.length > 1 && "s"} below reorder point</div>
                <div className="text-xs text-muted-foreground">{lowStock.map((p) => p.name).join(", ")}</div>
              </div>
            </div>
          )}
          <Card className="border-border/70 shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">On hand</th>
                  <th className="px-4 py-2 text-right font-medium">Reorder</th>
                  <th className="px-4 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5"><div className="font-medium">{p.name}</div><div className="font-mono text-[10px] text-muted-foreground">{p.sku}</div></td>
                    <td className="px-4 py-2.5 text-right font-mono">{p.stock} {p.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{p.reorder}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMwk(p.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMwk(p.cost * p.stock)}</td>
                    <td className="px-4 py-2.5">
                      {p.stock <= p.reorder
                        ? <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">Reorder</Badge>
                        : <Badge variant="outline" className="border-success/30 text-success">In stock</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {(["batches", "adjustments", "transfers", "counts"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="grid place-items-center py-16 text-center">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-secondary"><Boxes className="h-4 w-4" /></div>
                <div className="font-serif text-lg capitalize">{t}</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Wired to the MySQL schema (<code className="font-mono">stock_{t === "counts" ? "counts" : t.slice(0, -1) + "s"}</code>). UI form ready in the next iteration.
                </p>
                <Button size="sm" className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">New {t.slice(0, -1)}</Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
