import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-bold text-[11px] hover:bg-blue-200 transition-colors shadow-sm"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="whitespace-nowrap">Cài App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-bold text-[11px] hover:bg-blue-200 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Cài App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowIOSGuide(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900">Cài đặt trên iPhone/iPad</h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                1. Chạm vào nút <strong>Chia sẻ (Share)</strong> ở thanh công cụ Safari.<br />
                2. Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-100 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
