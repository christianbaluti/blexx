import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMwk, type Product } from "@/data/mock";
import {
  ArrowLeft, Search, Trash2, Pause, Play, ScanLine, Banknote, CreditCard, Smartphone, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/pos")({
  component: POS,
});

type CartLine = { product: Product; qty: number; discount: number };

function POS() {
  const { user } = useAuth();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [held, setHeld] = useState<CartLine[][]>([]);

  const sellable = useMemo(
    () => products.filter((p) => p.price > 0 && (cat === "all" || p.categoryId === cat) &&
      (!query || p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.includes(query) || p.barcode.includes(query))),
    [products, query, cat],
  );

  const add = (p: Product) => {
    setCart((c) => {
      const idx = c.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) {
        const next = [...c]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next;
      }
      return [...c, { product: p, qty: 1, discount: 0 }];
    });
  };
  const setQty = (id: string, qty: number) =>
    setCart((c) => c.map((l) => l.product.id === id ? { ...l, qty: Math.max(0, qty) } : l).filter((l) => l.qty > 0));
  const remove = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id));

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty - l.discount, 0);
  const tax = Math.round(subtotal * 0.165);
  const total = subtotal + tax;

  const checkout = (payment: string) => {
    if (!cart.length) { toast.error("Cart is empty"); return; }
    toast.success(`Sale completed · ${formatMwk(total)} · ${payment}`);
    setCart([]);
  };

  const hold = () => {
    if (!cart.length) return;
    setHeld((h) => [...h, cart]); setCart([]); toast.message("Cart held");
  };
  const resume = (i: number) => {
    setCart(held[i]); setHeld((h) => h.filter((_, j) => j !== i));
  };

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* Header */}
      <header className="flex h-12 items-center gap-3 border-b border-border bg-background px-4">
        <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Exit POS
        </Link>
        <div className="mx-3 h-4 w-px bg-border" />
        <div className="font-serif text-base font-semibold">Lane 01</div>
        <Badge variant="outline" className="ml-1 font-mono text-[10px]">{user?.name}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {held.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Held:</span>
              {held.map((_, i) => (
                <Button key={i} size="sm" variant="outline" onClick={() => resume(i)}>
                  <Play className="mr-1 h-3 w-3" /> #{i + 1}
                </Button>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={hold}><Pause className="mr-1.5 h-3.5 w-3.5" /> Hold</Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* Catalogue */}
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border bg-background p-3">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus placeholder="Scan barcode or search…" value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 pl-9 font-mono text-sm" />
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-background px-3 py-2">
            <button onClick={() => setCat("all")}
              className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium ${cat === "all" ? "bg-foreground text-background" : "bg-secondary text-foreground/70"}`}>
              All
            </button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium ${cat === c.id ? "bg-foreground text-background" : "bg-secondary text-foreground/70"}`}>
                {c.name}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
            {sellable.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="group flex flex-col items-start rounded-md border border-border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
              >
                <div className="mb-2 grid h-16 w-full place-items-center rounded bg-secondary font-serif text-2xl text-foreground/40">
                  {p.name.charAt(0)}
                </div>
                <div className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</div>
                <div className="mt-1 flex w-full items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                  <span className="font-mono text-sm font-semibold text-accent">{formatMwk(p.price)}</span>
                </div>
              </button>
            ))}
            {!sellable.length && (
              <div className="col-span-full grid place-items-center py-16 text-sm text-muted-foreground">
                <Search className="mb-2 h-6 w-6" /> No matches
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="flex min-h-0 flex-col bg-background">
          <div className="border-b border-border px-5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current sale</div>
            <div className="font-serif text-lg">{cart.length} item{cart.length !== 1 && "s"}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!cart.length && (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="font-serif text-base">Scan or tap to begin</div>
                  <div className="mt-1 text-xs text-muted-foreground">Items will appear here</div>
                </div>
              </div>
            )}
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.product.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{l.product.sku} · {formatMwk(l.product.price)}</div>
                </div>
                <div className="flex items-center overflow-hidden rounded-md border border-border">
                  <button className="h-7 w-7 text-sm hover:bg-muted" onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                  <input
                    className="w-10 border-x border-border bg-transparent py-1 text-center font-mono text-sm focus:outline-none"
                    value={l.qty}
                    onChange={(e) => setQty(l.product.id, Number(e.target.value) || 0)}
                  />
                  <button className="h-7 w-7 text-sm hover:bg-muted" onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
                </div>
                <div className="w-24 text-right font-mono text-sm">{formatMwk(l.product.price * l.qty)}</div>
                <button onClick={() => remove(l.product.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-card px-5 py-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">{formatMwk(subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>VAT 16.5%</span><span className="font-mono">{formatMwk(tax)}</span></div>
              <div className="mt-2 flex items-end justify-between border-t border-dashed border-border pt-2">
                <span className="font-serif text-base font-semibold">Total</span>
                <span className="font-mono text-2xl font-semibold text-accent">{formatMwk(total)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button onClick={() => checkout("Cash")}    className="h-11 bg-foreground text-background hover:bg-foreground/90"><Banknote className="mr-1.5 h-4 w-4" />Cash</Button>
              <Button onClick={() => checkout("Card")}    variant="outline" className="h-11"><CreditCard className="mr-1.5 h-4 w-4" />Card</Button>
              <Button onClick={() => checkout("Mobile")}  variant="outline" className="h-11"><Smartphone className="mr-1.5 h-4 w-4" />Mobile</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
