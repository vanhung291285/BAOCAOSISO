const fs = require('fs');
let file = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

file = file.replace(
`  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);`,
`  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const savedId = localStorage.getItem(CURRENT_USER_KEY);
      const rawUsers = localStorage.getItem('sso_profiles_v1');
      if (savedId && rawUsers) {
        const users = JSON.parse(rawUsers);
        const match = users.find((u: Profile) => u.id === savedId);
        if (match) return match;
      }
    } catch (err) {}
    return null;
  });
  
  const [allUsers, setAllUsers] = useState<Profile[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const rawUsers = localStorage.getItem('sso_profiles_v1');
      if (rawUsers) return JSON.parse(rawUsers);
    } catch (err) {}
    return [];
  });
  
  const [loading, setLoading] = useState(false);`
);

fs.writeFileSync('src/contexts/AuthContext.tsx', file);
console.log("Patched AuthContext!");
