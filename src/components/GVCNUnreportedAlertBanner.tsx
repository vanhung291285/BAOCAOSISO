import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { useNotifications } from '../contexts/NotificationContext';
import { AlertTriangle, Clock, ArrowRight, X, ChevronRight, BellRing } from 'lucide-react';
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
  const { urgentAttendanceReminder, markAsRead } = useNotifications();
  const [dismissed, setDismissed] = useState(false);

  // If not GVCN or already on attendance page or dismissed -> do not show
  if (!isGVCN || currentPath === '/attendance' || dismissed) {
    return null;
  }

  // Check if GVCN has an assigned class
  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);
  if (!assignedClass) {
    return null;
  }

  // Only display if there is an active urgent attendance reminder for today
  if (!urgentAttendanceReminder) {
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

  return (
    <aside aria-label="Cảnh báo chưa nộp báo cáo sĩ số" className="sticky top-16 z-20 bg-linear-to-r from-rose-600 via-red-600 to-amber-600 text-white shadow-md border-b border-rose-700 animate-in slide-in-from-top duration-200">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 animate-bounce">
              <BellRing className="w-5 h-5 text-amber-200" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded shadow-2xs">
                  CẢNH BÁO TỰ ĐỘNG
                </span>
                <span className="text-xs sm:text-sm font-black text-amber-200">
                  Lớp {assignedClass.class_name} chưa nộp báo cáo sĩ số hôm nay ({formattedToday})
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-rose-100 mt-0.5 line-clamp-1">
                Thầy/Cô {currentUser?.full_name} vui lòng cập nhật sĩ số có mặt, vắng mặt để BGH tổng hợp toàn trường và bảo toàn điểm thi đua báo cáo sớm!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={handleGoToAttendance}
              className="py-1.5 px-3.5 sm:py-2 sm:px-4 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all whitespace-nowrap"
            >
              <span>ĐIỂM DANH & GỬI NGAY</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              title="Tạm ẩn thông báo"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
