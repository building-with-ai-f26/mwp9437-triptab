import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Which build this is (C57, Mike's call 11/24). Each build gets its own id, baked into the app as
 * __BUILD_ID__ and written to version.json beside it. A tab left open asks for version.json now and
 * then; a different id means triptab.org has been updated, and the app offers a reload. The dev
 * server answers version.json too, so the click-through can check the note.
 */
function buildVersion(): Plugin {
  const id = Date.now().toString(36);
  return {
    name: "triptab-build-version",
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(id) } }),
    configureServer(server) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ id }));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id }) });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), buildVersion()],
  server: { port: 5173 },
  test: {
    // Live tests hit the real Supabase project; they run with `npm run test:rls`, not `npm test`.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
