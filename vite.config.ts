import { defineConfig } from "vitest/config";

// Vite config doubles as the Vitest config. Tauri-friendly dev server settings
// (fixed port, no clearing the screen so Rust logs stay visible).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Tauri expects a relative base and a predictable build target.
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
