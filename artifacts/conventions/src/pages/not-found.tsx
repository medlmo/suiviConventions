import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-full flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
      <h1 className="text-6xl font-black text-primary mb-4">404</h1>
      <h2 className="text-2xl font-bold text-foreground mb-2">Page introuvable</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Le document ou la page que vous cherchez n'existe pas ou a été déplacé.
      </p>
      <button 
        onClick={() => setLocation("/")}
        className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
      >
        Retour au tableau de bord
      </button>
    </div>
  );
}
