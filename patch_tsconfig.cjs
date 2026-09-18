const fs = require('fs');
let file = fs.readFileSync('tsconfig.json', 'utf8');

if (!file.includes('vite-plugin-pwa/client')) {
    const typesRegex = /"types":\s*\[/;
    if (typesRegex.test(file)) {
        file = file.replace(typesRegex, `"types": ["vite-plugin-pwa/client", `);
    } else {
        file = file.replace(
            '"compilerOptions": {',
            '"compilerOptions": {\n    "types": ["vite/client", "vite-plugin-pwa/client"],'
        );
    }
    fs.writeFileSync('tsconfig.json', file);
}
