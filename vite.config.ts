import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { geminiApiPlugin } from './server/apiPlugin.ts';

export default defineConfig(({ mode }) => {
  // Load all .env vars (no VITE_ prefix) for the server plugin only; nothing here reaches the client bundle.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react(), tailwindcss(), geminiApiPlugin(env)],
    worker: { format: 'es' },
    // Single-page demo: Recharts + embedded OSM geometry make one ~840 kB chunk; no code-splitting needed.
    build: { chunkSizeWarningLimit: 1000 },
  };
});
