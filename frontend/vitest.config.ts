import { defineConfig } from "vitest/config";

// ponytail: separate from vite.config.ts because the reactRouter plugin breaks under vitest
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
