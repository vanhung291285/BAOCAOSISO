const fs = require('fs');
let file = fs.readFileSync('src/components/CampusSelector.tsx', 'utf8');

if (!file.includes('useAuth')) {
    file = file.replace(
        "import { useSchool } from '../contexts/SchoolContext';",
        "import { useSchool } from '../contexts/SchoolContext';\nimport { useAuth } from '../contexts/AuthContext';"
    );
}

file = file.replace(
    "const { settings, campuses } = useSchool();",
    "const { settings, campuses, classes } = useSchool();\n  const { isGVCN, currentUser } = useAuth();\n\n  // Determine locked campus for GVCN\n  const lockedCampusId = React.useMemo(() => {\n    if (isGVCN && currentUser?.assigned_class_id) {\n      const cls = classes.find(c => c.id === currentUser.assigned_class_id);\n      return cls?.campus_id || null;\n    }\n    return null;\n  }, [isGVCN, currentUser, classes]);"
);

// Filter campuses based on lock
file = file.replace(
    "const activeCampuses = campuses.filter((c) => c.active);",
    "const activeCampuses = campuses.filter((c) => c.active && (!lockedCampusId || c.id === lockedCampusId));"
);

// If lockedCampusId is set, do not render the "Toàn trường" button.
file = file.replace(
    "<button\n        type=\"button\"\n        onClick={() => onChange('all')}",
    "{!lockedCampusId && (\n      <button\n        type=\"button\"\n        onClick={() => onChange('all')}"
);

file = file.replace(
    "Toàn trường\n      </button>",
    "Toàn trường\n      </button>\n      )}"
);

fs.writeFileSync('src/components/CampusSelector.tsx', file);
