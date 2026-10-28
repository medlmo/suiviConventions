import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, ApiError, errorMessage, type User, useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignIn() {
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const authenticatedUser = await api<User>("/auth/login", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
      await setUser(authenticatedUser);
      navigate("/");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401 ? "Identifiant ou mot de passe incorrect." : errorMessage(cause));
      setPassword("");
    } finally { setPending(false); }
  }
  return <main className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,1.04fr)_minmax(440px,.96fr)] bg-background">
    <section className="auth-panel auth-grid text-sidebar-foreground min-h-[36dvh] lg:min-h-[100dvh] p-8 md:p-14 lg:p-20 flex flex-col justify-between overflow-hidden">
      <div className="flex items-center gap-4"><div className="bg-card rounded-lg p-1.5 w-14 h-14"><img src="/logo-crsm.png" alt="Emblème de la Région Souss-Massa" className="w-full h-full object-contain" /></div><div className="leading-tight"><strong className="block text-lg">Région Souss Massa</strong><span className="text-sm text-sidebar-foreground/65">Suivi des conventions</span></div></div>
      <div className="max-w-xl py-12 lg:py-0"><div className="w-14 h-1 bg-secondary mb-8" /><p className="uppercase tracking-[.22em] text-xs text-sidebar-foreground/65 mb-5">Suivi des conventions</p><p className="mt-6 text-base md:text-lg text-sidebar-foreground/75 leading-relaxed max-w-md">Un espace réservé aux équipes de la Région pour suivre les conventions, leurs échéances et les décisions qui comptent.</p></div>
      <div className="hidden lg:flex items-center gap-2 text-xs text-sidebar-foreground/55"><ShieldCheck className="w-4 h-4" /> Accès réservé aux comptes autorisés</div>
    </section>
    <section className="flex items-center justify-center p-6 md:p-14 lg:p-20"><div className="w-full max-w-[420px] py-8">
      <span className="text-secondary text-xs font-bold uppercase tracking-[.22em]">Accès sécurisé</span>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-4 text-foreground">Bienvenue.</h2>
      <p className="text-muted-foreground mt-3 mb-10">Connectez-vous avec votre identifiant.</p>
      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2"><label htmlFor="username" className="text-sm font-semibold">Nom d'utilisateur</label><Input id="username" autoComplete="username" autoCapitalize="none" required value={username} onChange={event => setUsername(event.target.value)} placeholder="Votre identifiant" className="h-12 bg-card" /></div>
        <div className="space-y-2"><label htmlFor="password" className="text-sm font-semibold">Mot de passe</label><div className="relative"><Input id="password" type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Votre mot de passe" className="h-12 pr-12 bg-card" /><button type="button" aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setVisible(!visible)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">{visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive p-3 text-sm">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full h-12 text-base justify-between px-5">{pending ? "Connexion en cours…" : "Se connecter"}<ArrowRight className="w-5 h-5" /></Button>
      </form>
      <div className="mt-12 pt-6 border-t text-xs text-muted-foreground flex items-center gap-2"><LockKeyhole className="w-4 h-4" /> Aucun accès public ni inscription libre.</div>
    </div></section>
  </main>;
}