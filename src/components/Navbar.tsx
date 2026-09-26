import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { PWAInstallButton } from './PWAInstallButton';
import { NotificationCenter } from './NotificationCenter';
import {
  School,
  Menu,
  X,
  LogOut,
  User,
  Settings,
  ClipboardList,
  BarChart3,
  ShieldCheck,
  Calendar,
  Layers,
  Database,
  MapPin,
  FileSpreadsheet,
  Trophy,
  ChevronDown,
  Globe,
  ExternalLink,
  FileCheck2,
  Sparkles,
  LayoutDashboard,
  CalendarRange,
  Users,
} from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate, onToggleSidebar }) => {
  const { currentUser, logout, isAdmin, isBGH, isGVCN } = useAuth();
  const { settings, activeYear, classes } = useSchool();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find user's assigned class if GVCN
  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  const getRoleLabel = () => {
    if (!currentUser) return '';
    if (currentUser.role === 'ADMIN') return 'Quản trị viên';
    if (currentUser.role === 'BGH') return 'Ban Giám Hiệu';
    if (assignedClass) return `GVCN Lớp ${assignedClass.class_name}`;
    return 'Giáo viên';
  };

  const getRoleBadgeColor = () => {
    if (!currentUser) return '';
    if (currentUser.role === 'ADMIN') return 'bg-rose-100 text-rose-800 border-rose-200';
    if (currentUser.role === 'BGH') return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  };

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs no-print pt-[env(safe-area-inset-top)]">
      <div className="w-full px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-15 gap-2 w-full">
          {/* 1. Left: School Brand, Logo & Titles */}
          <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
            {/* Mobile menu hamburger toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none flex-shrink-0"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div
              className="flex items-center gap-2.5 cursor-pointer select-none group"
              onClick={() => handleNav('/dashboard')}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0 transition-transform group-hover:scale-105"
                style={{ backgroundColor: settings?.primary_color || '#1e40af' }}
              >
                {settings?.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt="Logo"
                    className="w-7 h-7 object-contain rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <School className="w-5 h-5" />
                )}
              </div>

              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight leading-tight uppercase truncate">
                    SỔ BÁO CÁO SĨ SỐ
                  </h1>
                </div>
                <div className="text-[10px] sm:text-xs text-blue-700 font-bold leading-tight truncate">
                  {settings?.school_name?.toUpperCase() || 'TRƯỜNG PTDTBT THCS XA DUNG'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Middle quick badge for active year (Desktop) */}
          {activeYear && (
            <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200/80 rounded-full text-xs font-semibold text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Năm học: <strong className="text-slate-900">{activeYear.name}</strong></span>
            </div>
          )}

          {/* 3. Right: Notification, PWA, User Profile & Menu */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Notification Bell Center */}
            <NotificationCenter onNavigate={handleNav} />

            {/* User Profile Card & Dropdown */}
            {currentUser && (
              <div className="relative" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200/80 hover:border-slate-300 bg-white"
                  title="Tài khoản cá nhân"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                    {currentUser.full_name.charAt(0)}
                  </div>
                  <div className="hidden md:block text-left max-w-[130px] lg:max-w-[150px]">
                    <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                      {currentUser.full_name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium truncate leading-tight mt-0.5">
                      {getRoleLabel()}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* User info box */}
                    <div className="px-3 py-2.5 bg-slate-50 rounded-xl mb-1 border border-slate-100">
                      <div className="text-xs font-bold text-slate-900 truncate">{currentUser.full_name}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{currentUser.email}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor()}`}>
                          {getRoleLabel()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleNav('/profile')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <User className="w-4 h-4 text-slate-500" />
                      <span>Thông tin tài khoản</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleNav('/settings/school')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-500" />
                        <span>Cấu hình nhà trường</span>
                      </button>
                    )}

                    <div className="border-t border-slate-100 my-1 pt-1">
                      <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Đăng xuất tài khoản</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Mobile / Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-150 max-h-[85vh] overflow-y-auto">
          {/* Main Direct Pages */}
          <div className="space-y-1">
            <button
              onClick={() => handleNav('/dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                currentPath === '/dashboard' ? 'bg-blue-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Tổng quan</span>
            </button>

            <button
              onClick={() => handleNav('/attendance')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                currentPath === '/attendance'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-blue-50/80 text-blue-700 font-bold'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>{isGVCN && assignedClass ? `Báo cáo Lớp ${assignedClass.class_name}` : 'Báo cáo sĩ số'}</span>
            </button>
          </div>

          {/* Reports */}
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Báo cáo & Thống kê
            </div>
            <button
              onClick={() => handleNav('/reports/daily')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                currentPath === '/reports/daily' || currentPath === '/daily-report'
                  ? 'bg-blue-50 text-blue-800 font-bold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Báo cáo theo ngày</span>
            </button>
            <button
              onClick={() => handleNav('/reports/monthly')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                currentPath === '/reports/monthly' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <CalendarRange className="w-4 h-4 text-blue-600" />
              <span>Báo cáo theo tháng</span>
            </button>
            <button
              onClick={() => handleNav('/reports/ranking')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                currentPath === '/reports/ranking' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-600" />
              <span>Thi đua sĩ số</span>
            </button>
            <button
              onClick={() => handleNav('/charts')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                currentPath === '/charts' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>Thống kê biểu đồ</span>
            </button>
          </div>

          {/* Management for BGH/Admin */}
          {(isBGH || isAdmin) && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Quản lý hệ thống
              </div>
              <button
                onClick={() => handleNav('/classes')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/classes' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Quản lý lớp học</span>
              </button>
              <button
                onClick={() => handleNav('/users')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/users' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Quản lý giáo viên</span>
              </button>
            </div>
          )}

          {/* Settings for Admin */}
          {isAdmin && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Cấu hình
              </div>
              <button
                onClick={() => handleNav('/settings/school')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/settings/school' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Cấu hình nhà trường</span>
              </button>
              <button
                onClick={() => handleNav('/settings/campuses')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/settings/campuses' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <MapPin className="w-4 h-4 text-slate-500" />
                <span>Điểm trường / Phân hiệu</span>
              </button>
              <button
                onClick={() => handleNav('/settings/indicators')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/settings/indicators' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Nhóm chỉ tiêu</span>
              </button>
              <button
                onClick={() => handleNav('/settings/report-template')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/settings/report-template' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <span>Biểu mẫu báo cáo</span>
              </button>
              <button
                onClick={() => handleNav('/settings/supabase')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  currentPath === '/settings/supabase' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Database className="w-4 h-4 text-slate-500" />
                <span>Đồng bộ dữ liệu Supabase</span>
              </button>
            </div>
          )}

          {/* Account & Logout */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={() => handleNav('/profile')}
              className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-blue-700"
            >
              <User className="w-4 h-4 text-slate-500" />
              <span>{currentUser?.full_name}</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-xs font-semibold text-rose-600 px-2.5 py-1 rounded-lg hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
