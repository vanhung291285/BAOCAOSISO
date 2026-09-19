import React, { useState, useEffect } from 'react';
import { SUPABASE_SQL_SCHEMA } from '../services/sqlSchema';
import { StorageService, TableSyncStatus } from '../services/storage';
import {
  getSupabaseCredentials,
  saveSupabaseCredentials,
  testSupabaseConnection,
  SupabaseConnectionStatus,
} from '../services/supabase';
import { SettingsNavTabs } from '../components/SettingsNavTabs';
import {
  Database,
  Copy,
  Check,
  RefreshCw,
  Server,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Code2,
  ArrowRight,
  Info,
  Loader2,
} from 'lucide-react';

export const SettingsSupabasePage: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Credentials
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Status & Testing
  const [testing, setTesting] = useState(false);
  const [connStatus, setConnStatus] = useState<SupabaseConnectionStatus | null>(null);

  // Table synchronization info
  const [syncStatusList, setSyncStatusList] = useState<TableSyncStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Sync actions
  const [syncingToCloud, setSyncingToCloud] = useState(false);
  const [syncingFromCloud, setSyncingFromCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const creds = getSupabaseCredentials();
    setSupabaseUrl(creds.url);
    setSupabaseKey(creds.anonKey);

    // Initial check
    checkConnectionAndTables();
  }, []);

  const checkConnectionAndTables = async () => {
    setLoadingStatus(true);
    try {
      const status = await testSupabaseConnection();
      setConnStatus(status);

      const tableStatuses = await StorageService.getSupabaseSyncStatus();
      setSyncStatusList(tableStatuses);
    } catch (err: any) {
      console.error('Error checking sync status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setSyncMessage(null);
    try {
      const status = await testSupabaseConnection();
      setConnStatus(status);
      const tableStatuses = await StorageService.getSupabaseSyncStatus();
      setSyncStatusList(tableStatuses);

      if (status.connected) {
        setSyncMessage({
          type: 'success',
          text: status.message,
        });
      } else {
        setSyncMessage({
          type: 'error',
          text: status.message,
        });
      }
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Lỗi kiểm tra kết nối: ${err?.message || err}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    saveSupabaseCredentials(supabaseUrl, supabaseKey);
    setSyncMessage({
      type: 'info',
      text: 'Đã lưu thông số kết nối Supabase! Đang kiểm tra kết nối...',
    });
    
    setTesting(true);
    try {
      const status = await testSupabaseConnection();
      setConnStatus(status);
      const tableStatuses = await StorageService.getSupabaseSyncStatus();
      setSyncStatusList(tableStatuses);

      if (status.connected) {
        setSyncMessage({
          type: 'info',
          text: status.message + ' Đang tự động lấy dữ liệu mới nhất từ Cloud...',
        });
        
        // Auto-pull from cloud on successful connection
        const pullRes = await StorageService.syncAllFromSupabase();
        if (pullRes.success) {
          setSyncMessage({ type: 'success', text: 'Kết nối thành công và đã đồng bộ dữ liệu từ Cloud!' });
          // Force UI refresh via realtime channel
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sso_realtime_update', { detail: { table: 'all' } }));
          }
        } else {
          setSyncMessage({ type: 'error', text: 'Kết nối thành công nhưng lỗi khi lấy dữ liệu: ' + pullRes.message });
        }
      } else {
        setSyncMessage({
          type: 'error',
          text: status.message,
        });
      }
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Lỗi kiểm tra kết nối: ${err?.message || err}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleUploadAllToCloud = async () => {
    if (!connStatus?.connected) {
      alert('Vui lòng kiểm tra và đảm bảo kết nối Supabase thành công trước khi đẩy dữ liệu.');
      return;
    }

    setSyncingToCloud(true);
    setSyncMessage({ type: 'info', text: 'Đang đẩy toàn bộ thiết lập và dữ liệu lên Supabase Cloud...' });

    try {
      const res = await StorageService.syncAllToSupabase();
      if (res.success) {
        setSyncMessage({
          type: 'success',
          text: res.message,
        });
      } else {
        setSyncMessage({
          type: 'error',
          text: res.message,
        });
      }
      // Re-check tables
      const tableStatuses = await StorageService.getSupabaseSyncStatus();
      setSyncStatusList(tableStatuses);
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Lỗi đồng bộ lên Supabase: ${err?.message || err}`,
      });
    } finally {
      setSyncingToCloud(false);
    }
  };

  const handlePullAllFromCloud = async () => {
    if (!connStatus?.connected) {
      alert('Vui lòng kiểm tra kết nối Supabase trước khi tải dữ liệu.');
      return;
    }

    if (
      !window.confirm(
        'Thao tác này sẽ tải dữ liệu mới nhất từ Supabase Cloud và cập nhật vào bộ nhớ máy này. Bạn có muốn tiếp tục?'
      )
    ) {
      return;
    }

    setSyncingFromCloud(true);
    setSyncMessage({ type: 'info', text: 'Đang tải dữ liệu từ Supabase Cloud về máy...' });

    try {
      const res = await StorageService.syncAllFromSupabase();
      if (res.success) {
        setSyncMessage({
          type: 'success',
          text: res.message,
        });
      } else {
        setSyncMessage({
          type: 'error',
          text: res.message,
        });
      }
      const tableStatuses = await StorageService.getSupabaseSyncStatus();
      setSyncStatusList(tableStatuses);
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Lỗi tải dữ liệu từ Supabase: ${err?.message || err}`,
      });
    } finally {
      setSyncingFromCloud(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetSampleData = () => {
    if (
      window.confirm(
        'Bạn có chắc chắn muốn đặt lại tất cả dữ liệu về mặc định rỗng để cấu hình lại từ đầu không?'
      )
    ) {
      StorageService.resetAllDataToEmpty();
      setResetSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Settings Navigation Tabs */}
      <SettingsNavTabs currentPath="/settings/supabase" />

      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              ĐỒNG BỘ CSDL SUPABASE CLOUD
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Đảm bảo 100% mọi thiết lập nhà trường, năm học, tài khoản, chỉ tiêu và số liệu sĩ số được lưu trữ bền vững trên đám mây
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={checkConnectionAndTables}
            disabled={loadingStatus}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors"
            title="Làm mới trạng thái kết nối và số liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Kiểm tra lại</span>
          </button>

          <button
            type="button"
            onClick={handleResetSampleData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
            <span>Khôi phục mẫu</span>
          </button>
        </div>
      </div>

      {resetSuccess && (
        <div className="p-4 bg-emerald-100 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 animate-in fade-in duration-200">
          Đã khôi phục dữ liệu mẫu thành công! Đang tải lại ứng dụng...
        </div>
      )}

      {syncMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-start gap-2.5 ${
            syncMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
              : syncMessage.type === 'error'
              ? 'bg-red-50 border border-red-300 text-red-900'
              : 'bg-blue-50 border border-blue-300 text-blue-900'
          }`}
        >
          {syncMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : syncMessage.type === 'error' ? (
            <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          )}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* Cloud Connection & Status Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`w-3.5 h-3.5 rounded-full ${
                connStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <div>
              <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>Trạng thái kết nối Supabase Cloud:</span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-extrabold ${
                    connStatus?.connected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {connStatus?.connected ? 'ĐÃ KẾT NỐI CLOUD' : 'CHƯA KẾT NỐI HOẶC CẦN KHỞI TẠO SQL'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {connStatus?.connected
                  ? `Máy chủ phản hồi trong ${connStatus.latencyMs ?? 0}ms • URL: ${connStatus.url}`
                  : connStatus?.message || 'Chưa nhận diện kết nối Supabase'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Server className="w-4 h-4 text-slate-600" />}
              <span>{testing ? 'Đang kiểm tra...' : 'Test kết nối'}</span>
            </button>
          </div>
        </div>

        {/* 1-Click Sync Command Bar */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-blue-900 uppercase tracking-wide">
              Đồng bộ dữ liệu hai chiều (Dual Sync)
            </div>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Tất cả thao tác chỉnh sửa thiết lập và ghi sổ sĩ số đều được tự động lưu đồng thời vào Supabase Cloud.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleUploadAllToCloud}
              disabled={syncingToCloud || !connStatus?.connected}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors disabled:opacity-50"
            >
              {syncingToCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>Đẩy tất cả lên Supabase</span>
            </button>

            <button
              type="button"
              onClick={handlePullAllFromCloud}
              disabled={syncingFromCloud || !connStatus?.connected}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors disabled:opacity-50"
            >
              {syncingFromCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <DownloadCloud className="w-4 h-4" />
              )}
              <span>Tải từ Supabase về</span>
            </button>
          </div>
        </div>

        {/* Sync Status Table by Entity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span>Chi tiết kiểm toán dữ liệu các bảng (Supabase vs Bộ nhớ cục bộ):</span>
            <span className="text-[11px] text-slate-500 font-normal">
              {syncStatusList.filter((s) => s.inSync).length}/{syncStatusList.length} bảng khớp 100%
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="px-3.5 py-2.5">Bảng dữ liệu</th>
                  <th className="px-3.5 py-2.5 text-center">Bản ghi máy này</th>
                  <th className="px-3.5 py-2.5 text-center">Bản ghi Supabase Cloud</th>
                  <th className="px-3.5 py-2.5 text-center">Trạng thái đồng bộ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {syncStatusList.map((st) => (
                  <tr key={st.table} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5">
                      <div className="font-bold text-slate-800">{st.label}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {st.table}
                        {st.table === 'system_logs' && (
                          <span className="text-slate-400 font-sans block text-[9px] mt-0.5 leading-normal max-w-md">
                            * Trình duyệt chỉ lưu tối đa 100-200 dòng mới nhất để tránh đầy bộ nhớ máy, đám mây lưu trữ toàn bộ lịch sử vĩnh viễn.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-bold text-slate-700">
                      {st.localCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-bold text-blue-700">
                      {st.error ? (
                        <span className="text-amber-600 text-[10px]">Chưa tạo</span>
                      ) : (
                        st.cloudCount
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      {st.inSync ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Đồng bộ hoàn hảo
                        </span>
                      ) : st.error ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Cần chạy SQL Schema
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          Chờ đồng bộ ({st.localCount} / {st.cloudCount})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supabase URL & Key Form */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Cấu hình Thông số Kết nối Supabase Project
            </h2>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              <span>Mở Supabase Dashboard</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Supabase Anon / Public API Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveConnection}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
            >
              Lưu & Kiểm tra kết nối
            </button>
          </div>
        </div>
      </div>

      {/* SQL Script View & 1-Click Copy */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                KỊCH BẢN TẠO BẢNG SUPABASE (SQL DDL, RLS & REALTIME)
              </h2>
              <p className="text-xs text-slate-500">
                1. Sao chép đoạn mã SQL bên dưới → 2. Mở Supabase SQL Editor → 3. Dán và bấm Run để tạo bảng trong 5 giây
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopySql}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'ĐÃ SAO CHÉP SQL!' : 'SAO CHÉP SQL SCHEMA'}</span>
          </button>
        </div>

        <div className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-[440px]">
          <pre>{SUPABASE_SQL_SCHEMA}</pre>
        </div>
      </div>
    </div>
  );
};
