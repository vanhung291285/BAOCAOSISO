import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { QuickUserSwitcher } from './QuickUserSwitcher';
import { PWAInstallButton } from './PWAInstallButton';
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
  Printer,
  FileSpreadsheet,
} from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const { currentUser, logout, isAdmin, isBGH, isGVCN } = useAuth();
  const { settings, activeYear, classes } = useSchool();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Find user's assigned class if GVCN
  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  const navItems = [
    { label: 'Tổng quan', path: '/dashboard', icon: BarChart3 },
    {
      label: 'Báo cáo sĩ số',
      path: '/attendance',
      icon: ClipboardList,
      highlight: isGVCN,
    },
    { label: 'Báo cáo ngày', path: '/reports/daily', icon: FileSpreadsheet },
    { label: 'Báo cáo tháng', path: '/reports/monthly', icon: Calendar },
    { label: 'Biểu đồ', path: '/charts', icon: BarChart3 },
  ];

  if (isBGH || isAdmin) {
    navItems.push({ label: 'Lớp học', path: '/classes', icon: Layers });
    navItems.push({ label: 'Tài khoản', path: '/users', icon: ShieldCheck });
  }

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs no-print">
      <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 xl:gap-4 w-full">
          {/* Brand & School info - Protected with flex-shrink-0 so it is never squashed or covered */}
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer flex-shrink xl:flex-shrink-0 max-w-[200px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] xl:max-w-[400px] 2xl:max-w-[500px] min-w-0"
            onClick={() => handleNav('/dashboard')}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white shadow-xs flex-shrink-0"
              style={{ backgroundColor: settings?.primary_color || '#1e40af' }}
            >
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg" />
              ) : (
                <School className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <div className="text-[11px] font-bold text-blue-700 tracking-wide uppercase leading-tight truncate">
                {settings?.short_name || 'BÁO CÁO SĨ SỐ'}
              </div>
              <h1 className="text-xs sm:text-sm lg:text-base font-black text-slate-900 tracking-tight leading-snug truncate">
                {settings?.school_name || 'Hệ thống Báo cáo Sĩ số Học sinh'}
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 font-medium leading-tight whitespace-nowrap">
                {activeYear && (
                  <span>
                    Năm học <span className="font-semibold text-slate-700">{activeYear.name}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links - Shown on xl screens (>=1280px) to ensure no overlap */}
          <nav className="hidden xl:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`flex items-center gap-1 xl:gap-1.5 px-1.5 2xl:px-3 py-2 rounded-lg text-[11px] 2xl:text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    item.highlight && !isActive
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                      : isActive
                      ? 'bg-slate-100 text-blue-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}

            
          </nav>

          {/* User profile & Quick Switcher */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <div className="relative group hidden xl:block">
                <button
                  onClick={() => handleNav('/settings/school')}
                  className={`flex items-center gap-1 xl:gap-1.5 px-1.5 2xl:px-3 py-2 rounded-lg text-[11px] 2xl:text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                    currentPath.startsWith('/settings')
                      ? 'bg-slate-100 text-blue-800 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Settings className="w-4 h-4 text-slate-500 group-hover:rotate-45 transition-transform flex-shrink-0" />
                  <span className="whitespace-nowrap">Cài đặt</span>
                </button>

                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-50 animate-in fade-in duration-150">
                  <button
                    onClick={() => handleNav('/settings/school')}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cấu hình trường & Năm học</span>
                  </button>
                  <button
                    onClick={() => handleNav('/settings/campuses')}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>Quản lý Phân hiệu / Điểm trường</span>
                  </button>
                  <button
                    onClick={() => handleNav('/settings/indicators')}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Nhóm chỉ tiêu</span>
                  </button>
                  <button
                    onClick={() => handleNav('/settings/report-template')}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    <span>Biểu mẫu báo cáo</span>
                  </button>
                  <button
                    onClick={() => handleNav('/settings/supabase')}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                  >
                    <Database className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-bold">Đồng bộ Supabase Cloud</span>
                  </button>
                </div>
              </div>
            )}
            <PWAInstallButton />
            {isAdmin && <QuickUserSwitcher />}

            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 flex-shrink-0">
                <button
                  onClick={() => handleNav('/profile')}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
                  title="Xem thông tin tài khoản"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs flex-shrink-0">
                    {currentUser.full_name.charAt(0)}
                  </div>
                  <div className="hidden 2xl:block">
                    <div className="text-xs font-bold text-slate-800 line-clamp-1">{currentUser.full_name}</div>
                    <div className="text-[10px] text-slate-500">
                      {currentUser.role === 'ADMIN' ? 'Quản trị' : currentUser.role === 'BGH' ? 'Ban giám hiệu' : assignedClass ? `Lớp ${assignedClass.class_name}` : 'GVCN'}
                    </div>
                  </div>
                </button>

                <button
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile / Tablet menu button (screens < xl) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-1.5 sm:p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-hidden flex-shrink-0"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    item.highlight && !isActive
                      ? 'bg-blue-600 text-white'
                      : isActive
                      ? 'bg-blue-50 text-blue-800 font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {isAdmin && (
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cài đặt hệ thống</div>
                <button
                  onClick={() => handleNav('/settings/school')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    currentPath === '/settings/school' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Cấu hình trường & Năm học</span>
                </button>
                <button
                  onClick={() => handleNav('/settings/campuses')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    currentPath === '/settings/campuses' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span>Quản lý Phân hiệu / Điểm trường</span>
                </button>
                <button
                  onClick={() => handleNav('/settings/indicators')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    currentPath === '/settings/indicators' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-4 h-4 text-slate-500" />
                  <span>Nhóm chỉ tiêu (Bán trú / Nội trú)</span>
                </button>
                <button
                  onClick={() => handleNav('/settings/report-template')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    currentPath === '/settings/report-template' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                  <span>Thiết lập biểu mẫu báo cáo</span>
                </button>
                <button
                  onClick={() => handleNav('/settings/supabase')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    currentPath === '/settings/supabase' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Database className="w-4 h-4 text-slate-500" />
                  <span>Kết nối Supabase & SQL Schema</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={() => handleNav('/profile')}
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <User className="w-4 h-4 text-slate-500" />
              <span>{currentUser?.full_name}</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50"
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
