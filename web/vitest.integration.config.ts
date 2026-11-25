import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// integration tests against a running game server (HW_SERVER_BIN); the
// svelte plugin compiles the runes in *.svelte.ts modules
export default defineConfig({
  plugins: [svelte()],
  test: { include: ['test/**/*.integration.ts'], environment: 'node', testTimeout: 30000 },
});
