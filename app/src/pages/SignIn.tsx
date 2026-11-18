import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Brand } from "../components/Brand";
import { PhotoFrame } from "../components/ui";
import { LANDING_PHOTO } from "../lib/photos";
import { useAuth } from "../lib/auth";
import { AuthForm } from "../components/AuthForm";

export default function SignIn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/trips";
  if (user) return <Navigate to={next} replace />;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PhotoFrame src={LANDING_PHOTO} tone="landing" />
      <header className="relative z-10 px-4 py-4 sm:px-6 sm:py-5">
        <Brand light />
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pb-10 pt-4 sm:justify-center">
        <div className="glass-card-readable w-full max-w-sm rounded-3xl p-6">
          <AuthForm
            initialMode={params.get("mode") === "sign-in" ? "sign-in" : "create"}
            onDone={() => navigate(next, { replace: true })}
            googleReturn={`/sign-in?next=${encodeURIComponent(next)}`}
          />
        </div>
        <Link to="/privacy" className="mt-4 text-xs font-medium text-white underline underline-offset-4 drop-shadow">
          How TripTab uses your data
        </Link>
      </main>
    </div>
  );
}
