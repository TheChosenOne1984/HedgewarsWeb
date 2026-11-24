import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    // the engine module (public/engine/hwengine.mjs) is loaded at run time, not bundled
    rollupOptions: { external: [/\/engine\/hwengine\.mjs$/] },
  },
  server: {
    // dev: proxy the game server's WebSocket listener
    proxy: { '/ws': { target: 'ws://localhost:46632', ws: true } },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
