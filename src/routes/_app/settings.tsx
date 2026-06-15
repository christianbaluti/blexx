import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MOCK_USERS, ROLE_LABELS } from "@/lib/auth";
import { CircleUserRound } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Configuration" title="Settings" description="Company, tax, users, roles and integrations." />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="sync">Sync & devices</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card className="border-border/70 shadow-none"><CardContent className="grid max-w-2xl gap-4 p-6">
            <div className="grid gap-1.5"><Label>Trading name</Label><Input defaultValue="ModernTech Innovation" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5"><Label>Currency</Label><Input defaultValue="MWK — Malawian Kwacha" /></div>
              <div className="grid gap-1.5"><Label>VAT rate (%)</Label><Input defaultValue="16.5" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Address</Label><Input defaultValue="Area 47, Lilongwe, Malawi" /></div>
            <div className="flex justify-end"><Button className="bg-accent text-accent-foreground hover:bg-accent/90">Save changes</Button></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card className="border-border/70 shadow-none">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr></thead>
              <tbody>
                {MOCK_USERS.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5">
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-secondary"><CircleUserRound className="h-4 w-4 text-muted-foreground" /></div>
                      <div><div className="font-medium">{u.name}</div><div className="font-mono text-[10px] text-muted-foreground">@{u.username}</div></div>
                    </div></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2.5"><Badge variant="secondary" className="font-normal">{ROLE_LABELS[u.role]}</Badge></td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="border-success/30 text-success">Active</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card className="border-border/70 shadow-none"><CardContent className="max-w-xl space-y-5 p-6">
            {[
              { l: "Two-factor authentication", d: "Require a TOTP code on every sign-in." },
              { l: "Biometric unlock (mobile)",   d: "Allow fingerprint or face on supported devices." },
              { l: "Session auto-lock (15 min)",  d: "Lock the POS lane after 15 minutes of inactivity." },
              { l: "Password expiry (90 days)",   d: "Force a password reset every quarter." },
            ].map((s, i) => (
              <div key={s.l} className="flex items-start justify-between gap-4">
                <div><div className="text-sm font-medium">{s.l}</div><div className="text-xs text-muted-foreground">{s.d}</div></div>
                <Switch defaultChecked={i < 2} />
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <Card className="border-border/70 shadow-none"><CardContent className="p-6">
            <h3 className="font-serif text-lg">Offline synchronisation</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              The POS terminal keeps a local copy of products, prices and unsynced sales. When connectivity returns, changes are pushed to MySQL through a background job with last-writer-wins conflict resolution on sales and detect-and-merge on master data.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { l: "Pending uploads", v: "0" },
                { l: "Last sync",       v: "just now" },
                { l: "Local DB size",   v: "4.8 MB" },
              ].map((k) => (
                <div key={k.l} className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
                  <div className="mt-1 font-mono text-base">{k.v}</div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
