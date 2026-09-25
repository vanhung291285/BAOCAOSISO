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
} from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
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

  // Grouped Reports
  const reportItems = [
    { label: 'Báo cáo ngày', path: '/reports/daily', icon: FileSpreadsheet, desc: 'Tổng hợp sĩ số theo ngày' },
    { label: 'Báo cáo tháng', path: '/reports/monthly', icon: Calendar, desc: 'Số liệu chuyên cần tháng' },
    { label: 'Thi đua sĩ số', path: '/reports/ranking', icon: Trophy, desc: 'Bảng xếp hạng thi đua nền nếp' },
    { label: 'Biểu đồ trực quan', path: '/charts', icon: BarChart3, desc: 'Biểu đồ phân tích tỷ lệ đi học' },
  ];

  // Grouped Management & Settings for BGH / Admin
  const managementItems = [];
  if (isBGH || isAdmin) {
    managementItems.push({ label: 'Quản lý lớp học', path: '/classes', icon: Layers, desc: 'Danh sách lớp & phân công GVCN' });
    managementItems.push({ label: 'Quản lý tài khoản', path: '/users', icon: ShieldCheck, desc: 'Phân quyền GVCN & BGH' });
  }
  if (isAdmin) {
    managementItems.push({ label: 'Cấu hình trường & Năm học', path: '/settings/school', icon: Settings, desc: 'Thông tin trường & học kỳ' });
    managementItems.push({ label: 'Phân hiệu / Điểm trường', path: '/settings/campuses', icon: MapPin, desc: 'Quản lý các điểm trường' });
    managementItems.push({ label: 'Nhóm chỉ tiêu', path: '/settings/indicators', icon: Layers, desc: 'Bán trú, nội trú, các diện' });
    managementItems.push({ label: 'Biểu mẫu báo cáo', path: '/settings/report-template', icon: FileSpreadsheet, desc: 'Mẫu in ấn & xuất excel' });
    managementItems.push({ label: 'Đồng bộ Supabase Cloud', path: '/settings/supabase', icon: Database, desc: 'Kết nối cơ sở dữ liệu cloud' });
  }

  // All nav items for mobile drawer
  const isReportActive = reportItems.some((r) => currentPath === r.path);
  const isManagementActive = managementItems.some((m) => currentPath === m.path);

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs no-print pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-15 gap-2 w-full">
          {/* 1. Brand & School info */}
          <div
            className="flex items-center gap-2.5 cursor-pointer flex-shrink-0 min-w-0 max-w-[220px] sm:max-w-[280px]"
            onClick={() => handleNav('/dashboard')}
          >
            <div
              className="w-8.5 h-8.5 rounded-xl flex items-center justify-center text-white shadow-2xs flex-shrink-0"
              style={{ backgroundColor: settings?.primary_color || '#1e40af' }}
            >
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-6.5 h-6.5 object-contain rounded-lg" />
              ) : (
                <School className="w-5 h-5" />
              )}
            </div>
            <div className="flex flex-col justify-center min-w-0 pr-1">
              <h1 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                {settings?.school_name || 'Báo Cáo Sĩ Số'}
              </h1>
              <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-tight truncate">
                {activeYear ? `Năm học ${activeYear.name}` : settings?.short_name || 'Hệ thống báo cáo'}
              </div>
            </div>
          </div>

          {/* 2. Desktop Navigation Links - Compact, elegant & zero overlapping */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 justify-center px-1">
            {/* Tổng quan */}
            <button
              onClick={() => handleNav('/dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                currentPath === '/dashboard'
                  ? 'bg-blue-50 text-blue-800 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 flex-shrink-0 text-blue-600" />
              <span>Tổng quan</span>
            </button>

            {/* Báo cáo sĩ số (Nổi bật cho GVCN) */}
            <button
              onClick={() => handleNav('/attendance')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                currentPath === '/attendance'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : isGVCN
                  ? 'bg-blue-50 text-blue-700 font-bold hover:bg-blue-100/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Báo cáo sĩ số</span>
            </button>

            {/* Dropdown: Báo cáo & Thống kê */}
            <div className="relative group">
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                  isReportActive
                    ? 'bg-blue-50 text-blue-800 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                <span>Báo cáo & Thống kê</span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
              </button>

              <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-50 animate-in fade-in duration-150">
                {reportItems.map((rep) => {
                  const Icon = rep.icon;
                  const isActive = currentPath === rep.path;
                  return (
                    <button
                      key={rep.path}
                      onClick={() => handleNav(rep.path)}
                      className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-slate-800 leading-tight">{rep.label}</span>
                        <span className="text-[10px] text-slate-400 leading-tight truncate">{rep.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dropdown: Quản lý & Cài đặt (BGH / Admin) */}
            {managementItems.length > 0 && (
              <div className="relative group">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    isManagementActive
                      ? 'bg-blue-50 text-blue-800 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Quản lý & Cài đặt</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
                </button>

                <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-50 animate-in fade-in duration-150 max-h-[75vh] overflow-y-auto">
                  {managementItems.map((m) => {
                    const Icon = m.icon;
                    const isActive = currentPath === m.path;
                    return (
                      <button
                        key={m.path}
                        onClick={() => handleNav(m.path)}
                        className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-800 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-slate-800 leading-tight">{m.label}</span>
                          <span className="text-[10px] text-slate-400 leading-tight truncate">{m.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dropdown: Cổng liên kết ngoài */}
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              >
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Cổng liên kết</span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
              </button>

              <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-50 animate-in fade-in duration-150">
                <a
                  href="https://thcsxadung.db.edu.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-blue-50/70 transition-colors group/item"
                >
                  <School className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 group-hover/item:text-blue-700 leading-tight">TT Điện tử trường</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight truncate">thcsxadung.db.edu.vn</span>
                  </div>
                </a>

                <a
                  href="https://kqht.db.edu.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-emerald-50/70 transition-colors group/item"
                >
                  <FileCheck2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 group-hover/item:text-emerald-700 leading-tight">Kết quả học tập HS</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight truncate">kqht.db.edu.vn</span>
                  </div>
                </a>
              </div>
            </div>
          </nav>

          {/* 3. Right Actions: Notifications, PWA, User Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <PWAInstallButton />
            <NotificationCenter onNavigate={handleNav} />

            {/* Compact User Menu Popover */}
            {currentUser && (
              <div className="relative" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                  title="Tài khoản cá nhân"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    {currentUser.full_name.charAt(0)}
                  </div>
                  <div className="hidden xl:block text-left max-w-[120px]">
                    <div className="text-xs font-bold text-slate-800 truncate leading-tight">{currentUser.full_name}</div>
                    <div className="text-[10px] text-slate-500 truncate leading-tight">
                      {currentUser.role === 'ADMIN' ? 'Quản trị' : currentUser.role === 'BGH' ? 'Ban giám hiệu' : assignedClass ? `Lớp ${assignedClass.class_name}` : 'GVCN'}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden xl:block" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{currentUser.full_name}</div>
                      <div className="text-[11px] text-blue-600 font-medium truncate">
                        {currentUser.role === 'ADMIN' ? 'Quản trị viên' : currentUser.role === 'BGH' ? 'Ban Giám Hiệu' : assignedClass ? `GVCN Lớp ${assignedClass.class_name}` : 'Giáo viên'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleNav('/profile')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <User className="w-4 h-4 text-slate-500" />
                      <span>Thông tin tài khoản</span>
                    </button>

                    <button
                      type="button"
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile / Tablet menu toggle button (screens < lg) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none flex-shrink-0"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Mobile / Tablet Drawer Menu - Categorized and beautiful */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-150 max-h-[85vh] overflow-y-auto">
          {/* Main Direct Pages */}
          <div className="space-y-1">
            <button
              onClick={() => handleNav('/dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                currentPath === '/dashboard' ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-blue-600" />
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
              <span>Báo cáo sĩ số</span>
            </button>
          </div>

          {/* Reports */}
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Báo cáo & Thống kê</div>
            {reportItems.map((rep) => {
              const Icon = rep.icon;
              const isActive = currentPath === rep.path;
              return (
                <button
                  key={rep.path}
                  onClick={() => handleNav(rep.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 text-blue-600" />
                  <span>{rep.label}</span>
                </button>
              );
            })}
          </div>

          {/* Management for BGH/Admin */}
          {managementItems.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quản lý & Cài đặt</div>
              {managementItems.map((m) => {
                const Icon = m.icon;
                const isActive = currentPath === m.path;
                return (
                  <button
                    key={m.path}
                    onClick={() => handleNav(m.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isActive ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* External Links */}
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cổng liên kết tiện ích</div>
            <a
              href="https://thcsxadung.db.edu.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-blue-700 bg-blue-50/50 hover:bg-blue-100/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <School className="w-4 h-4 text-blue-600" />
                <span>Trang TT Điện tử trường</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
            </a>

            <a
              href="https://kqht.db.edu.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Kết quả học tập HS</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            </a>
          </div>

          {/* Account and Logout in mobile */}
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
