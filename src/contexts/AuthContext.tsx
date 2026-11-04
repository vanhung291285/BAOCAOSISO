import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile } from '../types';
import { readCachedProfiles, StorageService, subscribeRealtime } from '../services/storage';

interface AuthContextType {
  currentUser: Profile | null;
  loading: boolean;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string, fallbackProfile?: Profile) => Promise<void>;
  updateCurrentProfile: (data: Partial<Profile>) => Promise<void>;
  allUsers: Profile[];
  reloadUsers: () => Promise<void>;
  isAdmin: boolean;
  isBGH: boolean;
  isGVCN: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'sso_active_auth_user_id_v2';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>(readCachedProfiles);

  // Set default loading to true to prevent rendering the admin dashboard during session restore validation
  const [loading, setLoading] = useState(true);

  const reloadUsers = async () => {
    try {
      const users = await StorageService.getProfiles();
      setAllUsers(users);

      const sessionId = sessionStorage.getItem(CURRENT_USER_KEY);
      const savedId = sessionId || localStorage.getItem(CURRENT_USER_KEY);
      if (!savedId) return;

      const match = users.find((user) => user.id === savedId);
      if (!match || match.active === false) {
        logout();
        return;
      }

      if (match.role === 'ADMIN' || match.role === 'BGH') {
        const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
        if (sessionId || isRemembered) {
          sessionStorage.setItem(CURRENT_USER_KEY, match.id);
          setCurrentUser(match);
          return;
        }
      } else if (sessionId && sessionStorage.getItem('sso_session_active') === 'true') {
        // Realtime updates may refresh the current teacher profile.
        setCurrentUser(match);
        return;
      }
      logout();
    } catch (err) {
      console.error('Error in reloadUsers:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    // Teachers sign in again when the app opens, as in the existing workflow.
    try {
      sessionStorage.removeItem('sso_session_active');
      localStorage.removeItem('sso_saved_admin_password');
      localStorage.removeItem('sso_saved_admin_creds');
    } catch {}
    reloadUsers().finally(() => {
      if (mounted) setLoading(false);
    });

    const unsubscribe = subscribeRealtime((event) => {
      if (
        event?.table === 'profiles' ||
        event?.table === 'classes' ||
        event?.table === 'all_reset' ||
        event?.table === 'all'
      ) {
        if (mounted) {
          reloadUsers();
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string): Promise<boolean> => {
    const cleanEmail = email.toLowerCase().trim();
    const isAdminAlias = ['admin@db.edu.vn', 'admin', 'admin@xadung.edu.vn'].includes(cleanEmail);
    const findProfile = (users: Profile[]) =>
      users.find((user) => user.email.toLowerCase() === cleanEmail) ||
      (isAdminAlias ? users.find((user) => user.role === 'ADMIN') : undefined);
    let found = findProfile(await StorageService.getProfiles());
    if (!found) {
      found = findProfile(await StorageService.refreshProfiles() ?? []);
    }
    if (found?.role === 'GVCN') return false;

    // Emergency fallback if admin is totally missing from database
    if (!found && isAdminAlias) {
      found = {
        id: 'u_admin_' + Date.now(),
        full_name: 'Quản trị viên Hệ thống',
        email: 'admin@db.edu.vn',
        role: 'ADMIN',
        active: true,
        phone: '',
        created_at: new Date().toISOString()
      };
      await StorageService.saveProfile(found);
    }

    if (found && found.active !== false) {
      setCurrentUser(found);
      saveSession(found);

      return true;
    }
    return false;
  };

  const saveSession = (profile: Profile) => {
    try {
      sessionStorage.setItem('sso_session_active', 'true');
      sessionStorage.setItem(CURRENT_USER_KEY, profile.id);
    } catch {}
    try {
      const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
      if ((profile.role === 'ADMIN' || profile.role === 'BGH') && isRemembered) {
        localStorage.setItem(CURRENT_USER_KEY, profile.id);
      } else {
        localStorage.removeItem(CURRENT_USER_KEY);
      }
    } catch {}
  };

  const logout = () => {
    setCurrentUser(null);
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch {}
    try {
      sessionStorage.removeItem(CURRENT_USER_KEY);
      sessionStorage.removeItem('sso_session_active');
    } catch {}
  };

  const switchUser = async (userId: string, fallbackProfile?: Profile) => {
    let users: Profile[] = [];
    try {
      users = await StorageService.getProfiles();
    } catch {
      users = allUsers;
    }

    let match = users.find((u) => u.id === userId);
    if (!match && fallbackProfile && fallbackProfile.id === userId) {
      match = fallbackProfile;
    }
    if (!match) {
      match = allUsers.find(
        (u) => u.id === userId || (u.role === 'GVCN' && u.assigned_class_id === userId)
      );
    }
    if (!match && fallbackProfile) {
      match = fallbackProfile;
    }

    if (!match) {
      // Create emergency GVCN profile if no match exists
      match = {
        id: userId,
        full_name: `GVCN (${userId})`,
        email: `gvcn_${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}@xadung.edu.vn`,
        role: 'GVCN',
        active: true,
        assigned_class_id: userId,
        created_at: new Date().toISOString(),
      };
    }

    setCurrentUser(match);
    saveSession(match);
  };

  const updateCurrentProfile = async (data: Partial<Profile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...data };
    await StorageService.saveProfile(updated);
    setCurrentUser(updated);
    await reloadUsers();
  };

  const isAdmin = currentUser?.role === 'ADMIN';
  const isBGH = currentUser?.role === 'BGH' || isAdmin;
  const isGVCN = currentUser?.role === 'GVCN';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        login,
        logout,
        switchUser,
        updateCurrentProfile,
        allUsers,
        reloadUsers,
        isAdmin,
        isBGH,
        isGVCN,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
