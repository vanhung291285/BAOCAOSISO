const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

file = file.replace(
    'className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs no-print"',
    'className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs no-print pt-[env(safe-area-inset-top)]"'
);

fs.writeFileSync('src/components/Navbar.tsx', file);
