import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppNotification } from '../types';
import { StorageService, subscribeRealtime } from '../services/storage';
import { useAuth } from './AuthContext';
import { getTodayDateStr } from '../utils/schoolWeeks';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  urgentAttendanceReminder: AppNotification | null;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  triggerAutoCheck: (targetDate?: string) => Promise<{ sentCount: number; remindedClasses: string[] }>;
  sendBGHManualReminder: (targetDate?: string) => Promise<{ sentCount: number; remindedClasses: string[]; skippedClasses: string[] }>;
  browserPermission: NotificationPermission | 'unsupported';
  requestBrowserPermission: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Web Audio API chime generator for pleasant notification sound
function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    // Pleasant two-tone chime (E5 -> A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (err) {
    // Ignore audio autoplay restrictions
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isGVCN, isBGH, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const loadNotifications = useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const list = await StorageService.getNotifications(currentUser.id);
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Request browser desktop notification permission
  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setBrowserPermission(perm);
      } catch (err) {
        console.error('Notification permission request error:', err);
      }
    }
  };

  // Show desktop notification if permitted
  const showDesktopNotification = (title: string, body: string, actionUrl?: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'sso_attendance_reminder',
        });
        notif.onclick = () => {
          window.focus();
          if (actionUrl) {
            window.location.hash = actionUrl;
          }
        };
      } catch (err) {
        console.error('Error showing desktop notification:', err);
      }
    }
  };

  // Run auto check for attendance reports
  const triggerAutoCheck = useCallback(async (targetDate?: string) => {
    const today = targetDate || getTodayDateStr();
    try {
      const res = await StorageService.checkAndGenerateGVCNReminders(today, false);
      if (res.sentCount > 0) {
        await loadNotifications();
      }
      return res;
    } catch (err) {
      console.error('Error running auto check for GVCN reminders:', err);
      return { sentCount: 0, remindedClasses: [], skippedClasses: [] };
    }
  }, [loadNotifications]);

  // BGH manual trigger to alert all unreported GVCN accounts
  const sendBGHManualReminder = useCallback(async (targetDate?: string) => {
    const today = targetDate || getTodayDateStr();
    try {
      const res = await StorageService.checkAndGenerateGVCNReminders(today, true, currentUser || undefined);
      await loadNotifications();
      return res;
    } catch (err) {
      console.error('Error sending BGH manual reminders:', err);
      return { sentCount: 0, remindedClasses: [], skippedClasses: [] };
    }
  }, [currentUser, loadNotifications]);

  // Initialize and listen to realtime updates
  useEffect(() => {
    loadNotifications();

    // Auto-check on login/mount for GVCN or BGH
    const today = getTodayDateStr();
    triggerAutoCheck(today);

    // Subscribe to realtime updates across tabs/cloud
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'notifications' || event.table === 'daily_reports') {
        loadNotifications();
      }
    });

    // Run auto-check periodically every 2 minutes while app is open
    const interval = setInterval(() => {
      triggerAutoCheck();
    }, 2 * 60 * 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [loadNotifications, triggerAutoCheck]);

  // Detect unread urgent attendance reminder for currently logged-in user
  const today = getTodayDateStr();
  const urgentAttendanceReminder = React.useMemo(() => {
    return (
      notifications.find(
        (n) =>
          !n.read &&
          n.date === today &&
          (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT')
      ) || null
    );
  }, [notifications, today]);

  // When an urgent reminder appears, play audio chime and show browser notification
  const previousUrgentIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (urgentAttendanceReminder && urgentAttendanceReminder.id !== previousUrgentIdRef.current) {
      previousUrgentIdRef.current = urgentAttendanceReminder.id;
      playNotificationChime();
      showDesktopNotification(
        urgentAttendanceReminder.title,
        urgentAttendanceReminder.message,
        urgentAttendanceReminder.action_url
      );
    }
  }, [urgentAttendanceReminder]);

  const markAsRead = async (id: string) => {
    await StorageService.markNotificationAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    await StorageService.markAllNotificationsAsRead(currentUser.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    await StorageService.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = async () => {
    if (!currentUser) return;
    await StorageService.clearAllNotifications(currentUser.id);
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        urgentAttendanceReminder,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        refreshNotifications: loadNotifications,
        triggerAutoCheck,
        sendBGHManualReminder,
        browserPermission,
        requestBrowserPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
};
