import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  // General install/instructions flow
  return (
    <>
      <button
        onClick={isInstallable ? install : () => setShowIOSGuide(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shadow-md"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="whitespace-nowrap">Cài đặt ứng dụng</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowIOSGuide(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Cách cài đặt ứng dụng</h3>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {isIOS 
                ? <>1. Chạm vào nút <strong>Chia sẻ (Share)</strong> ở thanh công cụ Safari.<br />2. Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.</>
                : <>Nhấn vào menu trình duyệt (thường là biểu tượng 3 chấm) và chọn <strong>"Thêm vào màn hình chính" (Add to Home screen)</strong> để cài đặt ứng dụng.</>
              }
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
};
