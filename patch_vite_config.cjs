const fs = require('fs');
let file = fs.readFileSync('vite.config.ts', 'utf8');

if (!file.includes('VitePWA')) {
    file = file.replace(
        "import react from '@vitejs/plugin-react';",
        "import react from '@vitejs/plugin-react';\nimport { VitePWA } from 'vite-plugin-pwa';"
    );

    const pluginsRegex = /plugins:\s*\[react\(\),\s*tailwindcss\(\)\]/;
    file = file.replace(pluginsRegex, `plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Báo cáo Sĩ số',
          short_name: 'Báo cáo',
          description: 'Hệ thống báo cáo sĩ số trường học',
          theme_color: '#1e40af',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      })
    ]`);
    
    fs.writeFileSync('vite.config.ts', file);
}
