import { defineConfig, loadEnv } from "vite";

// The AI import eval (`npm run eval:import`): real calls to the deployed import-bookings
// function on TripTab dev, as a throwaway account, using the public values in app/.env.local. It costs real
// (small) money, so it is never part of `npm test`.
export default defineConfig(({ mode }) => ({
  test: {
    include: ["evals/**/*.eval.ts"],
    env: loadEnv(mode, process.cwd(), "VITE_"),
    testTimeout: 900_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
}));
