const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// The newly moved block starts with `{isAdmin && (\n              <div className="relative group">`
// We need to add `hidden xl:block` to it.
file = file.replace(
    /\{isAdmin && \(\s*<div className="relative group">/,
    `{isAdmin && (
              <div className="relative group hidden xl:block">`
);

fs.writeFileSync('src/components/Navbar.tsx', file);
