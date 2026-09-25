import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PatientUser, PatientNotification } from '../types';
import { patientApi, patientStorage } from '../services/patientApi';

interface PatientAuthContextType {
  patient: PatientUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, pass: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (data: Parameters<typeof patientApi.register>[0]) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<PatientUser>) => Promise<{ success: boolean; error?: string; patient?: PatientUser }>;
  changePassword: (oldPass: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  notifications: PatientNotification[];
  unreadNotificationsCount: number;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patient, setPatient] = useState<PatientUser | null>(() => patientStorage.getPatient());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<PatientNotification[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!patientStorage.getToken()) return;
    try {
      const res = await patientApi.getNotifications();
      if (res.success && res.notifications) {
        setNotifications(res.notifications);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!patientStorage.getToken()) {
      setPatient(null);
      return;
    }
    try {
      const res = await patientApi.getProfile();
      if (res.success && res.patient) {
        setPatient(res.patient);
      }
    } catch {
      // ignore
    }
  }, []);

  // Verify session on mount
  useEffect(() => {
    let isMounted = true;
    async function initAuth() {
      const token = patientStorage.getToken();
      if (!token) {
        if (isMounted) {
          setPatient(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const verifyRes = await patientApi.verifySession();
        if (isMounted) {
          if (verifyRes.valid && verifyRes.patient) {
            setPatient(verifyRes.patient);
            fetchNotifications();
          } else if (!verifyRes.valid) {
            setPatient(null);
          }
        }
      } catch {
        if (isMounted) {
          const cached = patientStorage.getPatient();
          setPatient(cached);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();
    return () => {
      isMounted = false;
    };
  }, [fetchNotifications]);

  const login = async (identifier: string, pass: string, remember: boolean = true) => {
    setIsLoading(true);
    try {
      const res = await patientApi.login(identifier, pass, remember);
      if (res.success && res.patient) {
        setPatient(res.patient);
        fetchNotifications();
        return { success: true };
      }
      return { success: false, error: res.error || 'Invalid credentials' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login connection failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: Parameters<typeof patientApi.register>[0]) => {
    setIsLoading(true);
    try {
      const res = await patientApi.register(data);
      if (res.success && res.patient) {
        setPatient(res.patient);
        fetchNotifications();
        return { success: true };
      }
      return { success: false, error: res.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration connection failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await patientApi.logout();
    } finally {
      setPatient(null);
      setNotifications([]);
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<PatientUser>) => {
    try {
      const res = await patientApi.updateProfile(updates);
      if (res.success && res.patient) {
        setPatient(res.patient);
        fetchNotifications();
        return { success: true, patient: res.patient };
      }
      return { success: false, error: res.error || 'Failed to update profile' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Update failed' };
    }
  };

  const changePassword = async (oldPass: string, newPass: string) => {
    try {
      const res = await patientApi.changePassword(oldPass, newPass);
      if (res.success) {
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to change password' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Password update failed' };
    }
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await patientApi.markNotificationRead(id);
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await patientApi.markAllNotificationsRead();
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        isAuthenticated: !!patient,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
        updateProfile,
        changePassword,
        notifications,
        unreadNotificationsCount,
        fetchNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
};

export const usePatientAuth = (): PatientAuthContextType => {
  const context = useContext(PatientAuthContext);
  if (!context) {
    throw new Error('usePatientAuth must be used within a PatientAuthProvider');
  }
  return context;
};
