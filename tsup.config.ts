// Production build: bundles src/server.ts into dist/server.js.
// npm packages stay external and are loaded from node_modules at runtime.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
});
