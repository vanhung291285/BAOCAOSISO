import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  CalendarRange,
  BarChart3,
  Users,
  Layers,
  Settings,
  User,
  MapPin,
  FileSpreadsheet,
  Database,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Globe,
  ExternalLink,
  FileCheck2,
  School,
  Sparkles,
  Utensils,
} from 'lucide-react';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  collapsed,
  onToggleCollapse,
}) => {
  const { currentUser, isGVCN, isBGH, isAdmin } = useAuth();
  const { settings, classes } = useSchool();

  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  // Navigation Items
  const mainNavItems = [
    {
      id: 'dashboard',
      label: 'Tổng quan',
      path: '/dashboard',
      icon: LayoutDashboard,
      allowed: true,
    },
    {
      id: 'attendance',
      label: isGVCN && assignedClass ? `Báo cáo Lớp ${assignedClass.class_name}` : 'Báo cáo sĩ số',
      path: '/attendance',
      icon: ClipboardList,
      allowed: true,
      highlight: isGVCN,
    },
    {
      id: 'boarding',
      label: isGVCN && assignedClass ? `Báo ăn Lớp ${assignedClass.class_name}` : 'Báo ăn Bán trú',
      path: '/boarding',
      icon: Utensils,
      allowed: true,
      highlight: true,
    },
  ];

  const reportNavItems = [
    {
      id: 'daily-report',
      label: 'Báo cáo theo ngày',
      path: '/reports/daily',
      icon: Calendar,
      allowed: true,
    },
    {
      id: 'monthly-report',
      label: 'Báo cáo theo tháng',
      path: '/reports/monthly',
      icon: CalendarRange,
      allowed: true,
    },
    {
      id: 'ranking',
      label: 'Thi đua sĩ số',
      path: '/reports/ranking',
      icon: Trophy,
      allowed: true,
    },
    {
      id: 'charts',
      label: 'Thống kê biểu đồ',
      path: '/charts',
      icon: BarChart3,
      allowed: true,
    },
  ];

  const managementNavItems = [
    {
      id: 'classes',
      label: 'Quản lý lớp học',
      path: '/classes',
      icon: Layers,
      allowed: isBGH || isAdmin,
    },
    {
      id: 'users',
      label: 'Quản lý giáo viên',
      path: '/users',
      icon: Users,
      allowed: isBGH || isAdmin,
    },
  ];

  const settingsNavItems = [
    {
      id: 'settings-school',
      label: 'Cấu hình trường',
      path: '/settings/school',
      icon: Settings,
      allowed: isAdmin,
    },
    {
      id: 'settings-campuses',
      label: 'Điểm trường',
      path: '/settings/campuses',
      icon: MapPin,
      allowed: isAdmin,
    },
    {
      id: 'settings-indicators',
      label: 'Nhóm chỉ tiêu',
      path: '/settings/indicators',
      icon: Layers,
      allowed: isAdmin,
    },
    {
      id: 'settings-template',
      label: 'Biểu mẫu báo cáo',
      path: '/settings/report-template',
      icon: FileSpreadsheet,
      allowed: isAdmin,
    },
    {
      id: 'settings-supabase',
      label: 'Đồng bộ dữ liệu',
      path: '/settings/supabase',
      icon: Database,
      allowed: isAdmin,
    },
  ];

  const accountNavItems = [
    {
      id: 'profile',
      label: 'Tài khoản',
      path: '/profile',
      icon: User,
      allowed: true,
    },
  ];

  const isItemActive = (path: string) => {
    if (path === '/reports/daily') {
      return currentPath === '/reports/daily' || currentPath === '/daily-report' || currentPath === '/reports';
    }
    return currentPath === path;
  };

  const renderNavGroup = (title: string, items: typeof mainNavItems) => {
    const visibleItems = items.filter((item) => item.allowed);
    if (visibleItems.length === 0) return null;

    return (
      <div className="space-y-1">
        {!collapsed && (
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
            {title}
          </div>
        )}
        <div className="space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.path);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.path)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 relative group ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 font-bold'
                    : item.highlight
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                    active
                      ? 'text-white'
                      : item.highlight
                      ? 'text-blue-600'
                      : 'text-slate-500 group-hover:text-slate-800'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}

                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside
      className={`hidden lg:flex flex-col bg-white border-r border-slate-200 sticky top-15 h-[calc(100dvh-3.75rem)] transition-all duration-300 z-20 select-none ${
        collapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 custom-scrollbar">
        {renderNavGroup('Điều hướng chính', mainNavItems)}
        {renderNavGroup('Báo cáo & Thống kê', reportNavItems)}
        {(isBGH || isAdmin) && renderNavGroup('Quản lý hệ thống', managementNavItems)}
        {isAdmin && renderNavGroup('Cấu hình', settingsNavItems)}
        {renderNavGroup('Cá nhân', accountNavItems)}

        {/* External Useful Links */}
        {!collapsed && (
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Liên kết nhà trường
            </div>
            <a
              href="https://thcsxadung.db.edu.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50/60 transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <School className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">Cổng TTĐT Trường</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
            </a>
            <a
              href="https://kqht.db.edu.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/60 transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Kết quả học tập HS</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
            </a>
          </div>
        )}
      </div>

      {/* Collapse Toggle Footer */}
      <div className="p-2 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
        {!collapsed && (
          <div className="px-2 text-[11px] text-slate-400 truncate">
            {settings?.short_name || 'THCS Xa Dung'}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors ${
            collapsed ? 'mx-auto' : ''
          }`}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
