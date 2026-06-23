import type { AuthUser, Role } from "@blex/shared";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "./sessionStore";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthSession()
      .then(async (session) => {
        if (!session) return;
        setUser(session.user);
        try {
          const freshUser = await api.me();
          await saveAuthSession({ token: session.token, user: freshUser });
          setUser(freshUser);
        } catch {
          await clearAuthSession();
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      async login(username, password) {
        const session = await api.login(username, password);
        await saveAuthSession(session);
        setUser(session.user);
      },
      async logout() {
        await clearAuthSession();
        setUser(null);
      },
      hasRole(...roles) {
        if (!user) return false;
        return user.role === "super_admin" || roles.includes(user.role);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
