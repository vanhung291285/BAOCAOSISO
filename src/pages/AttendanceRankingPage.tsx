import React, { useState, useEffect, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import {
  AttendanceRankingSummary,
  AttendancePeriodType,
  SchoolOffDay,
  ClassAttendanceRank,
} from '../types';
import { CampusSelector } from '../components/CampusSelector';
import * as XLSX from 'xlsx';
import {
  DEFAULT_WEEK1_START_DATE,
  DEFAULT_EARLY_REPORT_DEADLINE,
  DEFAULT_EARLY_REPORT_BONUS_PER_DAY,
  DEFAULT_EARLY_REPORT_MAX_BONUS,
  getSchoolWeekInfo,
  getSchoolWeekFromDate,
  generateSchoolYearWeeks,
  formatDateVN,
  formatDayMonthVN,
  getTodayDateStr,
} from '../utils/schoolWeeks';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Trophy,
  Award,
  Medal,
  Calendar,
  Filter,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Settings2,
  Layers,
  X,
  Info,
  Building2,
  BarChart3,
  CalendarDays,
  Check,
} from 'lucide-react';

interface AttendanceRankingPageProps {
  onNavigate?: (path: string) => void;
}

export const AttendanceRankingPage: React.FC<AttendanceRankingPageProps> = ({ onNavigate }) => {
  const { settings, campuses, classes, activeYear, updateSchoolSettings } = useSchool();
  const { isAdmin, isBGH, isGVCN, currentUser } = useAuth();

  // Reference date for week 1 (default 2026-09-07 per requirement)
  const week1StartDate = settings?.week1_start_date || DEFAULT_WEEK1_START_DATE;
  const todayStr = useMemo(() => getTodayDateStr(), []);

  // Compute school year weeks list (37 weeks)
  const schoolYearWeeks = useMemo(() => {
    return generateSchoolYearWeeks(week1StartDate, 37, todayStr);
  }, [week1StartDate, todayStr]);

  // Current real-time week number based on today's date
  const currentWeekInfo = useMemo(() => {
    return getSchoolWeekFromDate(todayStr, week1StartDate);
  }, [todayStr, week1StartDate]);

  // Period state
  const [periodType, setPeriodType] = useState<AttendancePeriodType>('WEEK');
  
  // Selected week number (1 to 37, default to current academic week)
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(() => {
    const today = getTodayDateStr();
    const info = getSchoolWeekFromDate(today, DEFAULT_WEEK1_START_DATE);
    return info.weekNumber;
  });

  // Keep selected week synchronized if settings change
  useEffect(() => {
    if (settings?.week1_start_date) {
      const info = getSchoolWeekFromDate(todayStr, settings.week1_start_date);
      setSelectedWeekNumber(info.weekNumber);
    }
  }, [settings?.week1_start_date, todayStr]);
  
  // Custom month reference (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Custom year / semester
  const [selectedSemester, setSelectedSemester] = useState<'FULL_YEAR' | 'SEMESTER_1' | 'SEMESTER_2'>('FULL_YEAR');

  // Filters
  const [selectedCampusId, setSelectedCampusId] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<number | 'ALL'>('ALL');

  // Day off rules (strictly exclude weekends for school weeks)
  const [excludeSundays, setExcludeSundays] = useState<boolean>(true);
  const [excludeSaturdays, setExcludeSaturdays] = useState<boolean>(true);
  const [excludeEmptySchoolDays, setExcludeEmptySchoolDays] = useState<boolean>(true);

  // Week ranking configuration modal
  const [showWeekConfigModal, setShowWeekConfigModal] = useState<boolean>(false);
  const [configWeek1Start, setConfigWeek1Start] = useState<string>(week1StartDate);
  const [configThresholdExcellent, setConfigThresholdExcellent] = useState<number>(settings?.ranking_threshold_excellent ?? 98);
  const [configThresholdGood, setConfigThresholdGood] = useState<number>(settings?.ranking_threshold_good ?? 95);
  const [configThresholdFair, setConfigThresholdFair] = useState<number>(settings?.ranking_threshold_fair ?? 90);
  const [configEnableEarlyBonus, setConfigEnableEarlyBonus] = useState<boolean>(settings?.enable_early_report_bonus ?? true);
  const [configEarlyDeadline, setConfigEarlyDeadline] = useState<string>(settings?.early_report_deadline || DEFAULT_EARLY_REPORT_DEADLINE);
  const [configEarlyBonusPoints, setConfigEarlyBonusPoints] = useState<number>(settings?.early_report_bonus_points ?? DEFAULT_EARLY_REPORT_BONUS_PER_DAY);
  const [configEarlyMaxBonus, setConfigEarlyMaxBonus] = useState<number>(settings?.early_report_max_bonus ?? DEFAULT_EARLY_REPORT_MAX_BONUS);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string>('');

  // Sync modal values with settings when opened
  useEffect(() => {
    if (settings) {
      setConfigWeek1Start(settings.week1_start_date || DEFAULT_WEEK1_START_DATE);
      setConfigThresholdExcellent(settings.ranking_threshold_excellent ?? 98);
      setConfigThresholdGood(settings.ranking_threshold_good ?? 95);
      setConfigThresholdFair(settings.ranking_threshold_fair ?? 90);
      setConfigEnableEarlyBonus(settings.enable_early_report_bonus ?? true);
      setConfigEarlyDeadline(settings.early_report_deadline || DEFAULT_EARLY_REPORT_DEADLINE);
      setConfigEarlyBonusPoints(settings.early_report_bonus_points ?? DEFAULT_EARLY_REPORT_BONUS_PER_DAY);
      setConfigEarlyMaxBonus(settings.early_report_max_bonus ?? DEFAULT_EARLY_REPORT_MAX_BONUS);
    }
  }, [settings, showWeekConfigModal]);

  // Off days modal
  const [showOffDaysModal, setShowOffDaysModal] = useState<boolean>(false);
  const [offDaysList, setOffDaysList] = useState<SchoolOffDay[]>([]);
  const [newOffDate, setNewOffDate] = useState<string>(() => getTodayDateStr());
  const [newOffName, setNewOffName] = useState<string>('');
  const [newOffType, setNewOffType] = useState<SchoolOffDay['type']>('HOLIDAY');

  // Ranking data
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<AttendanceRankingSummary | null>(null);

  // View mode: 'ALL_SCHOOL' (Bảng tổng sắp toàn trường) or 'BY_CAMPUS' (Xếp hạng theo từng phân hiệu)
  const [rankingMode, setRankingMode] = useState<'ALL_SCHOOL' | 'BY_CAMPUS'>('ALL_SCHOOL');
  const [activeCampusTab, setActiveCampusTab] = useState<string>('all');
  
  // View mode: 'TABLE' or 'CHART'
  const [viewMode, setViewMode] = useState<'TABLE' | 'CHART'>('TABLE');

  // GVCN assigned class rank
  const myClassRank = useMemo(() => {
    if (!summary || !currentUser?.assigned_class_id) return null;
    return summary.rankings.find((r) => r.classItem.id === currentUser.assigned_class_id) || null;
  }, [summary, currentUser]);

  // Calculate Start and End dates based on selected period
  const periodConfig = useMemo(() => {
    if (periodType === 'WEEK') {
      // Use exact school week calculation (Monday to Friday, 5 school days)
      const weekInfo = getSchoolWeekInfo(selectedWeekNumber, week1StartDate);
      return {
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate,
        label: weekInfo.label,
        subLabel: `Từ Thứ Hai (${formatDayMonthVN(weekInfo.startDate)}) đến hết sáng Thứ Sáu (${formatDateVN(weekInfo.endDate)}) - 5 ngày học`,
        weekNumber: weekInfo.weekNumber,
        schoolWeekInfo: weekInfo,
      };
    } else if (periodType === 'MONTH') {
      const [yStr, mStr] = selectedMonth.split('-');
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      const lastDay = new Date(year, month, 0).getDate();

      const start = `${selectedMonth}-01`;
      const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      return {
        startDate: start,
        endDate: end,
        label: `Tháng ${month}/${year}`,
      };
    } else {
      // YEAR
      const yearName = activeYear?.name || '2026-2027';
      const [startYearStr, endYearStr] = yearName.split('-');
      const sY = parseInt(startYearStr, 10) || 2026;
      const eY = parseInt(endYearStr, 10) || (sY + 1);

      if (selectedSemester === 'SEMESTER_1') {
        return {
          startDate: `${sY}-09-01`,
          endDate: `${eY}-01-15`,
          label: `Học kỳ I (Năm học ${yearName})`,
        };
      } else if (selectedSemester === 'SEMESTER_2') {
        return {
          startDate: `${eY}-01-16`,
          endDate: `${eY}-05-31`,
          label: `Học kỳ II (Năm học ${yearName})`,
        };
      } else {
        return {
          startDate: `${sY}-09-01`,
          endDate: `${eY}-05-31`,
          label: `Cả năm học ${yearName}`,
        };
      }
    }
  }, [periodType, selectedWeekNumber, week1StartDate, selectedMonth, selectedSemester, activeYear]);

  // Load off days
  const loadOffDays = async () => {
    const list = await StorageService.getOffDays();
    setOffDaysList(list);
  };

  useEffect(() => {
    loadOffDays();
  }, []);

  // Fetch ranking data
  const fetchRankings = async () => {
    setLoading(true);
    try {
      const isWeek = periodType === 'WEEK';
      const result = await StorageService.getAttendanceRanking({
        periodType,
        startDate: periodConfig.startDate,
        endDate: periodConfig.endDate,
        periodLabel: periodConfig.label,
        weekNumber: isWeek ? periodConfig.weekNumber : undefined,
        schoolWeekInfo: isWeek ? periodConfig.schoolWeekInfo : undefined,
        campusId: selectedCampusId,
        grade: selectedGrade,
        excludeSundays: isWeek ? true : excludeSundays,
        excludeSaturdays: isWeek ? true : excludeSaturdays,
        excludeEmptySchoolDays,
      });
      setSummary(result);
    } catch (err) {
      console.error('Error fetching attendance ranking:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, [
    periodConfig,
    selectedCampusId,
    selectedGrade,
    excludeSundays,
    excludeSaturdays,
    excludeEmptySchoolDays,
  ]);

  // Week navigation (School weeks 1 to 37)
  const handlePrevWeek = () => {
    setSelectedWeekNumber((prev) => Math.max(1, prev - 1));
  };

  const handleNextWeek = () => {
    setSelectedWeekNumber((prev) => Math.min(37, prev + 1));
  };

  const handleCurrentWeek = () => {
    setSelectedWeekNumber(currentWeekInfo.weekNumber);
  };

  // Save week ranking configuration
  const handleSaveWeekConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      await updateSchoolSettings({
        ...settings,
        week1_start_date: configWeek1Start,
        ranking_threshold_excellent: configThresholdExcellent,
        ranking_threshold_good: configThresholdGood,
        ranking_threshold_fair: configThresholdFair,
        enable_early_report_bonus: configEnableEarlyBonus,
        early_report_deadline: configEarlyDeadline,
        early_report_bonus_points: configEarlyBonusPoints,
        early_report_max_bonus: configEarlyMaxBonus,
      });
      setConfigSuccessMsg('Đã lưu cấu hình xếp loại tuần thành công!');
      setTimeout(() => {
        setConfigSuccessMsg('');
        setShowWeekConfigModal(false);
      }, 1000);
      fetchRankings();
    } catch (err) {
      console.error('Error saving week ranking configuration:', err);
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setSelectedMonth(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setSelectedMonth(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  // Add Day Off handler
  const handleAddOffDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOffDate || !newOffName.trim()) return;

    const newDay: SchoolOffDay = {
      id: `off_${newOffDate}_${Date.now()}`,
      date: newOffDate,
      name: newOffName.trim(),
      type: newOffType,
      applies_to: selectedCampusId === 'all' ? 'ALL' : selectedCampusId,
      created_at: new Date().toISOString(),
    };

    await StorageService.saveOffDay(newDay);
    await loadOffDays();
    setNewOffName('');
    fetchRankings();
  };

  const handleDeleteOffDay = async (id: string) => {
    if (confirm('Thầy/Cô có chắc chắn muốn xóa ngày nghỉ này?')) {
      await StorageService.deleteOffDay(id);
      await loadOffDays();
      fetchRankings();
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!summary) return;

    let campusName = '';
    if (selectedCampusId !== 'all') {
      const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
      if (selectedCampus) {
        campusName = ` - ${selectedCampus.name.toUpperCase()}`;
      }
    }

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // Header info
    wsData.push([settings?.sub_department_name || 'UBND HUYỆN ĐIỆN BIÊN ĐÔNG']);
    wsData.push([settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG']);
    wsData.push([]);
    wsData.push([`BẢNG TỔNG KẾT & XẾP LOẠI THI ĐUA DUY TRÌ SĨ SỐ HỌC SINH`]);
    wsData.push([`${summary.periodLabel.toUpperCase()}${campusName}`]);
    wsData.push([
      `Thời gian: Từ ngày ${summary.dateRange.start.split('-').reverse().join('/')} đến ngày ${summary.dateRange.end.split('-').reverse().join('/')}`,
    ]);
    wsData.push([
      `Số ngày tính thi đua: ${summary.totalValidDays} ngày (Đã loại trừ ${summary.totalExcludedDays} ngày học sinh được nghỉ)`,
    ]);
    wsData.push([]);

    // Table Header
    wsData.push([
      'Hạng toàn trường',
      'Hạng phân hiệu',
      'Lớp',
      'Khối',
      'Điểm trường',
      'Giáo viên chủ nhiệm',
      'Sĩ số',
      'Số ngày học tính thi đua',
      'Số ngày đã báo cáo',
      'Số ngày báo sớm',
      'Giờ báo TB',
      'Điểm thưởng báo sớm',
      'Tổng lượt có mặt',
      'Tổng lượt vắng',
      'Tỷ lệ duy trì sĩ số (%)',
      'Tổng điểm thi đua',
      'Xếp loại thi đua',
    ]);

    // Data rows
    summary.rankings.forEach((r) => {
      wsData.push([
        r.schoolRank,
        `Hạng ${r.campusRank}/${r.totalClassesInCampus || ''}`,
        r.classItem.class_name,
        `Khối ${r.classItem.grade}`,
        r.campusName || 'Khu chính',
        r.teacher?.full_name || 'Chưa phân công',
        r.enrollment,
        r.validSchoolDays,
        r.reportedDays,
        r.earlyReportDays || 0,
        r.averageReportTime || '--:--',
        r.earlyBonusPoints ? `+${r.earlyBonusPoints.toFixed(1)}đ` : '0đ',
        r.totalPresentAttendances,
        r.totalAbsentAttendances,
        `${r.attendanceRate.toFixed(2).replace('.', ',')}%`,
        `${(r.totalScore ?? r.attendanceRate).toFixed(2).replace('.', ',')}đ`,
        r.classificationLabel,
      ]);
    });

    wsData.push([]);
    wsData.push([
      'Tổng kết toàn trường:',
      '',
      '',
      '',
      '',
      '',
      summary.totalStudents,
      summary.totalValidDays,
      '',
      '',
      '',
      '',
      summary.totalPresent,
      summary.totalAbsent,
      `${summary.schoolAttendanceRate.toFixed(2).replace('.', ',')}%`,
      '',
      '',
    ]);
    wsData.push([]);
    wsData.push([]);

    // Signatures
    const now = new Date();
    const dateStr = `..., ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', dateStr]);
    wsData.push([
      settings?.reporter_title || 'NGƯỜI LẬP BIỂU',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      settings?.principal_title || 'HIỆU TRƯỞNG',
    ]);
    wsData.push([]);
    wsData.push([]);
    wsData.push([
      settings?.reporter_name || '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      settings?.principal_name || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Toàn trường');

    // Individual campus sheets if available
    if (summary.campusSummaries && summary.campusSummaries.length > 0) {
      summary.campusSummaries.forEach((cs) => {
        const cData: any[][] = [];
        cData.push([settings?.sub_department_name || 'UBND HUYỆN ĐIỆN BIÊN ĐÔNG']);
        cData.push([settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG']);
        cData.push([]);
        cData.push([`BẢNG XẾP HẠNG THI ĐUA DUY TRÌ SĨ SỐ - ${cs.campusName.toUpperCase()}`]);
        cData.push([`${summary.periodLabel.toUpperCase()}`]);
        cData.push([
          `Thời gian: Từ ${summary.dateRange.start.split('-').reverse().join('/')} đến ${summary.dateRange.end.split('-').reverse().join('/')} (${summary.totalValidDays} ngày tính điểm)`,
        ]);
        cData.push([
          `Chỉ số phân hiệu: ${cs.totalClasses} lớp • ${cs.totalStudents} học sinh • Tỷ lệ duy trì trung bình: ${cs.attendanceRate.toFixed(2)}%`,
        ]);
        cData.push([]);

        cData.push([
          'Hạng phân hiệu',
          'Lớp học',
          'Khối',
          'Giáo viên chủ nhiệm',
          'Sĩ số',
          'Số ngày học',
          'Đã báo cáo',
          'Số ngày báo sớm',
          'Giờ báo TB',
          'Điểm thưởng báo sớm',
          'Lượt có mặt',
          'Lượt vắng',
          'Tỷ lệ duy trì (%)',
          'Tổng điểm thi đua',
          'Xếp loại',
          'Hạng toàn trường',
        ]);

        cs.rankings.forEach((r) => {
          cData.push([
            `Hạng ${r.campusRank}`,
            r.classItem.class_name,
            `Khối ${r.classItem.grade}`,
            r.teacher?.full_name || 'Chưa phân công',
            r.enrollment,
            r.validSchoolDays,
            r.reportedDays,
            r.earlyReportDays || 0,
            r.averageReportTime || '--:--',
            r.earlyBonusPoints ? `+${r.earlyBonusPoints.toFixed(1)}đ` : '0đ',
            r.totalPresentAttendances,
            r.totalAbsentAttendances,
            `${r.attendanceRate.toFixed(2).replace('.', ',')}%`,
            `${(r.totalScore ?? r.attendanceRate).toFixed(2).replace('.', ',')}đ`,
            r.classificationLabel,
            `#${r.schoolRank}/${r.totalClassesInSchool}`,
          ]);
        });

        cData.push([]);
        cData.push([
          'Tổng kết phân hiệu:',
          `${cs.totalClasses} lớp`,
          '',
          '',
          cs.totalStudents,
          summary.totalValidDays,
          '',
          '',
          '',
          '',
          cs.totalPresent,
          cs.totalAbsent,
          `${cs.attendanceRate.toFixed(2).replace('.', ',')}%`,
          '',
          '',
          '',
        ]);

        const cWs = XLSX.utils.aoa_to_sheet(cData);
        // Excel worksheet names must be <= 31 chars and no invalid chars
        const safeName = cs.campusName.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 30);
        XLSX.utils.book_append_sheet(wb, cWs, safeName || `PH_${cs.campusId}`);
      });
    }

    const cleanName = (settings?.short_name || 'THCS_Xa_Dung').replace(/\s+/g, '_');
    const filename = `Tong_Ket_Thi_Dua_Si_So_${cleanName}_${summary.periodType}_${periodConfig.startDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* 1. Header & Controls */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-600 font-extrabold text-xs uppercase tracking-wider mb-1">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>BẢNG VÀNG THI ĐUA & DUY TRÌ SĨ SỐ</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Tổng Kết Lớp Duy Trì Sĩ Số Tốt
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Tự động tổng hợp kết quả chuyên cần theo Tuần, Tháng, Năm —{' '}
              <span className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2">
                Không xếp loại những ngày học sinh được nghỉ
              </span>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'TABLE' ? 'CHART' : 'TABLE')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95 ${
                viewMode === 'CHART' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{viewMode === 'TABLE' ? 'Xem Biểu đồ' : 'Xem Bảng'}</span>
            </button>

            <button
              onClick={() => setShowOffDaysModal(true)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <span>Quản lý ngày nghỉ</span>
              {offDaysList.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px]">
                  {offDaysList.length}
                </span>
              )}
            </button>

            <button
              onClick={handleExportExcel}
              disabled={loading || !summary}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất Excel</span>
              <span className="sm:hidden">Excel</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-2xs no-print cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">In bảng</span>
            </button>
          </div>
        </div>

        {/* 2. Period Navigation Bar (Tuần / Tháng / Năm) */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Period selector tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setPeriodType('WEEK')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                periodType === 'WEEK'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hàng Tuần
            </button>
            <button
              onClick={() => setPeriodType('MONTH')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                periodType === 'MONTH'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hàng Tháng
            </button>
            <button
              onClick={() => setPeriodType('YEAR')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                periodType === 'YEAR'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hàng Năm (Học Kỳ)
            </button>
          </div>

          {/* Period time controller */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            {periodType === 'WEEK' && (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Week selector dropdown (Tuần 1 -> Tuần 37) */}
                <select
                  value={selectedWeekNumber}
                  onChange={(e) => setSelectedWeekNumber(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-xl border border-blue-300 bg-blue-50/90 text-blue-950 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  {schoolYearWeeks.map((w) => (
                    <option key={w.weekNumber} value={w.weekNumber}>
                      {w.label} {w.isCurrent ? '★ (Hiện tại)' : ''}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevWeek}
                    disabled={selectedWeekNumber <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Tuần trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCurrentWeek}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                      selectedWeekNumber === currentWeekInfo.weekNumber
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                    title="Nhảy đến tuần học hiện tại"
                  >
                    Tuần này (T{currentWeekInfo.weekNumber})
                  </button>
                  <button
                    onClick={handleNextWeek}
                    disabled={selectedWeekNumber >= 37}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Tuần sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Week ranking configuration quick button */}
                <button
                  type="button"
                  onClick={() => setShowWeekConfigModal(true)}
                  className="px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                  title="Cấu hình ngày bắt đầu Tuần 1, số ngày học/tuần và tiêu chí xếp loại thi đua"
                >
                  <Settings2 className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden sm:inline">Cấu hình thi đua tuần</span>
                </button>
              </div>
            )}

            {periodType === 'MONTH' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                  title="Tháng trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                  title="Tháng sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {periodType === 'YEAR' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="FULL_YEAR">Cả năm học ({activeYear?.name || '2026-2027'})</option>
                  <option value="SEMESTER_1">Học kỳ I</option>
                  <option value="SEMESTER_2">Học kỳ II</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 3. Filter Bar (Khối, Điểm trường, Cấu hình ngày nghỉ) */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Campus selector if enabled */}
            {settings?.enable_campuses && campuses.length > 0 && (
              <CampusSelector
                selectedCampusId={selectedCampusId}
                onChange={(id) => setSelectedCampusId(id)}
              />
            )}

            {/* Grade selector */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500 font-semibold">Khối:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                {(['ALL', 6, 7, 8, 9] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    className={`px-2 py-0.5 rounded-md font-bold text-[11px] cursor-pointer transition-all ${
                      selectedGrade === g
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g === 'ALL' ? 'Tất cả' : `K${g}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Excluded day toggles */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] font-medium text-slate-600">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeSundays}
                onChange={(e) => setExcludeSundays(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Trừ ngày Chủ nhật</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeSaturdays}
                onChange={(e) => setExcludeSaturdays(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Trừ ngày Thứ bảy</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeEmptySchoolDays}
                onChange={(e) => setExcludeEmptySchoolDays(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span title="Nếu cả trường không lớp nào học (ngày nghỉ toàn trường/nghỉ lễ không báo cáo), tự động bỏ qua">
                Tự động trừ ngày cả trường nghỉ
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* 4. Highlight Banner: Quy tắc loại trừ ngày nghỉ */}
      {summary && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 border border-blue-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-xs sm:text-sm text-blue-900">
                    Quy chuẩn xếp loại: {summary.periodLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-200/80 text-blue-900">
                    {summary.totalValidDays} ngày tính điểm
                  </span>
                  {periodType === 'WEEK' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                      Thứ 2 đến hết sáng Thứ 6
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-700/90 mt-0.5">
                  {periodType === 'WEEK' ? (
                    <span>
                      Tuần học bắt đầu từ <strong>Thứ Hai</strong> đến hết sáng <strong>Thứ Sáu</strong> (5 ngày học/tuần). Đã loại trừ{' '}
                      <strong className="text-red-600">{summary.totalExcludedDays} ngày nghỉ</strong> (Thứ Bảy, Chủ Nhật và các ngày nghỉ học sinh).
                    </span>
                  ) : (
                    <span>
                      Đã tự động loại trừ{' '}
                      <strong className="text-red-600">{summary.totalExcludedDays} ngày học sinh được nghỉ</strong>{' '}
                      (Chủ nhật, ngày nghỉ lễ/đột xuất, ngày không có lịch học).
                    </span>
                  )}
                </p>
                {/* Ranking Criteria indicator */}
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-600 flex-wrap">
                  <span className="font-bold text-slate-500">Tiêu chí xếp loại tuần:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Xuất sắc: ≥{settings?.ranking_threshold_excellent ?? 98}%
                  </span>
                  <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    Tốt: ≥{settings?.ranking_threshold_good ?? 95}%
                  </span>
                  <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    Khá: ≥{settings?.ranking_threshold_fair ?? 90}%
                  </span>
                  <span className="font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Cần cố gắng: &lt;{settings?.ranking_threshold_fair ?? 90}%
                  </span>
                  {(settings?.enable_early_report_bonus ?? true) && (
                    <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 shadow-2xs">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Thưởng báo sớm trước {settings?.early_report_deadline || '07:30'}: +{settings?.early_report_bonus_points ?? 0.5}đ/ngày (tối đa +{settings?.early_report_max_bonus ?? 2.5}đ/tuần)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {summary.excludedOffDays.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-center">
                <span className="text-[11px] font-bold text-slate-500">Ngày nghỉ:</span>
                {summary.excludedOffDays.slice(0, 3).map((off, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-semibold text-slate-700 shadow-2xs"
                    title={`${off.date}: ${off.name}`}
                  >
                    {off.date.split('-').reverse().slice(0, 2).join('/')} ({off.name})
                  </span>
                ))}
                {summary.excludedOffDays.length > 3 && (
                  <span
                    onClick={() => setShowOffDaysModal(true)}
                    className="px-2 py-0.5 rounded-md bg-blue-100 text-[10px] font-bold text-blue-800 cursor-pointer hover:bg-blue-200"
                  >
                    +{summary.excludedOffDays.length - 3} ngày khác
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4.5. GVCN PERSONAL SYNCHRONIZED EMULATION CARD */}
      {isGVCN && myClassRank && (
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-indigo-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-emerald-500/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-slate-950" /> KẾT QUẢ THI ĐUA ĐỒNG BỘ TÀI KHOẢN GVCN
                </span>
                <span className="text-xs font-bold text-emerald-200">
                  {summary?.periodLabel}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Lớp {myClassRank.classItem.class_name}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/20 text-white">
                  {myClassRank.campusName}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/20 text-white">
                  Khối {myClassRank.classItem.grade}
                </span>
              </h3>
              <p className="text-xs text-emerald-100 max-w-xl">
                GVCN: <strong className="text-white">{myClassRank.teacher?.full_name || currentUser?.full_name}</strong> • Sĩ số: <strong className="text-white">{myClassRank.enrollment} học sinh</strong> • Tính trên {myClassRank.validSchoolDays} ngày học thực tế (đã loại trừ toàn bộ ngày nghỉ).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 flex-shrink-0">
              {/* Hạng Phân hiệu */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-white/20 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Hạng Phân hiệu
                </div>
                <div className="text-lg sm:text-2xl font-black text-amber-300 mt-0.5 flex items-center justify-center gap-1">
                  <span>
                    {myClassRank.campusRank === 1 ? '🥇' : myClassRank.campusRank === 2 ? '🥈' : myClassRank.campusRank === 3 ? '🥉' : '#'}
                  </span>
                  <span>{myClassRank.campusRank}</span>
                  <span className="text-xs font-medium text-emerald-200">/{myClassRank.totalClassesInCampus}</span>
                </div>
                <div className="text-[10px] text-emerald-100 truncate mt-0.5">
                  {myClassRank.campusName}
                </div>
              </div>

              {/* Hạng Toàn trường */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-white/20 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200">
                  Hạng Toàn trường
                </div>
                <div className="text-lg sm:text-2xl font-black text-white mt-0.5 flex items-center justify-center gap-1">
                  <span>#{myClassRank.schoolRank}</span>
                  <span className="text-xs font-medium text-emerald-200">/{myClassRank.totalClassesInSchool}</span>
                </div>
                <div className="text-[10px] text-emerald-100 truncate mt-0.5">
                  Tất cả các khối
                </div>
              </div>

              {/* Tổng điểm thi đua */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-amber-400/40 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Điểm Thi Đua
                </div>
                <div className="text-lg sm:text-2xl font-black text-amber-300 mt-0.5">
                  {(myClassRank.totalScore ?? myClassRank.attendanceRate).toFixed(2)}đ
                </div>
                <div className="text-[10px] font-extrabold text-emerald-200 truncate mt-0.5">
                  {myClassRank.classificationLabel}
                </div>
              </div>

              {/* Báo cáo sớm */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-white/20 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                  Báo Sớm
                </div>
                <div className="text-lg sm:text-2xl font-black text-white mt-0.5 flex items-center justify-center gap-1">
                  <span>{myClassRank.earlyReportDays}/{myClassRank.validSchoolDays}</span>
                  {myClassRank.earlyBonusPoints > 0 && (
                    <span className="text-xs font-black text-amber-300">(+{myClassRank.earlyBonusPoints.toFixed(1)}đ)</span>
                  )}
                </div>
                <div className="text-[10px] text-emerald-100 truncate mt-0.5">
                  Giờ TB: {myClassRank.averageReportTime || '--:--'}
                </div>
              </div>

              {/* Lượt có mặt/vắng */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-white/20 text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  Có mặt / Vắng
                </div>
                <div className="text-sm sm:text-base font-black text-white mt-1">
                  <span className="text-emerald-300">{myClassRank.totalPresentAttendances}</span> / <span className="text-red-300">{myClassRank.totalAbsentAttendances}</span>
                </div>
                <div className="text-[10px] text-slate-300 truncate mt-0.5">
                  Chuyên cần: {myClassRank.attendanceRate.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4.6. VIEW MODE SWITCHER: BẢNG TỔNG SẮP TOÀN TRƯỜNG VS XẾP HẠNG THEO PHÂN HIỆU */}
      {settings?.enable_campuses && campuses.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setRankingMode('ALL_SCHOOL')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                rankingMode === 'ALL_SCHOOL'
                  ? 'bg-white text-blue-700 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-blue-600" />
              <span>Bảng Tổng Sắp Toàn Trường</span>
            </button>

            <button
              type="button"
              onClick={() => setRankingMode('BY_CAMPUS')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                rankingMode === 'BY_CAMPUS'
                  ? 'bg-white text-indigo-700 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Xếp Hạng Thi Đua Theo Phân Hiệu ({summary?.campusSummaries?.length || campuses.length} Điểm trường)</span>
            </button>
          </div>

          {rankingMode === 'BY_CAMPUS' && summary?.campusSummaries && summary.campusSummaries.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveCampusTab('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                  activeCampusTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất cả phân hiệu
              </button>
              {summary.campusSummaries.map((cs) => (
                <button
                  key={cs.campusId}
                  type="button"
                  onClick={() => setActiveCampusTab(cs.campusId)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                    activeCampusTab === cs.campusId
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cs.campusName} ({cs.rankings.length} lớp)
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. TOP PERFORMERS - BẢNG VÀNG TUYÊN DƯƠNG TOP LỚP DUY TRÌ SĨ SỐ (CHẾ ĐỘ TOÀN TRƯỜNG) */}
      {rankingMode === 'ALL_SCHOOL' && summary && summary.topPerformers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Bảng Vàng Tuyên Dương - Top Lớp Chuyên Cần Nhất Toàn Trường
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {summary.topPerformers.map((item, index) => {
              const isFirst = index === 0;
              const isSecond = index === 1;
              const isThird = index === 2;

              const titleBadge = isFirst
                ? 'bg-amber-500 text-white'
                : isSecond
                ? 'bg-slate-600 text-white'
                : 'bg-amber-700 text-white';

              const titleText = isFirst ? '🥇 DẪN ĐẦU THI ĐUA' : isSecond ? '🥈 HẠNG NHÌ' : '🥉 HẠNG BA';

              return (
                <div
                  key={item.classItem.id}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 relative overflow-hidden transition-all hover:shadow-md ${
                    isFirst ? 'border-amber-300 shadow-xs' : 'border-slate-200'
                  }`}
                >
                  {/* Decorative background circle */}
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-amber-50/50 pointer-events-none" />

                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${titleBadge}`}>
                      {titleText}
                    </span>
                    <div className="text-right">
                      <div className="text-2xl sm:text-3xl font-black text-amber-600 leading-none">
                        {(item.totalScore ?? item.attendanceRate).toFixed(2)}đ
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                        Điểm thi đua
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 relative z-10">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <span>Lớp {item.classItem.class_name}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        Khối {item.classItem.grade}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      GVCN: <span className="font-bold text-slate-700">{item.teacher?.full_name || 'Chưa cập nhật'}</span>
                    </p>
                    {item.campusName && item.campusName !== 'Khu chính' && (
                      <p className="text-[11px] text-blue-600 font-semibold mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {item.campusName} (Hạng {item.campusRank}/{item.totalClassesInCampus})
                      </p>
                    )}
                  </div>

                  {/* Early report info pill */}
                  <div className="mt-2.5 flex items-center justify-between text-[11px] bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1 relative z-10">
                    <span className="text-slate-600 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Báo sớm: <strong>{item.earlyReportDays}/{item.validSchoolDays} ngày</strong> (TB: {item.averageReportTime || '--:--'})
                    </span>
                    {item.earlyBonusPoints > 0 ? (
                      <span className="font-black text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px]">
                        +{item.earlyBonusPoints.toFixed(1)}đ thưởng
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">0đ thưởng</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5 space-y-1 relative z-10">
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(item.attendanceRate, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                      <span>
                        Duy trì sĩ số: <strong className="text-slate-800">{item.attendanceRate.toFixed(1)}%</strong>
                      </span>
                      <span>
                        Vắng: <strong className="text-red-600">{item.totalAbsentAttendances}</strong> lượt
                      </span>
                    </div>
                  </div>

                  {/* Bottom honor badge */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs relative z-10">
                    <span className="text-slate-500">Xếp loại:</span>
                    <span className="font-extrabold text-emerald-700 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      {item.classificationLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6A. CAMPUS RANKINGS VIEW (KHI CHỌN CHẾ ĐỘ XẾP HẠNG THEO PHÂN HIỆU) */}
      {rankingMode === 'BY_CAMPUS' && summary && (
        <div className="space-y-6">
          {(!summary.campusSummaries || summary.campusSummaries.length === 0) ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-slate-200">
              Chưa có dữ liệu phân hiệu hoặc chưa kích hoạt tính năng nhiều điểm trường trong Cấu hình.
            </div>
          ) : (
            summary.campusSummaries
              .filter((cs) => activeCampusTab === 'all' || cs.campusId === activeCampusTab)
              .map((campusSummary) => {
                const top1 = campusSummary.rankings[0];
                const top2 = campusSummary.rankings[1];
                const top3 = campusSummary.rankings[2];

                return (
                  <div
                    key={campusSummary.campusId}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                  >
                    {/* Campus Header */}
                    <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-50 via-slate-50 to-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-black text-slate-900">
                              {campusSummary.campusName}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                              {campusSummary.totalClasses} lớp học
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
                              {campusSummary.totalStudents} học sinh
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Tính thi đua trên {summary.totalValidDays} ngày học thực tế (đã trừ ngày nghỉ theo phân hiệu)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 shadow-2xs text-xs font-bold text-slate-700">
                          Tỷ lệ duy trì sĩ số phân hiệu:{' '}
                          <span className="text-indigo-700 font-extrabold text-sm">
                            {campusSummary.attendanceRate.toFixed(2)}%
                          </span>
                        </div>
                        <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs font-medium text-slate-600">
                          Đi học: <strong className="text-emerald-700">{campusSummary.totalPresent}</strong> • Vắng: <strong className="text-red-600">{campusSummary.totalAbsent}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Mini Podium for this Campus */}
                    {campusSummary.rankings.length > 0 && (
                      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/40">
                        <div className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                          <Trophy className="w-4 h-4 text-amber-500" />
                          <span>Dẫn Đầu Thi Đua Tại {campusSummary.campusName}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {top1 && (
                            <div className="bg-white rounded-xl border-2 border-amber-300 p-3.5 shadow-xs relative">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-amber-950 uppercase">
                                🥇 Hạng Nhất Phân Hiệu
                              </span>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="font-black text-base text-slate-900">
                                  Lớp {top1.classItem.class_name}
                                </div>
                                <div className="text-right">
                                  <div className="text-base font-black text-amber-600 leading-none">
                                    {(top1.totalScore ?? top1.attendanceRate).toFixed(2)}đ
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                    {top1.attendanceRate.toFixed(1)}% {top1.earlyBonusPoints > 0 ? `(+${top1.earlyBonusPoints.toFixed(1)}đ)` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 truncate">
                                GVCN: <strong className="text-slate-700">{top1.teacher?.full_name || 'Chưa cập nhật'}</strong>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                                <span>Báo sớm: <strong className="text-emerald-700">{top1.earlyReportDays}/{top1.validSchoolDays}</strong></span>
                                <span className="font-semibold text-blue-600">#Hạng {top1.schoolRank} toàn trường</span>
                              </div>
                            </div>
                          )}

                          {top2 && (
                            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-200 text-slate-800 uppercase">
                                🥈 Hạng Nhì Phân Hiệu
                              </span>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="font-black text-base text-slate-900">
                                  Lớp {top2.classItem.class_name}
                                </div>
                                <div className="text-right">
                                  <div className="text-base font-black text-slate-700 leading-none">
                                    {(top2.totalScore ?? top2.attendanceRate).toFixed(2)}đ
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                    {top2.attendanceRate.toFixed(1)}% {top2.earlyBonusPoints > 0 ? `(+${top2.earlyBonusPoints.toFixed(1)}đ)` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 truncate">
                                GVCN: <strong className="text-slate-700">{top2.teacher?.full_name || 'Chưa cập nhật'}</strong>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                                <span>Báo sớm: <strong className="text-emerald-700">{top2.earlyReportDays}/{top2.validSchoolDays}</strong></span>
                                <span className="font-semibold text-blue-600">#Hạng {top2.schoolRank} toàn trường</span>
                              </div>
                            </div>
                          )}

                          {top3 && (
                            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-700 text-white uppercase">
                                🥉 Hạng Ba Phân Hiệu
                              </span>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="font-black text-base text-slate-900">
                                  Lớp {top3.classItem.class_name}
                                </div>
                                <div className="text-right">
                                  <div className="text-base font-black text-slate-700 leading-none">
                                    {(top3.totalScore ?? top3.attendanceRate).toFixed(2)}đ
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                    {top3.attendanceRate.toFixed(1)}% {top3.earlyBonusPoints > 0 ? `(+${top3.earlyBonusPoints.toFixed(1)}đ)` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 truncate">
                                GVCN: <strong className="text-slate-700">{top3.teacher?.full_name || 'Chưa cập nhật'}</strong>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                                <span>Báo sớm: <strong className="text-emerald-700">{top3.earlyReportDays}/{top3.validSchoolDays}</strong></span>
                                <span className="font-semibold text-blue-600">#Hạng {top3.schoolRank} toàn trường</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Table for this Campus */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/90 text-slate-700 uppercase font-black tracking-wider text-[10px] border-b border-slate-200">
                            <th className="py-3 px-3 text-center w-14">Hạng PH</th>
                            <th className="py-3 px-3">Lớp học</th>
                            <th className="py-3 px-3">Khối</th>
                            <th className="py-3 px-3">GVCN</th>
                            <th className="py-3 px-3 text-center">Sĩ số</th>
                            <th className="py-3 px-3 text-center" title="Số ngày học tính thi đua đã trừ ngày nghỉ">
                              Ngày tính
                            </th>
                            <th className="py-3 px-3 text-center">Đã báo</th>
                            <th className="py-3 px-3 text-center" title="Số ngày báo trước giờ quy định và giờ báo trung bình">
                              Báo sớm (Giờ TB)
                            </th>
                            <th className="py-3 px-3 text-center" title="Điểm cộng thi đua do báo sớm">
                              Thưởng báo sớm
                            </th>
                            <th className="py-3 px-3 text-center">Lượt có mặt</th>
                            <th className="py-3 px-3 text-center">Lượt vắng</th>
                            <th className="py-3 px-3 text-right">Duy trì (%)</th>
                            <th className="py-3 px-3 text-right min-w-[110px]" title="Tổng điểm = Tỷ lệ duy trì + Điểm thưởng báo sớm">
                              Tổng điểm thi đua
                            </th>
                            <th className="py-3 px-3 text-center">Xếp loại</th>
                            <th className="py-3 px-3 text-center" title="Thứ hạng so với toàn bộ các lớp của trường">
                              Toàn trường
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {campusSummary.rankings.map((item) => {
                            const isMyClass = Boolean(
                              currentUser?.assigned_class_id &&
                                item.classItem.id === currentUser.assigned_class_id
                            );
                            const isTop1 = item.campusRank === 1;
                            const isTop2 = item.campusRank === 2;
                            const isTop3 = item.campusRank === 3;

                            let rankBadge = (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                                {item.campusRank}
                              </span>
                            );

                            if (isTop1) {
                              rankBadge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-xs">
                                  1
                                </span>
                              );
                            } else if (isTop2) {
                              rankBadge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs">
                                  2
                                </span>
                              );
                            } else if (isTop3) {
                              rankBadge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs">
                                  3
                                </span>
                              );
                            }

                            let classColor = 'bg-slate-100 text-slate-600';
                            if (item.classification === 'EXCELLENT') {
                              classColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                            } else if (item.classification === 'GOOD') {
                              classColor = 'bg-blue-100 text-blue-800 border-blue-300';
                            } else if (item.classification === 'FAIR') {
                              classColor = 'bg-amber-100 text-amber-800 border-amber-300';
                            } else if (item.classification === 'NEEDS_IMPROVEMENT') {
                              classColor = 'bg-red-100 text-red-800 border-red-300';
                            }

                            return (
                              <tr
                                key={item.classItem.id}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  isMyClass
                                    ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600 font-semibold ring-1 ring-emerald-300'
                                    : isTop1
                                    ? 'bg-amber-50/30 font-semibold'
                                    : ''
                                }`}
                              >
                                <td className="py-3 px-3 text-center">{rankBadge}</td>
                                <td className="py-3 px-3">
                                  <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                                    <span>Lớp {item.classItem.class_name}</span>
                                    {isTop1 && <Trophy className="w-3.5 h-3.5 text-amber-500 inline" />}
                                    {isMyClass && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white uppercase tracking-wider">
                                        Lớp của Thầy/Cô
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold">
                                    Khối {item.classItem.grade}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-700">
                                  {item.teacher?.full_name || (
                                    <span className="text-slate-400 italic">Chưa cập nhật</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-slate-900">
                                  {item.enrollment}
                                </td>
                                <td className="py-3 px-3 text-center font-semibold text-blue-700">
                                  {item.validSchoolDays}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`font-semibold ${
                                      item.reportedDays < item.validSchoolDays
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}
                                  >
                                    {item.reportedDays}/{item.validSchoolDays}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <div className="font-bold text-slate-800">
                                    {item.earlyReportDays}/{item.validSchoolDays} ngày
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    TB: {item.averageReportTime || '--:--'}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {item.earlyBonusPoints > 0 ? (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                      +{item.earlyBonusPoints.toFixed(1)}đ
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">0đ</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-emerald-700">
                                  {item.totalPresentAttendances}
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-red-600">
                                  {item.totalAbsentAttendances}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-slate-700">
                                  {item.attendanceRate.toFixed(2)}%
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="font-black text-sm text-amber-700">
                                    {(item.totalScore ?? item.attendanceRate).toFixed(2)}đ
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {item.earlyBonusPoints > 0 ? `(${item.attendanceRate.toFixed(1)}% + ${item.earlyBonusPoints.toFixed(1)}đ)` : `${item.attendanceRate.toFixed(1)}%`}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider inline-block ${classColor}`}
                                  >
                                    {item.classificationLabel}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-xs">
                                    #{item.schoolRank}/{item.totalClassesInSchool}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* 6B. FULL SCHOOL RANKINGS TABLE (CHẾ ĐỘ TỔNG SẮP TOÀN TRƯỜNG) */}
      {rankingMode === 'ALL_SCHOOL' && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              Bảng Tổng Kết & Xếp Hạng Chi Tiết Toàn Trường
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Xếp hạng dựa trên tỷ lệ chuyên cần thực tế trong {summary?.totalValidDays || 0} ngày học (đã loại trừ toàn bộ ngày nghỉ)
            </p>
          </div>

          {summary && (
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs font-bold text-slate-700">
                Tỷ lệ toàn trường:{' '}
                <span className="text-blue-700 font-extrabold">
                  {summary.schoolAttendanceRate.toFixed(2)}%
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs font-bold text-slate-700">
                Tổng sĩ số:{' '}
                <span className="text-slate-900 font-extrabold">{summary.totalStudents} HS</span>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <Clock className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
            Đang tổng hợp số liệu thi đua sĩ số...
          </div>
        ) : !summary || summary.rankings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Chưa có dữ liệu báo cáo sĩ số trong khoảng thời gian đã chọn.
          </div>
        ) : viewMode === 'CHART' ? (
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200">
            <h2 className="text-lg font-black text-slate-900 mb-6">Biểu đồ xếp hạng thi đua (Top 10 lớp)</h2>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.rankings.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="classItem.class_name" />
                  <YAxis domain={[80, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="attendanceRate" name="Tỷ lệ duy trì (%)" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 uppercase font-black tracking-wider text-[10px] border-b border-slate-200">
                  <th className="py-3 px-3 text-center w-12">Hạng</th>
                  <th className="py-3 px-3">Lớp học</th>
                  <th className="py-3 px-3">Khối</th>
                  {settings?.enable_campuses && (
                    <th className="py-3 px-3">Hạng Phân hiệu</th>
                  )}
                  <th className="py-3 px-3">GVCN</th>
                  <th className="py-3 px-3 text-center">Sĩ số</th>
                  <th className="py-3 px-3 text-center" title="Số ngày học tính thi đua đã trừ ngày nghỉ">
                    Ngày tính
                  </th>
                  <th className="py-3 px-3 text-center" title="Số ngày lớp đã gửi báo cáo">
                    Đã báo
                  </th>
                  <th className="py-3 px-3 text-center" title="Số ngày báo trước giờ quy định và giờ báo trung bình">
                    Báo sớm (Giờ TB)
                  </th>
                  <th className="py-3 px-3 text-center" title="Điểm cộng thi đua do báo sớm">
                    Thưởng báo sớm
                  </th>
                  <th className="py-3 px-3 text-center">Lượt có mặt</th>
                  <th className="py-3 px-3 text-center">Lượt vắng</th>
                  <th className="py-3 px-3 text-right">Duy trì (%)</th>
                  <th className="py-3 px-3 text-right min-w-[110px]" title="Tổng điểm = Tỷ lệ duy trì + Điểm thưởng báo sớm">
                    Tổng điểm thi đua
                  </th>
                  <th className="py-3 px-3 text-center">Xếp loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {summary.rankings.map((item) => {
                  const isMyClass = Boolean(
                    currentUser?.assigned_class_id &&
                      item.classItem.id === currentUser.assigned_class_id
                  );
                  const isTop1 = item.rank === 1;
                  const isTop2 = item.rank === 2;
                  const isTop3 = item.rank === 3;

                  let rankBadge = (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                      {item.rank}
                    </span>
                  );

                  if (isTop1) {
                    rankBadge = (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-xs">
                        1
                      </span>
                    );
                  } else if (isTop2) {
                    rankBadge = (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs">
                        2
                      </span>
                    );
                  } else if (isTop3) {
                    rankBadge = (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs">
                        3
                      </span>
                    );
                  }

                  let classColor = 'bg-slate-100 text-slate-600';
                  if (item.classification === 'EXCELLENT') {
                    classColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  } else if (item.classification === 'GOOD') {
                    classColor = 'bg-blue-100 text-blue-800 border-blue-300';
                  } else if (item.classification === 'FAIR') {
                    classColor = 'bg-amber-100 text-amber-800 border-amber-300';
                  } else if (item.classification === 'NEEDS_IMPROVEMENT') {
                    classColor = 'bg-red-100 text-red-800 border-red-300';
                  }

                  return (
                    <tr
                      key={item.classItem.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isMyClass
                          ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600 font-semibold ring-1 ring-emerald-300'
                          : isTop1
                          ? 'bg-amber-50/30 font-semibold'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">{rankBadge}</td>
                      <td className="py-3 px-3">
                        <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{item.classItem.class_name}</span>
                          {isTop1 && <Trophy className="w-3.5 h-3.5 text-amber-500 inline" />}
                          {isMyClass && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white uppercase tracking-wider">
                              Lớp của Thầy/Cô
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold">
                          Khối {item.classItem.grade}
                        </span>
                      </td>
                      {settings?.enable_campuses && (
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-[11px]">
                              Hạng {item.campusRank}/{item.totalClassesInCampus || ''}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {item.campusName || 'Khu chính'}
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-3 text-slate-700">
                        {item.teacher?.full_name || (
                          <span className="text-slate-400 italic">Chưa cập nhật</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-900">
                        {item.enrollment}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-blue-700">
                        {item.validSchoolDays}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-semibold ${
                            item.reportedDays < item.validSchoolDays
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {item.reportedDays}/{item.validSchoolDays}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="font-bold text-slate-800">
                          {item.earlyReportDays}/{item.validSchoolDays} ngày
                        </div>
                        <div className="text-[10px] text-slate-400">
                          TB: {item.averageReportTime || '--:--'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {item.earlyBonusPoints > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                            +{item.earlyBonusPoints.toFixed(1)}đ
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0đ</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700">
                        {item.totalPresentAttendances}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-red-600">
                        {item.totalAbsentAttendances}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-700">
                        {item.attendanceRate.toFixed(2)}%
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="font-black text-sm text-amber-700">
                          {(item.totalScore ?? item.attendanceRate).toFixed(2)}đ
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.earlyBonusPoints > 0 ? `(${item.attendanceRate.toFixed(1)}% + ${item.earlyBonusPoints.toFixed(1)}đ)` : `${item.attendanceRate.toFixed(1)}%`}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider inline-block ${classColor}`}
                        >
                          {item.classificationLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* 7. MODAL QUẢN LÝ NGÀY NGHỈ HỌC SINH */}
      {showOffDaysModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150"
          onClick={() => setShowOffDaysModal(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  Quản Lý Ngày Nghỉ Của Học Sinh
                </h3>
              </div>
              <button
                onClick={() => setShowOffDaysModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  Nguyên tắc không xếp loại ngày nghỉ:
                </p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Các ngày được thêm vào danh sách này (Lễ, Tết, Nghỉ đột xuất phòng chống bão lũ, rét đậm...) cùng với các ngày Chủ nhật sẽ hoàn toàn được <strong>loại trừ khỏi mẫu số tính điểm thi đua</strong>. Học sinh và lớp sẽ không bị trừ điểm hay tính vắng trong các ngày này.
                </p>
              </div>

              {/* Form thêm ngày nghỉ mới */}
              <form onSubmit={handleAddOffDay} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  + Thêm ngày nghỉ mới
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ngày nghỉ:
                    </label>
                    <input
                      type="date"
                      required
                      value={newOffDate}
                      onChange={(e) => setNewOffDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Loại ngày nghỉ:
                    </label>
                    <select
                      value={newOffType}
                      onChange={(e) => setNewOffType(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="HOLIDAY">Ngày nghỉ lễ / Tết</option>
                      <option value="WEATHER">Nghỉ phòng chống bão / Rét đậm</option>
                      <option value="SPECIAL">Nghỉ sự kiện / Đại hội / Hoạt động ngành</option>
                      <option value="OTHER">Lý do khác</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tên / Lý do nghỉ:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nghỉ lễ Quốc khánh 2/9, Nghỉ rét đậm vùng cao..."
                    value={newOffName}
                    onChange={(e) => setNewOffName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm ngày nghỉ
                  </button>
                </div>
              </form>

              {/* Danh sách các ngày nghỉ hiện tại */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between items-center">
                  <span>Danh sách ngày nghỉ trong năm ({offDaysList.length})</span>
                </div>

                {offDaysList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Chưa có ngày nghỉ đặc biệt nào được lưu.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    {offDaysList
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day) => (
                        <div
                          key={day.id}
                          className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 font-mono">
                              {day.date.split('-').reverse().join('/')}
                            </span>
                            <span className="text-slate-700 font-medium">{day.name}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteOffDay(day.id)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Xóa ngày nghỉ này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowOffDaysModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL CẤU HÌNH XẾP LOẠI THI ĐUA THEO TUẦN */}
      {showWeekConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Cấu Hình Xếp Loại Thi Đua Tuần</h3>
                  <p className="text-xs text-amber-100">
                    Áp dụng cho từng phân hiệu và toàn trường
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWeekConfigModal(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWeekConfig} className="p-4 sm:p-6 space-y-4 text-xs">
              {configSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{configSuccessMsg}</span>
                </div>
              )}

              {/* Ngày bắt đầu Tuần 1 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  1. Ngày bắt đầu Tuần 1 (Thứ Hai)
                </label>
                <input
                  type="date"
                  value={configWeek1Start}
                  onChange={(e) => setConfigWeek1Start(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-slate-50"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Mặc định: <strong>07/09/2026</strong>. Hệ thống tự động tính ngày Thứ Hai đến hết sáng Thứ Sáu cho từng tuần (Tuần 1, Tuần 2,...).
                </p>
              </div>

              {/* Lịch học tuần */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  2. Thời gian một tuần học
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-slate-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Từ Thứ Hai đến hết sáng Thứ Sáu (5 ngày học tiêu chuẩn)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Thứ Bảy, Chủ Nhật và các ngày nghỉ lễ được tự động loại trừ khỏi điểm thi đua tuần.
                </p>
              </div>

              {/* Tiêu chí xếp loại tuần */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  3. Tiêu chí xếp loại chuyên cần tuần (%)
                </label>
                <div className="space-y-2">
                  <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <span className="font-extrabold text-emerald-800 flex items-center gap-1.5">
                      🏆 Loại Xuất sắc:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-500">≥</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={configThresholdExcellent}
                        onChange={(e) => setConfigThresholdExcellent(parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-xs font-black text-center border border-emerald-300 rounded-lg bg-white"
                      />
                      <span className="font-bold text-slate-600">%</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                    <span className="font-extrabold text-blue-800 flex items-center gap-1.5">
                      🥇 Loại Tốt:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-500">≥</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={configThresholdGood}
                        onChange={(e) => setConfigThresholdGood(parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-xs font-black text-center border border-blue-300 rounded-lg bg-white"
                      />
                      <span className="font-bold text-slate-600">%</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between">
                    <span className="font-extrabold text-amber-800 flex items-center gap-1.5">
                      🥈 Loại Khá:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-500">≥</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={configThresholdFair}
                        onChange={(e) => setConfigThresholdFair(parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-xs font-black text-center border border-amber-300 rounded-lg bg-white"
                      />
                      <span className="font-bold text-slate-600">%</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-slate-600">
                    <span className="font-bold">⚠️ Loại Cần cố gắng:</span>
                    <span className="font-bold text-slate-500">Dưới {configThresholdFair}%</span>
                  </div>
                </div>
              </div>

              {/* 4. Cấu hình điểm cộng báo cáo sớm */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    4. Cộng điểm thi đua khi báo cáo sớm
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configEnableEarlyBonus}
                      onChange={(e) => setConfigEnableEarlyBonus(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">Kích hoạt</span>
                  </label>
                </div>

                {configEnableEarlyBonus && (
                  <div className="space-y-2.5 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Hạn chót tính sớm
                        </label>
                        <input
                          type="time"
                          value={configEarlyDeadline}
                          onChange={(e) => setConfigEarlyDeadline(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white"
                        />
                        <p className="text-[10px] text-slate-500 mt-0.5">Báo trước giờ này</p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Điểm cộng mỗi ngày
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            value={configEarlyBonusPoints}
                            onChange={(e) => setConfigEarlyBonusPoints(parseFloat(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white"
                          />
                          <span className="text-xs font-bold text-amber-900">đ/ngày</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Mặc định: +0.5đ/ngày</p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Điểm cộng tối đa
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            value={configEarlyMaxBonus}
                            onChange={(e) => setConfigEarlyMaxBonus(parseFloat(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-xs font-black border border-amber-300 rounded-lg bg-white"
                          />
                          <span className="text-xs font-bold text-amber-900">đ/tuần</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Tối đa 5 ngày/tuần</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-amber-900 font-medium">
                      💡 <em>Ví dụ: Lớp gửi báo cáo chuyên cần trước {configEarlyDeadline} sẽ được cộng +{configEarlyBonusPoints} điểm thi đua/ngày vào tổng điểm xếp hạng.</em>
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfigWeek1Start('2026-09-07');
                    setConfigThresholdExcellent(98);
                    setConfigThresholdGood(95);
                    setConfigThresholdFair(90);
                    setConfigEnableEarlyBonus(true);
                    setConfigEarlyDeadline('07:30');
                    setConfigEarlyBonusPoints(0.5);
                    setConfigEarlyMaxBonus(2.5);
                  }}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Khôi phục mặc định
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWeekConfigModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Lưu Cấu Hình</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
