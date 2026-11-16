import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "vitest/config";

loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
