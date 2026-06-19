import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser } from "@blex/shared";

export type AuthSession = {
  token: string;
  user: AuthUser;
};

const STORAGE_KEY = "blex.auth";

export async function loadAuthSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<AuthSession>;
    if (!session.token || !session.user) return null;
    return session as AuthSession;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function saveAuthSession(session: AuthSession) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function clearAuthSession() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function getAuthToken() {
  return (await loadAuthSession())?.token ?? null;
}
