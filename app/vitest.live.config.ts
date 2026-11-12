import { defineConfig, loadEnv } from "vite";

// Live tests: run against the real Supabase project in app/.env.local (`npm run test:rls`).
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
