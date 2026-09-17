const fs = require('fs');
let file = fs.readFileSync('src/pages/ChartsPage.tsx', 'utf8');

if (!file.includes('isGVCN =')) {
    file = file.replace(
        "const { settings, classes } = useSchool();",
        "const { settings, classes } = useSchool();\n  const { isGVCN, currentUser } = useAuth();"
    );
}

fs.writeFileSync('src/pages/ChartsPage.tsx', file);
