import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { SchoolWeeklyAggregate, ClassWeeklySummary, CampusWeeklySummary } from '../types';
import { Attendance4LevelsOverview } from '../components/Attendance4LevelsOverview';
import {
  DEFAULT_WEEK1_START_DATE,
  getSchoolWeekInfo,
  getSchoolWeekFromDate,
  generateSchoolYearWeeks,
  formatDateVN,
  getTodayDateStr,
} from '../utils/schoolWeeks';
import {
  exportAttendanceWeeklySchoolExcel,
  exportAttendanceWeeklyCampusExcel,
  exportAttendanceWeeklyClassExcel,
} from '../utils/exportWeeklyAttendanceExcel';
import {
  Calendar,
  CalendarDays,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  School,
  Building2,
  GraduationCap,
  Users,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Utensils,
  Filter,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Info,
  Award,
} from 'lucide-react';

export type WeeklyReportViewMode = 'school' | 'campus' | 'class';

interface WeeklyReportPageProps {
  onNavigate?: (path: string) => void;
  initialView?: WeeklyReportViewMode;
  initialClassId?: string;
  initialCampusId?: string;
}

export const WeeklyReportPage: React.FC<WeeklyReportPageProps> = ({
  onNavigate,
  initialView = 'school',
  initialClassId,
  initialCampusId,
}) => {
  const { settings, campuses, classes, activeYear } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  const assignedClass = useMemo(() => {
    if (!currentUser) return null;
    return (
      classes.find((c) => currentUser.assigned_class_id && c.id === currentUser.assigned_class_id) ||
      classes.find((c) => currentUser.id && c.homeroom_teacher_id === currentUser.id) ||
      null
    );
  }, [classes, currentUser]);

  // Current view mode: 'school' | 'campus' | 'class'
  const [viewMode, setViewMode] = useState<WeeklyReportViewMode>(() => {
    if (isGVCN && assignedClass) return 'class';
    return initialView || 'school';
  });

  const week1StartDate = settings?.week1_start_date || DEFAULT_WEEK1_START_DATE;
  const todayStr = useMemo(() => getTodayDateStr(), []);

  // Compute school year 37 weeks
  const schoolYearWeeks = useMemo(() => {
    return generateSchoolYearWeeks(week1StartDate, 37, todayStr);
  }, [week1StartDate, todayStr]);

  // Current real-time academic week number
  const currentWeekInfo = useMemo(() => {
    return getSchoolWeekFromDate(todayStr, week1StartDate);
  }, [todayStr, week1StartDate]);

  // Selected week number
  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    return currentWeekInfo.weekNumber || 1;
  });

  // Selected campus filter
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (initialCampusId) return initialCampusId;
    if (isGVCN && assignedClass?.campus_id) return assignedClass.campus_id;
    return 'all';
  });

  // Selected grade filter (ALL, 6, 7, 8, 9)
  const [selectedGrade, setSelectedGrade] = useState<number | 'ALL'>('ALL');

  // Selected class for class-detail view
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialClassId) return initialClassId;
    if (isGVCN && assignedClass) return assignedClass.id;
    return classes[0]?.id || '';
  });

  // Report loading state & data
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [data, setData] = useState<SchoolWeeklyAggregate | null>(null);

  // Sync GVCN defaults
  useEffect(() => {
    if (isGVCN && assignedClass) {
      if (!selectedClassId || selectedClassId !== assignedClass.id) {
        setSelectedClassId(assignedClass.id);
      }
      if (assignedClass.campus_id && selectedCampusId === 'all') {
        setSelectedCampusId(assignedClass.campus_id);
      }
    }
  }, [isGVCN, assignedClass, selectedClassId, selectedCampusId]);

  // Fetch weekly aggregate data
  const loadWeeklyData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const agg = await StorageService.getWeeklyAggregate(
        selectedWeek,
        week1StartDate,
        selectedCampusId !== 'all' ? selectedCampusId : undefined,
        undefined
      );
      setData(agg);
    } catch (err) {
      console.error('Failed to load weekly aggregate:', err);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, [selectedWeek, week1StartDate, selectedCampusId]);

  useEffect(() => {
    loadWeeklyData(true);

    let debounceTimer: any = null;
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'daily_reports' || event.table === 'daily_report_values' || event.table === 'boarding_reports') {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadWeeklyData(false);
        }, 500);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [loadWeeklyData]);

  // Filtered classes by grade
  const filteredClassesSummary = useMemo(() => {
    if (!data) return [];
    let list = data.classesSummary;
    if (selectedGrade !== 'ALL') {
      list = list.filter((c) => c.classItem.grade === selectedGrade);
    }
    return list;
  }, [data, selectedGrade]);

  // Selected class detail summary
  const currentClassSummary = useMemo<ClassWeeklySummary | null>(() => {
    if (!data) return null;
    return (
      data.classesSummary.find(
        (c) =>
          c.classItem.id === selectedClassId ||
          c.classItem.class_name.toLowerCase() === selectedClassId.toLowerCase()
      ) ||
      data.classesSummary[0] ||
      null
    );
  }, [data, selectedClassId]);

  // Selected campus detail summary
  const currentCampusSummary = useMemo<CampusWeeklySummary | null>(() => {
    if (!data) return null;
    if (selectedCampusId !== 'all') {
      return data.campusesSummary.find((cp) => cp.campus.id === selectedCampusId) || data.campusesSummary[0] || null;
    }
    return data.campusesSummary[0] || null;
  }, [data, selectedCampusId]);

  // Export Excel Handlers
  const handleExportExcel = async () => {
    if (!data) return;
    setIsExporting(true);
    try {
      if (viewMode === 'school') {
        await exportAttendanceWeeklySchoolExcel(data, settings);
      } else if (viewMode === 'campus' && currentCampusSummary) {
        await exportAttendanceWeeklyCampusExcel(currentCampusSummary, data, settings);
      } else if (viewMode === 'class' && currentClassSummary) {
        await exportAttendanceWeeklyClassExcel(currentClassSummary, data.label, settings);
      }
    } catch (err) {
      console.error('Error exporting weekly report to Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full print:p-0">
      {/* 1. Header & Actions Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                <CalendarDays className="w-3.5 h-3.5" />
                Báo cáo học kỳ & tuần học
              </span>
              {data?.isCurrent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Tuần hiện tại
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              BÁO CÁO SĨ SỐ HỌC SINH THEO TUẦN
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Tổng hợp chuyên cần, vắng học và báo ăn bán trú toàn trường theo từng tuần học
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadWeeklyData(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer active:scale-95"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-2xs transition-all cursor-pointer active:scale-95"
              title="In báo cáo A4"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>In báo cáo</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || isLoading || !data}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Xuất bảng Excel chuẩn Bộ GD&ĐT"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isExporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          </div>
        </div>

        {/* 2. Top View Mode Tabs: Toàn trường | Từng phân hiệu | Từng lớp */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 max-w-full overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode('school')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'school'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <School className="w-4 h-4" />
              <span>Tổng hợp toàn trường</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('campus')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'campus'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Từng phân hiệu / Điểm trường</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('class')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'class'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Chi tiết từng lớp</span>
            </button>
          </div>

          {/* Quick jump to current week button */}
          {selectedWeek !== currentWeekInfo.weekNumber && (
            <button
              type="button"
              onClick={() => setSelectedWeek(currentWeekInfo.weekNumber)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Về tuần hiện tại (Tuần {currentWeekInfo.weekNumber})</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Week Selector Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs no-print flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Week navigation: Prev, Dropdown, Next */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}
            disabled={selectedWeek <= 1}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Tuần trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Dropdown 37 weeks */}
          <div className="relative min-w-[260px] sm:min-w-[320px]">
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              aria-label="Chọn tuần học"
              className="w-full appearance-none bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 pr-9 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {schoolYearWeeks.map((w) => (
                <option key={w.weekNumber} value={w.weekNumber}>
                  {w.label} {w.isCurrent ? '⭐ (Hiện tại)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setSelectedWeek((w) => Math.min(37, w + 1))}
            disabled={selectedWeek >= 37}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Tuần sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {data && (
            <div className="text-xs font-semibold text-slate-500 hidden xl:block">
              Từ ngày <strong className="text-slate-800">{formatDateVN(data.startDate)}</strong> đến ngày{' '}
              <strong className="text-slate-800">{formatDateVN(data.endDate)}</strong>
            </div>
          )}
        </div>

        {/* Filters depending on view */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Campus Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">Phân hiệu:</span>
            <select
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              aria-label="Chọn phân hiệu"
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">Tất cả phân hiệu ({campuses.length})</option>
              {campuses.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grade Filter (in school view) */}
          {viewMode === 'school' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">Khối:</span>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                aria-label="Chọn khối lớp"
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">Tất cả khối</option>
                <option value={6}>Khối 6</option>
                <option value={7}>Khối 7</option>
                <option value={8}>Khối 8</option>
                <option value={9}>Khối 9</option>
              </select>
            </div>
          )}

          {/* Class Filter (in class view) */}
          {viewMode === 'class' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">Chọn lớp:</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                aria-label="Chọn lớp học"
                className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {classes
                  .filter((c) => selectedCampusId === 'all' || c.campus_id === selectedCampusId)
                  .map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      Lớp {cls.class_name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 4-Level Attendance Overview Cards & Comparison */}
      <Attendance4LevelsOverview
        campusId={selectedCampusId !== 'all' ? selectedCampusId : undefined}
        classId={viewMode === 'class' ? selectedClassId : undefined}
        onNavigate={onNavigate}
      />

      {/* 4. Main View Content */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">Đang tổng hợp dữ liệu báo cáo tuần...</h3>
          <p className="text-xs text-slate-400 mt-1">Đang tính toán sĩ số, chuyên cần và báo ăn bán trú</p>
        </div>
      ) : !data ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Chưa có dữ liệu báo cáo cho tuần này</h3>
          <p className="text-xs text-slate-500 mt-1">Vui lòng chọn tuần khác hoặc kiểm tra lại lịch báo cáo.</p>
        </div>
      ) : (
        <>
          {/* VIEW 1: TỔNG HỢP TOÀN TRƯỜNG */}
          {viewMode === 'school' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Tổng sĩ số</span>
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-extrabold text-slate-900">
                    {data.schoolTotals.totalStudents}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Toàn trường ({data.schoolTotals.totalClasses} lớp)
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Chuyên cần tuần</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-extrabold text-emerald-600">
                    {data.schoolTotals.avgPresentRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Trung bình 5 ngày học</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">TB Có mặt/ngày</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-extrabold text-blue-700">
                    {data.schoolTotals.avgDailyPresent}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Học sinh / ngày</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Tổng lượt vắng</span>
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="text-xl font-extrabold text-rose-600">
                    {data.schoolTotals.totalWeeklyAbsent}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    TB {data.schoolTotals.avgDailyAbsent} em/ngày
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Suất ăn bán trú</span>
                    <Utensils className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-extrabold text-amber-600">
                    {data.schoolTotals.totalBoardingMeals}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Tổng suất ăn trong tuần</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Báo cáo đủ tuần</span>
                    <Award className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-xl font-extrabold text-purple-700">
                    {data.schoolTotals.fullyReportedClassesCount}/{data.schoolTotals.totalClasses}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lớp hoàn thành 5/5 ngày</div>
                </div>
              </div>

              {/* 5 Daily Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {data.schoolTotals.dayTotals.map((dt, idx) => (
                  <div
                    key={dt.date}
                    className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs text-center"
                  >
                    <div className="text-xs font-bold text-slate-800">{dt.dayLabel}</div>
                    <div className="mt-1.5 flex items-baseline justify-center gap-1.5">
                      <span className="text-lg font-extrabold text-blue-700">{dt.present}</span>
                      <span className="text-xs text-slate-400">/ {dt.total}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-2 text-[11px]">
                      <span className="font-bold text-emerald-600">{dt.rate.toFixed(1)}%</span>
                      <span className="text-rose-600 font-semibold">Vắng: {dt.absent}</span>
                    </div>
                    <div className="text-[10px] text-amber-700 bg-amber-50 rounded py-0.5 px-1 mt-1 font-medium">
                      Bán trú: {dt.boardingMeals} suất
                    </div>
                  </div>
                ))}
              </div>

              {/* Full School Matrix Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                      BẢNG TỔNG HỢP SĨ SỐ VÀ CHUYÊN CẦN CÁC LỚP TRONG TUẦN ({filteredClassesSummary.length} lớp)
                    </h3>
                  </div>
                  <div className="text-xs text-slate-400 italic">
                    Nhấp vào dòng lớp để xem chi tiết từng ngày
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 text-slate-600 text-[11px] font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3 text-center border-r border-slate-200 w-10">STT</th>
                        <th className="py-2.5 px-3 border-r border-slate-200">Lớp</th>
                        <th className="py-2.5 px-3 border-r border-slate-200">Phân hiệu</th>
                        <th className="py-2.5 px-3 border-r border-slate-200">GVCN</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Sĩ số</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 2</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 3</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 4</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 5</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 6</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 text-rose-600">
                          Tổng vắng
                        </th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 text-emerald-700">
                          Chuyên cần
                        </th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 text-amber-700">
                          Suất ăn BT
                        </th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200">Báo sớm</th>
                        <th className="py-2.5 px-2 text-center">Xếp loại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredClassesSummary.map((cls, idx) => {
                        const isExcellent = cls.avgPresentRate >= 98;
                        const isGood = cls.avgPresentRate >= 95 && cls.avgPresentRate < 98;
                        const isWarning = cls.avgPresentRate < 92;

                        return (
                          <tr
                            key={cls.classItem.id}
                            onClick={() => {
                              setSelectedClassId(cls.classItem.id);
                              setViewMode('class');
                            }}
                            className="hover:bg-blue-50/60 transition-colors cursor-pointer group"
                          >
                            <td className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100 font-normal">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-extrabold text-blue-700 border-r border-slate-100 group-hover:underline">
                              {cls.classItem.class_name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100 truncate max-w-[140px]">
                              {cls.campusName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100 truncate max-w-[140px]">
                              {cls.teacherName}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-slate-900 border-r border-slate-100">
                              {cls.totalEnrollment}
                            </td>

                            {/* 5 ngày Thứ 2 -> Thứ 6 */}
                            {cls.days.map((d, dIdx) => (
                              <td
                                key={d.date}
                                className="py-2.5 px-1.5 text-center border-r border-slate-100 whitespace-nowrap"
                              >
                                {d.isReported ? (
                                  <div className="flex items-center justify-center gap-1 text-[11px]">
                                    <span className="font-bold text-slate-800">{d.present}</span>
                                    {d.absent > 0 && (
                                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1 rounded">
                                        -{d.absent}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            ))}

                            <td className="py-2.5 px-2 text-center font-extrabold text-rose-600 border-r border-slate-100">
                              {cls.sumAbsent > 0 ? cls.sumAbsent : '0'}
                            </td>

                            <td className="py-2.5 px-2 text-center font-extrabold border-r border-slate-100">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                  isExcellent
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isGood
                                    ? 'bg-blue-100 text-blue-800'
                                    : isWarning
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {cls.avgPresentRate.toFixed(1)}%
                              </span>
                            </td>

                            <td className="py-2.5 px-2 text-center font-bold text-amber-800 border-r border-slate-100">
                              {cls.totalBoardingMeals}
                            </td>

                            <td className="py-2.5 px-2 text-center text-slate-600 border-r border-slate-100">
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-700">
                                <Clock className="w-3 h-3 text-blue-500" />
                                {cls.earlyReportsCount}/5
                              </span>
                            </td>

                            <td className="py-2.5 px-2 text-center">
                              {cls.totalSessionsReported === 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200" title="Lớp chưa gửi báo cáo ngày nào trong tuần này">
                                  Chưa nộp
                                </span>
                              ) : cls.totalSessionsReported < 5 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300" title={`Lớp mới nộp ${cls.totalSessionsReported}/5 ngày học. Cần báo bổ sung để được xét thi đua.`}>
                                  Thiếu {5 - cls.totalSessionsReported} ngày ({cls.totalSessionsReported}/5)
                                </span>
                              ) : isExcellent ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  Xuất sắc
                                </span>
                              ) : isGood ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                  Tốt
                                </span>
                              ) : isWarning ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                  Cần nhắc
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500">Đạt</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50/70 text-slate-900 font-extrabold border-t-2 border-slate-300 text-xs">
                        <td colSpan={4} className="py-3 px-4 text-center border-r border-slate-200 uppercase">
                          Tổng cộng toàn trường
                        </td>
                        <td className="py-3 px-2 text-center border-r border-slate-200 text-blue-800">
                          {data.schoolTotals.totalStudents}
                        </td>
                        {data.schoolTotals.dayTotals.map((dt) => (
                          <td
                            key={dt.date}
                            className="py-3 px-2 text-center border-r border-slate-200"
                          >
                            <span className="text-blue-800">{dt.present}</span>
                            {dt.absent > 0 && (
                              <span className="text-rose-600 text-[10px] ml-1">(-{dt.absent})</span>
                            )}
                          </td>
                        ))}
                        <td className="py-3 px-2 text-center border-r border-slate-200 text-rose-600">
                          {data.schoolTotals.totalWeeklyAbsent}
                        </td>
                        <td className="py-3 px-2 text-center border-r border-slate-200 text-emerald-700">
                          {data.schoolTotals.avgPresentRate.toFixed(1)}%
                        </td>
                        <td className="py-3 px-2 text-center border-r border-slate-200 text-amber-800">
                          {data.schoolTotals.totalBoardingMeals}
                        </td>
                        <td className="py-3 px-2 text-center border-r border-slate-200 text-slate-600">
                          {data.schoolTotals.fullyReportedClassesCount}/{data.schoolTotals.totalClasses}
                        </td>
                        <td className="py-3 px-2 text-center text-slate-500">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Note on how attendance % is calculated when classes forgot to report */}
                <div className="p-3 bg-amber-50/80 border-t border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold">Quy tắc tính tỉ lệ % chuyên cần khi có lớp quên báo cáo:</span>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      • Các ngày lớp quên báo cáo được đánh dấu dấu gạch ngang <strong className="text-slate-800">(-)</strong> và không tự ý tính là vắng cả lớp hay có mặt đủ.
                      <br />
                      • Tỉ lệ % chuyên cần trung bình được tính chuẩn xác bằng: <strong className="text-slate-900">(Tổng lượt HS có mặt / Tổng lượt sĩ số của các ngày ĐÃ BÁO CÁO) × 100%</strong>.
                      <br />
                      • Lớp nộp thiếu báo cáo (dưới 5/5 ngày) sẽ được cảnh báo <span className="font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded">Thiếu ngày</span> và không đủ điều kiện xét Xuất sắc. GVCN có thể vào mục <button type="button" onClick={() => onNavigate?.('/attendance')} className="font-bold text-blue-700 underline cursor-pointer">Báo cáo sĩ số</button>, chọn lại ngày đã quên để gửi bổ sung bất cứ lúc nào.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: TỪNG PHÂN HIỆU */}
          {viewMode === 'campus' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Campus Selector Pills */}
              <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  Điểm trường:
                </span>
                {data.campusesSummary.map((cp) => (
                  <button
                    key={cp.campus.id}
                    type="button"
                    onClick={() => setSelectedCampusId(cp.campus.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedCampusId === cp.campus.id ||
                      (selectedCampusId === 'all' && currentCampusSummary?.campus.id === cp.campus.id)
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{cp.campus.name}</span>
                    <span className="text-[10px] opacity-80">({cp.totalClasses} lớp)</span>
                  </button>
                ))}
              </div>

              {/* Campus Comparison Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.campusesSummary.map((cp) => (
                  <div
                    key={cp.campus.id}
                    onClick={() => setSelectedCampusId(cp.campus.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      currentCampusSummary?.campus.id === cp.campus.id
                        ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-slate-900">{cp.campus.name}</h4>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                        {cp.totalClasses} lớp
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Sĩ số</div>
                        <div className="text-sm font-extrabold text-slate-800">{cp.totalStudents}</div>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl">
                        <div className="text-[10px] text-emerald-700 uppercase font-semibold">Chuyên cần</div>
                        <div className="text-sm font-extrabold text-emerald-700">
                          {cp.avgPresentRate.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-rose-50 p-2 rounded-xl">
                        <div className="text-[10px] text-rose-700 uppercase font-semibold">Vắng tuần</div>
                        <div className="text-sm font-extrabold text-rose-700">{cp.totalWeeklyAbsent}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected Campus Detail Table */}
              {currentCampusSummary && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase">
                          CHI TIẾT PHÂN HIỆU: {currentCampusSummary.campus.name.toUpperCase()}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {currentCampusSummary.totalClasses} lớp học • {currentCampusSummary.totalStudents} học sinh •{' '}
                          Chuyên cần trung bình: <strong className="text-emerald-600">{currentCampusSummary.avgPresentRate.toFixed(1)}%</strong>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => exportAttendanceWeeklyCampusExcel(currentCampusSummary, data, settings)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer active:scale-95"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Xuất Excel Phân hiệu</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3 text-center border-r border-slate-200">STT</th>
                          <th className="py-2.5 px-3 border-r border-slate-200">Lớp</th>
                          <th className="py-2.5 px-3 border-r border-slate-200">GVCN</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Sĩ số</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 2</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 3</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 4</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 5</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200">Thứ 6</th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200 text-rose-600">
                            Vắng tuần
                          </th>
                          <th className="py-2.5 px-2 text-center border-r border-slate-200 text-emerald-700">
                            Chuyên cần
                          </th>
                          <th className="py-2.5 px-2 text-center text-amber-700">Suất ăn BT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {currentCampusSummary.classes.map((cls, idx) => (
                          <tr
                            key={cls.classItem.id}
                            onClick={() => {
                              setSelectedClassId(cls.classItem.id);
                              setViewMode('class');
                            }}
                            className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-100">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-extrabold text-blue-700 border-r border-slate-100">
                              {cls.classItem.class_name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100">
                              {cls.teacherName}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-slate-900 border-r border-slate-100">
                              {cls.totalEnrollment}
                            </td>
                            {cls.days.map((d) => (
                              <td
                                key={d.date}
                                className="py-2.5 px-1.5 text-center border-r border-slate-100"
                              >
                                {d.isReported ? (
                                  <span className="font-bold text-slate-800">
                                    {d.present}
                                    {d.absent > 0 && (
                                      <span className="text-[10px] text-rose-600 ml-1">
                                        (-{d.absent})
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            ))}
                            <td className="py-2.5 px-2 text-center font-extrabold text-rose-600 border-r border-slate-100">
                              {cls.sumAbsent}
                            </td>
                            <td className="py-2.5 px-2 text-center font-extrabold text-emerald-700 border-r border-slate-100">
                              {cls.avgPresentRate.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-amber-800">
                              {cls.totalBoardingMeals}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: CHI TIẾT TỪNG LỚP */}
          {viewMode === 'class' && currentClassSummary && (
            <div className="space-y-4 sm:space-y-6">
              {/* Class Header Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm shadow-blue-600/30">
                      {currentClassSummary.classItem.class_name}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                          Báo cáo Tuần Lớp {currentClassSummary.classItem.class_name}
                        </h2>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {currentClassSummary.campusName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        GVCN: <strong className="text-slate-800">{currentClassSummary.teacherName}</strong> • Sĩ
                        số: <strong className="text-slate-800">{currentClassSummary.totalEnrollment} học sinh</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => exportAttendanceWeeklyClassExcel(currentClassSummary, data.label, settings)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-all cursor-pointer active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Xuất Excel Lớp {currentClassSummary.classItem.class_name}</span>
                  </button>
                </div>

                {/* 4 Quick Stat Pills for Class */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-100">
                  <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Chuyên cần tuần</div>
                    <div className="text-lg font-extrabold text-emerald-600">
                      {currentClassSummary.avgPresentRate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Tổng lượt vắng</div>
                    <div className="text-lg font-extrabold text-rose-600">
                      {currentClassSummary.sumAbsent}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Suất ăn bán trú</div>
                    <div className="text-lg font-extrabold text-amber-700">
                      {currentClassSummary.totalBoardingMeals}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Báo sớm trước 07:30</div>
                    <div className="text-lg font-extrabold text-blue-700">
                      {currentClassSummary.earlyReportsCount}/5 buổi
                    </div>
                  </div>
                </div>
              </div>

              {/* Day-by-Day Table for this Class */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Theo dõi sĩ số chi tiết từng ngày (Thứ 2 đến Thứ 6)</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3">Buổi học & Ngày</th>
                        <th className="py-2.5 px-3 text-center">Sĩ số</th>
                        <th className="py-2.5 px-3 text-center">Có mặt</th>
                        <th className="py-2.5 px-3 text-center text-rose-600">Vắng</th>
                        <th className="py-2.5 px-3 text-center text-emerald-700">Tỉ lệ CC (%)</th>
                        <th className="py-2.5 px-3 text-center text-amber-700">Bán trú ăn trưa</th>
                        <th className="py-2.5 px-3 text-center">Giờ báo cáo</th>
                        <th className="py-2.5 px-3 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {currentClassSummary.days.map((d) => (
                        <tr key={d.date} className="hover:bg-slate-50/80">
                          <td className="py-3 px-3 font-bold text-slate-800">{d.dayLabel}</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-900">
                            {d.isReported ? d.total : '-'}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-blue-700">
                            {d.isReported ? d.present : '-'}
                          </td>
                          <td className="py-3 px-3 text-center font-extrabold text-rose-600">
                            {d.isReported ? (d.absent > 0 ? d.absent : '0') : '-'}
                          </td>
                          <td className="py-3 px-3 text-center font-extrabold text-emerald-700">
                            {d.isReported ? `${d.rate.toFixed(1)}%` : '-'}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-amber-800">
                            {d.isReported ? `${d.boardingMeals} suất` : '-'}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600">
                            {d.isReported ? (
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {d.reportedTime || 'Đã gửi'}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {d.isReported ? (
                              d.isEarly ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                                  Báo sớm
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                  Đã báo
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Chưa báo
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Absent Students List for the Week */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <h3 className="text-xs font-extrabold text-slate-900 uppercase">
                      DANH SÁCH HỌC SINH NGHỈ HỌC TRONG TUẦN ({currentClassSummary.absentStudentsAllWeek.length} lượt)
                    </h3>
                  </div>
                  {currentClassSummary.absentStudentsAllWeek.length === 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Tuyệt vời! Tuần này không có học sinh nghỉ học
                    </span>
                  )}
                </div>

                {currentClassSummary.absentStudentsAllWeek.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3 text-center w-12">STT</th>
                          <th className="py-2.5 px-3">Họ và tên học sinh</th>
                          <th className="py-2.5 px-3">Ngày nghỉ</th>
                          <th className="py-2.5 px-3">Lý do nghỉ</th>
                          <th className="py-2.5 px-3">Địa chỉ thôn / bản</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {currentClassSummary.absentStudentsAllWeek.map((st, i) => (
                          <tr key={`${st.studentName}_${st.date}_${i}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 text-center text-slate-400 font-normal">
                              {i + 1}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{st.studentName}</td>
                            <td className="py-2.5 px-3 text-slate-600 font-semibold">{st.dayLabel}</td>
                            <td className="py-2.5 px-3 text-rose-700 font-medium">{st.reason}</td>
                            <td className="py-2.5 px-3 text-slate-500">{st.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Lớp duy trì sĩ số 100% trong toàn bộ các buổi học của tuần.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
