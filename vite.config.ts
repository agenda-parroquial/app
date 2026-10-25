import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Service worker propio (src/sw.ts): modo sin conexión + avisos push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': la app avisa cuando hay versión nueva y el usuario decide
      // cuándo recargar (así no se pierde un formulario a medio llenar).
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Agenda Parroquial',
        short_name: 'Agenda',
        description: 'Agenda de la parroquia: misas, sacramentos y eventos.',
        lang: 'es',
        theme_color: '#5b1a2b',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
});
