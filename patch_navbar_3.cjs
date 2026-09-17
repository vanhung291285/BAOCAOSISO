const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// Use flex-shrink on mobile so it doesn't overflow, but xl:flex-shrink-0 so it holds its ground against the nav.
file = file.replace(
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink-0 max-w-[200px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] xl:max-w-[500px]\"",
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink xl:flex-shrink-0 max-w-[200px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] xl:max-w-[500px] min-w-0\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
