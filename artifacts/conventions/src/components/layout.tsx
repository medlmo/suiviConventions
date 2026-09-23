import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, PlusCircle, Settings, LogOut, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { name: "Toutes les conventions", href: "/conventions", icon: FileText },
  { name: "Nouvelle convention", href: "/conventions/nouvelle", icon: PlusCircle },
];

function estNavigationActive(location: string, href: string): boolean {
  if (location === href) return true;
  if (href === "/") return false;

  // « Nouvelle convention » est une route distincte de la liste, même si son
  // chemin commence par « /conventions ». Les autres sous-pages, notamment
  // les fiches de détail, restent rattachées à la liste.
  return location.startsWith(`${href}/`) && location !== "/conventions/nouvelle";
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex w-72 flex-col bg-sidebar border-r border-sidebar-border shadow-xl z-10">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar/50">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white font-bold text-lg leading-none">SM</span>
          </div>
          <h1 className="text-sidebar-foreground font-bold tracking-tight text-lg">
            Souss-Massa
          </h1>
        </div>
        
        <div className="px-6 py-4">
          <div className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-4">
            Suivi des conventions
          </div>
          
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = estNavigationActive(location, item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary" : "opacity-70")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-sidebar-border/50">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/70">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center border border-sidebar-border text-xs font-medium">
              AZ
            </div>
            <div>
              <p className="font-medium text-sidebar-foreground">Agent Région</p>
              <p className="text-xs opacity-70">Direction Générale</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 lg:px-8 shadow-sm z-10 shrink-0">
          <div className="md:hidden flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar border-sidebar-border p-0">
                <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar/50">
                  <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center mr-3 shadow-sm">
                    <span className="text-white font-bold text-lg leading-none">SM</span>
                  </div>
                  <h1 className="text-sidebar-foreground font-bold tracking-tight text-lg">
                    Souss-Massa
                  </h1>
                </div>
                
                <div className="px-6 py-4">
                  <div className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-4">
                    Suivi des conventions
                  </div>
                  
                  <nav className="space-y-1">
                    {navigation.map((item) => {
                      const isActive = estNavigationActive(location, item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary" : "opacity-70")} />
                          {item.name}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">SM</span>
            </div>
          </div>
          
          <div className="hidden md:block">
            <h2 className="text-lg font-semibold text-foreground">
              {navigation.find(n => estNavigationActive(location, n.href))?.name || "Détail"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
            <div className="h-6 w-px bg-border"></div>
            <span className="text-sm font-medium text-muted-foreground">Poste de Pilotage</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-auto bg-background p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
