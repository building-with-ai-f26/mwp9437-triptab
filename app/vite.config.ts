import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  test: {
    // Live tests hit the real Supabase project; they run with `npm run test:rls`, not `npm test`.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
