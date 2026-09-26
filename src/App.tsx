import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SchoolProvider, useSchool } from './contexts/SchoolContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { GVCNUnreportedAlertBanner } from './components/GVCNUnreportedAlertBanner';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendanceInputPage } from './pages/AttendanceInputPage';
import { DailyReportPage } from './pages/DailyReportPage';
import { MonthlyReportPage } from './pages/MonthlyReportPage';
import { AttendanceRankingPage } from './pages/AttendanceRankingPage';
import { ChartsPage } from './pages/ChartsPage';
import { ClassesManagementPage } from './pages/ClassesManagementPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { SettingsSchoolPage } from './pages/SettingsSchoolPage';
import { SettingsCampusesPage } from './pages/SettingsCampusesPage';
import { SettingsIndicatorsPage } from './pages/SettingsIndicatorsPage';
import { SettingsReportTemplatePage } from './pages/SettingsReportTemplatePage';
import { SettingsSupabasePage } from './pages/SettingsSupabasePage';
import { ProfilePage } from './pages/ProfilePage';
import {
  School,
  LayoutDashboard,
  ClipboardList,
  Calendar,
  User,
  Code2,
} from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, isGVCN, isAdmin, isBGH, loading } = useAuth();
  const { settings, activeYear, classes } = useSchool();

  // Navigation state
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return '/dashboard';
  });

  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('app_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Selected class & date for direct navigation to attendance
  const [selectedClassForInput, setSelectedClassForInput] = useState<{ classId?: string; date?: string }>({});

  const handleNavigate = (path: string) => {
    if (path === '/attendance') {
      setSelectedClassForInput({});
    }
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectClassForInput = (classId: string, date: string) => {
    setSelectedClassForInput({ classId, date });
    setCurrentPath('/attendance');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Find user's assigned class name if GVCN
  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  // Default routing for GVCN on app load
  useEffect(() => {
    if (!loading && currentUser?.role === 'GVCN' && currentPath === '/dashboard') {
      // GVCN can access dashboard, but default to attendance if needed
      // setCurrentPath('/attendance');
    }
  }, [loading, currentUser, currentPath]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-700/25 animate-pulse">
            <School className="w-7 h-7" />
          </div>
          <div className="text-center">
            <h1 className="font-extrabold text-slate-900 text-base">
              {settings?.school_name || 'Sổ Báo Cáo Sĩ Số'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Đang kết nối hệ thống dữ liệu...</p>
          </div>
        </div>
      </div>
    );
  }

  // If not logged in, show LoginPage
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(targetPath?: string) => {
          if (targetPath === '/attendance') {
            setSelectedClassForInput({});
          }
          if (targetPath) {
            setCurrentPath(targetPath);
          } else {
            setCurrentPath('/dashboard');
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100/70 flex flex-col font-sans antialiased text-slate-800 selection:bg-blue-600 selection:text-white">
      {/* Top Navbar Header */}
      <Navbar
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Main Layout Body with Sidebar + Viewport */}
      <div className="flex-1 flex flex-row w-full min-w-0">
        {/* Left Desktop Sidebar */}
        <Sidebar
          currentPath={currentPath}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />

        {/* Center Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Automatic Alert Banner for GVCN when class has not reported attendance */}
          <GVCNUnreportedAlertBanner onNavigate={handleNavigate} currentPath={currentPath} />

          <main
            className={`flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 ${
              currentPath === '/attendance'
                ? 'pt-3.5 pb-0 sm:py-6'
                : 'py-3.5 sm:py-6 pb-20 sm:pb-8'
            }`}
          >
            {currentPath === '/dashboard' && (
              <DashboardPage
                onNavigate={handleNavigate}
                onSelectClassForInput={handleSelectClassForInput}
              />
            )}

            {currentPath === '/attendance' && (
              <AttendanceInputPage
                initialClassId={selectedClassForInput.classId}
                initialDate={selectedClassForInput.date}
                onSavedSuccess={() => {
                  // Optional callback
                }}
                onNavigate={handleNavigate}
              />
            )}

            {(currentPath === '/reports/daily' || currentPath === '/daily-report' || currentPath === '/reports') && (
              <DailyReportPage onNavigate={handleNavigate} />
            )}

            {currentPath === '/reports/monthly' && (
              <MonthlyReportPage onNavigate={handleNavigate} />
            )}

            {currentPath === '/reports/ranking' && (
              <AttendanceRankingPage onNavigate={handleNavigate} />
            )}

            {currentPath === '/charts' && <ChartsPage />}

            {currentPath === '/classes' && (isAdmin || isBGH ? <ClassesManagementPage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/users' && (isAdmin || isBGH ? <UsersManagementPage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/settings/school' && (isAdmin ? <SettingsSchoolPage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/settings/campuses' && (isAdmin ? <SettingsCampusesPage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/settings/indicators' && (isAdmin ? <SettingsIndicatorsPage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/settings/report-template' && (isAdmin ? <SettingsReportTemplatePage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/settings/supabase' && (isAdmin ? <SettingsSupabasePage /> : <DashboardPage onNavigate={handleNavigate} onSelectClassForInput={handleSelectClassForInput} />)}

            {currentPath === '/profile' && <ProfilePage onNavigate={handleNavigate} />}
          </main>

          {/* App Footer */}
          {currentPath !== '/attendance' && (
            <footer className="mt-auto border-t border-slate-200 bg-white py-4 no-print text-xs text-slate-500">
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-2.5 text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <School className="w-4 h-4 text-blue-700 flex-shrink-0" />
                  <span className="font-extrabold text-slate-800">
                    {settings?.school_name || 'Hệ thống Quản lý Báo cáo Sĩ số'}
                  </span>
                  {(settings?.commune || settings?.province) && (
                    <>
                      <span className="text-slate-300 hidden sm:inline">|</span>
                      <span>{[settings.commune, settings.province].filter(Boolean).join(', ')}</span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 text-[11px]">
                  <span>Năm học: <strong className="text-slate-700">{activeYear?.name || '2026-2027'}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                    <Code2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span>Ứng dụng phát triển bởi: <strong className="text-slate-900 font-bold">{settings?.developer_name || 'Vũ Văn Hùng'}</strong></span>
                    <span className="text-slate-600 font-medium">({settings?.developer_contact || 'SĐT: 0984246993'})</span>
                  </span>
                </div>
              </div>
            </footer>
          )}
        </div>
      </div>

      {/* Persistent Mobile Bottom Navigation Bar (Hidden when on /attendance page where docked actions exist) */}
      {currentPath !== '/attendance' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-1.5 flex items-center justify-around shadow-lg no-print pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => handleNavigate('/dashboard')}
            className={`flex flex-col items-center justify-center min-w-[64px] py-1 transition-all ${
              currentPath === '/dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Tổng quan</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/attendance')}
            className="flex flex-col items-center justify-center relative -top-3 min-w-[72px]"
          >
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              <ClipboardList className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-blue-700 mt-0.5 whitespace-nowrap">
              {isGVCN && assignedClass ? `Lớp ${assignedClass.class_name}` : 'Điểm danh'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/reports/daily')}
            className={`flex flex-col items-center justify-center min-w-[64px] py-1 transition-all ${
              currentPath === '/reports/daily' || currentPath === '/daily-report' ? 'text-blue-600 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Theo ngày</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/profile')}
            className={`flex flex-col items-center justify-center min-w-[64px] py-1 transition-all ${
              currentPath === '/profile' ? 'text-blue-600 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <User className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Cá nhân</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default function App() {
  return (
    <SchoolProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </SchoolProvider>
  );
}
