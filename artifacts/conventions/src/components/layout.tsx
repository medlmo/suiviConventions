import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  LogOut,
  Menu,
  Users,
  History,
  FolderTree,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useAuth, roleLabels } from "@/hooks/use-auth";
import { useOperationsSnapshot, useServiceReadiness } from "@/hooks/use-operational-health";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notification-center";
import mosaicRibbon from "@/assets/mosaic-ribbon-reference.png";

const navigation = [
  { name: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { name: "Toutes les conventions", href: "/conventions", icon: FileText },
  {
    name: "Nouvelle convention",
    href: "/conventions/nouvelle",
    icon: PlusCircle,
  },
];

function estNavigationActive(location: string, href: string): boolean {
  if (location === href) return true;
  if (href === "/") return false;

  // « Nouvelle convention » est une route distincte de la liste, même si son
  // chemin commence par « /conventions ». Les autres sous-pages, notamment
  // les fiches de détail, restent rattachées à la liste.
  return (
    location.startsWith(`${href}/`) && location !== "/conventions/nouvelle"
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const readiness = useServiceReadiness();
  const operations = useOperationsSnapshot(user?.role === "admin");
  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };
  const items = navigation.filter(item => item.href !== "/conventions/nouvelle" || (user?.role !== "directeur" && user?.role !== "directeur_general_services"));
  const adminItems = user?.role === "admin" ? [
    { name: "Référentiel", href: "/admin/referentiel", icon: FolderTree },
    { name: "Utilisateurs", href: "/admin/utilisateurs", icon: Users },
    { name: "Journal des modifications", href: "/admin/journal", icon: History },
    { name: "État du service", href: "/admin/operations", icon: Activity },
  ] : [];
  const allItems = [...items, ...adminItems];
  const account = <div className="border-t border-sidebar-border p-4 mt-auto">
    <div className="px-3 py-2 text-sidebar-foreground"><div className="font-semibold truncate">{user?.username}</div><div className="text-xs text-sidebar-foreground/60">{user ? roleLabels[user.role] : ""}</div></div>
    <button type="button" onClick={() => void handleLogout()} className="w-full text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md px-3 py-2.5 flex items-center gap-3 text-sm"><LogOut className="w-4 h-4" /> Se déconnecter</button>
  </div>;

  return (
    <div className="fixed inset-0 flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex w-72 flex-col bg-sidebar border-r border-sidebar-border shadow-xl z-10">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar/50">
          <h1 className="text-sidebar-foreground font-bold tracking-tight text-base">
            Suivi des conventions
          </h1>
        </div>

        <div className="px-6 py-4">
          <nav className="space-y-1">
            {allItems.map((item) => {
              const isActive = estNavigationActive(location, item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5",
                      isActive ? "text-sidebar-primary" : "opacity-70",
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex-1 min-h-48 flex items-center justify-center px-6 py-8">
          <img
            src="/logo-crsm-blanc.png"
            alt="Région Souss Massa"
            className="w-44 max-h-72 object-contain opacity-95"
          />
        </div>
        {account}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* Top Header */}
        <header
          className="h-16 border-b border-border flex items-center justify-between px-6 lg:px-8 shadow-sm z-10 shrink-0"
          style={{
            backgroundColor: "#fff",
            backgroundImage: `url(${mosaicRibbon})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="md:hidden flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 h-full bg-sidebar border-sidebar-border p-0 flex flex-col"
              >
                <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar/50">
                  <h1 className="text-sidebar-foreground font-bold tracking-tight text-base">
                    Suivi des conventions
                  </h1>
                </div>

                <div className="px-6 py-4 flex-1 min-h-0 flex flex-col">
                  <nav className="space-y-1">
                    {allItems.map((item) => {
                      const isActive = estNavigationActive(location, item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "w-5 h-5",
                              isActive ? "text-sidebar-primary" : "opacity-70",
                            )}
                          />
                          {item.name}
                        </Link>
                      );
                    })}
                  </nav>
                  <div className="flex-1 min-h-0 flex items-center justify-center py-2">
                    <img
                      src="/logo-crsm-blanc.png"
                      alt="Région Souss Massa"
                      className="w-20 max-h-24 object-contain opacity-95"
                    />
                  </div>
                  <div className="mt-auto shrink-0 border-t border-sidebar-border pt-4 text-sidebar-foreground">
                    <p className="px-3 text-sm font-semibold">{user?.username}</p><p className="px-3 text-xs opacity-60">{user ? roleLabels[user.role] : ""}</p>
                    <button type="button" onClick={() => void handleLogout()} className="mt-3 px-3 py-2 flex items-center gap-2 text-sm"><LogOut className="w-4 h-4" /> Se déconnecter</button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center shadow-sm overflow-hidden">
              <img
                src="/logo-crsm.png"
                alt="Logo de la Région Souss Massa"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <div className="hidden md:block">
            <h2 className="text-lg font-semibold text-foreground">
              {allItems.find((n) => estNavigationActive(location, n.href))
                ?.name || "Détail"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <NotificationCenter key={user?.id ?? "anonyme"} />
            <span className="text-xs text-muted-foreground hidden sm:inline">{user?.username} · {user ? roleLabels[user.role] : ""}</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 min-h-0 overflow-auto bg-background p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {(readiness.data?.status === "unavailable" || readiness.isError ||
              (user?.role === "admin" && (operations.data?.alerts.length ?? 0) > 0)) && <div
                className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
                  readiness.data?.status === "unavailable" || readiness.isError
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
                role="alert"
                aria-live="polite"
                data-testid="alert-service-status"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {readiness.data?.status === "unavailable"
                      ? "La base de données est temporairement indisponible."
                      : readiness.isError
                        ? "L’état du service ne peut pas être vérifié."
                        : operations.data?.alerts[0]?.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {readiness.data?.status === "unavailable"
                      ? "Certaines fonctions peuvent échouer. L’équipe d’administration est informée dans l’application."
                      : readiness.isError
                        ? "Réessayez dans quelques instants."
                        : operations.data?.alerts[0]?.description}
                  </p>
                </div>
                {user?.role === "admin" && <Link href="/admin/operations" className="shrink-0 text-sm font-medium text-primary underline">
                  Voir l’état du service
                </Link>}
              </div>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
