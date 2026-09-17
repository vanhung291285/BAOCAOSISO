const fs = require('fs');
let file = fs.readFileSync('src/pages/MonthlyReportPage.tsx', 'utf8');

// Ensure useAuth is imported
if (!file.includes('useAuth')) {
    file = file.replace(
        "import { useSchool } from '../contexts/SchoolContext';",
        "import { useSchool } from '../contexts/SchoolContext';\nimport { useAuth } from '../contexts/AuthContext';"
    );
}

// Add classes to useSchool and get useAuth
file = file.replace(
    "const { settings, campuses, classes } = useSchool();",
    "const { settings, campuses, classes } = useSchool();\n  const { isGVCN, currentUser } = useAuth();"
);

// Fallback if classes wasn't already in useSchool
if (!file.includes('const { isGVCN')) {
    file = file.replace(
        "const { settings, campuses } = useSchool();",
        "const { settings, campuses, classes } = useSchool();\n  const { isGVCN, currentUser } = useAuth();"
    );
}

// Update selectedCampusId initial state
file = file.replace(
    "const [selectedCampusId, setSelectedCampusId] = useState<string>('all');",
    `const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });`
);

fs.writeFileSync('src/pages/MonthlyReportPage.tsx', file);
