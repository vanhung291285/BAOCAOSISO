const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

file = file.replace(
    "className=\"hidden xl:flex items-center gap-1 flex-shrink-0\"",
    "className=\"hidden xl:flex items-center gap-0.5 flex-shrink-0\""
);

file = file.replace(
    "className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${",
    "className={`flex items-center gap-1.5 px-2 2xl:px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${"
);

file = file.replace(
    "className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${",
    "className={`flex items-center gap-1.5 px-2 2xl:px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${"
);

fs.writeFileSync('src/components/Navbar.tsx', file);
