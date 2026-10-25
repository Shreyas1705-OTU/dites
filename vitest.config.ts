import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Unit tests live next to the code; tests/security holds attack tests
    // against the local stack. Playwright owns tests/e2e.
    include: ["src/**/*.test.ts", "tests/security/**/*.test.ts"],
  },
});
