import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { PageHeader } from "./page-header";

export function ModuleStub({
  eyebrow, title, description, sections, children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections?: { name: string; items: string[] }[];
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
      {sections && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((sec) => (
            <Card key={sec.name} className="border-border/70 shadow-none">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-accent/10 text-accent">
                    <Construction className="h-3.5 w-3.5" />
                  </div>
                  <div className="font-serif text-base font-semibold">{sec.name}</div>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {sec.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
