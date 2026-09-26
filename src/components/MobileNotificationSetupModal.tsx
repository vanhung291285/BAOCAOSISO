import React, { useState, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { showScreenAlert } from '../utils/notificationAudio';
import {
  BellRing,
  Smartphone,
  CheckCircle2,
  Volume2,
  ShieldCheck,
  Download,
  Share,
  Sparkles,
  X,
  AlertTriangle,
  Clock,
  ChevronRight,
} from 'lucide-react';

interface MobileNotificationSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileNotificationSetupModal: React.FC<MobileNotificationSetupModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentUser } = useAuth();
  const {
    browserPermission,
    requestBrowserPermission,
    testSound,
    isAudioBlocked,
  } = useNotifications();

  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if running as installed PWA
    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for install prompt on Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (!isOpen) return null;

  const handleEnableNotification = async () => {
    const res = await requestBrowserPermission();
    if (res === 'granted') {
      await showScreenAlert({
        title: '🔔 ĐÃ KÍCH HOẠT THÔNG BÁO TỰ ĐỘNG THÀNH CÔNG!',
        body: `Hệ thống sẽ tự động gửi thông báo nhắc nhở kèm chuông và rung trước 07h30 sáng cho Thầy/Cô ${currentUser?.full_name || ''}.`,
        actionUrl: '/attendance',
      });
    }
  };

  const handleTestChimeAndPush = async () => {
    setIsPlayingTest(true);
    await testSound();
    await showScreenAlert({
      title: '⚠️ BÁO THỨC ĐIỂM DANH SĨ SỐ (THỬ NGHIỆM)',
      body: 'Hệ thống tự động phát chuông và rung thiết bị để nhắc GVCN nộp báo cáo sĩ số trước 07h30 sáng!',
      actionUrl: '/attendance',
    });
    setTimeout(() => setIsPlayingTest(false), 1500);
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsStandalone(true);
        setDeferredPrompt(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-amber-300 font-bold shadow-xs">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                Cài Đặt Chuông Báo Tự Động
              </h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Nhận chuông & thông báo rung ngay cả khi chưa mở ứng dụng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm">
          {/* Note explaining why phones need this */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Lưu ý trên điện thoại:</strong> Khi đóng trình duyệt, hệ điều hành sẽ tự tắt âm thanh để tiết kiệm pin. Hãy thực hiện <strong>2 bước</strong> dưới đây để điện thoại tự động đổ chuông và gửi thông báo màn hình khóa:
            </div>
          </div>

          {/* Step 1: Enable Push Notifications */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                  1
                </span>
                Bật quyền thông báo màn hình khóa
              </span>
              {browserPermission === 'granted' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Đã bật
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Chưa kích hoạt
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Cho phép hệ thống gửi thông báo đẩy trực tiếp ra thanh thông báo và màn hình khóa điện thoại mỗi sáng.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {browserPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleEnableNotification}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <BellRing className="w-4 h-4" />
                  <span>BẬT QUYỀN THÔNG BÁO NGAY</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleTestChimeAndPush}
                  className={`px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                    isPlayingTest
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  <Volume2 className="w-4 h-4 text-emerald-600" />
                  <span>{isPlayingTest ? 'Đang phát chuông & rung...' : 'Thử chuông & Rung ngoài màn hình'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Step 2: Install PWA on Home Screen */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                  2
                </span>
                Thêm ứng dụng ra màn hình chính (PWA)
              </span>
              {isStandalone ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Đã cài đặt
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Khuyên dùng
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Cài ứng dụng ra màn hình điện thoại giúp mở nhanh 1 chạm như app Zalo/VnEdu và tự động nhận chuông báo ổn định nhất.
            </p>

            {/* Instruction for Android or iOS */}
            {isIOS ? (
              <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-blue-900 flex items-center gap-1">
                  <Share className="w-3.5 h-3.5 text-blue-600" />
                  <span>Hướng dẫn trên iPhone / Safari:</span>
                </div>
                <div className="pl-2 space-y-1 text-slate-600 text-[11px]">
                  <div>1. Nhấn vào nút <strong>Chia sẻ (hình vuông có mũi tên ⎋)</strong> ở đáy Safari.</div>
                  <div>2. Cuộn xuống chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong>.</div>
                  <div>3. Nhấn <strong>"Thêm"</strong> ở góc phải trên.</div>
                </div>
              </div>
            ) : deferredPrompt ? (
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>CÀI ĐẶT ỨNG DỤNG VỀ ĐIỆN THOẠI</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  <span>Hướng dẫn trên Android (Chrome / Cốc Cốc):</span>
                </div>
                <div className="pl-2 space-y-1 text-slate-600 text-[11px]">
                  <div>1. Nhấn vào biểu tượng <strong>3 chấm (⋮)</strong> ở góc trên trình duyệt.</div>
                  <div>2. Chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính"</strong>.</div>
                </div>
              </div>
            )}
          </div>

          {/* Schedule summary */}
          <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Khung giờ chuông tự động nhắc mỗi sáng:</span>
            </div>
            <span className="font-black text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">
              06:45 • 07:00 • 07:15
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleTestChimeAndPush}
            className="text-xs font-bold text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Thử chuông ngay</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
