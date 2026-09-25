import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '../types';
import { StorageService } from '../services/storage';

interface AuthContextType {
  currentUser: Profile | null;
  loading: boolean;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => Promise<void>;
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
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      // Check for saved user ID
      let savedId = sessionStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem(CURRENT_USER_KEY);
      const rawUsers = localStorage.getItem('sso_profiles_v1');
      
      if (savedId && rawUsers) {
        const users = JSON.parse(rawUsers);
        const match = users.find((u: Profile) => u.id === savedId);
        if (match) {
          // ADMIN and BGH support persistent login if remembered on Safari / iPhone
          if (match.role === 'ADMIN' || match.role === 'BGH') {
            const hasSessionId = sessionStorage.getItem(CURRENT_USER_KEY) === savedId;
            const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
            if (!hasSessionId && !isRemembered) {
              localStorage.removeItem(CURRENT_USER_KEY);
              return null;
            }
          }
          // GVCN and remembered admin stay logged in reliably across tabs/sessions
          sessionStorage.setItem('sso_session_active', 'true');
          sessionStorage.setItem(CURRENT_USER_KEY, match.id);
          return match;
        }
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
  
  // Set default loading to true to prevent rendering the admin dashboard during session restore validation
  const [loading, setLoading] = useState(true);

  const reloadUsers = async () => {
    try {
      const users = await StorageService.getProfiles();
      setAllUsers(users);

      let savedId = sessionStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem(CURRENT_USER_KEY);

      if (savedId) {
        const match = users.find((u) => u.id === savedId);
        if (match) {
          if (match.role === 'ADMIN' || match.role === 'BGH') {
            const hasSessionId = sessionStorage.getItem(CURRENT_USER_KEY) === savedId;
            const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
            if (!hasSessionId && !isRemembered) {
              localStorage.removeItem(CURRENT_USER_KEY);
              setCurrentUser(null);
              return;
            }
          }
          sessionStorage.setItem('sso_session_active', 'true');
          sessionStorage.setItem(CURRENT_USER_KEY, match.id);
          setCurrentUser(match);
          return;
        }
      }

      setCurrentUser(null);
    } catch (err) {
      console.error('Error in reloadUsers:', err);
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    reloadUsers().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string): Promise<boolean> => {
    const users = await StorageService.getProfiles();
    const cleanEmail = email.toLowerCase().trim();
    let found = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!found && (cleanEmail === 'admin@db.edu.vn' || cleanEmail === 'admin' || cleanEmail === 'admin@xadung.edu.vn')) {
      found = users.find((u) => u.role === 'ADMIN');
    }
    
    // Emergency fallback if admin is totally missing from database
    if (!found && (cleanEmail === 'admin@db.edu.vn' || cleanEmail === 'admin' || cleanEmail === 'admin@xadung.edu.vn')) {
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

    if (found) {
      setCurrentUser(found);
      
      // Storage strategy:
      // GVCN and Admin with remember option persist in localStorage to avoid reload kicks on iPhone Safari
      sessionStorage.setItem('sso_session_active', 'true');
      sessionStorage.setItem(CURRENT_USER_KEY, found.id);

      const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
      if (found.role === 'ADMIN' || found.role === 'BGH') {
        if (isRemembered) {
          localStorage.setItem(CURRENT_USER_KEY, found.id);
        } else {
          localStorage.removeItem(CURRENT_USER_KEY);
        }
      } else {
        localStorage.setItem(CURRENT_USER_KEY, found.id);
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    sessionStorage.removeItem(CURRENT_USER_KEY);
    sessionStorage.removeItem('sso_session_active');
    // Don't leave completely blank in prototype; set to null for login page
    setCurrentUser(null);
  };

  const switchUser = async (userId: string) => {
    const users = await StorageService.getProfiles();
    const match = users.find((u) => u.id === userId);
    if (match) {
      setCurrentUser(match);
      sessionStorage.setItem('sso_session_active', 'true');
      sessionStorage.setItem(CURRENT_USER_KEY, match.id);

      const isRemembered = localStorage.getItem('sso_admin_remember_login') !== 'false';
      if (match.role === 'ADMIN' || match.role === 'BGH') {
        if (isRemembered) {
          localStorage.setItem(CURRENT_USER_KEY, match.id);
        } else {
          localStorage.removeItem(CURRENT_USER_KEY);
        }
      } else {
        localStorage.setItem(CURRENT_USER_KEY, match.id);
      }
    }
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
