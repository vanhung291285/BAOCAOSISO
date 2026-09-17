const fs = require('fs');
let file = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

// Find where state is initialized
file = file.replace(
  "const [selectedCampus, setSelectedCampus] = useState<string>('all');",
  `const [selectedCampus, setSelectedCampus] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });`
);

// We need to also hook an effect so that if isGVCN / currentUser loads later, we update it.
// Actually, currentUser is loaded before rendering DashboardPage (App.tsx only renders routes if !loading and currentUser exists).
// But let's add an effect just in case. Or useMemo.
// Let's also patch DailyReportPage.tsx.

fs.writeFileSync('src/pages/DashboardPage.tsx', file);
