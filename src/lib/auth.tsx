import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role =
  | "super_admin"
  | "inventory_officer"
  | "production_officer"
  | "pos_cashier"
  | "finance_user"
  | "cro";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  inventory_officer: "Inventory Officer",
  production_officer: "Production Officer",
  pos_cashier: "POS Cashier",
  finance_user: "Finance User",
  cro: "Customer Relationship Officer",
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  avatar?: string;
}

export const MOCK_USERS: (AuthUser & { password: string })[] = [
  { id: "u1", name: "Tadala Banda", username: "admin", email: "admin@moderntech.mw", role: "super_admin", password: "admin" },
  { id: "u2", name: "Chimwemwe Phiri", username: "inventory", email: "inv@moderntech.mw", role: "inventory_officer", password: "demo" },
  { id: "u3", name: "Mphatso Nkhata", username: "production", email: "prod@moderntech.mw", role: "production_officer", password: "demo" },
  { id: "u4", name: "Yamikani Mhone", username: "cashier", email: "pos@moderntech.mw", role: "pos_cashier", password: "demo" },
  { id: "u5", name: "Limbani Gondwe", username: "finance", email: "fin@moderntech.mw", role: "finance_user", password: "demo" },
  { id: "u6", name: "Tamanda Kaunda", username: "cro", email: "cro@moderntech.mw", role: "cro", password: "demo" },
];

interface AuthCtx {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasRole: (...r: Role[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "mt_pos_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      isAuthenticated: !!user,
      async login(username, password) {
        await new Promise((r) => setTimeout(r, 250));
        const found = MOCK_USERS.find(
          (u) =>
            (u.username === username.trim() || u.email === username.trim()) &&
            u.password === password,
        );
        if (!found) throw new Error("Invalid credentials. Try admin / admin.");
        const { password: _p, ...safe } = found;
        localStorage.setItem(KEY, JSON.stringify(safe));
        setUser(safe);
        return safe;
      },
      logout() {
        localStorage.removeItem(KEY);
        setUser(null);
      },
      hasRole(...roles) {
        if (!user) return false;
        if (user.role === "super_admin") return true;
        return roles.includes(user.role);
      },
    }),
    [user],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
