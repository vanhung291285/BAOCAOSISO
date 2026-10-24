import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isClearing: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isClearing: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, isClearing: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = async () => {
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update().catch(() => {});
        }
      }
    } catch {}
    window.location.reload();
  };

  private handleResetCache = async () => {
    this.setState({ isClearing: true });
    try {
      // 1. Hủy đăng ký Service Worker để dọn dẹp các tệp JavaScript cũ bị lưu cache
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // 2. Xóa toàn bộ CacheStorage
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }

      // 3. Dọn dẹp phiên làm việc cũ
      sessionStorage.clear();
      localStorage.removeItem('sso_active_auth_user_id_v2');
      localStorage.removeItem('sso_session_active');
    } catch (e) {
      console.error('Error clearing cache:', e);
    }

    // Tải lại trang với timestamp để bỏ qua cache trình duyệt
    const targetUrl = window.location.origin + window.location.pathname + '?v=' + Date.now();
    window.location.href = targetUrl;
  };

  private handleGoHome = () => {
    window.location.href = window.location.origin + '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h1 className="text-lg font-bold text-slate-900 mb-1">Đã xảy ra lỗi hiển thị</h1>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Hệ thống đã ghi nhận lỗi. Để khắc phục triệt để trên máy này, bạn có thể tải lại trang hoặc bấm <b>Cập nhật bản mới & Xóa cache</b> để đồng bộ mã nguồn mới nhất.
            </p>

            {this.state.error && (
              <div className="bg-slate-100 p-3 rounded-xl text-left text-[11px] font-mono text-slate-700 mb-5 overflow-auto max-h-32 border border-slate-200">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={this.handleResetCache}
                disabled={this.state.isClearing}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{this.state.isClearing ? 'Đang dọn cache & tải bản mới...' : 'Cập nhật bản mới & Xóa cache'}</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tải lại trang</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Về trang chủ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
