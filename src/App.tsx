import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SchoolProvider, useSchool } from './contexts/SchoolContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendanceInputPage } from './pages/AttendanceInputPage';
import { DailyReportPage } from './pages/DailyReportPage';
import { MonthlyReportPage } from './pages/MonthlyReportPage';
import { ChartsPage } from './pages/ChartsPage';
import { ClassesManagementPage } from './pages/ClassesManagementPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { SettingsSchoolPage } from './pages/SettingsSchoolPage';
import { SettingsIndicatorsPage } from './pages/SettingsIndicatorsPage';
import { SettingsReportTemplatePage } from './pages/SettingsReportTemplatePage';
import { SettingsSupabasePage } from './pages/SettingsSupabasePage';
import { ProfilePage } from './pages/ProfilePage';
import { Heart, School, ShieldAlert, Sparkles, BarChart3, ClipboardList, FileSpreadsheet, User, Code2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, isGVCN } = useAuth();
  const { settings, activeYear, classes } = useSchool();

  // Navigation state
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return '/dashboard';
  });

  // Selected class & date for direct navigation to attendance
  const [selectedClassForInput, setSelectedClassForInput] = useState<{ classId?: string; date?: string }>({});

  const handleNavigate = (path: string) => {
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

  // If not logged in, show LoginPage
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(targetPath?: string) => {
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
    <div className="min-h-screen bg-slate-100/80 flex flex-col font-sans antialiased text-slate-800 selection:bg-blue-600 selection:text-white pb-16 sm:pb-0">
      {/* Top Navbar */}
      <Navbar currentPath={currentPath} onNavigate={handleNavigate} />

      {/* Main Content Area - Optimized spacing for phones */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-8">
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

        {currentPath === '/reports/daily' && (
          <DailyReportPage onNavigate={handleNavigate} />
        )}

        {currentPath === '/reports/monthly' && <MonthlyReportPage />}

        {currentPath === '/charts' && <ChartsPage />}

        {currentPath === '/classes' && <ClassesManagementPage />}

        {currentPath === '/users' && <UsersManagementPage />}

        {currentPath === '/settings/school' && <SettingsSchoolPage />}

        {currentPath === '/settings/indicators' && <SettingsIndicatorsPage />}

        {currentPath === '/settings/report-template' && <SettingsReportTemplatePage />}

        {currentPath === '/settings/supabase' && <SettingsSupabasePage />}

        {currentPath === '/profile' && <ProfilePage onNavigate={handleNavigate} />}
      </main>

      {/* App Footer (Hidden when printing reports) */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-5 no-print text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
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
            {settings?.developer_name ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                <Code2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span>Phát triển bởi: <strong className="text-slate-900 font-bold">{settings.developer_name}</strong></span>
                {settings.developer_contact && (
                  <span className="text-slate-500 font-normal">({settings.developer_contact})</span>
                )}
              </span>
            ) : (
              <span>Phiên bản v2.0 - Chuẩn Excel PGD</span>
            )}
          </div>
        </div>
      </footer>

      {/* Persistent Mobile Bottom Navigation Bar (Dành riêng cho màn hình điện thoại) */}
      {currentPath !== '/attendance' && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-1.5 flex items-center justify-around shadow-lg no-print">
          <button
            type="button"
            onClick={() => handleNavigate('/dashboard')}
            className={`flex flex-col items-center justify-center min-w-[64px] py-1 transition-all ${
              currentPath === '/dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <BarChart3 className="w-5 h-5 mb-0.5" />
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
              currentPath === '/reports/daily' ? 'text-blue-600 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Mẫu biểu</span>
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
        <AppContent />
      </AuthProvider>
    </SchoolProvider>
  );
}
