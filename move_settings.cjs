const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

const settingsBlockRegex = /\{isAdmin && \(\s*<div className="relative group">[\s\S]*?<Database className="w-3\.5 h-3\.5 text-blue-600" \/>\s*<span className="font-bold">Đồng bộ Supabase Cloud<\/span>\s*<\/button>\s*<\/div>\s*<\/div>\s*\)\}/;

const match = file.match(settingsBlockRegex);
if (!match) throw new Error("Could not find settings block");

const settingsCode = match[0];

// Remove it from the nav
file = file.replace(settingsCode, '');

// Insert it before QuickUserSwitcher
const rightSectionRegex = /\{\/\* User profile & Quick Switcher \*\/\}\s*<div className="flex items-center gap-2 flex-shrink-0">/;
file = file.replace(rightSectionRegex, `{/* User profile & Quick Switcher */}\n          <div className="flex items-center gap-2 flex-shrink-0">\n            ${settingsCode}`);

fs.writeFileSync('src/components/Navbar.tsx', file);
