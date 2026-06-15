import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMwk } from "@/data/mock";
import { Plus, Search, Package, Edit3 } from "lucide-react";

export const Route = createFileRoute("/_app/products")({ component: Products });

function Products() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const [q, setQ] = useState("");
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const filtered = products.filter((p) =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q) || p.barcode.includes(q));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Manage SKUs, barcodes, variants and pricing."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />New product</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-none"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total SKUs</div><div className="mt-1 font-serif text-2xl">{products.length}</div></CardContent></Card>
        <Card className="border-border/70 shadow-none"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Categories</div><div className="mt-1 font-serif text-2xl">{categories.length}</div></CardContent></Card>
        <Card className="border-border/70 shadow-none"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock value</div><div className="mt-1 font-serif text-2xl">{formatMwk(products.reduce((s, p) => s + p.stock * p.cost, 0))}</div></CardContent></Card>
        <Card className="border-border/70 shadow-none"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Low stock</div><div className="mt-1 font-serif text-2xl text-destructive">{products.filter((p) => p.stock <= p.reorder).length}</div></CardContent></Card>
      </div>

      <Card className="border-border/70 shadow-none">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU or barcode" className="h-9 pl-8" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Product</th>
                <th className="px-4 py-2 text-left font-medium">SKU</th>
                <th className="px-4 py-2 text-left font-medium">Barcode</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">Stock</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded bg-secondary text-foreground/40"><Package className="h-3.5 w-3.5" /></div>
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                  <td className="px-4 py-2.5"><Badge variant="secondary" className="font-normal">{catName(p.categoryId)}</Badge></td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatMwk(p.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{p.price ? formatMwk(p.price) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={p.stock <= p.reorder ? "text-destructive font-semibold" : ""}>{p.stock} {p.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-muted-foreground hover:text-foreground"><Edit3 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
