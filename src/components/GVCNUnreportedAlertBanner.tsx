import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { useNotifications } from '../contexts/NotificationContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { showScreenAlert } from '../utils/notificationAudio';
import { AlertTriangle, Clock, ArrowRight, X, ChevronRight, BellRing, Volume2, VolumeX, AlertCircle, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import { getTodayDateStr, formatDateVN } from '../utils/schoolWeeks';

interface GVCNUnreportedAlertBannerProps {
  onNavigate: (path: string) => void;
  currentPath: string;
}

export const GVCNUnreportedAlertBanner: React.FC<GVCNUnreportedAlertBannerProps> = ({
  onNavigate,
  currentPath,
}) => {
  const { currentUser, isGVCN } = useAuth();
  const { classes } = useSchool();
  const {
    urgentAttendanceReminder,
    markAsRead,
    testSound,
    isSoundEnabled,
    toggleSound,
    isAudioBlocked,
    browserPermission,
    requestBrowserPermission,
  } = useNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [hasReportedToday, setHasReportedToday] = useState<boolean | null>(null);
  const [unreportedStats, setUnreportedStats] = useState<{
    todayReminders: number;
    totalReminders: number;
    unreportedDays: number;
  }>({ todayReminders: 1, totalReminders: 1, unreportedDays: 1 });

  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  // Kiểm tra trạng thái đã nộp báo cáo sĩ số của lớp hôm nay
  useEffect(() => {
    if (assignedClass) {
      const todayStr = getTodayDateStr();
      const checkReport = () => {
        const local = StorageService.getLocalDailyReport(assignedClass.id, todayStr);
        if (local.report && local.report.status !== 'NOT_REPORTED') {
          setHasReportedToday(true);
        } else {
          setHasReportedToday(false);
        }
      };
      checkReport();
      const unsub = subscribeRealtime(checkReport);
      return unsub;
    }
  }, [assignedClass]);

  useEffect(() => {
    if (assignedClass) {
      StorageService.getClassUnreportedStats(assignedClass.id, currentUser?.id)
        .then((res) => {
          setUnreportedStats({
            todayReminders: Math.max(1, res.todayReminders),
            totalReminders: Math.max(1, res.totalReminders),
            unreportedDays: Math.max(1, res.unreportedDays),
          });
        })
        .catch(console.error);
    }
  }, [assignedClass, currentUser]);

  // Nếu không phải GVCN hoặc không có lớp hoặc đã nộp báo cáo hôm nay hoặc đã tạm ẩn -> không hiển thị
  if (!isGVCN || !assignedClass || hasReportedToday === true || dismissed) {
    return null;
  }

  const todayStr = getTodayDateStr();
  const formattedToday = formatDateVN(todayStr);

  const handleGoToAttendance = async () => {
    if (urgentAttendanceReminder) {
      await markAsRead(urgentAttendanceReminder.id);
    }
    onNavigate('/attendance');
  };

  const handleTestSoundAndScreenNotification = async () => {
    setIsPlayingTest(true);
    await testSound();
    if (browserPermission !== 'granted') {
      await requestBrowserPermission();
    }
    await showScreenAlert({
      title: `⚠️ NHẮC BÁO CÁO SĨ SỐ - LỚP ${assignedClass.class_name}`,
      body: `Thầy/Cô ${currentUser?.full_name || ''} vui lòng nộp báo cáo sĩ số hôm nay (${formattedToday}) để BGH tổng hợp toàn trường!`,
      actionUrl: '/attendance',
    });
    setTimeout(() => setIsPlayingTest(false), 1200);
  };

  return (
    <aside aria-label="Cảnh báo trực tiếp chưa nộp báo cáo sĩ số" className="sticky top-16 z-30 bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 text-white shadow-lg border-b border-rose-700 animate-in slide-in-from-top duration-200">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 animate-bounce">
              <BellRing className="w-5 h-5 text-amber-200" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded shadow-2xs">
                  CẢNH BÁO TRỰC TIẾP
                </span>
                <span className="text-xs sm:text-sm font-black text-amber-200">
                  Lớp {assignedClass.class_name} chưa nộp báo cáo sĩ số ({formattedToday})
                </span>
                {/* Hiển thị số lần thông báo và số lần không báo cáo */}
                <span className="text-[10px] sm:text-[11px] font-bold bg-white/20 text-white border border-white/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <span>🔔 Nhắc: <strong>{unreportedStats.todayReminders} lần</strong></span>
                  <span>•</span>
                  <span>⚠️ Chưa báo: <strong>{unreportedStats.unreportedDays} lần</strong></span>
                </span>
                {isAudioBlocked && (
                  <span className="text-[10px] bg-amber-400 text-slate-900 font-bold px-1.5 py-0.5 rounded animate-pulse">
                    🔊 Chạm để kích hoạt chuông
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-rose-100 mt-0.5 line-clamp-1">
                Thầy/Cô {currentUser?.full_name} vui lòng hoàn thành báo cáo sĩ số sớm để BGH tổng hợp toàn trường và bảo toàn điểm thi đua!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            {/* Nút bật & thử chuông kèm thông báo ngoài màn hình */}
            <button
              type="button"
              onClick={handleTestSoundAndScreenNotification}
              title="Bấm để kích hoạt thông báo trực tiếp ra ngoài màn hình và nghe thử chuông báo"
              className={`py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer ${
                isPlayingTest
                  ? 'bg-emerald-400 text-emerald-950 ring-2 ring-white animate-pulse'
                  : isAudioBlocked || browserPermission !== 'granted'
                  ? 'bg-amber-400 text-slate-950 font-black animate-bounce'
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>
                {isPlayingTest
                  ? 'Đang phát chuông...'
                  : browserPermission !== 'granted'
                  ? 'BẬT BÁO NGOÀI MÀN HÌNH'
                  : 'Thử chuông & Màn hình'}
              </span>
            </button>

            {currentPath !== '/attendance' ? (
              <button
                type="button"
                onClick={handleGoToAttendance}
                className="py-1.5 px-3.5 sm:py-2 sm:px-4 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all whitespace-nowrap cursor-pointer"
              >
                <span>ĐIỂM DANH & GỬI NGAY</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="text-xs font-bold bg-white/20 text-white px-3 py-1.5 rounded-xl border border-white/30">
                Đang mở biểu mẫu điểm danh
              </div>
            )}

            <button
              type="button"
              onClick={() => setDismissed(true)}
              title="Tạm ẩn cảnh báo này"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
