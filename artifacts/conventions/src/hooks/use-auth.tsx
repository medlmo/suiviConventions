import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Role = "admin" | "directeur" | "directeur_general_services" | "chef_division" | "chef_service";
export type User = { id: number; username: string; role: Role; direction: string | null; division: string | null; service: string | null; active: boolean };
export type AdminUser = User & { lastLoginAt: string | null };
export const roleLabels: Record<Role, string> = {
  admin: "Administrateur", directeur: "Directeur", directeur_general_services: "Directeur Général des Services",
  chef_division: "Chef de division", chef_service: "Chef de service",
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init, credentials: "include",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/me") window.dispatchEvent(new Event("conventions-session-expired"));
    let message = "";
    try {
      const body = await response.json();
      message = body.message || body.error || "";
    } catch { /* The response may not contain JSON. */ }
    throw new ApiError(response.status, message || `Erreur ${response.status}`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Votre session a expiré. Veuillez vous reconnecter.";
    if (error.status === 403) return "Vous n'avez pas accès à cette opération.";
    if (error.status === 409) return "Cette donnée a changé depuis son ouverture. Actualisez avant de réessayer.";
    return error.message;
  }
  return "Le serveur est momentanément indisponible. Réessayez.";
}

type AuthContextValue = { user: User | null; setUser: (user: User) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  useEffect(() => {
    const expire = () => {
      void (async () => {
        await client.cancelQueries();
        client.removeQueries({ predicate: query => query.queryKey[0] !== "auth" });
        client.setQueryData(["auth", "me"], null);
      })();
    };
    window.addEventListener("conventions-session-expired", expire);
    return () => window.removeEventListener("conventions-session-expired", expire);
  }, [client]);
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try { return await api<User>("/auth/me"); }
      catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
    },
    retry: false, staleTime: 30_000, refetchOnWindowFocus: true,
  });
  const setUser = async (user: User) => {
    await client.cancelQueries();
    client.removeQueries({ predicate: query => query.queryKey[0] !== "auth" });
    client.setQueryData(["auth", "me"], user);
  };
  const logout = async () => {
    try { await api<void>("/auth/logout", { method: "POST" }); }
    catch { /* A failed network logout must not leave protected cached data visible. */ }
    finally {
      await client.cancelQueries();
      client.removeQueries({ predicate: query => query.queryKey[0] !== "auth" });
      client.setQueryData(["auth", "me"], null);
    }
  };
  if (query.isPending) return <div className="min-h-[100dvh] bg-background p-8" aria-label="Chargement de la session"><div className="mx-auto max-w-5xl animate-pulse space-y-6"><div className="h-14 w-64 rounded bg-muted" /><div className="h-40 rounded bg-muted" /><div className="h-64 rounded bg-muted" /></div></div>;
  if (query.isError) return <div className="min-h-[100dvh] bg-background grid place-items-center p-6"><div className="bg-card border rounded-xl p-8 max-w-md space-y-4"><h1 className="text-xl font-bold">Connexion au serveur impossible</h1><p className="text-muted-foreground">{errorMessage(query.error)}</p><button className="text-primary underline" onClick={() => void query.refetch()}>Réessayer</button></div></div>;
  return <AuthContext.Provider value={{ user: query.data ?? null, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider manquant");
  return value;
}

export function canEditConvention(user: User, convention?: { rattachement?: string | null; responsableProjet?: string | null }): boolean {
  if (user.role === "admin") return true;
  if (user.role === "directeur" || user.role === "directeur_general_services") return false;
  if (!convention) return true;
  if (user.role === "chef_division") return !!user.division && convention.rattachement === user.division;
  return !!user.division && !!user.service && convention.rattachement === user.division && convention.responsableProjet === user.service;
}