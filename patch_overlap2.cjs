const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

file = file.replace(
    "className=\"text-[11px] font-bold text-blue-700 tracking-wide uppercase leading-tight whitespace-nowrap\"",
    "className=\"text-[11px] font-bold text-blue-700 tracking-wide uppercase leading-tight truncate\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
