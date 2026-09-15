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
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadUsers = async () => {
    const users = await StorageService.getProfiles();
    setAllUsers(users);

    const savedId = localStorage.getItem(CURRENT_USER_KEY);
    if (savedId) {
      const match = users.find((u) => u.id === savedId);
      if (match) {
        setCurrentUser(match);
        return;
      }
    }

    // Removed automatic default user assignment to force manual login
    // Don't leave completely blank in prototype; set to null for login page
    setCurrentUser(null);
  };

  useEffect(() => {
    reloadUsers().finally(() => setLoading(false));
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
      localStorage.setItem(CURRENT_USER_KEY, found.id);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    // Don't leave completely blank in prototype; set to null for login page
    setCurrentUser(null);
  };

  const switchUser = async (userId: string) => {
    const users = await StorageService.getProfiles();
    const match = users.find((u) => u.id === userId);
    if (match) {
      setCurrentUser(match);
      localStorage.setItem(CURRENT_USER_KEY, match.id);
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
