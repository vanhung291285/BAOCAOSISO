const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// Replace the main flex container
file = file.replace(
    "className=\"flex items-center justify-between h-16 gap-2 xl:gap-1 2xl:gap-4\"",
    "className=\"flex items-center h-16 gap-2 xl:gap-4 w-full\""
);

// Left: flex-1 so it takes space and pushes center, but can shrink
file = file.replace(
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink-0 xl:flex-shrink min-w-0\"",
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-1\""
);

// Center: nav. Give it a wrapper that can shrink if needed, or just let it shrink
file = file.replace(
    "className=\"hidden xl:flex items-center gap-0.5 xl:gap-0 2xl:gap-1 flex-shrink-0\"",
    "className=\"hidden xl:flex items-center gap-1 flex-shrink min-w-0 overflow-x-auto no-scrollbar\""
);

// Right: flex-1 so it balances the left, with justify-end
file = file.replace(
    "className=\"flex items-center gap-2 flex-shrink-0\"",
    "className=\"flex items-center gap-2 flex-shrink-0 justify-end flex-1\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
