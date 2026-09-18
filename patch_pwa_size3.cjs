const fs = require('fs');
let file = fs.readFileSync('vite.config.ts', 'utf8');

file = file.replace(
    "workbox: {",
    "workbox: {\n          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,"
);

fs.writeFileSync('vite.config.ts', file);
