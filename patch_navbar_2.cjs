const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// The Left Brand section.
file = file.replace(
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-shrink xl:max-w-[35%] 2xl:max-w-[40%]\"",
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink-0 max-w-[200px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] xl:max-w-[500px]\""
);

// We need to make sure the text container inside it has min-w-0 so truncate works
file = file.replace(
    "className=\"flex flex-col justify-center min-w-0\"",
    "className=\"flex flex-col justify-center min-w-0 flex-1\""
);

// The Center Nav section.
// It should be able to shrink and overflow.
// flex-shrink min-w-0 flex-1 so it fills the middle but can shrink to 0.
file = file.replace(
    "className=\"hidden xl:flex items-center gap-1 flex-shrink min-w-0 overflow-x-auto no-scrollbar\"",
    "className=\"hidden xl:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar px-2\""
);

// The Right section.
file = file.replace(
    "className=\"flex items-center gap-2 flex-shrink-0 justify-end ml-auto\"",
    "className=\"flex items-center gap-2 flex-shrink-0\""
);

fs.writeFileSync('src/components/Navbar.tsx', file);
