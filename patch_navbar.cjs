const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// Replace the main flex container
file = file.replace(
    "className=\"flex items-center h-16 gap-2 xl:gap-4 w-full\"",
    "className=\"flex items-center justify-between h-16 gap-2 xl:gap-4 w-full\""
);

// Left: remove flex-1, use flex-shrink and a max-width so it can grow to fit text, but not exceed a certain percentage.
// And min-w-0 ensures it truncates if constrained.
file = file.replace(
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-1\"",
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-shrink xl:max-w-[35%] 2xl:max-w-[40%]\""
);

// Right: remove flex-1, use ml-auto just in case, though justify-between handles it if nav is missing.
file = file.replace(
    "className=\"flex items-center gap-2 flex-shrink-0 justify-end flex-1\"",
    "className=\"flex items-center gap-2 flex-shrink-0 justify-end ml-auto\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
