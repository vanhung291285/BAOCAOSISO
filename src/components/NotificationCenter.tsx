import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  CheckCheck,
  ExternalLink,
  X,
  Volume2,
  VolumeX,
  ChevronRight,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  onNavigate: (path: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
  const {
    notifications,
    unreadCount,
    urgentAttendanceReminder,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    browserPermission,
    requestBrowserPermission,
    testSound,
    isSoundEnabled,
    toggleSound,
    isAudioBlocked,
  } = useNotifications();
  const { isGVCN } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'REMINDER'>('ALL');
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.read;
    if (filter === 'REMINDER') return n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT';
    return true;
  });

  const handleAction = async (notif: AppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.action_url) {
      onNavigate(notif.action_url);
    }
  };

  const handleTestSound = async () => {
    setIsPlayingTest(true);
    await testSound();
    setTimeout(() => setIsPlayingTest(false), 1200);
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'Vừa xong';
      if (diffMinutes < 60) return `${diffMinutes} phút trước`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} ngày trước`;
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Thông báo hệ thống & Nhắc nhở sĩ số"
        className={`relative p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${
          urgentAttendanceReminder
            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shadow-2xs'
            : unreadCount > 0
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 shadow-2xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        <Bell className={`w-5 h-5 ${urgentAttendanceReminder ? 'animate-bounce text-rose-600' : ''}`} />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs border-2 border-white animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Pulsing indicator for urgent reminder */}
        {urgentAttendanceReminder && (
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 sm:right-0 mt-2 w-[calc(100vw-24px)] sm:w-[420px] max-w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-md flex items-center justify-center">
                <Bell className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight flex items-center gap-1.5">
                  <span>Thông báo & Nhắc nhở</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {unreadCount} mới
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-blue-200">Chuông báo sĩ số học sinh hằng ngày</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  title="Đánh dấu tất cả đã đọc"
                  className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors text-xs flex items-center gap-1"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sound Autoplay Unlock Banner (if browser blocked sound) */}
          {isAudioBlocked && (
            <div
              onClick={handleTestSound}
              className="cursor-pointer bg-amber-50 hover:bg-amber-100 border-b border-amber-200 px-3.5 py-2 flex items-center justify-between text-xs text-amber-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 text-amber-600 shrink-0 animate-bounce" />
                <span className="text-[11px] font-semibold">Trình duyệt chặn autoplay. Nhấn để bật chuông!</span>
              </div>
              <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded shadow-2xs">
                BẬT NGAY
              </span>
            </div>
          )}

          {/* Urgent GVCN Attendance Alert Pin (if class not reported today) */}
          {urgentAttendanceReminder && (
            <div className="p-3.5 bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 text-white shadow-inner">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-amber-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-1.5 py-0.2 rounded">
                      CẢNH BÁO TỰ ĐỘNG
                    </span>
                    <span className="text-[10px] text-rose-100 font-medium">Hôm nay</span>
                  </div>
                  <h4 className="text-xs font-black tracking-tight leading-snug">
                    {urgentAttendanceReminder.title}
                  </h4>
                  <p className="text-[11px] text-rose-100 mt-1 leading-relaxed line-clamp-2">
                    {urgentAttendanceReminder.message}
                  </p>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAction(urgentAttendanceReminder)}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all"
                    >
                      <span>ĐIỂM DANH & NỘP BÁO CÁO NGAY</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleTestSound}
                      title="Bấm để phát lại âm thanh chuông báo"
                      className="py-2 px-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{isPlayingTest ? '...' : 'Reo chuông'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Sound Control Bar */}
          <div className="px-3.5 py-1.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Âm thanh nhắc nhở:</span>
              </span>
              <button
                type="button"
                onClick={() => toggleSound(!isSoundEnabled)}
                className={`px-2 py-0.5 rounded text-[10px] font-black transition-colors ${
                  isSoundEnabled
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-300 text-slate-700'
                }`}
              >
                {isSoundEnabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className="text-[11px] text-blue-700 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
            >
              <span>{isPlayingTest ? '🔊 Đang phát...' : '🔔 Thử chuông 07h30'}</span>
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  filter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Tất cả ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('UNREAD')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  filter === 'UNREAD'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Chưa đọc ({unreadCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('REMINDER')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  filter === 'REMINDER'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Nhắc nhở
              </button>
            </div>

            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-slate-500 hover:text-rose-600 font-medium transition-colors"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* Browser Notification Permission Banner (if not yet granted) */}
          {browserPermission === 'default' && (
            <div className="px-3.5 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-blue-900 font-medium">
                <Volume2 className="w-4 h-4 text-blue-700 flex-shrink-0" />
                <span className="text-[11px]">Bật thông báo đẩy để không bỏ lỡ nhắc nhở?</span>
              </div>
              <button
                type="button"
                onClick={requestBrowserPermission}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs whitespace-nowrap"
              >
                Bật thông báo
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {filteredNotifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-xs font-bold text-slate-700">Không có thông báo nào</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                  {filter === 'UNREAD'
                    ? 'Bạn đã xem hết toàn bộ các thông báo và nhắc nhở!'
                    : 'Các thông báo nhắc nhở tự động sẽ xuất hiện ở đây khi đến giờ báo cáo.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUrgent = notif.type === 'ATTENDANCE_REMINDER' || notif.type === 'BGH_ALERT';
                const isSuccess = notif.type === 'ATTENDANCE_SUCCESS';

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleAction(notif)}
                    className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 group relative ${
                      !notif.read
                        ? isUrgent
                          ? 'bg-rose-50/60 hover:bg-rose-100/60'
                          : 'bg-blue-50/50 hover:bg-blue-100/50'
                        : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Status Dot */}
                    {!notif.read && (
                      <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}

                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isUrgent
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : isSuccess
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isUrgent ? (
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                      ) : isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-600" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                            isUrgent
                              ? 'bg-rose-200/70 text-rose-800'
                              : isSuccess
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isUrgent
                            ? notif.type === 'BGH_ALERT'
                              ? 'BGH NHẮC NHỞ'
                              : 'TỰ ĐỘNG NHẮC'
                            : isSuccess
                            ? 'THÀNH CÔNG'
                            : 'HỆ THỐNG'}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>

                      <h4
                        className={`text-xs font-bold leading-tight ${
                          !notif.read ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {notif.title}
                      </h4>

                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {notif.message}
                      </p>

                      {notif.created_by_name && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          Người gửi: <span className="font-semibold text-slate-600">{notif.created_by_name}</span>
                        </div>
                      )}

                      {/* Action Button */}
                      {notif.action_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAction(notif);
                            }}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
                              isUrgent
                                ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-2xs'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            <span>{isUrgent ? 'Nhập báo cáo ngay' : 'Xem chi tiết'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Delete item button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      title="Xóa thông báo này"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Sound Preview & Navigation */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-700 font-medium px-2 py-1 rounded-lg hover:bg-slate-200/60 transition-colors"
              title="Bấm để thử âm thanh chuông nhắc nhở và rung điện thoại"
            >
              <Volume2 className="w-3.5 h-3.5 text-blue-600" />
              <span>{isPlayingTest ? 'Đang reo chuông...' : 'Thử chuông nhắc nhở'}</span>
            </button>

            {isGVCN && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigate('/attendance');
                }}
                className="font-bold text-blue-700 hover:underline flex items-center gap-1"
              >
                <span>Báo cáo sĩ số</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
