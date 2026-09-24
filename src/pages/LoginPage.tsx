import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import {
  School,
  LogIn,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Award,
  GraduationCap,
  Calendar,
  Settings2,
  ArrowRight,
  UserCheck,
  Plus,
  Check,
  X,
  Sparkles,
  AlertCircle,
  Lock,
  Unlock,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { SchoolYear } from '../types';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { isSupabaseConnected } from '../services/supabase';

interface LoginPageProps {
  onLoginSuccess: (targetPath?: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { currentUser, login, allUsers, switchUser } = useAuth();
  const {
    settings,
    classes,
    campuses,
    years,
    activeYear,
    setActiveSchoolYear,
    saveSchoolYear,
    deleteSchoolYear,
    toggleLockSchoolYear,
  } = useSchool();

  // Mode: GVCN (default) or ADMIN/BGH
  const [activeTab, setActiveTab] = useState<'GVCN' | 'ADMIN'>('GVCN');

  // GVCN Selection State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

  // Admin / BGH Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState<boolean>(() => {
    return localStorage.getItem('sso_admin_remember_login') !== 'false';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  // School Year Config Modal State (ADMIN ONLY)
  const [showYearModal, setShowYearModal] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [newYearName, setNewYearName] = useState('');
  const [yearError, setYearError] = useState('');
  const [isSavingYear, setIsSavingYear] = useState(false);

  // Clear saved credentials manually
  const handleClearSavedAdminCreds = () => {
    localStorage.removeItem('sso_saved_admin_creds');
    setPassword('');
    setHasSavedCreds(false);
  };

  // Initialize selected class & teacher on mount
  useEffect(() => {
    const savedClassId = localStorage.getItem('sso_saved_class_id');
    const savedTeacherId = localStorage.getItem('sso_saved_teacher_id');
    const savedTab = localStorage.getItem('sso_saved_active_tab') as 'GVCN' | 'ADMIN';

    if (savedTab) {
      setActiveTab(savedTab);
    }
    if (savedClassId) {
      setSelectedClassId(savedClassId);
    }
    if (savedTeacherId) {
      setSelectedTeacherId(savedTeacherId);
    }

    // Auto-fill saved admin credentials on Safari / Chrome / Mobile
    const savedAdminCreds = localStorage.getItem('sso_saved_admin_creds');
    if (savedAdminCreds) {
      try {
        const parsed = JSON.parse(savedAdminCreds);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.password) {
          setPassword(parsed.password);
          setHasSavedCreds(true);
        }
      } catch {
        // ignore parse error
      }
    }
  }, []);

  // Sync and save selection of class
  useEffect(() => {
    if (selectedClassId) {
      localStorage.setItem('sso_saved_class_id', selectedClassId);
    }
  }, [selectedClassId]);

  // Save selected teacher
  useEffect(() => {
    if (selectedTeacherId) {
      localStorage.setItem('sso_saved_teacher_id', selectedTeacherId);
    }
  }, [selectedTeacherId]);

  // Save active tab
  useEffect(() => {
    localStorage.setItem('sso_saved_active_tab', activeTab);
  }, [activeTab]);

  // Sync teacher when selectedClassId changes
  useEffect(() => {
    if (!selectedClassId) {
      setSelectedTeacherId('');
      return;
    }

    const currentCls = classes.find((c) => c.id === selectedClassId);
    if (!currentCls) {
      setSelectedTeacherId('');
      return;
    }

    // Find teacher assigned to this class
    let teacher = allUsers.find(
      (u) =>
        u.role === 'GVCN' &&
        (u.id === currentCls.homeroom_teacher_id || u.assigned_class_id === currentCls.id)
    );

    // Fallback search by email
    if (!teacher) {
      teacher = allUsers.find(
        (u) =>
          u.role === 'GVCN' &&
          u.email.toLowerCase().includes(currentCls.class_name.toLowerCase())
      );
    }

    // Fallback to any teacher
    if (!teacher) {
      teacher = allUsers.find((u) => u.role === 'GVCN');
    }

    if (teacher) {
      setSelectedTeacherId(teacher.id);
    }
  }, [selectedClassId, classes, allUsers]);

  // Selected Class and Teacher objects
  const currentClass = classes.find((c) => c.id === selectedClassId);
  const currentTeacher = allUsers.find((u) => u.id === selectedTeacherId);

  const getCampusName = (campusId?: string) => {
    if (!campusId) return 'Khu chính';
    const campus = campuses.find(c => c.id === campusId);
    return campus ? campus.name : 'Khu chính';
  };

  // Handle GVCN Quick One-Click Login
  const handleGVCNLogin = async () => {
    if (!selectedTeacherId) {
      setError('Vui lòng chọn lớp và giáo viên chủ nhiệm.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await switchUser(selectedTeacherId);
      // GVCN is directly navigated to attendance input
      onLoginSuccess('/attendance');
    } catch {
      setError('Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin/BGH Standard Form Login
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const cleanEmail = email.toLowerCase().trim();
      
      const targetUser = allUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (targetUser && targetUser.role === 'GVCN') {
        setError('Tài khoản của bạn là Giáo viên, không được phép đăng nhập qua cổng Quản trị. Vui lòng chuyển sang thẻ GIÁO VIÊN CHỦ NHIỆM.');
        setIsSubmitting(false);
        return;
      }

      if (cleanEmail === 'admin@db.edu.vn' || cleanEmail === 'admin' || cleanEmail === 'admin@xadung.edu.vn') {
        const p = password.trim();
        if (p !== 'admin123456@' && p !== 'admin123456' && p !== '123456' && p !== 'admin') {
          setError('Mật khẩu Quản trị không đúng! Vui lòng kiểm tra lại.');
          setIsSubmitting(false);
          return;
        }
      }

      // 1. Lưu thông tin đăng nhập vào LocalStorage nếu chọn Ghi nhớ (hỗ trợ Safari iPhone)
      if (rememberAdmin) {
        localStorage.setItem('sso_admin_remember_login', 'true');
        localStorage.setItem(
          'sso_saved_admin_creds',
          JSON.stringify({ email: cleanEmail, password: password.trim() })
        );
        setHasSavedCreds(true);
      } else {
        localStorage.setItem('sso_admin_remember_login', 'false');
        localStorage.removeItem('sso_saved_admin_creds');
        setHasSavedCreds(false);
      }

      // 2. Kích hoạt W3C Credential Management API (Chuỗi khóa iCloud Safari / Google Password Manager)
      if (typeof window !== 'undefined' && (window as any).PasswordCredential && navigator.credentials?.store) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: cleanEmail,
            password: password.trim(),
            name: targetUser?.full_name || 'Quản trị viên'
          });
          await navigator.credentials.store(cred);
        } catch {
          // Trình duyệt không hỗ trợ hoặc chặn, tiếp tục luồng bình thường
        }
      }

      const ok = await login(email);
      if (ok) {
        // Cho Safari iOS 150-200ms để bắt sự kiện lưu mật khẩu vào Chuỗi khóa iCloud trước khi unmount form
        setTimeout(() => {
          onLoginSuccess('/dashboard');
        }, 180);
      } else {
        setError('Email hoặc tài khoản không chính xác. Vui lòng thử lại.');
        setIsSubmitting(false);
      }
    } catch {
      setError('Đã xảy ra lỗi khi đăng nhập.');
      setIsSubmitting(false);
    }
  };

  // Handle 1-click Quick Login for testing
  const handleQuickLogin = async (userId: string, targetPath: string = '/dashboard') => {
    await switchUser(userId);
    onLoginSuccess(targetPath);
  };

  // Open Admin Year Modal with verification check
  const handleOpenAdminYearModal = () => {
    if (currentUser?.role === 'ADMIN' || isAdminUnlocked) {
      setIsAdminUnlocked(true);
    } else {
      setIsAdminUnlocked(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
    }
    setShowYearModal(true);
  };

  // Verify admin password before accessing year configuration
  const handleVerifyAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    const input = adminPasswordInput.trim();
    if (input === 'admin123456@' || input === 'admin123456' || input === '123456' || input === 'admin123' || input === 'admin') {
      setIsAdminUnlocked(true);
      setAdminAuthError('');
    } else {
      setAdminAuthError('Mật khẩu Quản trị không chính xác! Vui lòng thử lại.');
    }
  };

  // Handle switching active school year (Admin only)
  const handleSelectSchoolYear = async (yearId: string) => {
    try {
      await setActiveSchoolYear(yearId);
    } catch (e) {
      console.error('Failed to set active school year:', e);
    }
  };

  // Handle locking/unlocking year (Admin only)
  const handleToggleLockYear = async (yearId: string, currentLocked?: boolean) => {
    try {
      await toggleLockSchoolYear(yearId, !currentLocked);
    } catch (e) {
      console.error('Failed to toggle lock year:', e);
    }
  };

  // Handle deleting school year (Admin only)
  const handleDeleteYear = async (yearId: string) => {
    if (yearId === activeYear?.id) {
      alert('Không thể xóa năm học đang áp dụng!');
      return;
    }
    if (confirm('Bạn có chắc chắn muốn xóa năm học này?')) {
      try {
        await deleteSchoolYear(yearId);
      } catch (e) {
        console.error('Failed to delete school year:', e);
      }
    }
  };

  // Handle adding new school year (Admin only)
  const handleAddNewSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setYearError('');
    const trimmed = newYearName.trim();
    if (!trimmed) {
      setYearError('Vui lòng nhập tên năm học (ví dụ: 2027-2028).');
      return;
    }

    // Check if duplicate
    const exists = years.some((y) => y.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setYearError('Năm học này đã tồn tại trong danh sách.');
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
    } catch {
      setYearError('Có lỗi xảy ra khi lưu năm học.');
    } finally {
      setIsSavingYear(false);
    }
  };

  // Group classes by grade
  const grade6Classes = classes.filter((c) => c.grade === 6);
  const grade7Classes = classes.filter((c) => c.grade === 7);
  const grade8Classes = classes.filter((c) => c.grade === 8);
  const grade9Classes = classes.filter((c) => c.grade === 9);

  // List of all GVCN users
  const gvcnUsers = allUsers.filter((u) => u.role === 'GVCN');

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-100 via-slate-50 to-slate-200 flex flex-col justify-center py-4 px-4 sm:px-6 lg:px-8">
      {!isSupabaseConnected() && (
        <div className="sm:mx-auto sm:w-full sm:max-w-lg mb-6 animate-in fade-in slide-in-from-top-4">
          <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <strong className="block font-bold mb-1">Cảnh báo: Dữ liệu đang lưu cục bộ!</strong>
              Mọi cấu hình hiện tại chưa được lưu lên Supabase do trình duyệt này chưa có thông số kết nối.
              Hãy đăng nhập bằng tài khoản Quản trị, vào <strong>Cài đặt Hệ thống &gt; Supabase</strong> để điền URL & API Key, sau đó bấm <strong>Lấy dữ liệu từ Cloud</strong> để đồng bộ.
            </div>
          </div>
        </div>
      )}

      {/* Header Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        <div
          className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10 flex-shrink-0"
          style={{ backgroundColor: settings?.primary_color || '#1e40af' }}
        >
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-xl" />
          ) : (
            <School className="w-8 h-8" />
          )}
        </div>
        <h1 className="mt-2 text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
          SỔ BÁO CÁO SĨ SỐ ĐIỆN TỬ
        </h1>
        <p className="mt-0.5 text-sm font-bold text-blue-700">
          {settings?.school_name || 'Hệ thống Quản lý Báo cáo Sĩ số'}
        </p>
        {(settings?.commune || settings?.province) ? (
          <p className="text-xs text-slate-500 mt-0.5">
            {[settings.commune, settings.province].filter(Boolean).join(' • ')}
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-0.5">
            Sổ điện tử theo dõi chuyên cần & sĩ số học sinh hằng ngày
          </p>
        )}
        <div className="mt-4 flex justify-center">
          <PWAInstallButton />
        </div>
      </div>

      {/* School Year Info Bar - Configuration restricted to ADMIN only */}
      <div className="mt-3 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white/90 backdrop-blur-xs border border-blue-200/80 rounded-xl px-3 py-1.5 shadow-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                Năm học hoạt động
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-black text-blue-950">
                  Năm học {activeYear?.name || '2026-2027'}
                </span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Đang áp dụng
                </span>
              </div>
            </div>
          </div>

          {activeTab === 'ADMIN' ? (
            <button
              type="button"
              onClick={handleOpenAdminYearModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 border border-purple-200 transition-colors flex-shrink-0"
              title="Cấu hình năm học (Dành riêng cho Quản trị viên)"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Cấu hình năm học</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Quản trị cấu hình</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Login Card */}
      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/80 p-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('GVCN');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'GVCN'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>GIÁO VIÊN CHỦ NHIỆM</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('ADMIN');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ADMIN'
                  ? 'bg-white text-purple-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>BGH & QUẢN TRỊ</span>
            </button>
          </div>

          <div className="p-4 sm:p-5">
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: GVCN - CHỈ CẦN THÔNG TIN LỚP & TÊN GVCN */}
            {activeTab === 'GVCN' && (
              <div className="space-y-4">
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2 text-[11px] text-blue-800 flex items-start gap-1.5 leading-tight">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Đăng nhập nhanh dành cho GVCN:</span> Chọn lớp và tên của bạn để báo cáo sĩ số, không cần mật khẩu.
                  </div>
                </div>

                {/* 1. Chọn Lớp học */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    1. Chọn Lớp học <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-2xs"
                  >
                    <option value="" disabled>-- Vui lòng chọn lớp học --</option>
                    {grade6Classes.length > 0 && (
                      <optgroup label="Khối 6">
                        {grade6Classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            Lớp {cls.class_name} ({getCampusName(cls.campus_id)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {grade7Classes.length > 0 && (
                      <optgroup label="Khối 7">
                        {grade7Classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            Lớp {cls.class_name} ({getCampusName(cls.campus_id)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {grade8Classes.length > 0 && (
                      <optgroup label="Khối 8">
                        {grade8Classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            Lớp {cls.class_name} ({getCampusName(cls.campus_id)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {grade9Classes.length > 0 && (
                      <optgroup label="Khối 9">
                        {grade9Classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            Lớp {cls.class_name} ({getCampusName(cls.campus_id)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* 2. Tên Giáo viên chủ nhiệm */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      2. Tên Giáo viên chủ nhiệm <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-blue-600 font-semibold">Tự nhận diện</span>
                  </div>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-2xs"
                  >
                    <option value="" disabled>-- Vui lòng chọn giáo viên chủ nhiệm --</option>
                    {gvcnUsers.map((teacher) => {
                      const teacherClass = classes.find((c) => c.id === teacher.assigned_class_id);
                      return (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.full_name} {teacherClass ? `(Lớp ${teacherClass.class_name})` : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Teacher Info Preview Card */}
                  {currentTeacher && (
                    <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
                          {currentTeacher.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">
                            {currentTeacher.full_name}
                          </div>
                          <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1 mt-0.5">
                            <span>GVCN {currentClass ? `Lớp ${currentClass.class_name}` : ''}</span>
                            <span>•</span>
                            <span className="text-slate-500 font-medium">Năm học {activeYear?.name || '2026-2027'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          <Check className="w-2.5 h-2.5" />
                          Sẵn sàng
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Big Action Button: Vào báo cáo sĩ số ngay */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleGVCNLogin}
                    disabled={isSubmitting || !selectedTeacherId}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                  >
                    <span>VÀO BÁO CÁO SĨ SỐ NGAY</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-center text-[10px] text-slate-400 mt-1.5">
                    Hệ thống sẽ chuyển trực tiếp vào màn hình nhập sĩ số của lớp {currentClass?.class_name || ''}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: BAN GIÁM HIỆU & QUẢN TRỊ VIÊN */}
            {activeTab === 'ADMIN' && (
              <form
                id="admin-login-form"
                name="adminLoginForm"
                method="post"
                action="#"
                autoComplete="on"
                className="space-y-4"
                onSubmit={handleAdminSubmit}
              >
                {/* Thông báo thông tin đã được ghi nhớ trên Safari / Thiết bị */}
                {hasSavedCreds && (
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span className="text-[11px] font-bold">
                        Đã lưu mật khẩu quản trị trên Safari
                      </span>
                    </div>
                    <span className="text-[10px] font-black bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                      Tự động điền
                    </span>
                  </div>
                )}

                <div>
                  <label htmlFor="admin-username" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Email hoặc Tên đăng nhập <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      id="admin-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      required
                      placeholder="admin@db.edu.vn hoặc admin..."
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="admin-password" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Mật khẩu Quản trị <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-purple-600 font-semibold">Bảo mật</span>
                  </div>
                  <div className="relative">
                    <input
                      id="admin-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      placeholder="Nhập mật khẩu quản trị..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-300 text-xs font-mono font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-md absolute right-2 top-1.5 cursor-pointer transition-colors"
                      tabIndex={-1}
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-purple-600" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Tùy chọn: Ghi nhớ mật khẩu trên Safari iPhone */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      name="remember"
                      id="admin-remember"
                      checked={rememberAdmin}
                      onChange={(e) => setRememberAdmin(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-700">
                      Ghi nhớ mật khẩu trên Safari (iPhone)
                    </span>
                  </label>
                  {hasSavedCreds && (
                    <button
                      type="button"
                      onClick={handleClearSavedAdminCreds}
                      className="text-[10px] text-rose-600 hover:text-rose-700 font-semibold underline cursor-pointer"
                    >
                      Xóa mật khẩu đã lưu
                    </button>
                  )}
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    id="admin-login-btn"
                    disabled={isSubmitting}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{isSubmitting ? 'Đang xác thực & Lưu mật khẩu...' : 'ĐĂNG NHẬP QUẢN TRỊ'}</span>
                  </button>
                </div>

                {/* Hướng dẫn lưu mật khẩu trên Safari iPhone */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-700 flex items-center gap-1 mb-0.5">
                    <span>💡 Hướng dẫn lưu mật khẩu trên Safari iPhone:</span>
                  </p>
                  <p>
                    Khi Safari hỏi <em>"Lưu mật khẩu này trong Chuỗi khóa iCloud?"</em>, hãy chọn <strong>"Lưu mật khẩu"</strong> để Safari tự động điền bằng Face ID / Touch ID ở các lần sau.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CẤU HÌNH NĂM HỌC - CHỈ QUẢN TRỊ VIÊN CÓ QUYỀN */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  isAdminUnlocked ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {isAdminUnlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isAdminUnlocked ? 'CẤU HÌNH NĂM HỌC (QUẢN TRỊ)' : 'XÁC THỰC QUYỀN HẠN QUẢN TRỊ'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAdminUnlocked
                      ? 'Thêm, kích hoạt và quản lý năm học hoạt động'
                      : 'Chỉ Quản trị viên mới có quyền cấu hình năm học'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowYearModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: Admin Password Verification if not yet verified */}
            {!isAdminUnlocked ? (
              <form onSubmit={handleVerifyAdmin} className="mt-5 space-y-4" method="post" action="#">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Quyền hạn bảo mật:</span> Chức năng cấu hình năm học chỉ dành riêng cho <strong>Quản trị viên (ADMIN)</strong>. Vui lòng nhập mật khẩu Quản trị để tiếp tục.
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="admin-modal-password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Mật khẩu Quản trị viên
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="admin-modal-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Nhập mật khẩu Quản trị..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-2xs font-mono"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                {adminAuthError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{adminAuthError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác nhận quyền Quản trị</span>
                  </button>
                </div>
              </form>
            ) : (
              /* STEP 2: Full Admin School Year Management */
              <div className="mt-4 space-y-5">
                {/* Admin badge */}
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Đã xác thực quyền <strong>Quản trị viên (ADMIN)</strong></span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Toàn quyền
                  </span>
                </div>

                {/* Add New School Year Form */}
                <form onSubmit={handleAddNewSchoolYear} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Thêm năm học mới vào hệ thống
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newYearName}
                        onChange={(e) => setNewYearName(e.target.value)}
                        placeholder="Ví dụ: 2027-2028"
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-semibold shadow-2xs"
                      />
                      <button
                        type="submit"
                        disabled={isSavingYear || !newYearName.trim()}
                        className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{isSavingYear ? 'Đang lưu...' : 'Thêm năm học'}</span>
                      </button>
                    </div>
                    {yearError && (
                      <p className="text-xs text-red-600 font-semibold mt-1">{yearError}</p>
                    )}
                  </div>
                </form>

                {/* List of existing school years */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Danh sách năm học & Trạng thái áp dụng
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {years.map((y) => {
                      const isActive = y.id === activeYear?.id;
                      return (
                        <div
                          key={y.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-400/30'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Calendar className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-purple-700' : 'text-slate-400'}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold truncate ${isActive ? 'text-purple-950' : 'text-slate-800'}`}>
                                  Năm học {y.name}
                                </span>
                                {y.is_locked && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    Đã khóa
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {isActive ? 'Đang áp dụng toàn trường' : 'Chưa áp dụng'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Toggle Lock Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleLockYear(y.id, y.is_locked)}
                              title={y.is_locked ? 'Mở khóa năm học' : 'Khóa năm học này'}
                              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                                y.is_locked
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {y.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete button (only if not active) */}
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

                            {/* Active or Switch Button */}
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-600 text-white shadow-2xs">
                                <Check className="w-3 h-3" />
                                Đang áp dụng
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectSchoolYear(y.id);
                                }}
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

                {/* Footer close button */}
                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
