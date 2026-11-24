import { Component, StrictMode, lazy, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { HASH_ROUTES } from "./lib/api";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { reportError, startAnalytics } from "./lib/analytics";
import { reloadOnStaleBuild } from "./lib/staleBuild";
import { isConfigured } from "./lib/supabase";
import { Spinner } from "./components/ui";
import { NewVersionNote } from "./components/NewVersion";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";

const Trips = lazy(() => import("./pages/Trips"));
const NewTrip = lazy(() => import("./pages/NewTrip"));
const TripPage = lazy(() => import("./pages/TripPage"));
const Join = lazy(() => import("./pages/Join"));
const PrintTrip = lazy(() => import("./pages/PrintTrip"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Privacy = lazy(() => import("./pages/Privacy"));
const ConfirmEmail = lazy(() => import("./pages/ConfirmEmail"));
const You = lazy(() => import("./pages/You"));
const Guide = lazy(() => import("./pages/Guide"));

startAnalytics();
reloadOnStaleBuild();

const Router = HASH_ROUTES ? HashRouter : BrowserRouter;

/** Pages that need an account send you to sign in, then back. */
function RequireUser({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function NotConfigured() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-2 text-2xl font-bold">TripTab needs its Supabase settings</h1>
      <p className="text-muted-foreground">
        Create <code>app/.env.local</code> with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
        (see AGENTS.md), then restart <code>npm run dev</code>.
      </p>
    </main>
  );
}

/**
 * A page that crashes shows this instead of a blank screen, and the error goes to PostHog through
 * the same scrubbing as every other event (C48, Mike's call 11/23).
 */
class CrashScreen extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    reportError(error, "page");
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 p-8">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-foreground/80">That's on TripTab, not you. Reload to pick up where you were.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-full bg-foreground px-5 text-sm font-semibold text-white"
        >
          Reload
        </button>
      </main>
    );
  }
}

function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/join/:token" element={<Join />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/confirm-email" element={<ConfirmEmail />} />
            <Route path="/trips" element={<RequireUser><Trips /></RequireUser>} />
            <Route path="/you" element={<RequireUser><You /></RequireUser>} />
            <Route path="/trips/new" element={<RequireUser><NewTrip /></RequireUser>} />
            <Route path="/trips/:id" element={<RequireUser><TripPage /></RequireUser>} />
            <Route path="/trips/:id/print" element={<RequireUser><PrintTrip /></RequireUser>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <NewVersionNote />
      </Router>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
);
