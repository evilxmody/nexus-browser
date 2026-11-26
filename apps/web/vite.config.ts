import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Set BASE_PATH=/<repo-name>/ when building for GitHub Pages (the workflow does this). Locally it stays '/'.
declare const process: { env: Record<string, string | undefined> };
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NEXUS Browser', short_name: 'NEXUS',
        description: 'A gesture-first browser interface.',
        theme_color: '#07080a', background_color: '#07080a',
        display: 'standalone', start_url: base, scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,svg,png}'] },
    }),
  ],
  server: { host: true },
});
