import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { SchoolSettings, SchoolYear } from '../types';
import { SettingsNavTabs } from '../components/SettingsNavTabs';
import {
  School,
  Save,
  CheckCircle,
  Palette,
  Building,
  Phone,
  Mail,
  UserCheck,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Check,
  Lock,
  Unlock,
  Trash2,
  AlertCircle,
  Code2,
  Clock,
  BellRing,
  Globe,
  Settings,
  Sparkles,
  Trophy,
  Utensils,
  Coffee,
  Sun,
  Moon,
  FileSpreadsheet,
  Calculator,
} from 'lucide-react';

export const SettingsSchoolPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const {
    settings,
    updateSchoolSettings,
    years,
    activeYear,
    setActiveSchoolYear,
    saveSchoolYear,
    deleteSchoolYear,
    toggleLockSchoolYear,
  } = useSchool();

  const [formData, setFormData] = useState<Partial<SchoolSettings>>(settings || {});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // School Year State
  const [newYearName, setNewYearName] = useState('');
  const [yearError, setYearError] = useState('');
  const [isSavingYear, setIsSavingYear] = useState(false);
  const [yearSuccessMsg, setYearSuccessMsg] = useState('');

  // Handle adding new year
  const handleAddNewSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setYearError('');
    setYearSuccessMsg('');
    const trimmed = newYearName.trim();
    if (!trimmed) {
      setYearError('Vui lòng nhập tên năm học (ví dụ: 2027-2028).');
      return;
    }

    const exists = years.some((y) => y.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setYearError('Năm học này đã có trong danh sách.');
      return;
    }

    setIsSavingYear(true);
    try {
      const newYearId = `year_${trimmed.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}`;
      const newYear: SchoolYear = {
        id: newYearId,
        name: trimmed,
        is_active: true,
        is_locked: false,
        created_at: new Date().toISOString(),
      };
      await saveSchoolYear(newYear);
      await setActiveSchoolYear(newYearId);
      setNewYearName('');
      setYearSuccessMsg(`Đã tạo và kích hoạt thành công Năm học ${trimmed}!`);
      setTimeout(() => setYearSuccessMsg(''), 4000);
    } catch {
      setYearError('Có lỗi xảy ra khi lưu năm học mới.');
    } finally {
      setIsSavingYear(false);
    }
  };

  // Handle switching active year
  const handleSelectYear = async (yearId: string) => {
    try {
      await setActiveSchoolYear(yearId);
      setYearSuccessMsg('Đã chuyển đổi năm học hoạt động thành công!');
      setTimeout(() => setYearSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  // Handle locking/unlocking year
  const handleToggleLock = async (yearId: string, currentLocked?: boolean) => {
    try {
      await toggleLockSchoolYear(yearId, !currentLocked);
    } catch (e) {
      console.error(e);
    }
  };

  // Handle delete year
  const handleDeleteYear = async (yearId: string) => {
    if (yearId === activeYear?.id) {
      alert('Không thể xóa năm học đang hoạt động!');
      return;
    }
    if (confirm('Bạn có chắc chắn muốn xóa năm học này khỏi hệ thống?')) {
      try {
        await deleteSchoolYear(yearId);
        setYearSuccessMsg('Đã xóa năm học thành công!');
        setTimeout(() => setYearSuccessMsg(''), 4000);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSchoolSettings(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // If user is not an administrator, deny access
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
          QUYỀN TRUY CẬP BỊ GIỚI HẠN
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          Chức năng cấu hình năm học và thông tin trường chỉ dành riêng cho tài khoản <strong>Quản trị viên (ADMIN)</strong>.
        </p>
        <p className="text-xs text-slate-500">
          Tài khoản hiện tại: <strong className="text-slate-800">{currentUser?.full_name}</strong> ({currentUser?.role})
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Sub-Tabs */}
      <SettingsNavTabs currentPath="/settings/school" />

      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
              Quản trị viên hệ thống
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-700" />
            <span>⚙️ CẤU HÌNH NHÀ TRƯỜNG</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý thông tin nhà trường, năm học, giờ chốt báo cáo và cài đặt giao diện
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {savedSuccess && (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold animate-in fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Đã lưu & đồng bộ thành công!</span>
            </div>
          )}
          <button
            type="submit"
            form="school-settings-form"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu...' : 'LƯU TOÀN BỘ CẤU HÌNH'}</span>
          </button>
        </div>
      </div>

      <form id="school-settings-form" onSubmit={handleSubmit} className="space-y-6">
        {/* CARD 1: THÔNG TIN CHUNG TRƯỜNG HỌC */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-700" />
              <span>1. THÔNG TIN CHUNG TRƯỜNG HỌC</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thông tin hiển thị trên đầu các biểu mẫu in ấn, xuất Excel và thanh tiêu đề
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên trường đầy đủ *
              </label>
              <input
                type="text"
                required
                value={formData.school_name || ''}
                onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                placeholder="Ví dụ: Trường PTDTBT THCS Xa Dung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên viết tắt / Tên ngắn *
              </label>
              <input
                type="text"
                required
                value={formData.short_name || ''}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                placeholder="Ví dụ: THCS Xa Dung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Cơ quan chủ quản cấp trên
              </label>
              <input
                type="text"
                value={formData.sub_department_name || ''}
                onChange={(e) => setFormData({ ...formData, sub_department_name: e.target.value })}
                placeholder="Ví dụ: UBND HUYỆN ĐIỆN BIÊN ĐÔNG"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Phòng Giáo dục & Đào tạo
              </label>
              <input
                type="text"
                value={formData.department_name || ''}
                onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                placeholder="Ví dụ: PHÒNG GD&ĐT HUYỆN ĐIỆN BIÊN ĐÔNG"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Địa chỉ trường
              </label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Ví dụ: Bản Xa Dung A, Xã Xa Dung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Xã / Phường / Thị trấn
              </label>
              <input
                type="text"
                value={formData.commune || ''}
                onChange={(e) => setFormData({ ...formData, commune: e.target.value })}
                placeholder="Ví dụ: Xã Xa Dung"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tỉnh / Thành phố
              </label>
              <input
                type="text"
                value={formData.province || ''}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="Ví dụ: Tỉnh Điện Biên"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Ví dụ: 0984246993"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email nhà trường
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Ví dụ: c2xadung.dbd@dienbien.edu.vn"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Website cổng thông tin trường
              </label>
              <input
                type="url"
                value={formData.website || ''}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://thcsxadung.db.edu.vn"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Website Kết quả học tập học sinh
              </label>
              <input
                type="url"
                value={formData.student_results_url || ''}
                onChange={(e) => setFormData({ ...formData, student_results_url: e.target.value })}
                placeholder="https://kqht.db.edu.vn"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* CARD 2: NĂM HỌC & THỜI GIAN HỌC */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-700" />
                <span>2. NĂM HỌC & HỌC KỲ</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý các năm học, kích hoạt năm học hiện hành và cấu hình tuần học
              </p>
            </div>

            {activeYear && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-xl text-xs font-bold text-purple-900">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Năm học hiện hành: <strong>{activeYear.name}</strong></span>
              </div>
            )}
          </div>

          {yearSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{yearSuccessMsg}</span>
            </div>
          )}

          {/* Add Year Form */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tạo năm học mới
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={newYearName}
                onChange={(e) => setNewYearName(e.target.value)}
                placeholder="Ví dụ: 2027-2028"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              />
              <button
                type="button"
                onClick={handleAddNewSchoolYear}
                disabled={isSavingYear || !newYearName.trim()}
                className="px-5 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isSavingYear ? 'Đang tạo...' : 'Tạo & Áp dụng'}</span>
              </button>
            </div>
            {yearError && (
              <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{yearError}</span>
              </p>
            )}
          </div>

          {/* List of Years */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {years.map((y) => {
              const isActive = y.id === activeYear?.id;
              return (
                <div
                  key={y.id}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                    isActive
                      ? 'bg-purple-50/80 border-purple-300 ring-2 ring-purple-400/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className={`w-4 h-4 ${isActive ? 'text-purple-700' : 'text-slate-400'}`} />
                      <span className={`text-sm font-black ${isActive ? 'text-purple-950' : 'text-slate-800'}`}>
                        Năm học {y.name}
                      </span>
                    </div>

                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-600 text-white">
                        <Check className="w-3 h-3" /> Đang áp dụng
                      </span>
                    ) : y.is_locked ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Đã khóa
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">Chưa áp dụng</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleLock(y.id, y.is_locked)}
                        title={y.is_locked ? 'Mở khóa năm học này' : 'Khóa dữ liệu năm học này'}
                        className={`p-1.5 rounded-lg border text-xs transition-colors ${
                          y.is_locked
                            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {y.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleDeleteYear(y.id)}
                          title="Xóa năm học"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => handleSelectYear(y.id)}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 border border-slate-300 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                      >
                        Kích hoạt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Academic dates & weeks configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ngày bắt đầu Tuần 1 (Khai giảng)
              </label>
              <input
                type="date"
                value={formData.week1_start_date || '2026-09-07'}
                onChange={(e) => setFormData({ ...formData, week1_start_date: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Dùng làm mốc tự động tính Tuần 1, Tuần 2,... cho bảng xếp hạng thi đua
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Số ngày học trong tuần
              </label>
              <select
                value={formData.school_days_per_week || 5}
                onChange={(e) => setFormData({ ...formData, school_days_per_week: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              >
                <option value={5}>5 ngày (Thứ Hai đến Thứ Sáu)</option>
                <option value={6}>6 ngày (Thứ Hai đến Thứ Bảy)</option>
              </select>
            </div>
          </div>
        </div>

        {/* CARD: CẤU HÌNH CHẤM ĂN THỨ 6, THỨ 7 & TÊN SỔ CHẤM BÁN TRÚ */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Utensils className="w-4 h-4 text-orange-600" />
                <span>CẤU HÌNH CHẤM ĂN THỨ 6, THỨ 7 & TÊN SỔ CHẤM BÁN TRÚ</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thiết lập các bữa ăn bán trú (Sáng, Trưa, Tối) ngày Thứ 6, Thứ 7; cho phép tài khoản GVCN báo sĩ số và đồng bộ tự động sang sổ chấm ăn
              </p>
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shrink-0 self-start sm:self-auto">
              Đồng bộ Supabase Cloud
            </span>
          </div>

          {/* Section 1: Cấu hình Thứ 6 */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.allow_gvcn_report_friday ?? true}
                  onChange={(e) => setFormData({ ...formData, allow_gvcn_report_friday: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Cho phép GVCN báo sĩ số & chấm ăn cả ngày Thứ 6
                </span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                (Mặc định: Bật)
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              Chọn các bữa ăn bán trú phục vụ vào Thứ 6. Tích chọn để cho phép GVCN chấm ăn bữa đó:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Thứ 6 - Sáng */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.friday_breakfast ?? true
                  ? 'border-blue-600 bg-blue-50/60 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={formData.friday_breakfast ?? true}
                  onChange={(e) => setFormData({ ...formData, friday_breakfast: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5 text-blue-600" />
                    <span>Thứ 6: Bữa Sáng</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Ăn sáng tại trường</div>
                </div>
              </label>

              {/* Thứ 6 - Trưa */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.friday_lunch ?? true
                  ? 'border-amber-600 bg-amber-50/60 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={formData.friday_lunch ?? true}
                  onChange={(e) => setFormData({ ...formData, friday_lunch: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-600" />
                    <span>Thứ 6: Bữa Trưa</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Ăn trưa tại trường</div>
                </div>
              </label>

              {/* Thứ 6 - Tối */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.friday_dinner ?? false
                  ? 'border-purple-600 bg-purple-50/60 text-purple-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={formData.friday_dinner ?? false}
                  onChange={(e) => setFormData({ ...formData, friday_dinner: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5 text-purple-600" />
                    <span>Thứ 6: Bữa Tối</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formData.friday_dinner ? 'Đã bật ăn tối Thứ 6' : 'Mặc định HS về nhà'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: Cấu hình Thứ 7 */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.allow_gvcn_report_saturday || Boolean(formData.saturday_breakfast || formData.saturday_lunch || formData.saturday_dinner)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      allow_gvcn_report_saturday: checked,
                      school_days_per_week: checked ? 6 : (formData.school_days_per_week || 5),
                      saturday_lunch: checked ? (formData.saturday_lunch ?? true) : false,
                      saturday_breakfast: checked ? (formData.saturday_breakfast ?? false) : false,
                      saturday_dinner: checked ? (formData.saturday_dinner ?? false) : false,
                    });
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Cho phép GVCN báo sĩ số & chấm ăn cả ngày Thứ 7
                </span>
              </label>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                formData.allow_gvcn_report_saturday || formData.saturday_breakfast || formData.saturday_lunch || formData.saturday_dinner
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {formData.allow_gvcn_report_saturday || formData.saturday_breakfast || formData.saturday_lunch || formData.saturday_dinner
                  ? 'ĐÃ BẬT THỨ 7'
                  : 'ĐANG TẮT (HS NGHỈ)'}
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              Khi quản trị tích chọn các nút dưới đây, các tài khoản của GVCN được phép báo sĩ số cả ngày Thứ 7 và tự động đồng bộ sang sổ chấm ăn:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Thứ 7 - Sáng */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.saturday_breakfast
                  ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={Boolean(formData.saturday_breakfast)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      saturday_breakfast: checked,
                      allow_gvcn_report_saturday: checked || Boolean(formData.saturday_lunch || formData.saturday_dinner),
                      school_days_per_week: (checked || Boolean(formData.saturday_lunch || formData.saturday_dinner)) ? 6 : (formData.school_days_per_week || 5),
                    });
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Thứ 7: Bữa Sáng</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Chấm ăn sáng Thứ 7</div>
                </div>
              </label>

              {/* Thứ 7 - Trưa */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.saturday_lunch
                  ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={Boolean(formData.saturday_lunch)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      saturday_lunch: checked,
                      allow_gvcn_report_saturday: checked || Boolean(formData.saturday_breakfast || formData.saturday_dinner),
                      school_days_per_week: (checked || Boolean(formData.saturday_breakfast || formData.saturday_dinner)) ? 6 : (formData.school_days_per_week || 5),
                    });
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Thứ 7: Bữa Trưa</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Chấm ăn trưa Thứ 7</div>
                </div>
              </label>

              {/* Thứ 7 - Tối */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                formData.saturday_dinner
                  ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <input
                  type="checkbox"
                  checked={Boolean(formData.saturday_dinner)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      saturday_dinner: checked,
                      allow_gvcn_report_saturday: checked || Boolean(formData.saturday_breakfast || formData.saturday_lunch),
                      school_days_per_week: (checked || Boolean(formData.saturday_breakfast || formData.saturday_lunch)) ? 6 : (formData.school_days_per_week || 5),
                    });
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Thứ 7: Bữa Tối</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Chấm ăn tối Thứ 7</div>
                </div>
              </label>
            </div>
          </div>

          {/* Section 3: Cấu hình Tên sổ chấm ăn */}
          <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-2">
            <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>Cấu hình Tên sổ chấm (Hiển thị tiêu đề sổ, bản in & file Excel)</span>
            </label>
            <input
              type="text"
              value={formData.boarding_sheet_title || 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ'}
              onChange={(e) => setFormData({ ...formData, boarding_sheet_title: e.target.value })}
              placeholder="Ví dụ: SỔ CHẤM ĂN HỌC SINH BÁN TRÚ hoặc SỔ THEO DÕI ĂN BÁN TRÚ"
              className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-2xs"
            />
            <p className="text-[11px] text-slate-500">
              Tên sổ này sẽ tự động xuất hiện trên đầu bảng chấm cơm, tiêu đề xuất file Excel 2 trang chuẩn Bộ GD&ĐT và tiêu đề in ấn PDF.
            </p>
          </div>

          {/* Action button inside card */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/60 -mx-6 -mb-6 p-4 rounded-b-2xl">
            <span className="text-[11px] text-slate-600 font-medium">
              * Tích chọn các bữa trên và bấm nút này để lưu & đồng bộ tức thì sang tài khoản của tất cả GVCN.
            </span>
            <button
              type="button"
              disabled={isSaving}
              onClick={async (e) => {
                e.preventDefault();
                setIsSaving(true);
                try {
                  await updateSchoolSettings(formData);
                  setSavedSuccess(true);
                  setTimeout(() => setSavedSuccess(false), 4000);
                } catch (err) {
                  console.error('Lỗi khi lưu cấu hình chấm ăn:', err);
                } finally {
                  setIsSaving(false);
                }
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu đồng bộ...' : 'LƯU & ĐỒNG BỘ CẤU HÌNH NÀY TỚI GVCN'}</span>
            </button>
          </div>
        </div>

        {/* CARD 3: CẤU HÌNH BÁO CÁO & GIỜ GIỚI HẠN */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>3. CẤU HÌNH BÁO CÁO & GIỜ GIỚI HẠN</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thiết lập giờ giới hạn nộp báo cáo buổi sáng, thông báo tự động và điểm cộng thi đua
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Giờ giới hạn nộp báo cáo sáng (Điểm cộng báo sớm)
              </label>
              <input
                type="time"
                value={formData.early_report_deadline || '07:30'}
                onChange={(e) => setFormData({ ...formData, early_report_deadline: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                GVCN nộp trước giờ này sẽ được cộng điểm thi đua nền nếp báo cáo sớm
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Điểm cộng mỗi ngày nộp sớm (Điểm)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={formData.early_report_bonus_points ?? 0.5}
                onChange={(e) => setFormData({ ...formData, early_report_bonus_points: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
              />
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.enable_auto_reminder ?? true}
                  onChange={(e) => setFormData({ ...formData, enable_auto_reminder: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-xs font-bold text-slate-800">
                  Bật tính năng tự động phát thông báo nhắc nhở đến tài khoản GVCN chưa nộp báo cáo
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* CARD 4: CƠ CHẾ TÍNH TOÁN & CÔNG THỨC NHẬP SĨ SỐ (DÀNH CHO GVCN) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span>4. CƠ CHẾ TÍNH TOÁN KHI GVCN NHẬP SĨ SỐ</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy định công thức tự động tính số học sinh vắng hoặc có mặt trên màn hình điểm danh của GVCN
              </p>
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 self-start sm:self-auto">
              Đồng bộ tới GVCN
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <label
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                (formData.input_mode || 'MODE_1_TOTAL_PRESENT') === 'MODE_1_TOTAL_PRESENT'
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="school_input_mode"
                  value="MODE_1_TOTAL_PRESENT"
                  checked={(formData.input_mode || 'MODE_1_TOTAL_PRESENT') === 'MODE_1_TOTAL_PRESENT'}
                  onChange={() => setFormData({ ...formData, input_mode: 'MODE_1_TOTAL_PRESENT' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-black text-xs text-slate-900">Chế độ 1: Tổng số + Có mặt</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                    GVCN nhập <strong>Tổng số</strong> và <strong>Có mặt</strong>, hệ thống tự động tính <span className="font-bold text-rose-600">Vắng = Tổng - Có mặt</span>.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 self-start">
                Khuyên dùng
              </span>
            </label>

            <label
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                formData.input_mode === 'MODE_2_TOTAL_ABSENT'
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="school_input_mode"
                  value="MODE_2_TOTAL_ABSENT"
                  checked={formData.input_mode === 'MODE_2_TOTAL_ABSENT'}
                  onChange={() => setFormData({ ...formData, input_mode: 'MODE_2_TOTAL_ABSENT' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-black text-xs text-slate-900">Chế độ 2: Tổng số + Vắng</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                    GVCN nhập <strong>Tổng số</strong> và <strong>Vắng</strong>, hệ thống tự động tính <span className="font-bold text-emerald-700">Có mặt = Tổng - Vắng</span>.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 self-start">
                Nhanh gọn
              </span>
            </label>

            <label
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                formData.input_mode === 'MODE_3_ALL_THREE'
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="school_input_mode"
                  value="MODE_3_ALL_THREE"
                  checked={formData.input_mode === 'MODE_3_ALL_THREE'}
                  onChange={() => setFormData({ ...formData, input_mode: 'MODE_3_ALL_THREE' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-black text-xs text-slate-900">Chế độ 3: Nhập tự do cả 3</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Cho phép GVCN nhập tự do cả 3 chỉ số Tổng, Có mặt và Vắng, có cảnh báo nếu tổng không khớp.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 self-start">
                Tự do
              </span>
            </label>
          </div>
        </div>

        {/* CARD 5: CẤU HÌNH HIỂN THỊ & GIAO DIỆN */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-600" />
              <span>5. CẤU HÌNH HIỂN THỊ & GIAO DIỆN</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tùy chỉnh màu sắc thương hiệu, logo nhà trường và tiêu đề báo cáo
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Màu chủ đạo giao diện
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.primary_color || '#1e40af'}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300 p-0.5 bg-white"
                />
                <input
                  type="text"
                  value={formData.primary_color || '#1e40af'}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="w-32 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold uppercase bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Đường dẫn ảnh Logo trường (URL)
              </label>
              <input
                type="url"
                value={formData.logo_url || ''}
                onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Họ và tên Hiệu trưởng
              </label>
              <input
                type="text"
                value={formData.principal_name || ''}
                onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                placeholder="Ví dụ: Nguyễn Văn A"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Chức danh ký duyệt
              </label>
              <input
                type="text"
                value={formData.principal_title || 'HIỆU TRƯỞNG'}
                onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                placeholder="Ví dụ: HIỆU TRƯỞNG"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* CARD 5: THÔNG TIN NHÀ PHÁT TRIỂN */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600" />
              <span>5. ĐƠN VỊ PHÁT TRIỂN & HỖ TRỢ KỸ THUẬT</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thông tin hiển thị tại chân trang hệ thống
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên kỹ sư / Tác giả phát triển
              </label>
              <input
                type="text"
                value={formData.developer_name || 'Vũ Văn Hùng'}
                onChange={(e) => setFormData({ ...formData, developer_name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Số điện thoại liên hệ hỗ trợ
              </label>
              <input
                type="text"
                value={formData.developer_contact || 'SĐT: 0984246993'}
                onChange={(e) => setFormData({ ...formData, developer_contact: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
              />
            </div>
          </div>
        </div>

        {/* BOTTOM FIXED / PROMINENT SAVE ACTION */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 hidden sm:block">
            * Nhấn <strong>Lưu cấu hình</strong> để áp dụng toàn bộ các thay đổi lên hệ thống ngay lập tức.
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu cấu hình...' : 'LƯU CẤU HÌNH NHÀ TRƯỜNG'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
