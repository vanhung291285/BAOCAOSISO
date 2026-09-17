const fs = require('fs');
let file = fs.readFileSync('src/components/QuickUserSwitcher.tsx', 'utf8');

file = file.replace(
    "truncate max-w-[200px] 2xl:max-w-[250px]",
    "truncate max-w-[100px] xl:max-w-[120px] 2xl:max-w-[200px]"
);

fs.writeFileSync('src/components/QuickUserSwitcher.tsx', file);
