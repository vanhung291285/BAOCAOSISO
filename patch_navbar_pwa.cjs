const fs = require('fs');
let file = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

if (!file.includes('PWAInstallButton')) {
    file = file.replace(
        "import { QuickUserSwitcher } from './QuickUserSwitcher';",
        "import { QuickUserSwitcher } from './QuickUserSwitcher';\nimport { PWAInstallButton } from './PWAInstallButton';"
    );

    file = file.replace(
        "{isAdmin && <QuickUserSwitcher />}",
        "<PWAInstallButton />\n            {isAdmin && <QuickUserSwitcher />}"
    );

    fs.writeFileSync('src/components/Navbar.tsx', file);
}
