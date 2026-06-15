import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMwk } from "@/data/mock";
import { Plus, Phone, Mail, MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

function Suppliers() {
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: api.listSuppliers });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Relationships" title="Suppliers" description="Registration, balances, statements and purchase history."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />New supplier</Button>} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((s) => (
          <Card key={s.id} className="border-border/70 p-5 shadow-none transition hover:border-accent">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-serif text-lg font-semibold">{s.name}</div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{s.phone}</div>
                  <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{s.email}</div>
                  <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{s.address}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-dashed border-border pt-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Owed</div>
                <div className="font-mono text-lg font-semibold text-accent">{formatMwk(s.balance)}</div>
              </div>
              <Button variant="outline" size="sm">Statement</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
