const fs = require('fs');
let file = fs.readFileSync('src/pages/ChartsPage.tsx', 'utf8');

// Also make sure useAuth is imported.
if (!file.includes('import { useAuth }')) {
    file = file.replace(
        "import { useSchool } from '../contexts/SchoolContext';",
        "import { useSchool } from '../contexts/SchoolContext';\nimport { useAuth } from '../contexts/AuthContext';"
    );
    fs.writeFileSync('src/pages/ChartsPage.tsx', file);
}
