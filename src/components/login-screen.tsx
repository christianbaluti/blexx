import { useState } from "react";
import { useAuth, MOCK_USERS, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(username, password);
      toast.success(`Welcome, ${u.name.split(" ")[0]}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper lg:grid-cols-2">
      {/* Left — brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="absolute inset-0 opacity-[0.08]" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, oklch(0.62 0.16 38) 0, transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.45 0.08 200) 0, transparent 45%)",
        }} />
        <div className="relative flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
            <Building2 className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-serif text-lg font-semibold">ModernTech</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Commerce OS</div>
          </div>
        </div>

        <div className="relative max-w-md space-y-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">v1 · Pilot release</div>
          <h2 className="font-serif text-4xl leading-[1.05] tracking-tight">
            One ledger for stock,<br />sales and the shop floor.
          </h2>
          <p className="text-sm leading-relaxed text-sidebar-foreground/70">
            Inventory, production, POS, finance and customer relationships — built for the way real shops actually move.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-3 text-xs text-sidebar-foreground/60">
          <div><div className="font-mono text-base text-sidebar-foreground">99.9%</div>uptime SLA</div>
          <div><div className="font-mono text-base text-sidebar-foreground">6</div>roles</div>
          <div><div className="font-mono text-base text-sidebar-foreground">19</div>modules</div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-sidebar text-sidebar-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="font-serif text-lg font-semibold">ModernTech</div>
          </div>

          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Sign in</div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Open the shop</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Use your role credentials to continue.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u">Username or email</Label>
              <Input id="u" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="p">Password</Label>
                <button type="button" className="text-xs text-muted-foreground hover:text-accent">Forgot?</button>
              </div>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <Button type="submit" disabled={busy} className="h-10 w-full bg-foreground text-background hover:bg-foreground/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></>}
            </Button>
          </form>

          <div className="mt-7 rounded-md border border-dashed border-border bg-card/60 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Lock className="h-3 w-3" /> Demo accounts
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs">
              {MOCK_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setUsername(u.username); setPassword(u.password); }}
                  className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-muted"
                >
                  <span className="font-mono text-accent">{u.username}</span>
                  <span className="text-muted-foreground">{ROLE_LABELS[u.role]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
