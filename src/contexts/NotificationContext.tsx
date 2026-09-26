import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppNotification } from '../types';
import { StorageService, subscribeRealtime } from '../services/storage';
import { useAuth } from './AuthContext';
import { getTodayDateStr } from '../utils/schoolWeeks';
import {
  playNotificationChime,
  testNotificationChime,
  isSoundAlertEnabled,
  setSoundAlertEnabled,
  isAudioAutoplayBlocked,
  subscribeAudioState,
  showScreenAlert,
  requestScreenNotificationPermission,
  startDocumentTitleAlert,
  stopDocumentTitleAlert,
} from '../utils/notificationAudio';

// Re-export sound helpers for external callers
export {
  playNotificationChime,
  testNotificationChime,
  isSoundAlertEnabled,
  setSoundAlertEnabled,
  showScreenAlert,
  requestScreenNotificationPermission,
};

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
  requestBrowserPermission: () => Promise<NotificationPermission | 'unsupported'>;
  playNotificationChime: (options?: { force?: boolean }) => Promise<boolean>;
  testSound: () => Promise<boolean>;
  isSoundEnabled: boolean;
  toggleSound: (enabled: boolean) => void;
  isAudioBlocked: boolean;
  monitoredClassId: string;
  setMonitoredClassId: (classId: string) => void;
  snoozeUrgentReminder: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Lớp đang theo dõi cảnh báo trên thiết bị này (kể cả khi chưa đăng nhập)
  const [monitoredClassId, setMonitoredClassIdState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sso_device_alert_class_id') || localStorage.getItem('sso_saved_class_id') || '';
  });

  const setMonitoredClassId = useCallback((classId: string) => {
    setMonitoredClassIdState(classId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sso_device_alert_class_id', classId);
      localStorage.setItem('sso_saved_class_id', classId);
    }
  }, []);

  // Tự động ghi nhớ lớp của GVCN khi đăng nhập
  useEffect(() => {
    if (currentUser?.role === 'GVCN' && currentUser.assigned_class_id) {
      setMonitoredClassId(currentUser.assigned_class_id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sso_saved_teacher_id', currentUser.id);
      }
    }
  }, [currentUser, setMonitoredClassId]);

  // Trạng thái âm thanh chuông báo
  const [isSoundEnabled, setIsSoundEnabledState] = useState<boolean>(() => isSoundAlertEnabled());
  const [isAudioBlocked, setIsAudioBlockedState] = useState<boolean>(() => isAudioAutoplayBlocked());

  useEffect(() => {
    const unsub = subscribeAudioState(() => {
      setIsSoundEnabledState(isSoundAlertEnabled());
      setIsAudioBlockedState(isAudioAutoplayBlocked());
    });
    return unsub;
  }, []);

  const toggleSound = (enabled: boolean) => {
    setSoundAlertEnabled(enabled);
    setIsSoundEnabledState(enabled);
  };

  const testSound = async () => {
    const ok = await testNotificationChime();
    setIsAudioBlockedState(false);
    return ok;
  };

  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    try {
      if ('Notification' in window && typeof Notification !== 'undefined') {
        return Notification.permission;
      }
    } catch (err) {
      return 'unsupported';
    }
    return 'unsupported';
  });

  const loadNotifications = useCallback(async () => {
    try {
      if (currentUser) {
        const assignedClassId = currentUser.role === 'GVCN' ? currentUser.assigned_class_id : undefined;
        const list = await StorageService.getNotifications(currentUser.id, assignedClassId);
        setNotifications(list);
      } else {
        // KHI CHƯA ĐĂNG NHẬP: Lấy thông báo theo lớp/giáo viên được lưu trên thiết bị này
        const savedClass = (typeof window !== 'undefined'
          ? localStorage.getItem('sso_device_alert_class_id') || localStorage.getItem('sso_saved_class_id')
          : null) || monitoredClassId || undefined;
        const savedTeacher = typeof window !== 'undefined' ? localStorage.getItem('sso_saved_teacher_id') || undefined : undefined;
        const list = await StorageService.getNotifications(savedTeacher, savedClass);
        setNotifications(list);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, monitoredClassId]);

  // Request browser desktop notification permission safely
  const requestBrowserPermission = async () => {
    const perm = await requestScreenNotificationPermission();
    setBrowserPermission(perm);
    // Đồng thời kích hoạt âm thanh user gesture để mở khóa AudioContext
    try {
      await testNotificationChime();
    } catch (e) {}
    return perm;
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

  // Initialize and listen to realtime updates (Kể cả khi chưa đăng nhập)
  useEffect(() => {
    loadNotifications();

    // Auto-check on login/mount
    const today = getTodayDateStr();
    triggerAutoCheck(today);

    // Subscribe to realtime updates across tabs/cloud
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'notifications' || event.table === 'daily_reports') {
        loadNotifications();
      }
    });

    // Kiểm tra định kỳ mỗi 60 giây để đảm bảo dù GVCN chưa đăng nhập,
    // khi đến giờ chốt 07h30 hoặc BGH gửi lệnh thì máy vẫn phát chuông và cảnh báo ngay
    const interval = setInterval(() => {
      triggerAutoCheck();
    }, 60 * 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [loadNotifications, triggerAutoCheck]);

  // Phát hiện nhắc nhở sĩ số khẩn cấp hôm nay:
  // - Nếu đã đăng nhập: Lọc theo user_id hoặc assigned_class_id
  // - Nếu CHƯA ĐĂNG NHẬP: Lọc theo lớp/giáo viên được ghi nhớ trên thiết bị này (hoặc thông báo khẩn cấp bất kỳ)
  const today = getTodayDateStr();
  const urgentAttendanceReminder = React.useMemo(() => {
    if (currentUser) {
      return (
        notifications.find(
          (n) =>
            !n.read &&
            n.date === today &&
            (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT') &&
            (n.user_id === currentUser.id ||
              (currentUser.role === 'GVCN' &&
                currentUser.assigned_class_id &&
                n.class_id === currentUser.assigned_class_id))
        ) || null
      );
    }

    // KHI CHƯA ĐĂNG NHẬP:
    const targetClass = monitoredClassId || (typeof window !== 'undefined' ? localStorage.getItem('sso_device_alert_class_id') || localStorage.getItem('sso_saved_class_id') : null);
    const targetTeacher = typeof window !== 'undefined' ? localStorage.getItem('sso_saved_teacher_id') : null;

    if (targetClass || targetTeacher) {
      const match = notifications.find(
        (n) =>
          !n.read &&
          n.date === today &&
          (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT') &&
          ((targetClass && n.class_id === targetClass) || (targetTeacher && n.user_id === targetTeacher))
      );
      if (match) return match;
    }

    // Nếu chưa lưu lớp cụ thể, lấy thông báo khẩn cấp đầu tiên của ngày hôm nay
    return (
      notifications.find(
        (n) =>
          !n.read &&
          n.date === today &&
          (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT')
      ) || null
    );
  }, [notifications, today, currentUser, monitoredClassId]);

  // Quản lý phát âm thanh, nhấp nháy tiêu đề tab và bật thông báo ra ngoài màn hình
  const previousUrgentIdRef = React.useRef<string | null>(null);
  const [snoozedId, setSnoozedId] = useState<string | null>(null);

  const snoozeUrgentReminder = useCallback(() => {
    if (urgentAttendanceReminder) {
      setSnoozedId(urgentAttendanceReminder.id);
      stopDocumentTitleAlert();
    }
  }, [urgentAttendanceReminder]);

  useEffect(() => {
    if (!urgentAttendanceReminder) {
      stopDocumentTitleAlert();
      return;
    }

    if (snoozedId === urgentAttendanceReminder.id) {
      return;
    }

    // 1. Nhấp nháy cảnh báo trên tiêu đề tab trình duyệt (thanh tác vụ Windows / điện thoại)
    const alertLabel = urgentAttendanceReminder.class_name
      ? `LỚP ${urgentAttendanceReminder.class_name} CHƯA BÁO CÁO!`
      : 'CHƯA NỘP BÁO CÁO SĨ SỐ!';
    startDocumentTitleAlert(alertLabel);

    // 2. Phát chuông âm thanh và đẩy thông báo ra ngoài màn hình lần đầu
    if (urgentAttendanceReminder.id !== previousUrgentIdRef.current) {
      previousUrgentIdRef.current = urgentAttendanceReminder.id;
      playNotificationChime({ force: false });
      showScreenAlert({
        title: urgentAttendanceReminder.title,
        body: urgentAttendanceReminder.message,
        actionUrl: urgentAttendanceReminder.action_url || '/attendance',
      });
    }

    // 3. Nhắc chuông lại mỗi 60 giây nếu GVCN chưa xem hoặc chưa nộp báo cáo
    const interval = setInterval(() => {
      if (urgentAttendanceReminder && !urgentAttendanceReminder.read && snoozedId !== urgentAttendanceReminder.id) {
        playNotificationChime({ force: false });
        showScreenAlert({
          title: urgentAttendanceReminder.title,
          body: urgentAttendanceReminder.message,
          actionUrl: urgentAttendanceReminder.action_url || '/attendance',
        });
      }
    }, 60 * 1000);

    return () => {
      clearInterval(interval);
      stopDocumentTitleAlert();
    };
  }, [urgentAttendanceReminder, snoozedId]);

  const markAsRead = async (id: string) => {
    await StorageService.markNotificationAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    stopDocumentTitleAlert();
  };

  const markAllAsRead = async () => {
    const targetUserId = currentUser?.id || localStorage.getItem('sso_saved_teacher_id') || '';
    if (targetUserId) {
      await StorageService.markAllNotificationsAsRead(targetUserId);
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    stopDocumentTitleAlert();
  };

  const deleteNotification = async (id: string) => {
    await StorageService.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = async () => {
    const targetUserId = currentUser?.id || localStorage.getItem('sso_saved_teacher_id') || '';
    if (targetUserId) {
      await StorageService.clearAllNotifications(targetUserId);
    }
    setNotifications([]);
    stopDocumentTitleAlert();
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
        testSound,
        isSoundEnabled,
        toggleSound,
        isAudioBlocked,
        monitoredClassId,
        setMonitoredClassId,
        snoozeUrgentReminder,
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

