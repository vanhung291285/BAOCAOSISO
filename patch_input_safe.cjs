const fs = require('fs');
let file = fs.readFileSync('src/pages/AttendanceInputPage.tsx', 'utf8');

file = file.replace(
    'className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2.5 shadow-xl"',
    'className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 shadow-xl"'
);

fs.writeFileSync('src/pages/AttendanceInputPage.tsx', file);
