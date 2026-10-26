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
  LogOut,
  MapPin,
  FileSpreadsheet,
  Database,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Globe,
  ExternalLink,
  Sparkles,
  Utensils,
  GraduationCap,
  CalendarDays,
  ChevronDown,
  Bot,
  Mic,
} from 'lucide-react';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenAIAssistant?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onOpenAIAssistant,
}) => {
  const { currentUser, isGVCN, isBGH, isAdmin, logout } = useAuth();
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
    {
      id: 'ai-teacher-assistant',
      label: isGVCN && assignedClass ? `Trợ lý AI (${assignedClass.class_name})` : 'Trợ lý AI GVCN',
      path: '/ai-teacher-assistant',
      icon: Sparkles,
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
      id: 'weekly-report',
      label: 'Báo cáo theo tuần',
      path: '/reports/weekly',
      icon: CalendarDays,
      allowed: true,
      subItems: [
        { id: 'weekly-school', label: 'Tổng hợp theo trường', path: '/reports/weekly?view=school' },
        { id: 'weekly-campus', label: 'Từng phân hiệu', path: '/reports/weekly?view=campus' },
        {
          id: 'weekly-class',
          label: isGVCN && assignedClass ? `Lớp ${assignedClass.class_name}` : 'Từng lớp học',
          path: '/reports/weekly?view=class',
        },
      ],
    },
    {
      id: 'monthly-report',
      label: 'Báo cáo theo tháng',
      path: '/reports/monthly',
      icon: CalendarRange,
      allowed: true,
    },
    {
      id: 'boarding-monthly',
      label: isGVCN && assignedClass ? `Sổ chấm cơm ${assignedClass.class_name}` : 'Sổ chấm cơm tháng',
      path: '/reports/boarding-monthly',
      icon: FileSpreadsheet,
      allowed: true,
      highlight: isGVCN,
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
    {
      id: 'ai-predictive',
      label: 'AI Dự báo bỏ học',
      path: '/ai-dropout-prediction',
      icon: Sparkles,
      allowed: true,
      highlight: true,
    },
    {
      id: 'ai-boarding-forecast',
      label: 'AI Dự báo suất ăn',
      path: '/boarding/ai-forecast',
      icon: Utensils,
      allowed: true,
      highlight: true,
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

  const [weeklyExpanded, setWeeklyExpanded] = React.useState<boolean>(true);

  const isItemActive = (path: string) => {
    if (path === '/reports/daily') {
      return currentPath === '/reports/daily' || currentPath === '/daily-report' || currentPath === '/reports';
    }
    if (path === '/reports/weekly') {
      return currentPath.startsWith('/reports/weekly');
    }
    return currentPath === path;
  };

  const renderNavGroup = (title: string, items: any[]) => {
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
            const hasSub = item.subItems && item.subItems.length > 0;

            return (
              <div key={item.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (hasSub && !collapsed) {
                      setWeeklyExpanded(!weeklyExpanded);
                    }
                    onNavigate(item.path);
                  }}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 relative group cursor-pointer ${
                    active && !hasSub
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 font-bold'
                      : active && hasSub
                      ? 'bg-blue-50/90 text-blue-900 border border-blue-200/80 font-bold'
                      : item.highlight
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  } ${collapsed ? 'justify-center px-2' : ''}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                        active
                          ? 'text-blue-600'
                          : item.highlight
                          ? 'text-blue-600'
                          : 'text-slate-500 group-hover:text-slate-800'
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {hasSub && !collapsed && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setWeeklyExpanded(!weeklyExpanded);
                      }}
                      className="p-0.5 rounded hover:bg-blue-100/60 text-slate-400 hover:text-blue-700 transition-transform"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          weeklyExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  )}

                  {/* Tooltip for collapsed state */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                      {item.label}
                    </div>
                  )}
                </button>

                {/* Sub-items when expanded */}
                {hasSub && !collapsed && weeklyExpanded && (
                  <div className="ml-4 pl-3 border-l-2 border-blue-100 space-y-0.5 py-0.5 animate-in fade-in duration-150">
                    {item.subItems.map((sub: any) => {
                      const isSubActive =
                        currentPath === sub.path ||
                        (sub.id === 'weekly-school' &&
                          (currentPath === '/reports/weekly' || currentPath === '/reports/weekly?view=school'));
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => onNavigate(sub.path)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer text-left ${
                            isSubActive
                              ? 'bg-blue-600 text-white font-bold shadow-xs'
                              : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/60'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSubActive ? 'bg-white' : 'bg-slate-300'
                            }`}
                          />
                          <span className="truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 custom-scrollbar-slate">
        {renderNavGroup('Điều hướng chính', mainNavItems)}
        {renderNavGroup('Báo cáo & Thống kê', reportNavItems)}

        {/* AI Smart Assistant Trigger Card */}
        {onOpenAIAssistant && (
          <div className="pt-1">
            <button
              type="button"
              onClick={onOpenAIAssistant}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 text-white shadow-sm hover:shadow-indigo-500/25 hover:scale-[1.01] active:scale-95 transition-all cursor-pointer border border-indigo-400/30 group ${
                collapsed ? 'justify-center px-2' : ''
              }`}
              title="Trợ lý ảo AI Tra cứu & Báo cáo (NLP & Giọng nói)"
            >
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-400 to-indigo-500 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                <Bot className="w-4 h-4 text-slate-950 group-hover:rotate-12 transition-transform" />
              </div>
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <div className="text-xs font-black leading-tight flex items-center justify-between">
                    <span>Trợ lý AI Thầy Hùng</span>
                    <span className="text-[9px] bg-emerald-400/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                      24/7
                    </span>
                  </div>
                  <div className="text-[10px] text-blue-200 mt-0.5 truncate flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                    <span>Hỗ trợ GVCN & BGH 24/7</span>
                  </div>
                </div>
              )}
            </button>
          </div>
        )}

        {(isBGH || isAdmin) && renderNavGroup('Quản lý hệ thống', managementNavItems)}
        {isAdmin && renderNavGroup('Cấu hình', settingsNavItems)}
        {renderNavGroup('Cá nhân', accountNavItems)}

        {/* External Useful Links */}
        {!collapsed && (
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="px-3 text-[10px] font-extrabold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
              Liên kết nhà trường
            </div>
            <a
              href={settings?.website || 'https://thcsxadung.db.edu.vn/'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-blue-900 bg-blue-50/80 hover:bg-blue-600 hover:text-white transition-all border border-blue-200/70 group shadow-2xs"
              title="Trang thông tin điện tử nhà trường (https://thcsxadung.db.edu.vn/)"
            >
              <div className="flex items-center gap-2 truncate">
                <Globe className="w-3.5 h-3.5 text-blue-600 group-hover:text-white shrink-0" />
                <span className="truncate">Cổng TTĐT Trường</span>
              </div>
              <ExternalLink className="w-3 h-3 text-blue-400 group-hover:text-white shrink-0" />
            </a>
            <a
              href={settings?.student_results_url || 'https://kqht.db.edu.vn/'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-emerald-50/80 hover:bg-emerald-600 hover:text-white transition-all border border-emerald-200/70 group shadow-2xs"
              title="Trang tra cứu kết quả học tập (https://kqht.db.edu.vn/)"
            >
              <div className="flex items-center gap-2 truncate">
                <GraduationCap className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white shrink-0" />
                <span className="truncate">Kết quả học tập HS</span>
              </div>
              <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:text-white shrink-0" />
            </a>
          </div>
        )}
      </div>

      {/* Logout Button in Sidebar */}
      {currentUser && (
        <div className="p-2 border-t border-slate-100 bg-slate-50/40">
          <button
            type="button"
            onClick={logout}
            title={collapsed ? 'Đăng xuất tài khoản' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50/90 hover:bg-rose-100 transition-all border border-rose-200/80 shadow-2xs cursor-pointer active:scale-95 ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      )}

      {/* Collapse Toggle Footer */}
      <div className="p-2 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
        {!collapsed && (
          <div className="px-2 text-[11px] text-slate-400 truncate font-medium">
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
