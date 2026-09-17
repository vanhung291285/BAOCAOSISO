const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

file = file.replace(
    "className=\"flex flex-col justify-center\"",
    "className=\"flex flex-col justify-center min-w-0\""
);

// Allow the title to shrink more elegantly instead of just hard truncate at 200px.
// We can use truncate but remove max-w since flex will handle it.
file = file.replace(
    "className=\"text-xs sm:text-sm lg:text-base font-black text-slate-900 tracking-tight leading-snug whitespace-nowrap truncate xl:max-w-[200px] 2xl:max-w-none\"",
    "className=\"text-xs sm:text-sm lg:text-base font-black text-slate-900 tracking-tight leading-snug truncate\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
