import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC emits the decorator metadata Nest DI needs (esbuild does not).
export default defineConfig({
  plugins: [swc.vite()],
  test: { globals: true, root: "./" },
});
