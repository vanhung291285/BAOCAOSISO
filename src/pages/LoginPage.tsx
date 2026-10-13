import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  AlertCircle,
  Check,
  ShieldCheck,
  ShieldAlert,
  Settings2,
  Calendar,
  X,
  Plus,
  Trash2,
  Unlock,
  KeyRound,
  BellRing,
  UserCheck,
} from 'lucide-react';
import { SchoolYear, ClassItem, Profile } from '../types';
import { resolveTeacherName, DEFAULT_CLASS_TEACHER_MAP } from '../utils/exportAttendanceStandardExcel';
import { StorageService } from '../services/storage';

interface LoginPageProps {
  onLoginSuccess: (targetPath?: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { currentUser, login, allUsers, reloadUsers, switchUser } = useAuth();
  const {
    urgentAttendanceReminder,
    markAsRead,
  } = useNotifications();
  const {
    settings,
    classes,
    years,
    activeYear,
    setActiveSchoolYear,
    saveSchoolYear,
    deleteSchoolYear,
    toggleLockSchoolYear,
  } = useSchool();

  // Tabs: 'GVCN' = "Giáo Viên / Nhân Viên", 'ADMIN' = "Ban Giám Hiệu"
  const [activeTab, setActiveTab] = useState<'GVCN' | 'ADMIN'>('GVCN');

  // GVCN Form State: Tên Lớp & Tên GVCN (Mặc định rỗng: "Chọn tên lớp")
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [rememberLogin, setRememberLogin] = useState<boolean>(true);

  // Admin Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // General Status State
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [ssoNotice, setSsoNotice] = useState<string | null>(null);

  // School Year Config Modal State (ADMIN)
  const [showYearModal, setShowYearModal] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [newYearName, setNewYearName] = useState('');
  const [yearError, setYearError] = useState('');
  const [isSavingYear, setIsSavingYear] = useState(false);

  // Mặc định luôn là thẻ GVCN, tên lớp là "Chọn tên lớp" (rỗng), không tự động điền tài khoản/mật khẩu quản trị
  useEffect(() => {
    setActiveTab('GVCN');
    setSelectedClassId('');
    setSelectedTeacherId('');
    setEmail('');
    setPassword('');

    // Dọn sạch mọi cache tài khoản/mật khẩu quản trị cũ để tránh tự động điền
    try {
      localStorage.removeItem('sso_saved_admin_creds');
      localStorage.removeItem('sso_saved_active_tab');
      localStorage.removeItem('sso_saved_class_id');
      localStorage.removeItem('sso_saved_teacher_id');
    } catch {}
  }, []);

  // Sorted classes by grade
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0);
      return a.class_name.localeCompare(b.class_name, undefined, { numeric: true });
    });
  }, [classes]);

  // Current selected class item
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Helper tìm kiếm giáo viên tương ứng trong allUsers
  const findMatchedTeacher = useCallback(
    (cls: ClassItem | null): Profile | null => {
      if (!cls) return null;

      // 1. Theo homeroom_teacher_id của lớp
      if (cls.homeroom_teacher_id) {
        const t = allUsers.find((u) => u.id === cls.homeroom_teacher_id);
        if (t) return t;
      }

      // 2. Theo assigned_class_id của giáo viên
      const tByClassId = allUsers.find(
        (u) => u.role === 'GVCN' && u.assigned_class_id === cls.id
      );
      if (tByClassId) return tByClassId;

      // 3. Theo tên lớp trong email hoặc assigned_class_name
      const cleanName = cls.class_name.trim().toLowerCase();
      const tByEmail = allUsers.find(
        (u) =>
          u.role === 'GVCN' &&
          (u.email.toLowerCase().includes(cleanName) ||
            (u as any).assigned_class_name?.trim().toLowerCase() === cleanName)
      );
      if (tByEmail) return tByEmail;

      // 4. Theo tên chuẩn giáo viên trong DEFAULT_CLASS_TEACHER_MAP
      const resolvedStandardName = resolveTeacherName(cls.class_name);
      if (resolvedStandardName) {
        const tByName = allUsers.find(
          (u) =>
            u.role === 'GVCN' &&
            u.full_name.trim().toLowerCase() === resolvedStandardName.trim().toLowerCase()
        );
        if (tByName) return tByName;
      }

      return null;
    },
    [allUsers]
  );

  // Tên giáo viên chủ nhiệm hiển thị chuẩn xác
  const resolvedTeacherName = useMemo(() => {
    if (!currentClass) return '';
    const matched = findMatchedTeacher(currentClass);
    return resolveTeacherName(currentClass.class_name, matched?.full_name);
  }, [currentClass, findMatchedTeacher]);

  // Xử lý khi GVCN chọn lớp: tự động gắn và hiển thị đúng GVCN
  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setError('');

    if (!classId) {
      setSelectedTeacherId('');
      return;
    }

    const targetCls = classes.find((c) => c.id === classId);
    if (targetCls) {
      const matched = findMatchedTeacher(targetCls);
      if (matched) {
        setSelectedTeacherId(matched.id);
      } else {
        // Fallback dùng id có sẵn hoặc id định danh giáo viên
        setSelectedTeacherId(targetCls.homeroom_teacher_id || `teacher_${targetCls.id}`);
      }
    }
  };

  // Submit Handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (activeTab === 'GVCN') {
        if (!selectedClassId) {
          setError('Vui lòng chọn tên lớp.');
          setIsSubmitting(false);
          return;
        }

        if (!currentClass) {
          setError('Không tìm thấy thông tin lớp đã chọn.');
          setIsSubmitting(false);
          return;
        }

        // Tìm hoặc khởi tạo hồ sơ GVCN nếu chưa tồn tại
        let teacher = findMatchedTeacher(currentClass);
        if (!teacher) {
          const teacherId = currentClass.homeroom_teacher_id || `teacher_${currentClass.id}`;
          const teacherFullName = resolvedTeacherName || `GVCN Lớp ${currentClass.class_name}`;
          const newProfile: Profile = {
            id: teacherId,
            full_name: teacherFullName,
            email: `gvcn_${currentClass.class_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@xadung.edu.vn`,
            role: 'GVCN',
            active: true,
            assigned_class_id: currentClass.id,
            created_at: new Date().toISOString(),
          };

          try {
            await StorageService.saveProfile(newProfile);
            currentClass.homeroom_teacher_id = teacherId;
            await StorageService.saveClass(currentClass);
            await reloadUsers();
            teacher = newProfile;
          } catch (saveErr) {
            console.warn('Auto create teacher profile fallback:', saveErr);
          }
        }

        const targetTeacherId =
          teacher?.id || selectedTeacherId || allUsers.find((u) => u.role === 'GVCN')?.id;

        if (!targetTeacherId) {
          setError('Chưa thể xác định thông tin giáo viên chủ nhiệm.');
          setIsSubmitting(false);
          return;
        }

        if (rememberLogin) {
          localStorage.setItem('sso_saved_active_tab', 'GVCN');
        }

        await switchUser(targetTeacherId);
        onLoginSuccess('/attendance');
      } else {
        // ADMIN / BGH login
        const cleanEmail = email.toLowerCase().trim();
        const targetUser = allUsers.find((u) => u.email.toLowerCase() === cleanEmail);
        if (targetUser && targetUser.role === 'GVCN') {
          setError(
            'Tài khoản của bạn là Giáo viên, vui lòng chuyển sang thẻ "Giáo Viên / Nhân Viên".'
          );
          setIsSubmitting(false);
          return;
        }

        if (
          cleanEmail === 'admin@db.edu.vn' ||
          cleanEmail === 'admin' ||
          cleanEmail === 'admin@xadung.edu.vn'
        ) {
          const p = password.trim();
          if (p !== 'admin123456@' && p !== 'admin123456' && p !== '123456' && p !== 'admin') {
            setError('Mật khẩu Quản trị không đúng! Vui lòng thử lại.');
            setIsSubmitting(false);
            return;
          }
        }

        if (rememberLogin) {
          localStorage.setItem('sso_admin_remember_login', 'true');
        }

        const ok = await login(email);
        if (ok) {
          setTimeout(() => {
            onLoginSuccess('/dashboard');
          }, 150);
        } else {
          setError('Tài khoản hoặc mật khẩu không chính xác.');
          setIsSubmitting(false);
        }
      }
    } catch {
      setError('Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.');
      setIsSubmitting(false);
    }
  };

  // Direct Attendance Alert Action
  const handleDirectAttendanceFromAlert = async () => {
    if (!urgentAttendanceReminder) return;
    const targetClassId = urgentAttendanceReminder.class_id || selectedClassId;
    let teacher = allUsers.find(
      (u) =>
        u.role === 'GVCN' &&
        (u.assigned_class_id === targetClassId ||
          (targetClassId &&
            classes.some((c) => c.id === targetClassId && c.homeroom_teacher_id === u.id)))
    );
    if (!teacher && selectedTeacherId) {
      teacher = allUsers.find((u) => u.id === selectedTeacherId);
    }
    if (!teacher) {
      teacher = allUsers.find((u) => u.role === 'GVCN');
    }

    if (teacher) {
      setIsSubmitting(true);
      try {
        await switchUser(teacher.id);
        if (urgentAttendanceReminder) {
          await markAsRead(urgentAttendanceReminder.id);
        }
        onLoginSuccess('/attendance');
      } catch {
        setError('Không thể tự động đăng nhập.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Xử lý khi nhấn biểu tượng Google / Microsoft (Đăng nhập nhanh):
  // Theo yêu cầu người dùng: Giữ nguyên ở cửa sổ đăng nhập, không bao giờ hiển thị hay chuyển sang tài khoản/mật khẩu quản trị!
  const handleQuickDemoLogin = (provider: 'google' | 'microsoft') => {
    const providerName = provider === 'google' ? 'Google' : 'Microsoft';
    setError('');
    // Đảm bảo tuyệt đối ở thẻ GVCN, xóa sạch mọi ô nhập quản trị
    setActiveTab('GVCN');
    setEmail('');
    setPassword('');
    setSsoNotice(
      `Đăng nhập bằng tài khoản ${providerName}: Phương thức SSO đang được đồng bộ hóa theo tên miền trường học. Quý Thầy/Cô vui lòng chọn "Tên lớp" ở trên để đăng nhập trực tiếp vào sổ báo cáo sĩ số.`
    );
  };

  // Admin Year Modal Handlers
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

  const handleVerifyAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    const input = adminPasswordInput.trim();
    if (
      input === 'admin123456@' ||
      input === 'admin123456' ||
      input === '123456' ||
      input === 'admin123' ||
      input === 'admin'
    ) {
      setIsAdminUnlocked(true);
      setAdminAuthError('');
    } else {
      setAdminAuthError('Mật khẩu Quản trị không chính xác! Vui lòng thử lại.');
    }
  };

  const handleAddNewSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setYearError('');
    const trimmed = newYearName.trim();
    if (!trimmed) {
      setYearError('Vui lòng nhập tên năm học (ví dụ: 2027-2028).');
      return;
    }

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

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between overflow-x-hidden font-sans select-none bg-[#111927]">
      {/* ========================================================
          BACKGROUND: 100% MATCHING THE REFERENCE IMAGE
          - Left: Dark tech background with glowing isometric wireframe cubes, particles, chevrons
          - Right: Diagonal cut into soft light blue-gray gradient
          - Lower right: Dark navy wedge with 4-point sparkle star
         ======================================================== */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Right diagonal light area */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#f0f4f9] via-[#e2eaf4] to-[#cddbea]"
          style={{
            clipPath: 'polygon(52% 0%, 100% 0%, 100% 100%, 75% 100%)',
          }}
        />

        {/* Lower right dark navy wedge */}
        <div
          className="absolute bottom-0 right-0 w-[42%] h-[60%] bg-[#0e1d33]"
          style={{
            clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)',
          }}
        />

        {/* 4-point sparkle star in lower right */}
        <div className="absolute bottom-16 right-20 text-slate-400/40 text-4xl select-none animate-pulse">
          ✦
        </div>

        {/* Left tech grid and glowing particles */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e3a5f_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />

        {/* Left 3D Isometric wireframe cubes SVG illustration */}
        <svg
          className="absolute left-[-40px] top-[15%] w-[420px] h-[520px] opacity-35"
          viewBox="0 0 400 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Chevron stack >>> */}
          <path
            d="M40 70 L55 85 L40 100"
            stroke="#00d2ff"
            strokeWidth="2.5"
            opacity="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M40 95 L55 110 L40 125"
            stroke="#00d2ff"
            strokeWidth="2.5"
            opacity="0.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M40 120 L55 135 L40 150"
            stroke="#00d2ff"
            strokeWidth="2.5"
            opacity="0.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Cube 1 (Large Isometric) */}
          <g transform="translate(180, 160)">
            <path
              d="M0 -60 L52 -30 L52 30 L0 60 L-52 30 L-52 -30 Z"
              stroke="#38bdf8"
              strokeWidth="1.5"
              fill="rgba(15,23,42,0.4)"
            />
            <path
              d="M0 0 L0 60 M0 0 L52 -30 M0 0 L-52 -30"
              stroke="#38bdf8"
              strokeWidth="1.2"
              opacity="0.8"
            />
            <circle cx="0" cy="-60" r="3" fill="#38bdf8" />
            <circle cx="52" cy="-30" r="3" fill="#38bdf8" />
            <circle cx="52" cy="30" r="3" fill="#38bdf8" />
            <circle cx="0" cy="60" r="3" fill="#38bdf8" />
            <circle cx="-52" cy="30" r="3" fill="#38bdf8" />
            <circle cx="-52" cy="-30" r="3" fill="#38bdf8" />
          </g>

          {/* Cube 2 (Medium Isometric lower left) */}
          <g transform="translate(90, 360)">
            <path
              d="M0 -45 L39 -22 L39 22 L0 45 L-39 22 L-39 -22 Z"
              stroke="#00897b"
              strokeWidth="1.5"
              fill="rgba(15,23,42,0.4)"
            />
            <path
              d="M0 0 L0 45 M0 0 L39 -22 M0 0 L-39 -22"
              stroke="#00897b"
              strokeWidth="1.2"
              opacity="0.8"
            />
            <circle cx="0" cy="-45" r="2.5" fill="#2dd4bf" />
            <circle cx="39" cy="22" r="2.5" fill="#2dd4bf" />
          </g>

          {/* Glowing connecting dots */}
          <circle cx="120" cy="220" r="2" fill="#38bdf8" className="animate-ping" />
          <circle cx="260" cy="280" r="2.5" fill="#2dd4bf" />
          <circle cx="80" cy="180" r="2" fill="#818cf8" />
          <circle cx="210" cy="400" r="2.5" fill="#38bdf8" />
          <line
            x1="120"
            y1="220"
            x2="180"
            y2="160"
            stroke="#38bdf8"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.4"
          />
          <line
            x1="90"
            y1="360"
            x2="180"
            y2="220"
            stroke="#2dd4bf"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.4"
          />
        </svg>
      </div>

      {/* ========================================================
          TOP HEADER BAR: QUỐC HUY VIỆT NAM & TIÊU ĐỀ
         ======================================================== */}
      <header className="relative z-20 w-full pt-3.5 sm:pt-4 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Vietnam National Emblem Icon */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-red-600 to-red-700 p-1 flex items-center justify-center shadow-lg shadow-red-900/40 ring-2 ring-yellow-400 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
              <circle cx="50" cy="50" r="46" fill="#D32F2F" stroke="#FFD54F" strokeWidth="3" />
              {/* Rice ears border */}
              <circle cx="50" cy="50" r="38" stroke="#FFCA28" strokeWidth="2" strokeDasharray="3 2" />
              {/* Gold star */}
              <polygon
                points="50,22 58,38 76,40 62,53 66,71 50,62 34,71 38,53 24,40 42,38"
                fill="#FFEB3B"
              />
              {/* Cogwheel at base */}
              <rect x="42" y="76" width="16" height="8" rx="2" fill="#FFC107" />
            </svg>
          </div>

          <div>
            <div className="text-white text-xs sm:text-[13px] font-black tracking-wider uppercase drop-shadow-sm leading-tight">
              SỞ GIÁO DỤC VÀ ĐÀO TẠO
            </div>
            <div className="text-slate-300 text-[10px] sm:text-xs font-semibold drop-shadow-sm">
              {settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG'}
            </div>
          </div>
        </div>

        {/* School Year indicator badge */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-900/60 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/60 text-slate-300 text-xs">
          <Calendar className="w-3.5 h-3.5 text-teal-400" />
          <span>Năm học {activeYear?.name || '2026-2027'}</span>
        </div>
      </header>

      {/* ========================================================
          CENTER: CỬA SỔ ĐĂNG NHẬP TINH TẾ, THANH THOÁT, KHÔNG THÔ KỆCH
          - Tỷ lệ kích thước cân đối: max-w-[390px] sm:max-w-[405px]
          - Kiểu chữ sắc nét, khoảng đệm trang nhã
          - Mặc định "Chọn tên lớp", khi chọn lớp hiển thị đúng GVCN
         ======================================================== */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center py-4 px-3 sm:px-4">
        {/* Urgent reminder alert notice if unsubmitted report */}
        {urgentAttendanceReminder && (
          <div className="w-full max-w-[395px] mb-2.5 animate-in fade-in slide-in-from-top-3">
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white p-2.5 rounded-2xl shadow-xl border border-amber-300/80 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <BellRing className="w-4 h-4 text-amber-200 shrink-0 animate-bounce" />
                <div className="min-w-0">
                  <div className="text-xs font-black truncate">
                    CẢNH BÁO: LỚP {urgentAttendanceReminder.class_name || ''} CHƯA BÁO CÁO!
                  </div>
                  <div className="text-[10px] text-rose-100 truncate">
                    {urgentAttendanceReminder.message}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDirectAttendanceFromAlert}
                className="px-2.5 py-1 bg-amber-300 hover:bg-amber-200 text-slate-950 font-black text-xs rounded-xl shadow-xs shrink-0 cursor-pointer active:scale-95 transition-all"
              >
                Vào ngay
              </button>
            </div>
          </div>
        )}

        {/* Khung viền kính mờ tinh tế (Bo góc 24px, đổ bóng nhẹ nhàng chuẩn hình gốc) */}
        <div className="w-full max-w-[390px] sm:max-w-[405px] p-2 sm:p-2.5 bg-white/20 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-2xl shadow-slate-950/40 transition-all duration-300">
          {/* Card trắng bên trong: kích thước gọn gàng, không bị thô dày */}
          <div className="w-full bg-white rounded-[18px] p-5 sm:p-6 shadow-xs">
            {/* Header: Logo hình tròn và Tiêu đề ĐĂNG NHẬP */}
            <div className="flex items-center gap-3 sm:gap-3.5 mb-4">
              {/* Circular Emblem Seal */}
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 border-[#005f73] p-0.5 flex items-center justify-center shrink-0 shadow-xs bg-gradient-to-b from-white to-blue-50/40">
                <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
                  {/* Outer circle rings */}
                  <circle cx="50" cy="50" r="47" stroke="#005F73" strokeWidth="2" />
                  <circle cx="50" cy="50" r="43" stroke="#00897B" strokeWidth="1" strokeDasharray="2 2" />

                  {/* Circular text top */}
                  <path id="curve" d="M 18,50 A 32,32 0 1,1 82,50" fill="none" />
                  <text fontSize="7.5" fill="#005F73" fontWeight="900" letterSpacing="0.8">
                    <textPath href="#curve" startOffset="50%" textAnchor="middle">
                      HỆ THỐNG QUẢN TRỊ & BÁO CÁO
                    </textPath>
                  </text>

                  {/* Shield / Book base */}
                  <path d="M50 35 L70 44 L50 53 L30 44 Z" fill="#00897B" opacity="0.9" />
                  <polygon points="50,33 74,44 50,55 26,44" fill="#00897B" />
                  <path
                    d="M36 50 L36 60 Q50 68 64 60 L64 50"
                    stroke="#005F73"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  <path d="M42 62 Q50 68 58 62" stroke="#00897B" strokeWidth="2" fill="none" />

                  {/* Graduation cap tassel */}
                  <line x1="70" y1="45" x2="74" y2="58" stroke="#F59E0B" strokeWidth="2" />
                  <circle cx="74" cy="59" r="2" fill="#F59E0B" />

                  {/* Laurel branches */}
                  <path
                    d="M26 62 Q20 50 26 40 M74 62 Q80 50 74 40"
                    stroke="#00897B"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </div>

              {/* Title texts */}
              <div className="min-w-0">
                <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-none">
                  HỆ THỐNG QUẢN TRỊ &amp; BÁO CÁO
                </div>
                <h1 className="text-xl sm:text-[22px] font-black text-[#0f2d59] tracking-tight leading-tight mt-0.5">
                  ĐĂNG NHẬP
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-400 font-normal mt-0.5">
                  Vui lòng nhập thông tin tài khoản của bạn
                </p>
              </div>
            </div>

            {/* Segmented Tab Switcher (Giáo Viên / Nhân Viên vs Ban Giám Hiệu) */}
            <div className="bg-[#131d2a] p-1 rounded-xl grid grid-cols-2 gap-1 mb-3.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('GVCN');
                  setError('');
                  setSsoNotice(null);
                  setEmail('');
                  setPassword('');
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center select-none ${
                  activeTab === 'GVCN'
                    ? 'bg-gradient-to-r from-[#00897b] to-[#00796b] text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Giáo Viên / Nhân Viên
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('ADMIN');
                  setError('');
                  setSsoNotice(null);
                  setEmail('');
                  setPassword('');
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center select-none ${
                  activeTab === 'ADMIN'
                    ? 'bg-gradient-to-r from-[#00897b] to-[#00796b] text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Ban Giám Hiệu
              </button>
            </div>

            {/* Error banner if any */}
            {error && (
              <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* SSO Info Notice (Giữ nguyên tại cửa sổ đăng nhập khi click Google/Microsoft) */}
            {ssoNotice && (
              <div className="mb-3 p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-950 flex items-start justify-between gap-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{ssoNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSsoNotice(null)}
                  className="p-0.5 text-sky-400 hover:text-sky-700 cursor-pointer shrink-0"
                  title="Đóng thông báo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* FORM ĐĂNG NHẬP */}
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              {/* ========================================================
                  Ô 1: TÀI KHOẢN EMAIL -> THAY BẰNG "TÊN LỚP" (GVCN)
                  Mặc định: "Chọn tên lớp"
                 ======================================================== */}
              <div>
                <div className="relative flex items-center border border-slate-200 hover:border-slate-300 focus-within:border-[#00897b] focus-within:ring-2 focus-within:ring-[#00897b]/15 rounded-xl px-3 h-10.5 sm:h-11 bg-slate-50/60 focus-within:bg-white transition-all shadow-2xs">
                  <User className="w-4 h-4 text-slate-400 shrink-0 mr-2.5" />

                  {activeTab === 'GVCN' ? (
                    /* GVCN: TÊN LỚP (Mặc định: "Chọn tên lớp") */
                    <div className="relative flex-1">
                      <select
                        id="login-class-select"
                        value={selectedClassId}
                        onChange={(e) => handleClassChange(e.target.value)}
                        required
                        className="w-full bg-transparent text-xs sm:text-[13.5px] font-semibold text-slate-800 focus:outline-hidden cursor-pointer appearance-none pr-6"
                      >
                        <option value="">Chọn tên lớp</option>
                        {[6, 7, 8, 9].map((grade) => {
                          const grp = sortedClasses.filter((c) => c.grade === grade);
                          if (grp.length === 0) return null;
                          return (
                            <optgroup key={grade} label={`Khối ${grade}`}>
                              {grp.map((c) => (
                                <option key={c.id} value={c.id}>
                                  Lớp {c.class_name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  ) : (
                    /* ADMIN: TÀI KHOẢN HOẶC EMAIL */
                    <input
                      id="login-admin-email"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                      required
                      placeholder="Tài khoản hoặc Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent text-xs sm:text-[13.5px] font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                    />
                  )}
                </div>
              </div>

              {/* ========================================================
                  Ô 2: MẬT KHẨU -> THAY BẰNG "TÊN GVCN" (GVCN)
                  Khi GVCN chọn lớp thì tự động hiển thị đúng GVCN tương ứng
                 ======================================================== */}
              <div>
                {activeTab === 'GVCN' ? (
                  /* GVCN: TÊN GIÁO VIÊN CHỦ NHIỆM */
                  <div
                    className={`relative flex items-center border rounded-xl px-3 h-10.5 sm:h-11 transition-all shadow-2xs ${
                      selectedClassId
                        ? 'border-emerald-300/80 bg-emerald-50/30 text-slate-900'
                        : 'border-slate-200 bg-slate-50/60 text-slate-400'
                    }`}
                  >
                    {selectedClassId ? (
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mr-2.5" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-400 shrink-0 mr-2.5" />
                    )}

                    <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                      {selectedClassId ? (
                        <>
                          <div className="text-xs sm:text-[13.5px] font-bold text-slate-800 truncate">
                            GVCN: {resolvedTeacherName || 'Chưa phân công'}
                          </div>
                          <span className="shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Đúng GVCN
                          </span>
                        </>
                      ) : (
                        <div className="text-xs sm:text-[13px] text-slate-400 font-medium truncate select-none">
                          Tên GVCN (Chọn tên lớp để hiển thị)
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ADMIN: MẬT KHẨU */
                  <div className="relative flex items-center border border-slate-200 hover:border-slate-300 focus-within:border-[#00897b] focus-within:ring-2 focus-within:ring-[#00897b]/15 rounded-xl px-3 h-10.5 sm:h-11 bg-slate-50/60 focus-within:bg-white transition-all shadow-2xs">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0 mr-2.5" />
                    <input
                      id="login-admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                      required
                      placeholder="Mật khẩu"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent text-xs sm:text-[13.5px] font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 ml-2 cursor-pointer transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Row: Ghi nhớ đăng nhập & Quên mật khẩu? */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <div
                    onClick={() => setRememberLogin(!rememberLogin)}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                      rememberLogin
                        ? 'bg-[#00897b] border-[#00897b] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {rememberLogin && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="text-slate-600 font-medium text-[11px] sm:text-xs">
                    Ghi nhớ đăng nhập
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[#00897b] hover:text-[#00695c] hover:underline font-medium text-[11px] sm:text-xs cursor-pointer"
                >
                  Quên mật khẩu?
                </button>
              </div>

              {/* Nút ĐĂNG NHẬP (Pill Gradient Button theo đúng hình gốc) */}
              <div className="pt-1.5">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 sm:py-3 px-4 rounded-full bg-gradient-to-r from-[#003B5C] via-[#005B82] to-[#00897B] hover:opacity-95 text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-md shadow-teal-900/20 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center"
                >
                  <span>{isSubmitting ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP'}</span>
                </button>
              </div>

              {/* Hoặc đăng nhập nhanh bằng Google / Microsoft */}
              <div className="pt-2 text-center">
                <div className="text-[11px] sm:text-xs text-slate-500 flex items-center justify-center gap-2">
                  <span>Hoặc đăng nhập nhanh bằng</span>

                  <div className="flex items-center gap-1.5">
                    {/* Google Icon Button */}
                    <button
                      type="button"
                      onClick={() => handleQuickDemoLogin('google')}
                      title="Đăng nhập nhanh với Google"
                      className="p-1 hover:bg-slate-100 rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.36 7.34 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.42l4.02-3.13z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.64 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                        />
                      </svg>
                    </button>

                    {/* Microsoft Icon Button */}
                    <button
                      type="button"
                      onClick={() => handleQuickDemoLogin('microsoft')}
                      title="Đăng nhập nhanh với Microsoft"
                      className="p-1 hover:bg-slate-100 rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 21 21">
                        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Optional Year configuration shortcut for Admin */}
                {activeTab === 'ADMIN' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-center">
                    <button
                      type="button"
                      onClick={handleOpenAdminYearModal}
                      className="text-xs font-bold text-slate-500 hover:text-teal-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>Cấu hình năm học hoạt động</span>
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* ========================================================
          BOTTOM FOOTER: BẢN QUYỀN & HỖ TRỢ KỸ THUẬT
         ======================================================== */}
      <footer className="relative z-20 w-full py-3 px-4 text-center text-[10px] sm:text-xs text-slate-400/90 font-medium select-none">
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          <span>© 2026 Bản quyền thuộc về Hệ thống Quản lý Giáo dục.</span>
          <span>
            Hỗ trợ kỹ thuật: <strong>Vũ Văn Hùng - SĐT: 0984246993</strong>
          </span>
        </div>
      </footer>

      {/* ========================================================
          MODAL: QUÊN MẬT KHẨU?
         ======================================================== */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase">
                Hỗ trợ khôi phục mật khẩu
              </h3>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-3 text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                - <strong>Giáo viên chủ nhiệm:</strong> Hệ thống sử dụng chế độ đăng nhập nhanh chọn
                Tên lớp, tên GVCN được tự động xác nhận, không yêu cầu ghi nhớ mật khẩu phức tạp.
              </p>
              <p>
                - <strong>Ban Giám Hiệu / Quản trị viên:</strong> Vui lòng liên hệ Quản trị viên nhà trường để được hỗ trợ cấp lại mật khẩu đăng nhập:
              </p>
              <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl font-bold text-teal-900 mt-2 text-xs">
                Hỗ trợ kỹ thuật: Vũ Văn Hùng - SĐT: 0984246993
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition-colors cursor-pointer"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CẤU HÌNH NĂM HỌC (QUẢN TRỊ VIÊN)
         ======================================================== */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold ${
                    isAdminUnlocked ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isAdminUnlocked ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    {isAdminUnlocked ? 'CẤU HÌNH NĂM HỌC (QUẢN TRỊ)' : 'XÁC THỰC QUYỀN HẠN QUẢN TRỊ'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">
                    {isAdminUnlocked
                      ? 'Thêm, kích hoạt và quản lý năm học hoạt động'
                      : 'Chỉ Quản trị viên mới có quyền cấu hình năm học'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowYearModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isAdminUnlocked ? (
              <form onSubmit={handleVerifyAdmin} className="mt-4 space-y-3.5">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Quyền hạn bảo mật:</span> Chức năng cấu hình năm học
                    chỉ dành riêng cho <strong>Quản trị viên (ADMIN)</strong>. Vui lòng nhập mật
                    khẩu Quản trị để tiếp tục.
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-modal-pwd"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Mật khẩu Quản trị viên
                  </label>
                  <div className="relative">
                    <input
                      id="admin-modal-pwd"
                      type="password"
                      autoFocus
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Nhập mật khẩu Quản trị..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-mono"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                {adminAuthError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{adminAuthError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác nhận quyền Quản trị</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>
                      Đã xác thực quyền <strong>Quản trị viên (ADMIN)</strong>
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Toàn quyền
                  </span>
                </div>

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
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-semibold shadow-2xs"
                      />
                      <button
                        type="submit"
                        disabled={isSavingYear || !newYearName.trim()}
                        className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-xs cursor-pointer"
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Danh sách năm học &amp; Trạng thái áp dụng
                  </label>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {years.map((y) => {
                      const isActive = y.id === activeYear?.id;
                      return (
                        <div
                          key={y.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-teal-50/70 border-teal-300 ring-1 ring-teal-400/30'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Calendar
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-teal-700' : 'text-slate-400'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs sm:text-sm font-bold truncate ${
                                    isActive ? 'text-teal-950' : 'text-slate-800'
                                  }`}
                                >
                                  Năm học {y.name}
                                </span>
                                {y.is_locked && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    Đã khóa
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] sm:text-[11px] text-slate-500">
                                {isActive ? 'Đang áp dụng toàn trường' : 'Chưa áp dụng'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleLockSchoolYear(y.id, !y.is_locked)}
                              title={y.is_locked ? 'Mở khóa năm học' : 'Khóa năm học này'}
                              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                                y.is_locked
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {y.is_locked ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => deleteSchoolYear(y.id)}
                                title="Xóa năm học"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-600 text-white shadow-2xs">
                                <Check className="w-3 h-3" />
                                Đang áp dụng
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveSchoolYear(y.id)}
                                className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 border border-slate-300 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-colors cursor-pointer"
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

                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Hoàn tất &amp; Đóng
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
