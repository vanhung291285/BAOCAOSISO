const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// 1. Remove class name from 'Báo cáo sĩ số' to save space
file = file.replace(
    "label: isGVCN ? `Báo cáo sĩ số ${assignedClass ? `(${assignedClass.class_name})` : ''}` : 'Báo cáo sĩ số',",
    "label: 'Báo cáo sĩ số',"
);

// 2. Reduce gaps and paddings in the container
file = file.replace(
    "className=\"flex items-center justify-between h-16 gap-1.5 sm:gap-4\"",
    "className=\"flex items-center justify-between h-16 gap-2 xl:gap-1 2xl:gap-4\""
);

// 3. Make School Brand shrinkable and use truncate
file = file.replace(
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink-0\"",
    "className=\"flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink-0 xl:flex-shrink min-w-0\""
);
file = file.replace(
    "className=\"text-xs sm:text-sm lg:text-base font-black text-slate-900 tracking-tight leading-snug whitespace-nowrap\"",
    "className=\"text-xs sm:text-sm lg:text-base font-black text-slate-900 tracking-tight leading-snug whitespace-nowrap truncate xl:max-w-[200px] 2xl:max-w-none\""
);

// 4. Update Desktop Navigation Links paddings and text sizes
file = file.replace(
    "className=\"hidden xl:flex items-center gap-0.5 flex-shrink-0\"",
    "className=\"hidden xl:flex items-center gap-0.5 xl:gap-0 2xl:gap-1 flex-shrink-0\""
);

file = file.replace(
    /className=\{\`flex items-center gap-1\.5 px-2 2xl:px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 \$\{/g,
    "className={`flex items-center gap-1 xl:gap-1.5 px-1.5 2xl:px-3 py-2 rounded-lg text-[11px] 2xl:text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${"
);

file = file.replace(
    /className=\{\`flex items-center gap-1\.5 px-2 2xl:px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 \$\{/g,
    "className={`flex items-center gap-1 xl:gap-1.5 px-1.5 2xl:px-3 py-2 rounded-lg text-[11px] 2xl:text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${"
);

fs.writeFileSync('src/components/Navbar.tsx', file);
