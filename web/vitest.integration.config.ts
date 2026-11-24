import { defineConfig } from 'vitest/config';

// integration tests against a running game server (HW_SERVER_BIN)
export default defineConfig({
  test: { include: ['test/**/*.integration.ts'], environment: 'node', testTimeout: 30000 },
});
