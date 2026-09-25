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
    await updateSchoolSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
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
      <SettingsNavTabs currentPath="/settings/school" />

      {/* Page Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200">
              Dành riêng cho Quản trị viên
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            CẤU HÌNH HỆ THỐNG & NĂM HỌC
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý các năm học và thiết lập thông tin hiển thị của nhà trường trên mọi biểu mẫu
          </p>
        </div>

        {savedSuccess && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Đã lưu thông tin trường!</span>
          </div>
        )}
      </div>

      {/* SECTION 1: CẤU HÌNH & QUẢN LÝ NĂM HỌC (ADMIN-ONLY) */}
      <div className="bg-white rounded-2xl p-6 border border-purple-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-purple-950 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-700" />
              1. CẤU HÌNH & QUẢN LÝ NĂM HỌC
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chỉ Quản trị viên mới có vai trò thêm năm học mới, kích hoạt năm học hoặc khóa dữ liệu
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
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{yearSuccessMsg}</span>
          </div>
        )}

        {/* Add New School Year Form */}
        <form onSubmit={handleAddNewSchoolYear} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Tạo năm học mới
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
              placeholder="Ví dụ: 2027-2028"
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
            />
            <button
              type="submit"
              disabled={isSavingYear || !newYearName.trim()}
              className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 flex-shrink-0 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{isSavingYear ? 'Đang tạo...' : 'Tạo & Áp dụng ngay'}</span>
            </button>
          </div>
          {yearError && (
            <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{yearError}</span>
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            * Sau khi tạo, năm học mới sẽ được tự động kích hoạt và áp dụng toàn hệ thống.
          </p>
        </form>

        {/* List of School Years */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Danh sách năm học ({years.length})
            </label>
            <span className="text-[11px] text-slate-400">Có thể chuyển đổi hoặc khóa năm học cũ</span>
          </div>

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
                        <Check className="w-3 h-3" />
                        Đang áp dụng
                      </span>
                    ) : y.is_locked ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Đã khóa
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        Chưa áp dụng
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      {/* Lock / Unlock button */}
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

                      {/* Delete button (non-active only) */}
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
                        className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 border border-slate-300 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-colors"
                      >
                        Kích hoạt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: THÔNG TIN NHÀ TRƯỜNG */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        {/* Section: Tên trường & Cơ quan chủ quản */}
        <div>
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Building className="w-4 h-4" /> 2. ĐƠN VỊ & CƠ QUAN CHỦ QUẢN (HIỂN THỊ TRÊN ĐẦU BÁO CÁO)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên trường đầy đủ
              </label>
              <input
                type="text"
                required
                value={formData.school_name || ''}
                onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên viết tắt / Mã trường
              </label>
              <input
                type="text"
                value={formData.short_name || ''}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Cơ quan chủ quản cấp 1 (Sở / UBND)
              </label>
              <input
                type="text"
                value={formData.sub_department_name || ''}
                onChange={(e) => setFormData({ ...formData, sub_department_name: e.target.value })}
                placeholder="UBND HUYỆN ĐIỆN BIÊN ĐÔNG"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Cơ quan chủ quản cấp 2 (Phòng GD&ĐT)
              </label>
              <input
                type="text"
                value={formData.department_name || ''}
                onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                placeholder="PHÒNG GD&ĐT ĐIỆN BIÊN ĐÔNG"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section: Địa chỉ & Liên hệ */}
        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Phone className="w-4 h-4" /> 3. ĐỊA CHỈ & THÔNG TIN LIÊN HỆ
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Xã / Phường
              </label>
              <input
                type="text"
                value={formData.commune || ''}
                onChange={(e) => setFormData({ ...formData, commune: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Huyện / Quận
              </label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email nhà trường
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section: Thông tin chữ ký */}
        <div className="pt-4 border-t border-slate-100">
          <div className="mb-4">
            <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> 4. THÔNG TIN CHỮ KÝ VÀ NGƯỜI LẬP BIỂU
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 italic">
              * Đây là thông tin mặc định. Bạn có thể cấu hình tên chữ ký riêng biệt cho từng phân hiệu tại phần <strong>Cài đặt Điểm trường / Phân hiệu</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Họ và tên Hiệu trưởng
              </label>
              <input
                type="text"
                value={formData.principal_name || ''}
                onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Chức danh ký duyệt
              </label>
              <input
                type="text"
                value={formData.principal_title || 'PHÓ HIỆU TRƯỞNG'}
                onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Họ và tên Người lập biểu mặc định
              </label>
              <input
                type="text"
                value={formData.reporter_name || ''}
                onChange={(e) => setFormData({ ...formData, reporter_name: e.target.value })}
                placeholder="Người lập biểu"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Chức danh Người lập biểu
              </label>
              <input
                type="text"
                value={formData.reporter_title || 'GIÁO VIÊN'}
                onChange={(e) => setFormData({ ...formData, reporter_title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section: Màu sắc giao diện */}
        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Palette className="w-4 h-4" /> 5. TÙY BIẾN NHẬN DIỆN THƯƠNG HIỆU
          </h2>
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Sử dụng hệ thống phân hiệu
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="checkbox"
                checked={formData.enable_campuses || false}
                onChange={(e) => setFormData({ ...formData, enable_campuses: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                id="enable_campuses"
              />
              <label htmlFor="enable_campuses" className="text-sm font-semibold text-slate-800 cursor-pointer">
                Kích hoạt báo cáo theo từng điểm trường / phân hiệu
              </label>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Màu chủ đạo (Primary Color)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.primary_color || '#1e40af'}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="w-10 h-10 rounded-xl border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.primary_color || '#1e40af'}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="w-32 px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                URL Logo trường (Tùy chọn)
              </label>
              <input
                type="url"
                value={formData.logo_url || ''}
                onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 6: Cấu hình Thời gian biểu & Tiêu chí Xếp loại Thi đua Tuần */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" /> 6. THỜI GIAN BIỂU & TIÊU CHÍ XẾP LOẠI THI ĐUA TUẦN
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
              Áp dụng phân hiệu & toàn trường
            </span>
          </div>

          <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ngày bắt đầu Tuần 1 (Thứ Hai)
                </label>
                <input
                  type="date"
                  value={formData.week1_start_date || '2026-09-07'}
                  onChange={(e) => setFormData({ ...formData, week1_start_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Mặc định: <strong>07/09/2026</strong>. Hệ thống sẽ tự động tính Tuần 1, Tuần 2, ... Tuần 37 dựa trên ngày này.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Quy định thời gian một tuần học
                </label>
                <div className="px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Từ Thứ Hai đến hết sáng Thứ Sáu (5 ngày học/tuần)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Không xếp loại vào Thứ Bảy, Chủ Nhật và các ngày học sinh được nghỉ.
                </p>
              </div>
            </div>

            {/* Emulation ranking criteria thresholds */}
            <div className="pt-3 border-t border-blue-200/60">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Ngưỡng tỷ lệ duy trì sĩ số xếp loại thi đua tuần (%)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-1 shadow-2xs">
                  <span className="text-[11px] font-black uppercase text-emerald-700 flex items-center gap-1">
                    🏆 Loại Xuất sắc
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500">≥</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={formData.ranking_threshold_excellent ?? 98}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, ranking_threshold_excellent: val === '' ? ('' as any) : parseFloat(val) });
                      }}
                      onBlur={() => {
                        if (formData.ranking_threshold_excellent === ('' as any)) {
                          setFormData({ ...formData, ranking_threshold_excellent: 98 });
                        }
                      }}
                      className="w-20 px-2 py-1 text-sm font-black text-emerald-800 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Mặc định: 98%</p>
                </div>

                <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-1 shadow-2xs">
                  <span className="text-[11px] font-black uppercase text-blue-700 flex items-center gap-1">
                    🥇 Loại Tốt
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500">≥</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={formData.ranking_threshold_good ?? 95}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, ranking_threshold_good: val === '' ? ('' as any) : parseFloat(val) });
                      }}
                      onBlur={() => {
                        if (formData.ranking_threshold_good === ('' as any)) {
                          setFormData({ ...formData, ranking_threshold_good: 95 });
                        }
                      }}
                      className="w-20 px-2 py-1 text-sm font-black text-blue-800 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Mặc định: 95%</p>
                </div>

                <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-1 shadow-2xs">
                  <span className="text-[11px] font-black uppercase text-amber-700 flex items-center gap-1">
                    🥈 Loại Khá
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500">≥</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={formData.ranking_threshold_fair ?? 90}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, ranking_threshold_fair: val === '' ? ('' as any) : parseFloat(val) });
                      }}
                      onBlur={() => {
                        if (formData.ranking_threshold_fair === ('' as any)) {
                          setFormData({ ...formData, ranking_threshold_fair: 90 });
                        }
                      }}
                      className="w-20 px-2 py-1 text-sm font-black text-amber-800 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Dưới mức Khá: Cần cố gắng</p>
                </div>
              </div>
            </div>

            {/* Cấu hình cộng điểm thi đua báo cáo sớm */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Cộng điểm thi đua báo cáo sớm (Đầu giờ)
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enable_early_report_bonus ?? true}
                    onChange={(e) => setFormData({ ...formData, enable_early_report_bonus: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Kích hoạt cộng điểm</span>
                </label>
              </div>

              {(formData.enable_early_report_bonus ?? true) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Giờ quy định báo sớm
                    </label>
                    <input
                      type="time"
                      value={formData.early_report_deadline || '07:30'}
                      onChange={(e) => setFormData({ ...formData, early_report_deadline: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Báo trước giờ này tính là sớm</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Điểm cộng mỗi ngày báo sớm
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={formData.early_report_bonus_points ?? 0.5}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, early_report_bonus_points: val === '' ? ('' as any) : parseFloat(val) });
                        }}
                        onBlur={() => {
                          if (formData.early_report_bonus_points === ('' as any)) {
                            setFormData({ ...formData, early_report_bonus_points: 0.5 });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-amber-900">đ/ngày</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Mặc định: +0.5 điểm/ngày</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Điểm cộng tối đa mỗi tuần
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={formData.early_report_max_bonus ?? 2.5}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, early_report_max_bonus: val === '' ? ('' as any) : parseFloat(val) });
                        }}
                        onBlur={() => {
                          if (formData.early_report_max_bonus === ('' as any)) {
                            setFormData({ ...formData, early_report_max_bonus: 2.5 });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-amber-900">điểm</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Mặc định: +2.5 điểm (5 ngày x 0.5)</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 7: Cấu hình tự động nhắc nhở GVCN chưa báo cáo sĩ số */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-2">
                <BellRing className="w-4 h-4 text-rose-600" /> 7. CẤU HÌNH TỰ ĐỘNG BÁO VỀ TÀI KHOẢN GVCN CHƯA BÁO CÁO SĨ SỐ
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Khi lớp chưa gửi báo cáo sĩ số, hệ thống sẽ tự động phát cảnh báo, gửi thông báo trực tiếp về tài khoản của GVCN đó và hiển thị banner nhắc nhở.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
              <input
                type="checkbox"
                checked={formData.enable_auto_reminder ?? true}
                onChange={(e) => setFormData({ ...formData, enable_auto_reminder: e.target.checked })}
                className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
              />
              <span className="text-xs font-bold text-rose-900">Bật tự động nhắc nhở</span>
            </label>
          </div>

          {(formData.enable_auto_reminder ?? true) && (
            <div className="p-4 bg-rose-50/50 border border-rose-200/80 rounded-2xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Giờ tự động quét và phát thông báo nhắc nhở
                  </label>
                  <input
                    type="time"
                    value={formData.auto_reminder_time || '07:45'}
                    onChange={(e) => setFormData({ ...formData, auto_reminder_time: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-bold border border-rose-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Mặc định: <strong>07:45</strong> sáng mỗi ngày. Nếu lớp chưa nộp, hệ thống sẽ tự động tạo thông báo và rung chuông tài khoản GVCN.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phương thức cảnh báo trên tài khoản GVCN
                  </label>
                  <div className="p-2.5 bg-white border border-rose-200 rounded-xl space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Chuông thông báo & huy hiệu đỏ ở thanh điều hướng</span>
                    </div>
                    <div className="flex items-center gap-2 font-bold text-blue-800">
                      <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span>Banner cảnh báo gắn chặt đầu trang khi GVCN vào ứng dụng</span>
                    </div>
                    <div className="flex items-center gap-2 font-bold text-amber-800">
                      <CheckCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Phát âm thanh chuông nhắc nhở và thông báo đẩy trình duyệt</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mẫu nội dung thông báo nhắc nhở tự động
                  </label>
                  <textarea
                    rows={2}
                    value={formData.reminder_message_template || 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm để BGH tổng hợp toàn trường!'}
                    onChange={(e) => setFormData({ ...formData, reminder_message_template: e.target.value })}
                    placeholder="Sử dụng {class_name} cho tên lớp và {date} cho ngày báo cáo"
                    className="w-full px-3 py-2 text-sm border border-rose-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Các biến tự động thay thế: <code className="bg-rose-100 text-rose-800 px-1 rounded">{'{class_name}'}</code> (Tên lớp), <code className="bg-rose-100 text-rose-800 px-1 rounded">{'{date}'}</code> (Ngày báo cáo).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 8: Cấu hình Nhà phát triển & Chân trang */}
        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Code2 className="w-4 h-4" /> 8. THÔNG TIN NHÀ PHÁT TRIỂN & BẢN QUYỀN CHÂN TRANG
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên nhà phát triển ứng dụng / Tác giả
              </label>
              <input
                type="text"
                value={formData.developer_name || ''}
                onChange={(e) => setFormData({ ...formData, developer_name: e.target.value })}
                placeholder="Ví dụ: Thầy Nguyễn Hùng hoặc Tổ Tin học Nhà trường"
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tên này được hiển thị ở góc chân trang ứng dụng và trên các biểu mẫu báo cáo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Thông tin liên hệ / Đơn vị hỗ trợ (Tùy chọn)
              </label>
              <input
                type="text"
                value={formData.developer_contact || ''}
                onChange={(e) => setFormData({ ...formData, developer_contact: e.target.value })}
                placeholder="Ví dụ: hungthcsnongu@gmail.com hoặc SĐT hỗ trợ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Email hoặc số điện thoại hỗ trợ kỹ thuật khi giáo viên cần trợ giúp.
              </p>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Xem trước hiển thị chân trang:
            </span>
            <div className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <Code2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span>Phát triển bởi: <strong className="text-slate-900 font-bold">{formData.developer_name || '(Chưa đặt tên)'}</strong></span>
              {formData.developer_contact && (
                <span className="text-slate-500 font-normal">({formData.developer_contact})</span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <button
            type="submit"
            className="w-full sm:w-auto px-8 py-3 rounded-xl font-black text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>LƯU CẤU HÌNH NHÀ TRƯỜNG</span>
          </button>
        </div>
      </form>
    </div>
  );
};
