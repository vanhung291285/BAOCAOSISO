import React, { useState, useRef, useEffect } from 'react';
import {
  PenTool,
  CheckCircle2,
  X,
  Upload,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Calendar,
  MapPin,
  UserCheck,
  Database,
  Lock,
  FileCheck,
  Sparkles,
} from 'lucide-react';
import { BoardingSignatureConfig, BoardingMonthSignature } from '../types';
import { StorageService } from '../services/storage';
import { isSupabaseConnected } from '../services/supabase';

interface BoardingDigitalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  classNameStr: string;
  selectedMonth: string;
  monthNum: number;
  yearNum: number;
  currentTeacherName: string;
  currentLocation: string;
  sigConfig: BoardingSignatureConfig;
  monthSig: BoardingMonthSignature | null;
  onConfigSaved: (config: BoardingSignatureConfig) => void;
  onMonthSigSaved: (sig: BoardingMonthSignature | null) => void;
}

export const BoardingDigitalSignatureModal: React.FC<BoardingDigitalSignatureModalProps> = ({
  isOpen,
  onClose,
  classId,
  classNameStr,
  selectedMonth,
  monthNum,
  yearNum,
  currentTeacherName,
  currentLocation,
  sigConfig,
  monthSig,
  onConfigSaved,
  onMonthSigSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'sign' | 'sql'>('config');
  const [locationName, setLocationName] = useState<string>(sigConfig.location_name || currentLocation || 'Xa Dung');
  const [teacherTitle, setTeacherTitle] = useState<string>(sigConfig.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM');
  const [teacherName, setTeacherName] = useState<string>(sigConfig.teacher_name || currentTeacherName || '');
  const [enableDigitalSig, setEnableDigitalSig] = useState<boolean>(sigConfig.enable_digital_signature ?? true);
  const [certificateSerial, setCertificateSerial] = useState<string>(sigConfig.certificate_serial || '');
  const [signatureImageUrl, setSignatureImageUrl] = useState<string>(sigConfig.signature_image_url || '');
  const [stampImageUrl, setStampImageUrl] = useState<string>(sigConfig.stamp_image_url || '');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const fileInputSigRef = useRef<HTMLInputElement>(null);
  const fileInputStampRef = useRef<HTMLInputElement>(null);

  // Sync state when props change
  useEffect(() => {
    setLocationName(sigConfig.location_name || currentLocation || 'Xa Dung');
    setTeacherTitle(sigConfig.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM');
    setTeacherName(sigConfig.teacher_name || currentTeacherName || '');
    setEnableDigitalSig(sigConfig.enable_digital_signature ?? true);
    setCertificateSerial(sigConfig.certificate_serial || '');
    setSignatureImageUrl(sigConfig.signature_image_url || '');
    setStampImageUrl(sigConfig.stamp_image_url || '');
  }, [sigConfig, currentTeacherName, currentLocation]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const updated: BoardingSignatureConfig = {
        ...sigConfig,
        id: classId ? `sig_config_${classId}` : 'default',
        class_id: classId,
        location_name: locationName.trim() || 'Xa Dung',
        teacher_title: teacherTitle.trim() || 'GIÁO VIÊN CHỦ NHIỆM',
        teacher_name: teacherName.trim() || currentTeacherName,
        enable_digital_signature: enableDigitalSig,
        signature_image_url: signatureImageUrl,
        stamp_image_url: stampImageUrl,
        certificate_serial: certificateSerial.trim(),
        updated_at: new Date().toISOString(),
      };

      const saved = await StorageService.saveBoardingSignatureConfig(updated);
      localStorage.setItem('sso_boarding_signing_location', updated.location_name);
      localStorage.setItem(`sso_boarding_teacher_${classId}`, updated.teacher_name);

      onConfigSaved(saved);
      alert('Đã lưu cấu hình chữ ký số thành công lên cơ sở dữ liệu Supabase!');
    } catch (e) {
      console.error('Error saving signature config:', e);
      alert('Lỗi khi lưu cấu hình chữ ký số!');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignMonth = async () => {
    setIsSaving(true);
    try {
      const signer = teacherName.trim() || currentTeacherName || 'GVCN';
      const hash = `SIG-${(classNameStr || 'CLASS').replace(/\s+/g, '')}-${selectedMonth}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const newSig: BoardingMonthSignature = {
        id: `sig_${classId}_${selectedMonth}`,
        class_id: classId,
        month: selectedMonth,
        is_signed: true,
        signed_by_name: signer,
        signed_by_role: 'GVCN',
        signed_at: new Date().toISOString(),
        location_name: locationName.trim() || 'Xa Dung',
        signature_image_url: signatureImageUrl,
        certificate_hash: hash,
        notes: `Ký duyệt điện tử Sổ chấm cơm Tháng ${monthNum}/${yearNum}`,
        created_at: monthSig?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await StorageService.saveBoardingMonthSignature(newSig);
      onMonthSigSaved(saved);
      alert(`Đã ký số thành công cho Tháng ${monthNum}/${yearNum}! Dữ liệu đã được lưu trữ an toàn trên Supabase.`);
    } catch (e) {
      console.error('Error signing month:', e);
      alert('Lỗi khi thực hiện ký số!');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeSignature = async () => {
    if (!monthSig) return;
    if (window.confirm(`Bạn có chắc muốn HỦY chữ ký số của Tháng ${monthNum}/${yearNum}?`)) {
      setIsSaving(true);
      try {
        const revoked: BoardingMonthSignature = {
          ...monthSig,
          is_signed: false,
          signed_at: undefined,
          certificate_hash: undefined,
          updated_at: new Date().toISOString(),
        };
        const saved = await StorageService.saveBoardingMonthSignature(revoked);
        onMonthSigSaved(saved);
        alert('Đã hủy chữ ký số thành công.');
      } catch (e) {
        console.error('Error revoking signature:', e);
        alert('Lỗi khi hủy chữ ký số!');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Upload helpers (Base64)
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>, type: 'signature' | 'stamp') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Kích thước ảnh tối đa là 2MB!');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'signature') {
        setSignatureImageUrl(result);
      } else {
        setStampImageUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const sqlSchemaCode = `-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA: CẤU HÌNH CHỮ KÝ SỐ & SỔ BÁN TRÚ
-- Chạy đoạn mã này trong Supabase -> SQL Editor -> New query -> Run
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.boarding_signature_configs (
    id TEXT PRIMARY KEY,                          -- 'default' hoặc 'sig_config_<class_id>'
    class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
    location_name TEXT DEFAULT 'Xa Dung',        -- Địa danh ký
    teacher_title TEXT DEFAULT 'GIÁO VIÊN CHỦ NHIỆM',
    teacher_name TEXT NOT NULL DEFAULT '',        -- Họ và tên GVCN ký
    principal_title TEXT DEFAULT 'HIỆU TRƯỞNG',
    principal_name TEXT DEFAULT '',               -- Họ và tên Hiệu trưởng
    accountant_title TEXT DEFAULT 'KẾ TOÁN BÁN TRÚ',
    accountant_name TEXT DEFAULT '',              -- Họ và tên Kế toán
    enable_digital_signature BOOLEAN DEFAULT true,-- Bật/tắt chữ ký số
    signature_image_url TEXT DEFAULT '',          -- Ảnh chữ ký số GVCN (Base64/URL)
    stamp_image_url TEXT DEFAULT '',              -- Ảnh con dấu đỏ điện tử
    certificate_serial TEXT DEFAULT '',           -- Mã chứng thư số
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.boarding_month_signatures (
    id TEXT PRIMARY KEY,                          -- 'sig_<class_id>_<YYYY-MM>'
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    month TEXT NOT NULL,                          -- 'YYYY-MM'
    is_signed BOOLEAN DEFAULT false,              -- Trạng thái đã ký số
    signed_by_name TEXT DEFAULT '',               -- Họ tên người ký
    signed_by_role TEXT DEFAULT 'GVCN',           -- Vai trò ('GVCN', 'BGH', 'KETOAN')
    signed_at TIMESTAMPTZ,                        -- Thời gian ký số
    location_name TEXT DEFAULT 'Xa Dung',
    signature_image_url TEXT DEFAULT '',
    certificate_hash TEXT DEFAULT '',             -- Mã Hash xác thực chống sửa đổi
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_class_month_signature UNIQUE (class_id, month)
);

-- RLS & Realtime Policies
ALTER TABLE public.boarding_signature_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_month_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to boarding_signature_configs"
ON public.boarding_signature_configs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to boarding_month_signatures"
ON public.boarding_month_signatures FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_signature_configs;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_month_signatures;
    END IF;
END $$;`;

  const copySql = () => {
    navigator.clipboard.writeText(sqlSchemaCode);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const isSupabaseOnline = isSupabaseConnected();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-4 overflow-y-auto select-none">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg flex items-center gap-2">
                <span>Cấu hình Chữ ký số & Ký duyệt điện tử</span>
                {isSupabaseOnline ? (
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Supabase Connected
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    Offline / LocalStorage
                  </span>
                )}
              </h3>
              <p className="text-xs text-blue-200/80">
                Lớp {classNameStr} • Tháng {monthNum}/{yearNum} • Tự động lưu trữ trên Supabase PostgreSQL
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'border-blue-600 text-blue-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Thiết lập Chữ ký & Thông tin</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sign')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sign'
                ? 'border-blue-600 text-blue-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Ký duyệt Sổ Tháng {monthNum}/{yearNum}</span>
            {monthSig?.is_signed && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sql'
                ? 'border-blue-600 text-blue-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Mã SQL Supabase</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {activeTab === 'config' && (
            <div className="space-y-5">
              {/* Enable Digital Signature Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50/60 border border-blue-200">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs sm:text-sm text-blue-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Bật chế độ Chữ ký số & Con dấu điện tử</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Khi bật, biểu mẫu xuất PDF và in ấn sẽ hiển thị chữ ký số, con dấu đỏ và mã xác thực điện tử.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDigitalSig}
                    onChange={(e) => setEnableDigitalSig(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Location & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Địa danh ký:</span>
                  </label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Xa Dung"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Xuất hiện trên dòng: "Xa Dung, ngày... tháng... năm..."</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Chức danh người ký:</span>
                  </label>
                  <input
                    type="text"
                    value={teacherTitle}
                    onChange={(e) => setTeacherTitle(e.target.value)}
                    placeholder="GIÁO VIÊN CHỦ NHIỆM"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Teacher Name & Serial */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <span>Họ và tên Giáo viên chủ nhiệm:</span>
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="Vũ Văn Hùng"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Mã số chứng thư số (Tùy chọn):</span>
                  </label>
                  <input
                    type="text"
                    value={certificateSerial}
                    onChange={(e) => setCertificateSerial(e.target.value)}
                    placeholder="CA-VN-2026-XD6A1"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Upload Signature Image & Stamp Image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Ảnh Chữ ký */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center">
                  <div className="text-xs font-bold text-slate-800 mb-2">Ảnh Chữ ký GVCN</div>
                  {signatureImageUrl ? (
                    <div className="space-y-2 w-full flex flex-col items-center">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs max-h-24 flex items-center justify-center">
                        <img src={signatureImageUrl} alt="Chữ ký mẫu" className="max-h-20 object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSignatureImageUrl('')}
                        className="text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa ảnh</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputSigRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadImage(e, 'signature')}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputSigRef.current?.click()}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Tải ảnh chữ ký (PNG/JPG)</span>
                      </button>
                      <p className="text-[10px] text-slate-500 mt-1.5">Ảnh nền trong suốt (PNG) hiển thị đẹp nhất</p>
                    </div>
                  )}
                </div>

                {/* Ảnh Con dấu đỏ */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center">
                  <div className="text-xs font-bold text-slate-800 mb-2">Ảnh Con dấu đỏ điện tử</div>
                  {stampImageUrl ? (
                    <div className="space-y-2 w-full flex flex-col items-center">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs max-h-24 flex items-center justify-center">
                        <img src={stampImageUrl} alt="Con dấu mẫu" className="max-h-20 object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setStampImageUrl('')}
                        className="text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa con dấu</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputStampRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadImage(e, 'stamp')}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputStampRef.current?.click()}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Tải ảnh con dấu đỏ</span>
                      </button>
                      <p className="text-[10px] text-slate-500 mt-1.5">Ảnh dấu tròn trường / phân hiệu</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sign' && (
            <div className="space-y-5">
              {/* Signature Status Box */}
              <div className={`p-5 rounded-2xl border ${monthSig?.is_signed ? 'bg-emerald-50/80 border-emerald-300' : 'bg-amber-50/80 border-amber-300'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {monthSig?.is_signed ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <span className="font-extrabold text-sm sm:text-base text-emerald-950">
                            ĐÃ KÝ SỐ XÁC NHẬN SỔ THÁNG {monthNum}/{yearNum}
                          </span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-5 h-5 text-amber-600" />
                          <span className="font-extrabold text-sm sm:text-base text-amber-950">
                            CHƯA KÝ SỐ SỔ CHẤM CƠM THÁNG {monthNum}/{yearNum}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      {monthSig?.is_signed
                        ? `Được ký bởi ${monthSig.signed_by_name} (${monthSig.signed_by_role}) vào lúc ${new Date(monthSig.signed_at || '').toLocaleString('vi-VN')}.`
                        : 'Giáo viên chủ nhiệm kiểm tra số liệu toàn bộ tháng và bấm "Ký số ngay" để hoàn tất xác nhận báo cáo bán trú.'}
                    </p>
                    {monthSig?.certificate_hash && (
                      <div className="mt-2 text-[11px] font-mono text-emerald-900 bg-white/80 p-2 rounded-xl border border-emerald-200">
                        Mã Hash xác thực: <strong>{monthSig.certificate_hash}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons for Signing */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {monthSig?.is_signed ? (
                  <button
                    type="button"
                    onClick={handleRevokeSignature}
                    disabled={isSaving}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Hủy xác nhận chữ ký số</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignMonth}
                    disabled={isSaving}
                    className="px-5 py-3 rounded-xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>{isSaving ? 'Đang ký số...' : `Ký số xác nhận Sổ Tháng ${monthNum}/${yearNum}`}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">
                  Câu lệnh SQL khởi tạo bảng chữ ký số trên Supabase:
                </p>
                <button
                  type="button"
                  onClick={copySql}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Đã sao chép!' : 'Sao chép SQL'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 text-slate-200 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-[280px] border border-slate-800 leading-relaxed">
                {sqlSchemaCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            {isSupabaseOnline ? '✓ Đồng bộ dữ liệu Supabase Cloud tự động' : '⚠️ Đang lưu cục bộ trên trình duyệt'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer transition-all"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
