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
  playNotificationChime: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Web Audio API chime generator for pleasant notification sound and vibration on mobile
export function playNotificationChime() {
  if (typeof window === 'undefined') return;

  // 1. Rung thiết bị điện thoại (Vibration API) nếu thiết bị hỗ trợ
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      // Nhịp rung cảnh báo rõ ràng: rung 250ms, nghỉ 100ms, rung 250ms
      navigator.vibrate([250, 100, 250, 100, 400]);
    }
  } catch (err) {
    // Không ảnh hưởng nếu thiết bị không hỗ trợ rung
  }

  // 2. Phát chuông âm thanh nhắc nhở qua Web Audio API (chuông 3 nốt ngân vang rõ ràng)
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    
    // Nốt 1: E5 (659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Nốt 2: G#5 (830.61Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(830.61, now + 0.15);
    gain2.gain.setValueAtTime(0.22, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);

    // Nốt 3: B5 (987.77Hz) - ngân vang kết thúc
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(987.77, now + 0.32);
    gain3.gain.setValueAtTime(0.25, now + 0.32);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.32);
    osc3.stop(now + 0.95);
  } catch (err) {
    // Bỏ qua nếu trình duyệt chặn autoplay trước khi có tương tác
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isGVCN, isBGH, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    try {
      if ('Notification' in window && typeof Notification !== 'undefined') {
        return Notification.permission;
      }
    } catch (err) {
      // In iframes or sandboxed documents, accessing Notification.permission throws DOMException
      return 'unsupported';
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

  // Request browser desktop notification permission safely
  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined') return;
    try {
      if ('Notification' in window && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
        const perm = await Notification.requestPermission();
        setBrowserPermission(perm);
      }
    } catch (err) {
      console.warn('Notification permission request error or restricted in iframe:', err);
      setBrowserPermission('unsupported');
    }
  };

  // Show desktop notification if permitted safely
  const showDesktopNotification = (title: string, body: string, actionUrl?: string) => {
    if (typeof window === 'undefined') return;
    try {
      if ('Notification' in window && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
      }
    } catch (err) {
      // Ignore desktop notification errors in iframe or restricted environment
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
        playNotificationChime,
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
