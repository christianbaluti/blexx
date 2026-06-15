import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMwk } from "@/data/mock";
import { Plus, Factory, Workflow } from "lucide-react";

export const Route = createFileRoute("/_app/production")({ component: Production });

function Production() {
  const { data: boms = [] } = useQuery({ queryKey: ["boms"], queryFn: api.listBoms });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.listProducts });
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Production" description="Bills of material, batches, auto deduction and cost tracking."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />New batch</Button>} />
      <Tabs defaultValue="bom">
        <TabsList>
          <TabsTrigger value="bom">Bills of material</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="waste">Waste tracking</TabsTrigger>
        </TabsList>
        <TabsContent value="bom" className="mt-4 space-y-4">
          {boms.map((b) => {
            const matCost = b.components.reduce((s, c) => {
              const p = products.find((x) => x.id === c.materialId);
              return s + (p ? p.cost * c.qty : 0);
            }, 0);
            const total = matCost + b.laborCost + b.overhead;
            return (
              <Card key={b.id} className="border-border/70 shadow-none">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Output</div>
                      <div className="font-serif text-xl">{b.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Produces {pname(b.productId)}</div>
                    </div>
                    <Button variant="outline" size="sm"><Workflow className="mr-1.5 h-3.5 w-3.5" />Run production</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
                    <table className="text-sm">
                      <thead>
                        <tr className="border-y border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 text-left font-medium">Component</th>
                          <th className="py-2 text-right font-medium">Qty</th>
                          <th className="py-2 text-right font-medium">Unit cost</th>
                          <th className="py-2 text-right font-medium">Line</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.components.map((c) => {
                          const p = products.find((x) => x.id === c.materialId);
                          return (
                            <tr key={c.materialId} className="border-b border-border/60">
                              <td className="py-2 font-medium">{p?.name}</td>
                              <td className="py-2 text-right font-mono">{c.qty} {p?.unit}</td>
                              <td className="py-2 text-right font-mono">{formatMwk(p?.cost ?? 0)}</td>
                              <td className="py-2 text-right font-mono">{formatMwk((p?.cost ?? 0) * c.qty)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="space-y-2 rounded-md bg-secondary/50 p-4 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Materials</span><span className="font-mono">{formatMwk(matCost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Labour</span><span className="font-mono">{formatMwk(b.laborCost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Overhead</span><span className="font-mono">{formatMwk(b.overhead)}</span></div>
                      <div className="flex justify-between border-t border-dashed border-border pt-2 font-serif"><span>Batch cost</span><span className="font-mono font-semibold text-accent">{formatMwk(total)}</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        {(["batches", "waste"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card className="grid place-items-center border-border/70 py-16 text-center shadow-none">
              <Factory className="mb-2 h-6 w-6 text-muted-foreground" />
              <div className="font-serif text-lg capitalize">No {t} yet</div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
