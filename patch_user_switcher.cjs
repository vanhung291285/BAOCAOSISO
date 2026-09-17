const fs = require('fs');
let file = fs.readFileSync('src/components/QuickUserSwitcher.tsx', 'utf8');

file = file.replace(
    "truncate max-w-[130px]",
    "truncate max-w-[200px] 2xl:max-w-[250px]"
);

fs.writeFileSync('src/components/QuickUserSwitcher.tsx', file);
