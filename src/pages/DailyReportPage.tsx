import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { ClassReportRow, ClassItem, Profile } from '../types';
import { DateNavigator } from '../components/DateNavigator';
import { CampusSelector } from '../components/CampusSelector';
import {
  exportAttendanceDailyExcel,
  exportAttendanceMonthlyClassExcel,
  exportAttendanceMonthlyAllClassesExcel,
  ClassDailyRowData,
  MonthlyDayRowData,
  resolveTeacherName,
} from '../utils/exportAttendanceStandardExcel';
import {
  Printer,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  RotateCcw,
  AlertCircle,
  X,
  CheckCircle,
  RefreshCw,
  CloudUpload,
  BellRing,
  Filter,
  CalendarDays,
  Sparkles,
} from 'lucide-react';

interface DailyReportPageProps {
  onNavigate?: (path: string) => void;
}

export const DailyReportPage: React.FC<DailyReportPageProps> = ({ onNavigate }) => {
  const { settings, indicators, campuses, classes, students } = useSchool();
  const { isGVCN, currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isBGH = currentUser?.role === 'BGH';

  // Chế độ báo cáo: 'daily' = Báo cáo theo ngày | 'monthly_class' = Báo cáo theo tháng của từng lớp
  const [reportMode, setReportMode] = useState<'daily' | 'monthly_class'>('daily');

  // Bộ lọc Lớp khi xem theo ngày ('all' hoặc class_id cụ thể)
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');

  // Ngày được chọn (chế độ theo ngày)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Tháng được chọn (chế độ theo tháng)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Lớp được chọn khi xem theo tháng
  const [monthlyClassId, setMonthlyClassId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    return '';
  });

  // Tùy chọn lọc: chỉ hiện các ngày đã có báo cáo trong tháng
  const [onlyReportedDays, setOnlyReportedDays] = useState(false);

  // Phân hiệu được chọn
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });

  // Dữ liệu báo cáo ngày
  const [reportData, setReportData] = useState<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
  } | null>(null);

  // Dữ liệu báo cáo tháng của lớp
  const [monthlyData, setMonthlyData] = useState<{
    classItem: ClassItem | null;
    teacher: Profile | null;
    rows: MonthlyDayRowData[];
    summary: {
      totalDaysReported: number;
      sumTotalAll: number;
      sumAbsentAll: number;
      sumPresentAll: number;
      sumTotalBoarding: number;
      sumAbsentBoarding: number;
      sumBaoAnBoarding: number;
      sumTotalNgoaiTru: number;
      sumAbsentNgoaiTru: number;
      avgAbsentRate: number;
      avgPresentRate: number;
    };
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Reset Manager State
  const [showResetManager, setShowResetManager] = useState(false);
  const [managerDate, setManagerDate] = useState(selectedDate);
  const [managerData, setManagerData] = useState<{
    rows: ClassReportRow[];
    reportedClasses: number;
    totalClasses: number;
  } | null>(null);
  const [managerLoading, setManagerLoading] = useState(false);

  const [confirmResetModal, setConfirmResetModal] = useState<{
    classId: string;
    className: string;
    date: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const { sendBGHManualReminder } = useNotifications();
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  // Danh sách các lớp theo phân hiệu được chọn
  const displayClasses = useMemo(() => {
    let list = classes.filter((c) => c.active);
    if (selectedCampusId !== 'all') {
      list = list.filter((c) => c.campus_id === selectedCampusId);
    }
    return list;
  }, [classes, selectedCampusId]);

  // Cập nhật monthlyClassId mặc định nếu chưa chọn hoặc không nằm trong danh sách phân hiệu hiện tại
  useEffect(() => {
    if (displayClasses.length > 0) {
      if (!monthlyClassId) {
        if (isGVCN && currentUser?.assigned_class_id) {
          const found = displayClasses.find((c) => c.id === currentUser.assigned_class_id);
          if (found) {
            setMonthlyClassId(found.id);
            return;
          }
        }
        setMonthlyClassId(displayClasses[0].id);
      } else {
        const stillInList = displayClasses.some((c) => c.id === monthlyClassId);
        if (!stillInList) {
          setMonthlyClassId(displayClasses[0].id);
        }
      }
    }
  }, [displayClasses, monthlyClassId, isGVCN, currentUser]);

  const loadReportData = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(selectedDate, selectedCampusId);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      if (showIndicator) setLoading(false);
    }
  }, [selectedDate, selectedCampusId]);

  const loadMonthlyData = useCallback(async (showIndicator = true) => {
    if (!monthlyClassId) return;
    if (showIndicator) setLoadingMonthly(true);
    try {
      const data = await StorageService.getClassMonthlyAttendance(monthlyClassId, selectedMonth);
      setMonthlyData(data as any);
    } catch (err) {
      console.error('Failed to load monthly data:', err);
    } finally {
      if (showIndicator) setLoadingMonthly(false);
    }
  }, [monthlyClassId, selectedMonth]);

  useEffect(() => {
    if (reportMode === 'daily') {
      loadReportData(true);
    } else {
      loadMonthlyData(true);
    }

    let debounceTimer: any = null;
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'daily_reports' || event.table === 'daily_report_values') {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (reportMode === 'daily') {
            loadReportData(false);
          } else {
            loadMonthlyData(false);
          }
        }, 350);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [reportMode, loadReportData, loadMonthlyData]);

  const loadManagerData = async (dateStr: string) => {
    setManagerLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(dateStr, selectedCampusId);
      setManagerData(data);
    } catch (err) {
      console.error('Failed to load manager data:', err);
    } finally {
      setManagerLoading(false);
    }
  };

  useEffect(() => {
    if (showResetManager) {
      loadManagerData(managerDate);
    }
  }, [showResetManager, managerDate, selectedCampusId]);

  const handlePromptReset = (classId: string, className: string, dateStr: string = selectedDate) => {
    setConfirmResetModal({ classId, className, date: dateStr });
  };

  const handleConfirmReset = async () => {
    if (!confirmResetModal || !currentUser) return;
    setIsResetting(true);
    try {
      const ok = await StorageService.deleteDailyReport(confirmResetModal.classId, confirmResetModal.date, currentUser);
      if (ok) {
        setToastMessage(`Đã reset báo cáo lớp ${confirmResetModal.className} ngày ${confirmResetModal.date.split('-').reverse().join('/')} về trạng thái Chưa báo cáo thành công!`);
        setTimeout(() => setToastMessage(''), 5000);
        setConfirmResetModal(null);
        if (reportMode === 'daily') {
          await loadReportData();
        } else {
          await loadMonthlyData();
        }
        if (showResetManager) {
          await loadManagerData(managerDate);
        }
      }
    } catch (err) {
      console.error('Reset report error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const handleSyncSupabase = async () => {
    setSyncingSupabase(true);
    try {
      const res = await StorageService.syncAllToSupabase();
      if (res.success) {
        setToastMessage('Đã đồng bộ thành công toàn bộ dữ liệu báo cáo lên Supabase!');
        if (reportMode === 'daily') {
          await loadReportData(false);
        } else {
          await loadMonthlyData(false);
        }
      } else {
        setToastMessage(res.message || 'Lỗi khi đồng bộ. Vui lòng kiểm tra cấu hình Supabase.');
      }
    } catch (err: any) {
      console.error('Lỗi khi đồng bộ lên Supabase:', err);
      setToastMessage('Lỗi đồng bộ Supabase: ' + (err?.message || err));
    } finally {
      setSyncingSupabase(false);
      setTimeout(() => setToastMessage(''), 4500);
    }
  };

  // Parse date into day, month, year for official Vietnamese report header
  const dateParts = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-');
      return { day: d, month: m, year: y };
    } catch {
      const d = new Date();
      return { day: String(d.getDate()).padStart(2, '0'), month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()) };
    }
  }, [selectedDate]);

  const monthParts = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-');
      return { month: m, year: y };
    } catch {
      const d = new Date();
      return { month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()) };
    }
  }, [selectedMonth]);

  const formattedSchoolName = useMemo(() => {
    let name = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
    if (!name.toUpperCase().startsWith('TRƯỜNG')) {
      name = 'TRƯỜNG ' + name;
    }
    return name.toUpperCase();
  }, [settings?.school_name]);

  // Tiêu đề mẫu: mặc định hiển thị "BÁO CÁO SĨ SỐ HỌC SINH NGÀY .......THÁNG ...... NĂM 2026"
  const [blankDateInTitle, setBlankDateInTitle] = useState(true);

  const baseTitle = useMemo(() => {
    let raw = settings?.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH';
    raw = raw.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
    return raw;
  }, [settings?.report_title]);

  // Lớp đang chọn khi xem theo ngày
  const selectedDailyClassObj = useMemo(() => {
    if (selectedClassFilter === 'all') return null;
    return classes.find((c) => c.id === selectedClassFilter) || null;
  }, [selectedClassFilter, classes]);

  // Lớp đang chọn khi xem theo tháng
  const currentMonthlyClassObj = useMemo(() => {
    return classes.find((c) => c.id === monthlyClassId) || null;
  }, [monthlyClassId, classes]);

  // Helper to resolve the real count of students for a class from roster or latest reports
  const getClassStudentCount = useCallback((classId: string) => {
    const rosterCount = students.filter((s) => s.class_id === classId).length;
    if (rosterCount > 0) return rosterCount;

    // Fallback to the latest report values from localStorage if available
    try {
      const rawReports = localStorage.getItem('sso_daily_reports_v1');
      const rawValues = localStorage.getItem('sso_daily_report_values_v1');
      if (rawReports && rawValues) {
        const reps = JSON.parse(rawReports);
        const vals = JSON.parse(rawValues);
        if (Array.isArray(reps) && Array.isArray(vals)) {
          const classReps = reps.filter(
            (r: any) => r.class_id === classId && (r.status === 'SUBMITTED' || r.status === 'LOCKED')
          );
          if (classReps.length > 0) {
            // Sort by report_date descending to get the newest
            classReps.sort((a: any, b: any) => b.report_date.localeCompare(a.report_date));
            const latestRep = classReps[0];
            const allVal = vals.find(
              (v: any) => v.report_id === latestRep.id && (v.indicator_group_id === 'ig_all' || v.indicator_group_id === 'all')
            );
            if (allVal && typeof allVal.total_count === 'number' && allVal.total_count > 0) {
              return allVal.total_count;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error reading latest student count:', e);
    }
    return 0;
  }, [students]);

  const displayTitle = useMemo(() => {
    if (reportMode === 'monthly_class') {
      return `${baseTitle} THÁNG ${monthParts.month} NĂM ${monthParts.year}${
        currentMonthlyClassObj ? ` - LỚP ${currentMonthlyClassObj.class_name}` : ''
      }`;
    }

    if (blankDateInTitle) {
      return `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}${
        selectedDailyClassObj ? ` - LỚP ${selectedDailyClassObj.class_name}` : ''
      }`;
    }
    return `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}${
      selectedDailyClassObj ? ` - LỚP ${selectedDailyClassObj.class_name}` : ''
    }`;
  }, [reportMode, baseTitle, blankDateInTitle, dateParts, monthParts, selectedDailyClassObj, currentMonthlyClassObj]);

  const signatureSettings = useMemo(() => {
    if (selectedCampusId !== 'all') {
      const c = campuses.find((cmp) => cmp.id === selectedCampusId);
      if (c) {
        return {
          reporter_title: c.reporter_title || settings?.reporter_title || 'GIÁO VIÊN',
          reporter_name: c.reporter_name || settings?.reporter_name || 'Trần Thanh Tú',
          principal_title: c.principal_title || settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
          principal_name: c.principal_name || settings?.principal_name || 'Kiều Việt Hưng',
        };
      }
    }
    return {
      reporter_title: settings?.reporter_title || 'GIÁO VIÊN',
      reporter_name: settings?.reporter_name || 'Trần Thanh Tú',
      principal_title: settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
      principal_name: settings?.principal_name || 'Kiều Việt Hưng',
    };
  }, [selectedCampusId, campuses, settings]);

  const enabledIndicators = useMemo(() => {
    return indicators.filter((i) => i.enabled).sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  const allIndicator = useMemo(() => {
    return enabledIndicators.find((i) => i.code === 'ALL' || i.id === 'ig_all') || enabledIndicators[0];
  }, [enabledIndicators]);

  const boardingIndicator = useMemo(() => {
    return enabledIndicators.find(
      (i) => i.code === 'BOARDING_HALF' || i.id === 'ig_boarding_half' || i.name.toLowerCase().includes('bán trú')
    ) || enabledIndicators[1];
  }, [enabledIndicators]);

  const handlePrint = () => {
    window.print();
  };

  const getResolvedAddress = (s: any, classId: string): string => {
    if (s.id) {
      const match = students.find((std) => std.id === s.id);
      if (match && match.address) return match.address;
    }
    if (s.full_name) {
      const match = students.find(
        (std) => std.class_id === classId && std.full_name.trim().toLowerCase() === s.full_name.trim().toLowerCase()
      );
      if (match && match.address) return match.address;
    }
    return s.address || '';
  };

  const getAbsentStudentText = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      const listStr = row.report.absent_students
        .map((s) => `${s.full_name}${s.isBoarding ? ' (Bán Trú)' : ' (Ngoại Trú)'}${s.reason ? ` (${s.reason})` : ''}`)
        .join('\n');
      if (row.report.notes && !listStr.includes(row.report.notes)) {
        return `${listStr}\n- Ghi chú: ${row.report.notes}`;
      }
      return listStr;
    }
    return row.report?.notes || '';
  };

  const getAbsentStudentAddresses = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      return row.report.absent_students
        .map((s) => {
          const addr = getResolvedAddress(s, row.classItem.id);
          return addr && addr.trim() !== '' ? addr : '-';
        })
        .join('\n');
    }
    return '-';
  };

  // Rows hiển thị khi xem theo ngày (lọc theo lớp nếu chọn lớp cụ thể)
  const displayDailyRows = useMemo(() => {
    if (!reportData) return [];
    if (selectedClassFilter === 'all') return reportData.rows;
    return reportData.rows.filter((r) => r.classItem.id === selectedClassFilter);
  }, [reportData, selectedClassFilter]);

  // Rows hiển thị khi xem theo tháng của lớp
  const displayMonthlyRows = useMemo(() => {
    if (!monthlyData) return [];
    if (onlyReportedDays) {
      return monthlyData.rows.filter((r) => r.isReported);
    }
    return monthlyData.rows;
  }, [monthlyData, onlyReportedDays]);

  // XUẤT EXCEL CHUẨN (Đúng bảng 13 cột theo ngày hoặc theo tháng của từng lớp)
  const handleExportExcel = async (exportBlankTemplate: boolean = false) => {
    setExporting(true);
    try {
      if (reportMode === 'monthly_class') {
        if (!monthlyData || !currentMonthlyClassObj) return;
        const targetCampus = campuses.find((c) => c.id === currentMonthlyClassObj.campus_id);
        const rowsToExport = onlyReportedDays ? monthlyData.rows.filter((r) => r.isReported) : monthlyData.rows;

        await exportAttendanceMonthlyClassExcel({
          settings,
          campusName: targetCampus?.name || (campuses[0]?.name ?? 'Suối Lư'),
          yearMonth: selectedMonth,
          classItem: currentMonthlyClassObj,
          teacherName: resolveTeacherName(currentMonthlyClassObj.class_name, monthlyData.teacher?.full_name),
          rows: rowsToExport,
          signatureSettings,
        });
      } else {
        // Chế độ Ngày
        if (!reportData && !exportBlankTemplate) return;
        const rowsData: ClassDailyRowData[] = (reportData?.rows || []).map((row) => {
          const isReported = row.status !== 'NOT_REPORTED';
          const allVal = allIndicator ? row.values[allIndicator.id] : null;
          const boardingVal = boardingIndicator ? row.values[boardingIndicator.id] : null;

          const totalAll = allVal?.total ?? 0;
          const absentAll = allVal?.absent ?? 0;
          const presentAll = allVal?.present ?? (totalAll - absentAll);

          const totalBoarding = boardingVal?.total ?? 0;
          const absentBoarding = boardingVal?.absent ?? 0;
          const baoAnBoarding = Math.max(0, totalBoarding - absentBoarding);

          const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
          const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

          const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
          const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

          const studentNames = getAbsentStudentText(row);
          const studentAddresses = getAbsentStudentAddresses(row);

          return {
            classId: row.classItem.id,
            className: row.classItem.class_name,
            teacherName: resolveTeacherName(row.classItem.class_name, row.teacher?.full_name),
            totalAll,
            absentAll,
            presentAll,
            totalBoarding,
            absentBoarding,
            baoAnBoarding,
            totalNgoaiTru,
            absentNgoaiTru,
            studentNames,
            studentAddresses,
            absentRate,
            presentRate,
            isReported,
          };
        });

        await exportAttendanceDailyExcel({
          settings,
          campuses,
          selectedCampusId,
          reportDate: selectedDate,
          blankDateInTitle,
          exportBlankTemplate,
          rows: rowsData,
          selectedClassId: selectedClassFilter,
          selectedClassName: selectedDailyClassObj?.class_name,
          signatureSettings,
        });
      }
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
    } finally {
      setExporting(false);
    }
  };

  // Xuất file Excel tất cả các lớp trong tháng (Mỗi lớp 1 sheet chi tiết + Sheet tổng hợp)
  const handleExportAllClassesMonthly = async () => {
    setExporting(true);
    try {
      const activeClasses = displayClasses;
      const summaryRows: ClassDailyRowData[] = [];
      const classesDayRows: {
        classItem: ClassItem;
        teacherName: string;
        rows: MonthlyDayRowData[];
      }[] = [];

      for (const cls of activeClasses) {
        const cData = await StorageService.getClassMonthlyAttendance(cls.id, selectedMonth);
        const tName = resolveTeacherName(cls.class_name, cData.teacher?.full_name);
        classesDayRows.push({
          classItem: cls,
          teacherName: tName,
          rows: cData.rows,
        });

        const rosterTotal = students.filter((s) => s.class_id === cls.id).length;
        const clsTotal = rosterTotal > 0 
          ? rosterTotal 
          : (cData.summary.totalDaysReported > 0 
              ? Math.round(cData.summary.sumTotalAll / cData.summary.totalDaysReported) 
              : 35);

        const rosterBoarding = students.filter((s) => s.class_id === cls.id && s.isBoarding !== false).length;
        const clsBoarding = rosterBoarding > 0 
          ? rosterBoarding 
          : (cData.summary.totalDaysReported > 0 
              ? Math.round(cData.summary.sumTotalBoarding / cData.summary.totalDaysReported) 
              : Math.min(25, clsTotal));
        const clsNgoaiTru = Math.max(0, clsTotal - clsBoarding);

        summaryRows.push({
          classId: cls.id,
          className: cls.class_name,
          teacherName: tName,
          totalAll: clsTotal,
          absentAll: cData.summary.sumAbsentAll,
          presentAll: Math.max(0, clsTotal * (cData.summary.totalDaysReported || 1) - cData.summary.sumAbsentAll),
          totalBoarding: clsBoarding,
          absentBoarding: cData.summary.sumAbsentBoarding,
          baoAnBoarding: cData.summary.sumBaoAnBoarding,
          totalNgoaiTru: clsNgoaiTru,
          absentNgoaiTru: cData.summary.sumAbsentNgoaiTru,
          studentNames: `Đã nộp: ${cData.summary.totalDaysReported}/${cData.rows.length} ngày`,
          studentAddresses: '-',
          absentRate: cData.summary.avgAbsentRate,
          presentRate: cData.summary.avgPresentRate,
          isReported: cData.summary.totalDaysReported > 0,
        });
      }

      const targetCampus = campuses.find((c) => c.id === selectedCampusId);
      await exportAttendanceMonthlyAllClassesExcel({
        settings,
        campusName: targetCampus?.name || (selectedCampusId !== 'all' ? selectedCampusId : undefined),
        yearMonth: selectedMonth,
        summaryRows,
        classesDayRows,
        signatureSettings,
      });
    } catch (err) {
      console.error('Lỗi khi xuất file Excel tất cả các lớp:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Control Bar (Hidden on print) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col gap-4 no-print">
        {/* Top line: Header & Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            {onNavigate && (
              <button
                onClick={() => onNavigate('/dashboard')}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Quay lại Tổng quan"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                BIỂU MẪU BÁO CÁO SĨ SỐ HỌC SINH
              </h1>
              <p className="text-xs text-slate-500">
                Đúng chuẩn biểu mẫu gốc: đường kẻ rõ ràng, tự động tính % vắng và % chuyên cần
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setReportMode('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                reportMode === 'daily'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>BÁO CÁO THEO NGÀY</span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('monthly_class')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                reportMode === 'monthly_class'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>BÁO CÁO THEO THÁNG TỪNG LỚP</span>
            </button>
          </div>
        </div>

        {/* Filter & Actions line */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <CampusSelector selectedCampusId={selectedCampusId} onChange={setSelectedCampusId} />

            {/* Điều khiển khi ở chế độ Theo Ngày */}
            {reportMode === 'daily' && (
              <>
                <DateNavigator selectedDate={selectedDate} onChangeDate={setSelectedDate} />

                {/* Chọn Lớp cụ thể hoặc Tất cả các lớp */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <label className="text-xs font-bold text-slate-700">Lớp:</label>
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent border-0 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Tất cả các lớp ({displayClasses.length} lớp)</option>
                    {displayClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        Lớp {cls.class_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Điều khiển khi ở chế độ Theo Tháng từng lớp */}
            {reportMode === 'monthly_class' && (
              <>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <label className="text-xs font-bold text-slate-700">Tháng:</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent border-0 focus:outline-hidden cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2 bg-blue-50/70 border border-blue-300 rounded-xl px-3 py-1.5">
                  <label className="text-xs font-black text-blue-900">Lớp:</label>
                  <select
                    value={monthlyClassId}
                    onChange={(e) => setMonthlyClassId(e.target.value)}
                    className="text-xs font-black text-blue-900 bg-transparent border-0 focus:outline-hidden cursor-pointer"
                  >
                    {displayClasses.map((cls) => {
                      const count = getClassStudentCount(cls.id);
                      return (
                        <option key={cls.id} value={cls.id}>
                          Lớp {cls.class_name} {count > 0 ? `(${count} HS)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyReportedDays(!onlyReportedDays)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    onlyReportedDays
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                  title="Chuyển đổi giữa xem tất cả các ngày trong tháng (1 đến 30) hoặc chỉ các ngày lớp đã nộp báo cáo"
                >
                  {onlyReportedDays ? 'Chỉ hiện ngày đã nộp' : 'Hiện đủ cả tháng (1-30)'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => (reportMode === 'daily' ? loadReportData(true) : loadMonthlyData(true))}
              disabled={loading || loadingMonthly}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              title="Tải lại số liệu mới nhất"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading || loadingMonthly ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">LÀM MỚI</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {reportMode === 'daily' && (
              <button
                type="button"
                onClick={() => setBlankDateInTitle(!blankDateInTitle)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-colors ${
                  blankDateInTitle
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title="Nhấp để chuyển đổi giữa định dạng Ngày... Tháng... Năm (điền tay) hoặc Ngày cụ thể tự động"
              >
                <span className="font-mono text-[11px]">
                  {blankDateInTitle ? 'MẪU ĐIỀN TAY: NGÀY .......THÁNG ......' : `NGÀY ${dateParts.day} THÁNG ${dateParts.month}`}
                </span>
              </button>
            )}

            {/* Nút Xuất Excel */}
            <button
              type="button"
              onClick={() => handleExportExcel(false)}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              title={
                reportMode === 'daily'
                  ? selectedClassFilter === 'all'
                    ? 'Xuất file Excel chuẩn 13 cột toàn trường ngày đã chọn'
                    : `Xuất file Excel chuẩn 13 cột Lớp ${selectedDailyClassObj?.class_name} ngày đã chọn`
                  : `Xuất file Excel chuẩn 13 cột Lớp ${currentMonthlyClassObj?.class_name} theo các ngày trong Tháng ${monthParts.month}/${monthParts.year}`
              }
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>
                {exporting
                  ? 'ĐANG XUẤT...'
                  : reportMode === 'monthly_class'
                  ? `XUẤT EXCEL LỚP ${currentMonthlyClassObj?.class_name || ''}`
                  : selectedClassFilter === 'all'
                  ? 'XUẤT EXCEL'
                  : `XUẤT EXCEL LỚP ${selectedDailyClassObj?.class_name}`}
              </span>
            </button>

            {/* Nút Xuất Excel Tất cả các lớp trong tháng */}
            {reportMode === 'monthly_class' && (
              <button
                type="button"
                onClick={handleExportAllClassesMonthly}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 border border-teal-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                title="Xuất 1 file Excel gồm Sheet Tổng hợp và tất cả các Sheet riêng cho từng lớp theo đúng biểu mẫu chuẩn này"
              >
                <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                <span>XUẤT TẤT CẢ CÁC LỚP</span>
              </button>
            )}

            {reportMode === 'daily' && (
              <button
                type="button"
                onClick={() => handleExportExcel(true)}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                title="Xuất file Excel mẫu trắng y hệt hình gốc"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                <span>MẪU TRẮNG</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSyncSupabase}
              disabled={syncingSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              title="Đồng bộ toàn bộ dữ liệu báo cáo, chỉ số và danh sách vắng lên Supabase"
            >
              <CloudUpload className={`w-4 h-4 text-teal-700 ${syncingSupabase ? 'animate-bounce' : ''}`} />
              <span className="hidden xl:inline">{syncingSupabase ? 'ĐANG ĐỒNG BỘ...' : 'ĐỒNG BỘ'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>IN BÁO CÁO</span>
            </button>

            {reportMode === 'daily' && (isAdmin || isBGH) && (
              <button
                type="button"
                onClick={() => {
                  setManagerDate(selectedDate);
                  setShowResetManager(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition-colors cursor-pointer"
                title="Quản trị viên / BGH: Quản lý và reset báo cáo nhầm của các lớp về Chưa báo cáo"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>RESET BÁO CÁO NHẦM</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Document Layout - Matched precisely to the template image with solid borderlines */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 print-container text-black">
        {/* Official Document Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start font-serif text-black mb-6">
          <div className="flex flex-col items-start text-left">
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
              {settings?.sub_department_name || 'UBND XÃ XA DUNG'}
            </div>
            <div className="text-[11px] sm:text-xs font-extrabold uppercase mt-0.5 tracking-tight border-b border-black pb-0.5">
              {formattedSchoolName}
            </div>
            {selectedCampusId !== 'all' ? (
              <div className="text-[11px] sm:text-xs font-bold mt-1 uppercase">
                PHÂN HIỆU: {campuses.find((c) => c.id === selectedCampusId)?.name || '...........'}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center text-center mt-3 md:mt-0">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wide">
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </div>
            <div className="text-[10px] sm:text-xs font-bold border-b border-black pb-0.5 mt-0.5 px-4">
              Độc lập - Tự do - Hạnh phúc
            </div>
          </div>
        </div>

        {/* Dynamic Big Report Title */}
        <div className="text-center my-6 pb-2">
          <h2 className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wider text-black font-serif">
            {displayTitle}
          </h2>
          {(reportMode === 'monthly_class' || (reportMode === 'daily' && selectedClassFilter !== 'all')) && (
            <div className="text-xs sm:text-sm font-bold text-slate-800 font-serif mt-1.5 uppercase">
              LỚP: {reportMode === 'monthly_class' ? currentMonthlyClassObj?.class_name : selectedDailyClassObj?.class_name} 
              &nbsp;&nbsp;|&nbsp;&nbsp; 
              GIÁO VIÊN CHỦ NHIỆM: {
                reportMode === 'monthly_class'
                  ? resolveTeacherName(currentMonthlyClassObj?.class_name, monthlyData?.teacher?.full_name).toUpperCase()
                  : resolveTeacherName(selectedDailyClassObj?.class_name, reportData?.rows.find((r) => r.classItem.id === selectedClassFilter)?.teacher?.full_name).toUpperCase()
              }
            </div>
          )}
        </div>

        {/* Data Table with Full Borders (Đúng 13 cột chuẩn theo hình ảnh người dùng cung cấp) */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-xs font-serif">
            <thead>
              {/* Header Row 1 */}
              <tr className="bg-slate-50 text-black font-bold text-center">
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-16">
                  {reportMode === 'monthly_class' ? 'Ngày' : 'Lớp'}
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[160px] text-center">
                  Giáo viên chủ nhiệm
                </th>
                <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                  Học sinh toàn trường
                </th>
                <th colSpan={3} className="border border-black px-2 py-1.5 text-center bg-blue-50/50">
                  Học sinh bán trú
                </th>
                <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                  Học sinh ngoại trú
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[200px] text-center">
                  Tên học sinh nghỉ
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[150px] text-center">
                  Địa chỉ
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-24 text-center">
                  Tỉ lệ phần trăm vắng (%)
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-28 text-center">
                  Tỉ lệ phần trăm chuyên cần (%)
                </th>
                {reportMode === 'daily' && (
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-16 text-center print:hidden">
                    Xử lý
                  </th>
                )}
              </tr>

              {/* Header Row 2: Sub-columns */}
              <tr className="bg-slate-50 text-black font-bold text-center text-[11px]">
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
                <th className="border border-black px-1.5 py-1.5 w-20 bg-blue-50/80 text-blue-900 font-bold">
                  Học sinh báo ăn
                </th>
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
              </tr>
            </thead>

            <tbody>
              {/* TRƯỜNG HỢP 1: BÁO CÁO THEO NGÀY (Toàn trường hoặc 1 lớp cụ thể) */}
              {reportMode === 'daily' && (
                <>
                  {displayDailyRows.map((row) => {
                    const isReported = row.status !== 'NOT_REPORTED';

                    const allVal = allIndicator ? row.values[allIndicator.id] : null;
                    const boardingVal = boardingIndicator ? row.values[boardingIndicator.id] : null;

                    const totalAll = allVal?.total ?? 0;
                    const absentAll = allVal?.absent ?? 0;
                    const presentAll = allVal?.present ?? (totalAll - absentAll);

                    const totalBoarding = boardingVal?.total ?? 0;
                    const absentBoarding = boardingVal?.absent ?? 0;
                    const baoAnBoarding = Math.max(0, totalBoarding - absentBoarding);

                    const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
                    const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

                    const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
                    const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

                    const studentNames = getAbsentStudentText(row);
                    const studentAddresses = getAbsentStudentAddresses(row);

                    return (
                      <tr key={row.classItem.id} className="text-center hover:bg-slate-50/70">
                        {/* 1. Lớp */}
                        <td className="border border-black py-1.5 px-2 font-bold text-black text-center">
                          {row.classItem.class_name}
                        </td>

                        {/* 2. Giáo viên chủ nhiệm */}
                        <td className="border border-black py-1.5 px-2.5 text-left text-black font-medium">
                          {resolveTeacherName(row.classItem.class_name, row.teacher?.full_name)}
                        </td>

                        {/* 3. Học sinh toàn trường - Tổng số */}
                        <td className="border border-black py-1.5 px-1 font-medium text-center">
                          {isReported ? totalAll : ''}
                        </td>

                        {/* 4. Học sinh toàn trường - Số vắng */}
                        <td
                          className={`border border-black py-1.5 px-1 font-bold text-center ${
                            isReported && absentAll > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {isReported ? absentAll : ''}
                        </td>

                        {/* 5. Học sinh bán trú - Tổng số */}
                        <td className="border border-black py-1.5 px-1 font-medium text-center">
                          {isReported ? totalBoarding : ''}
                        </td>

                        {/* 6. Học sinh bán trú - Số vắng */}
                        <td
                          className={`border border-black py-1.5 px-1 font-bold text-center ${
                            isReported && absentBoarding > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {isReported ? absentBoarding : ''}
                        </td>

                        {/* 7. Học sinh bán trú - Báo ăn */}
                        <td className="border border-black py-1.5 px-1 font-bold text-center text-blue-900 bg-blue-50/40">
                          {isReported ? baoAnBoarding : ''}
                        </td>

                        {/* 8. Học sinh ngoại trú - Tổng số */}
                        <td className="border border-black py-1.5 px-1 font-medium text-center">
                          {isReported ? totalNgoaiTru : ''}
                        </td>

                        {/* 9. Học sinh ngoại trú - Số vắng */}
                        <td
                          className={`border border-black py-1.5 px-1 font-bold text-center ${
                            isReported && absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {isReported ? absentNgoaiTru : ''}
                        </td>

                        {/* 10. Tên học sinh nghỉ */}
                        <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                          {isReported ? studentNames || '' : ''}
                        </td>

                        {/* 11. Địa chỉ */}
                        <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                          {isReported ? studentAddresses || '' : ''}
                        </td>

                        {/* 12. % Vắng */}
                        <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                          {isReported ? `${absentRate.toFixed(2).replace('.', ',')}%` : ''}
                        </td>

                        {/* 13. % Chuyên cần */}
                        <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                          {isReported ? `${presentRate.toFixed(2).replace('.', ',')}%` : ''}
                        </td>

                        {/* 14. Xử lý reset nhầm (ẩn khi in) */}
                        <td className="border border-black py-1 px-1.5 text-center print:hidden">
                          {isReported &&
                          (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === row.classItem.id)) ? (
                            <button
                              type="button"
                              onClick={() => handlePromptReset(row.classItem.id, row.classItem.class_name, selectedDate)}
                              disabled={row.status === 'LOCKED' && !isAdmin}
                              className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                              title="Reset báo cáo nhầm về Chưa báo cáo"
                            >
                              <RotateCcw className="w-3 h-3 text-rose-600" />
                              <span>Reset</span>
                            </button>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Summary Row Theo Ngày */}
                  {displayDailyRows.length > 0 &&
                    (() => {
                      const reportedRows = displayDailyRows.filter((r) => r.status !== 'NOT_REPORTED');
                      const sumTotalAll = displayDailyRows.reduce((acc, r) => {
                        const v = allIndicator ? r.values[allIndicator.id]?.total : 0;
                        return acc + (v ?? 0);
                      }, 0);

                      const sumAbsentAll = displayDailyRows.reduce((acc, r) => {
                        const v = allIndicator ? r.values[allIndicator.id]?.absent : 0;
                        return acc + (v ?? 0);
                      }, 0);

                      const sumPresentAll = Math.max(0, sumTotalAll - sumAbsentAll);

                      const sumTotalBoarding = displayDailyRows.reduce((acc, r) => {
                        const v = boardingIndicator ? r.values[boardingIndicator.id]?.total : 0;
                        return acc + (v ?? 0);
                      }, 0);

                      const sumAbsentBoarding = displayDailyRows.reduce((acc, r) => {
                        const v = boardingIndicator ? r.values[boardingIndicator.id]?.absent : 0;
                        return acc + (v ?? 0);
                      }, 0);

                      const sumBaoAnBoarding = Math.max(0, sumTotalBoarding - sumAbsentBoarding);

                      const sumTotalNgoaiTru = Math.max(0, sumTotalAll - sumTotalBoarding);
                      const sumAbsentNgoaiTru = Math.max(0, sumAbsentAll - sumAbsentBoarding);

                      const overallAbsentRate = sumTotalAll > 0 ? (sumAbsentAll / sumTotalAll) * 100 : 0;
                      const overallPresentRate = sumTotalAll > 0 ? (sumPresentAll / sumTotalAll) * 100 : 0;

                      return (
                        <tr className="bg-slate-100 font-bold border-t-2 border-black">
                          <td colSpan={2} className="border border-black py-2 px-2 text-center text-xs font-black">
                            TỔNG CỘNG
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {sumTotalAll}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              sumAbsentAll > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {sumAbsentAll}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {sumTotalBoarding}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              sumAbsentBoarding > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {sumAbsentBoarding}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-blue-900 bg-blue-100/70 text-center">
                            {sumBaoAnBoarding}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {sumTotalNgoaiTru}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              sumAbsentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {sumAbsentNgoaiTru}
                          </td>
                          <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                            Đã báo cáo: {reportedRows.length}/{displayDailyRows.length} lớp
                          </td>
                          <td className="border border-black py-2 px-2 text-center text-[11px] font-semibold text-slate-700">
                            -
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {overallAbsentRate.toFixed(2).replace('.', ',')}%
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {overallPresentRate.toFixed(2).replace('.', ',')}%
                          </td>
                          <td className="border border-black py-2 px-1 text-center font-bold text-slate-400 print:hidden">
                            -
                          </td>
                        </tr>
                      );
                    })()}
                </>
              )}

              {/* TRƯỜNG HỢP 2: BÁO CÁO THEO THÁNG CỦA TỪNG LỚP (Mỗi dòng là 1 ngày trong tháng của lớp đó) */}
              {reportMode === 'monthly_class' && (
                <>
                  {displayMonthlyRows.map((r) => (
                    <tr key={r.date} className="text-center hover:bg-slate-50/70">
                      {/* 1. Ngày */}
                      <td className="border border-black py-1.5 px-2 font-bold text-black text-center whitespace-nowrap">
                        {r.dayLabel}
                      </td>

                      {/* 2. Giáo viên chủ nhiệm */}
                      <td className="border border-black py-1.5 px-2.5 text-left text-black font-medium">
                        {resolveTeacherName(currentMonthlyClassObj?.class_name, r.teacherName || monthlyData?.teacher?.full_name)}
                      </td>

                      {/* 3. Toàn trường/Lớp - Tổng số */}
                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {r.isReported ? r.totalAll : ''}
                      </td>

                      {/* 4. Toàn trường/Lớp - Số vắng */}
                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          r.isReported && r.absentAll > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {r.isReported ? r.absentAll : ''}
                      </td>

                      {/* 5. Bán trú - Tổng số */}
                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {r.isReported ? r.totalBoarding : ''}
                      </td>

                      {/* 6. Bán trú - Số vắng */}
                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          r.isReported && r.absentBoarding > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {r.isReported ? r.absentBoarding : ''}
                      </td>

                      {/* 7. Bán trú - Học sinh báo ăn */}
                      <td className="border border-black py-1.5 px-1 font-bold text-center text-blue-900 bg-blue-50/40">
                        {r.isReported ? r.baoAnBoarding : ''}
                      </td>

                      {/* 8. Ngoại trú - Tổng số */}
                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {r.isReported ? r.totalNgoaiTru : ''}
                      </td>

                      {/* 9. Ngoại trú - Số vắng */}
                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          r.isReported && r.absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {r.isReported ? r.absentNgoaiTru : ''}
                      </td>

                      {/* 10. Tên học sinh nghỉ */}
                      <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                        {r.studentNames || ''}
                      </td>

                      {/* 11. Địa chỉ */}
                      <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                        {r.isReported ? (r.studentAddresses && r.studentAddresses !== '-' ? r.studentAddresses : '') : ''}
                      </td>

                      {/* 12. % Vắng */}
                      <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                        {r.isReported ? `${r.absentRate.toFixed(2).replace('.', ',')}%` : ''}
                      </td>

                      {/* 13. % Chuyên cần */}
                      <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                        {r.isReported ? `${r.presentRate.toFixed(2).replace('.', ',')}%` : ''}
                      </td>
                    </tr>
                  ))}

                  {/* Summary Row Theo Tháng của Lớp */}
                  {monthlyData && (
                    (() => {
                      const rosterTotal = students.filter((s) => s.class_id === currentMonthlyClassObj?.id).length;
                      const curTotal = rosterTotal > 0 
                        ? rosterTotal 
                        : (monthlyData.summary.totalDaysReported > 0 
                            ? Math.round(monthlyData.summary.sumTotalAll / monthlyData.summary.totalDaysReported) 
                            : 35);

                      const rosterBoarding = students.filter((s) => s.class_id === currentMonthlyClassObj?.id && s.isBoarding !== false).length;
                      const curBoarding = rosterBoarding > 0 
                        ? rosterBoarding 
                        : (monthlyData.summary.totalDaysReported > 0 
                            ? Math.round(monthlyData.summary.sumTotalBoarding / monthlyData.summary.totalDaysReported) 
                            : Math.min(25, curTotal));
                      const curNgoaiTru = Math.max(0, curTotal - curBoarding);

                      return (
                        <tr className="bg-slate-100 font-bold border-t-2 border-black">
                          <td colSpan={2} className="border border-black py-2 px-2 text-center text-xs font-black">
                            TỔNG CỘNG / TRUNG BÌNH THÁNG
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {monthlyData.summary.totalDaysReported > 0
                              ? Math.round(monthlyData.summary.sumTotalAll / monthlyData.summary.totalDaysReported)
                              : '-'}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              monthlyData.summary.sumAbsentAll > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {monthlyData.summary.totalDaysReported > 0 ? monthlyData.summary.sumAbsentAll : '-'}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {monthlyData.summary.totalDaysReported > 0
                              ? Math.round(monthlyData.summary.sumTotalBoarding / monthlyData.summary.totalDaysReported)
                              : '-'}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              monthlyData.summary.sumAbsentBoarding > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {monthlyData.summary.totalDaysReported > 0 ? monthlyData.summary.sumAbsentBoarding : '-'}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-blue-900 bg-blue-100/70 text-center">
                            {monthlyData.summary.totalDaysReported > 0 ? monthlyData.summary.sumBaoAnBoarding : '-'}
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {monthlyData.summary.totalDaysReported > 0
                              ? Math.round(monthlyData.summary.sumTotalNgoaiTru / monthlyData.summary.totalDaysReported)
                              : '-'}
                          </td>
                          <td
                            className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                              monthlyData.summary.sumAbsentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {monthlyData.summary.totalDaysReported > 0 ? monthlyData.summary.sumAbsentNgoaiTru : '-'}
                          </td>
                          <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                            Đã nộp: {monthlyData.summary.totalDaysReported}/{monthlyData.rows.length} ngày
                          </td>
                          <td className="border border-black py-2 px-2 text-center text-[11px] font-semibold text-slate-700">
                            -
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {monthlyData.summary.avgAbsentRate.toFixed(2).replace('.', ',')}%
                          </td>
                          <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                            {monthlyData.summary.avgPresentRate.toFixed(2).replace('.', ',')}%
                          </td>
                        </tr>
                      );
                    })()
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & Signatures */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center font-serif text-black print-break-inside-avoid">
          <div>
            <div className="text-xs uppercase font-bold">
              {reportMode === 'monthly_class' || (reportMode === 'daily' && selectedClassFilter !== 'all')
                ? 'GIÁO VIÊN CHỦ NHIỆM'
                : signatureSettings.reporter_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">
              {reportMode === 'monthly_class'
                ? resolveTeacherName(currentMonthlyClassObj?.class_name, monthlyData?.teacher?.full_name)
                : selectedClassFilter !== 'all'
                ? resolveTeacherName(
                    selectedDailyClassObj?.class_name,
                    reportData?.rows.find((r) => r.classItem.id === selectedClassFilter)?.teacher?.full_name
                  )
                : signatureSettings.reporter_name}
            </div>
          </div>

          <div>
            <div className="text-xs italic text-slate-700 mb-1">
              {reportMode === 'monthly_class'
                ? `Tháng ${monthParts.month} năm ${monthParts.year}`
                : `Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`}
            </div>
            <div className="text-xs uppercase font-bold">{signatureSettings.principal_title}</div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký, đóng dấu và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.principal_name}</div>
          </div>
        </div>
      </div>

      {/* Modal Xác nhận Reset Báo cáo */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">Xác nhận reset báo cáo</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Bạn có chắc chắn muốn reset báo cáo của lớp <b>{confirmResetModal.className}</b> ngày{' '}
              <b>{confirmResetModal.date.split('-').reverse().join('/')}</b> về trạng thái <b>Chưa báo cáo</b>? Giáo viên chủ
              nhiệm sẽ có thể nhập lại sĩ số mới.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResetModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                {isResetting ? 'Đang reset...' : 'Xác nhận Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
