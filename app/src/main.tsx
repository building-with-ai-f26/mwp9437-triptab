import { StrictMode, lazy, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { startAnalytics } from "./lib/analytics";
import { isConfigured } from "./lib/supabase";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";

const Trips = lazy(() => import("./pages/Trips"));
const NewTrip = lazy(() => import("./pages/NewTrip"));
const TripPage = lazy(() => import("./pages/TripPage"));
const Join = lazy(() => import("./pages/Join"));

startAnalytics();

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

function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/join/:token" element={<Join />} />
            <Route path="/trips" element={<RequireUser><Trips /></RequireUser>} />
            <Route path="/trips/new" element={<RequireUser><NewTrip /></RequireUser>} />
            <Route path="/trips/:id" element={<RequireUser><TripPage /></RequireUser>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
