import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout';
import Dashboard from '@/pages/dashboard';
import ConventionsList from '@/pages/conventions-list';
import ConventionCreate from '@/pages/convention-create';
import ConventionDetail from '@/pages/convention-detail';
import SignIn from '@/pages/sign-in';
import AdminUsers from '@/pages/admin-users';
import AdminJournal from '@/pages/admin-journal';
import AdminReferentiel from '@/pages/admin-referentiel';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if ((error as { status?: number }).status === 401) window.dispatchEvent(new Event('conventions-session-expired'));
    },
  }),
  defaultOptions: { queries: { retry: (count, error) => (error as { status?: number }).status !== 401 && count < 1 } },
});

function Router() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  useEffect(() => { if (user && location === '/sign-in') navigate('/'); }, [user, location, navigate]);
  if (!user) return <SignIn />;
  if (location === '/sign-in') return null;
  const adminRoute = location.startsWith('/admin');
  if (adminRoute && user.role !== 'admin') return <div className="min-h-[100dvh] grid place-items-center bg-background"><div className="bg-card border rounded-xl p-8 text-center"><h1 className="text-xl font-bold">Accès réservé</h1><p className="text-muted-foreground mt-2">Cette section est réservée aux administrateurs.</p><Button className="mt-5" onClick={() => navigate('/')}>Retour au tableau de bord</Button></div></div>;
  if (location === '/conventions/nouvelle' && (user.role === 'directeur' || user.role === 'directeur_general_services')) return <div className="min-h-[100dvh] grid place-items-center bg-background"><div className="bg-card border rounded-xl p-8 text-center"><h1 className="text-xl font-bold">Consultation uniquement</h1><p className="text-muted-foreground mt-2">Votre compte ne peut pas créer de convention.</p><Button className="mt-5" onClick={() => navigate('/conventions')}>Voir les conventions</Button></div></div>;
  return (
    <AppLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/conventions" component={ConventionsList} />
          <Route path="/conventions/nouvelle" component={ConventionCreate} />
          <Route path="/conventions/:id" component={ConventionDetail} />
          <Route path="/admin/utilisateurs" component={AdminUsers} />
          <Route path="/admin/referentiel" component={AdminReferentiel} />
          <Route path="/admin/journal" component={AdminJournal} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppLayout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider><Router /></AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
