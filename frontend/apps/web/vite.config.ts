import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5175,
    // Same-origin /api in dev (VITE_MILESTONES_BASE_URL defaults to "/api"), Better Auth's /api/auth included, so cookies just work.
    proxy: { "/api": { target: "http://localhost:3010" } },
  },
});
