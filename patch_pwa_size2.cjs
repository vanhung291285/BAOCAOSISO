const fs = require('fs');
let file = fs.readFileSync('vite.config.ts', 'utf8');

file = file.replace(
    /workbox: \{\s*globPatterns: \['\*\*\/\*\.\{js,css,html,ico,png,svg,woff,woff2\}'\]\s*\},\s*devOptions:/,
    `workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions:`
);

fs.writeFileSync('vite.config.ts', file);
