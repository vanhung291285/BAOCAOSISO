const fs = require('fs');
let file = fs.readFileSync('src/contexts/SchoolContext.tsx', 'utf8');

file = file.replace(
`  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [activeYear, setActiveYear] = useState<SchoolYear | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [indicators, setIndicators] = useState<IndicatorGroup[]>([]);
  const [loading, setLoading] = useState(true);`,
`  const [settings, setSettings] = useState<SchoolSettings | null>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_settings_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return null;
  });
  const [years, setYears] = useState<SchoolYear[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_years_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [activeYear, setActiveYear] = useState<SchoolYear | null>(() => {
    if (typeof window !== 'undefined') {
      try { 
        const raw = localStorage.getItem('sso_school_years_v1'); 
        if (raw) {
          const arr = JSON.parse(raw);
          return arr.find((y: any) => y.is_active) || arr[0] || null;
        }
      } catch {}
    }
    return null;
  });
  const [campuses, setCampuses] = useState<Campus[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_campuses_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [classes, setClasses] = useState<ClassItem[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_classes_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [indicators, setIndicators] = useState<IndicatorGroup[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_indicator_groups_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(false);`
);

fs.writeFileSync('src/contexts/SchoolContext.tsx', file);
console.log("Patched SchoolContext!");
