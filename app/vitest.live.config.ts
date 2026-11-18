import { defineConfig, loadEnv } from "vite";

// Live tests: run against the Supabase project in app/.env.local, which is TripTab dev (`npm run test:rls`).
// In GitHub Actions the same values come from .github/workflows/ci.yml.
// They create throwaway accounts named rls-<run>-<who>@example.com and delete their trips after.
export default defineConfig(({ mode }) => ({
  test: {
    include: ["src/**/*.live.test.ts"],
    env: loadEnv(mode, process.cwd(), "VITE_"),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
}));
