import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser } from '../types';
import { adminApi, adminStorage } from '../services/adminApi';

interface AdminAuthContextType {
  isAuthenticated: boolean;
  user: AdminUser | null;
  isLoading: boolean;
  login: (email: string, pass: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(() => adminStorage.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!adminStorage.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSession = async () => {
    const token = adminStorage.getToken();
    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
      return false;
    }

    try {
      const res = await adminApi.verifySession();
      if (res.valid && res.user) {
        setUser(res.user);
        setIsAuthenticated(true);
        setIsLoading(false);
        return true;
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return false;
      }
    } catch {
      setIsLoading(false);
      return false;
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const login = async (email: string, pass: string, remember: boolean = true) => {
    setIsLoading(true);
    const res = await adminApi.login(email, pass, remember);
    setIsLoading(false);
    if (res.success && res.user) {
      setUser(res.user);
      setIsAuthenticated(true);
      return { success: true };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const logout = async () => {
    setIsLoading(true);
    await adminApi.logout();
    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);
  };

  const refreshSession = async () => {
    return await checkSession();
  };

  return (
    <AdminAuthContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
