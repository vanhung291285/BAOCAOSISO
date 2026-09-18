const fs = require('fs');
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
    'className="min-h-screen bg-slate-100/80 flex flex-col font-sans antialiased text-slate-800 selection:bg-blue-600 selection:text-white pb-16 sm:pb-0"',
    'className="min-h-[100dvh] bg-slate-100/80 flex flex-col font-sans antialiased text-slate-800 selection:bg-blue-600 selection:text-white pb-[calc(env(safe-area-inset-bottom)+4rem)] sm:pb-0"'
);

fs.writeFileSync('src/App.tsx', file);
