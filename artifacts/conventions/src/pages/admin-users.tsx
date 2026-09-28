import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, KeyRound, UserRound, Shield, Search } from "lucide-react";
import { api, errorMessage, roleLabels, type Role, type User, useAuth } from "@/hooks/use-auth";
import { organisation } from "@/lib/organisation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type FormData = { username: string; password: string; role: Role; direction: string; division: string; service: string };
const blank: FormData = { username: "", password: "", role: "chef_service", direction: "", division: "", service: "" };
const roles: Role[] = ["admin", "directeur", "chef_division", "chef_service"];
const field = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function AdminUsers() {
  const { user: current } = useAuth();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<User[]>("/admin/users"), staleTime: 15_000 });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [password, setPassword] = useState("");
  const [form, setForm] = useState<FormData>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const direction = organisation.find(item => item.direction === form.direction);
  const division = direction?.divisions.find(item => item.nom === form.division);
  const visible = query.data?.filter(item => `${item.username} ${roleLabels[item.role]} ${item.division ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function begin(user?: User) {
    setEditing(user ?? null);
    setForm(user ? { username: user.username, password: "", role: user.role, direction: user.direction ?? "", division: user.division ?? "", service: user.service ?? "" } : blank);
    setError(""); setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const scope = form.role === "admin" ? { direction: null, division: null, service: null }
      : form.role === "directeur" ? { direction: form.direction || null, division: null, service: null }
      : form.role === "chef_division" ? { direction: form.direction || null, division: form.division || null, service: null }
      : { direction: form.direction || null, division: form.division || null, service: form.service || null };
    try {
      if (editing) await api<User>(`/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify({ username: form.username.trim(), role: form.role, ...scope }) });
      else await api<User>("/admin/users", { method: "POST", body: JSON.stringify({ username: form.username.trim(), password: form.password, role: form.role, ...scope }) });
      setOpen(false); await client.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function toggle(user: User) {
    if (user.id === current?.id || !window.confirm(`${user.active ? "Désactiver" : "Réactiver"} le compte ${user.username} ?`)) return;
    setBusy(true); setError("");
    try { await api<User>(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) }); await client.invalidateQueries({ queryKey: ["admin", "users"] }); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); if (!passwordFor) return;
    setBusy(true); setError("");
    try { await api<void>(`/admin/users/${passwordFor.id}/password`, { method: "POST", body: JSON.stringify({ password }) }); setPasswordFor(null); setPassword(""); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 pb-12">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-widest text-secondary">Administration / accès</span><h1 className="text-3xl font-semibold mt-2">Utilisateurs</h1><p className="text-muted-foreground mt-1">Gérez les comptes et leurs périmètres de travail.</p></div><Button onClick={() => begin()}><Plus className="w-4 h-4 mr-2" /> Nouveau compte</Button></div>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input aria-label="Rechercher un utilisateur" placeholder="Rechercher un compte…" className="pl-9 bg-card" value={search} onChange={event => setSearch(event.target.value)} /></div>
    {error && !open && !passwordFor && <p role="alert" className="text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">{error}</p>}
    {query.isPending ? <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      : query.isError ? <Card><CardContent className="py-10 text-center"><p role="alert">{errorMessage(query.error)}</p><Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>Réessayer</Button></CardContent></Card>
      : visible?.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground"><UserRound className="mx-auto mb-4 w-9 h-9 text-secondary" />{search ? "Aucun compte ne correspond à votre recherche." : "Aucun compte pour le moment."}</CardContent></Card>
      : <div className="border rounded-xl bg-card divide-y overflow-hidden">{visible?.map(user => <div key={user.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex gap-4 flex-1 min-w-0"><div className="rounded-lg bg-accent text-primary w-11 h-11 shrink-0 grid place-items-center"><Shield className="w-5 h-5" /></div><div className="min-w-0"><div className="font-semibold flex flex-wrap items-center gap-2">{user.username}<span className={`text-xs rounded-full px-2 py-0.5 ${user.active ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{user.active ? "Actif" : "Inactif"}</span></div><div className="text-sm text-muted-foreground">{roleLabels[user.role]}{user.division ? ` · ${user.division}` : user.direction ? ` · ${user.direction}` : ""}{user.service ? ` · ${user.service}` : ""}</div></div></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => begin(user)}><Pencil className="w-3.5 h-3.5 mr-2" /> Modifier</Button><Button size="sm" variant="outline" onClick={() => { setError(""); setPassword(""); setPasswordFor(user); }}><KeyRound className="w-3.5 h-3.5 mr-2" /> Mot de passe</Button><Button size="sm" variant="ghost" disabled={busy || user.id === current?.id} onClick={() => void toggle(user)}>{user.active ? "Désactiver" : "Réactiver"}</Button></div>
      </div>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Modifier le compte" : "Nouveau compte"}</DialogTitle><DialogDescription>Définissez le rôle et le périmètre de l'utilisateur.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5"><label htmlFor="account-name" className="text-sm font-medium">Nom d'utilisateur</label><Input id="account-name" autoComplete="off" required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></div>
      {!editing && <div className="space-y-1.5"><label htmlFor="account-password" className="text-sm font-medium">Mot de passe initial</label><Input id="account-password" type="password" autoComplete="new-password" required value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></div>}
      <div className="space-y-1.5"><label htmlFor="account-role" className="text-sm font-medium">Rôle</label><select id="account-role" className={field} value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></div>
      {form.role !== "admin" && <div className="space-y-1.5"><label htmlFor="account-direction" className="text-sm font-medium">Direction</label><select id="account-direction" className={field} required value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value, division: "", service: "" })}><option value="">Choisir une direction</option>{organisation.map(item => <option key={item.direction} value={item.direction}>{item.direction}</option>)}</select></div>}
      {(form.role === "chef_division" || form.role === "chef_service") && <div className="space-y-1.5"><label htmlFor="account-division" className="text-sm font-medium">Division</label><select id="account-division" className={field} required value={form.division} onChange={event => setForm({ ...form, division: event.target.value, service: "" })}><option value="">Choisir une division</option>{direction?.divisions.map(item => <option key={item.nom} value={item.nom}>{item.nom}</option>)}</select></div>}
      {form.role === "chef_service" && <div className="space-y-1.5"><label htmlFor="account-service" className="text-sm font-medium">Service</label><select id="account-service" className={field} required value={form.service} onChange={event => setForm({ ...form, service: event.target.value })}><option value="">Choisir un service</option>{division?.services.map(item => <option key={item} value={item}>{item}</option>)}</select></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button disabled={busy} type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</Button></div>
    </form></DialogContent></Dialog>
    <Dialog open={!!passwordFor} onOpenChange={open => { if (!open) setPasswordFor(null); }}><DialogContent><DialogHeader><DialogTitle>Changer le mot de passe</DialogTitle><DialogDescription>Nouveau mot de passe pour {passwordFor?.username}.</DialogDescription></DialogHeader><form onSubmit={changePassword} className="space-y-4"><label htmlFor="new-password" className="text-sm font-medium">Nouveau mot de passe</label><Input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPasswordFor(null)}>Annuler</Button><Button disabled={busy} type="submit">Mettre à jour</Button></div></form></DialogContent></Dialog>
  </div>;
}