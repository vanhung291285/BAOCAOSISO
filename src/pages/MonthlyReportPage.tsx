import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { CampusSelector } from '../components/CampusSelector';
import { ClassItem, Profile } from '../types';
import {
  MonthlyDayRowData,
  ClassDailyRowData,
  exportAttendanceMonthlyClassExcel,
  exportAttendanceMonthlyAllClassesExcel,
  resolveTeacherName,
} from '../utils/exportAttendanceStandardExcel';
import {
  Calendar,
  FileSpreadsheet,
  TrendingDown,
  Award,
  AlertCircle,
  Clock,
  Download,
  Trophy,
  Utensils,
  CheckCircle2,
  Filter,
  Eye,
  Printer,
  CalendarDays,
  Users,
  Check,
} from 'lucide-react';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';
import { DEFAULT_BOARDING_STUDENTS_SEED } from '../utils/boardingRules';
import { isValidStudentAddress, cleanStudentAddress } from '../utils/studentUtils';
import { MonthlyBoardingSheet } from '../components/MonthlyBoardingSheet';

interface MonthlyReportPageProps {
  onNavigate?: (path: string) => void;
}

export const MonthlyReportPage: React.FC<MonthlyReportPageProps> = ({ onNavigate }) => {
  const { settings, campuses, classes, students } = useSchool();
  const { isGVCN, currentUser } = useAuth();
  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  const [isExportingBoarding, setIsExportingBoarding] = useState(false);
  const [isExportingStandard, setIsExportingStandard] = useState(false);
  const [boardingExportMessage, setBoardingExportMessage] = useState<string | null>(null);

  // Month state (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Campus filter
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });

  // Class filter: 'all' hoặc class_id cụ thể
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    return 'all';
  });

  // Chế độ xem: 'class_detail' = Chi tiết theo ngày của lớp | 'all_classes_summary' = Tổng hợp tất cả các lớp | 'boarding_sheet' = Sổ chấm ăn bán trú tháng
  const [viewMode, setViewMode] = useState<'class_detail' | 'all_classes_summary' | 'boarding_sheet'>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return 'class_detail';
    }
    return 'all_classes_summary';
  });

  // Tùy chọn lọc: chỉ hiện các ngày đã có báo cáo trong tháng (khi xem chi tiết lớp)
  const [onlyReportedDays, setOnlyReportedDays] = useState(false);

  // Data states
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    yearMonth: string;
    totalDaysReported: number;
    totalAbsentAccumulated: number;
    avgAbsentRate: number;
    highestAbsentClass: { className: string; rate: number } | null;
    lowestAbsentClass: { className: string; rate: number } | null;
    dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[];
  } | null>(null);

  // Dữ liệu chi tiết từng ngày của 1 lớp
  const [monthlyClassData, setMonthlyClassData] = useState<{
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

  // Dữ liệu tổng hợp tất cả các lớp trong tháng
  const [allClassesData, setAllClassesData] = useState<{
    summaryRows: ClassDailyRowData[];
    classesDayRows: {
      classItem: ClassItem;
      teacherName: string;
      rows: MonthlyDayRowData[];
    }[];
    totals: {
      totalAll: number;
      absentAll: number;
      presentAll: number;
      totalBoarding: number;
      absentBoarding: number;
      baoAnBoarding: number;
      totalNgoaiTru: number;
      absentNgoaiTru: number;
      avgAbsentRate: number;
      avgPresentRate: number;
      reportedClassesCount: number;
      totalClassesCount: number;
    };
  } | null>(null);

  // Danh sách các lớp theo phân hiệu được chọn
  const displayClasses = useMemo(() => {
    let list = classes.filter((c) => c.active);
    if (selectedCampusId !== 'all') {
      list = list.filter((c) => c.campus_id === selectedCampusId);
    }
    return list;
  }, [classes, selectedCampusId]);

  // Đối tượng lớp đang được chọn (nếu có)
  const currentClassObj = useMemo(() => {
    if (selectedClassFilter !== 'all') {
      return classes.find((c) => c.id === selectedClassFilter) || null;
    }
    return null;
  }, [classes, selectedClassFilter]);

  // Tự động chuyển viewMode khi thay đổi selectedClassFilter
  const handleSelectClass = (classId: string) => {
    setSelectedClassFilter(classId);
    if (classId !== 'all') {
      setViewMode('class_detail');
    } else {
      setViewMode('all_classes_summary');
    }
  };

  // Cấu hình chữ ký theo phân hiệu
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

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const targetClassId = selectedClassFilter !== 'all' ? selectedClassFilter : undefined;

      // 1. Load KPI aggregate
      const kpiData = await StorageService.getMonthlyAggregate(
        selectedMonth,
        selectedCampusId !== 'all' ? selectedCampusId : undefined,
        targetClassId
      );
      setStats(kpiData);

      // 2. Load Class Detail Data nếu có chọn lớp
      if (targetClassId) {
        const cData = await StorageService.getClassMonthlyAttendance(targetClassId, selectedMonth);
        setMonthlyClassData(cData);
      } else {
        setMonthlyClassData(null);
      }

      // 3. Load All Classes Summary Data
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
          studentNames: cData.summary.totalDaysReported > 0
            ? `Đã nộp: ${cData.summary.totalDaysReported}/${cData.rows.length} ngày`
            : 'Chưa nộp',
          studentAddresses: '-',
          absentRate: cData.summary.avgAbsentRate,
          presentRate: cData.summary.avgPresentRate,
          isReported: cData.summary.totalDaysReported > 0,
        });
      }

      const sumTotalAll = summaryRows.reduce((acc, r) => acc + r.totalAll, 0);
      const sumAbsentAll = summaryRows.reduce((acc, r) => acc + r.absentAll, 0);
      const sumPresentAll = summaryRows.reduce((acc, r) => acc + r.presentAll, 0);
      const sumTotalBoarding = summaryRows.reduce((acc, r) => acc + r.totalBoarding, 0);
      const sumAbsentBoarding = summaryRows.reduce((acc, r) => acc + r.absentBoarding, 0);
      const sumBaoAnBoarding = summaryRows.reduce((acc, r) => acc + r.baoAnBoarding, 0);
      const sumTotalNgoaiTru = summaryRows.reduce((acc, r) => acc + r.totalNgoaiTru, 0);
      const sumAbsentNgoaiTru = summaryRows.reduce((acc, r) => acc + r.absentNgoaiTru, 0);

      const reportedClassesCount = summaryRows.filter((r) => r.isReported).length;
      const avgAbsentRate = sumTotalAll > 0 ? (sumAbsentAll / (sumTotalAll * (kpiData.totalDaysReported || 1))) * 100 : 0;
      const avgPresentRate = Math.max(0, 100 - avgAbsentRate);

      setAllClassesData({
        summaryRows,
        classesDayRows,
        totals: {
          totalAll: sumTotalAll,
          absentAll: sumAbsentAll,
          presentAll: sumPresentAll,
          totalBoarding: sumTotalBoarding,
          absentBoarding: sumAbsentBoarding,
          baoAnBoarding: sumBaoAnBoarding,
          totalNgoaiTru: sumTotalNgoaiTru,
          absentNgoaiTru: sumAbsentNgoaiTru,
          avgAbsentRate,
          avgPresentRate,
          reportedClassesCount,
          totalClassesCount: summaryRows.length,
        },
      });
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu báo cáo tháng:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedCampusId, selectedClassFilter, displayClasses, students]);

  useEffect(() => {
    loadData();

    // Lắng nghe realtime từ các bảng liên quan
    const unsubscribe = subscribeRealtime((event) => {
      if (
        event?.table === 'daily_reports' ||
        event?.table === 'daily_report_values' ||
        event?.table === 'classes' ||
        event?.table === 'all_reset'
      ) {
        loadData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadData]);

  // Lọc hàng tháng của lớp
  const displayMonthlyRows = useMemo(() => {
    if (!monthlyClassData) return [];
    if (!onlyReportedDays) return monthlyClassData.rows;
    return monthlyClassData.rows.filter((r) => r.isReported);
  }, [monthlyClassData, onlyReportedDays]);

  // Helper hiển thị địa chỉ của học sinh vắng trong hàng báo cáo
  const getRowDisplayAddress = useCallback((r: MonthlyDayRowData, classId?: string) => {
    if (!r.isReported) return '';
    if (r.studentAddresses && isValidStudentAddress(r.studentAddresses)) {
      return cleanStudentAddress(r.studentAddresses);
    }
    if (r.absentAll > 0 && r.studentNames && r.studentNames !== 'Ngày nghỉ') {
      const lines = r.studentNames.split('\n').filter((l) => !l.startsWith('-') && !l.startsWith('Thứ 6'));
      const addrs: string[] = [];
      lines.forEach((l) => {
        const cName = l.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
        if (!cName) return;
        const m = students.find((std) => (classId ? std.class_id === classId : true) && std.full_name.trim().toLowerCase() === cName)
               || students.find((std) => std.full_name.trim().toLowerCase() === cName);
        if (m && isValidStudentAddress(m.address || m.village)) {
          addrs.push(cleanStudentAddress(m.address || m.village));
        } else {
          const seed = DEFAULT_BOARDING_STUDENTS_SEED.find((sd) => sd.name.toLowerCase() === cName);
          if (seed) addrs.push(seed.village);
          else addrs.push('-');
        }
      });
      if (addrs.length > 0 && addrs.some((a) => a !== '-')) {
        return addrs.join('\n');
      }
    }
    return '';
  }, [students]);

  // In ấn biểu mẫu chuẩn
  const handlePrint = () => {
    window.print();
  };

  // Xuất file Excel chuẩn 13 cột theo đúng bảng quy định
  const handleExportStandardMonthlyExcel = async () => {
    setIsExportingStandard(true);
    try {
      const targetCampus = campuses.find((c) => c.id === selectedCampusId);
      const campusName = targetCampus?.name || (selectedCampusId !== 'all' ? selectedCampusId : undefined);

      if (selectedClassFilter !== 'all') {
        const targetClass = classes.find((c) => c.id === selectedClassFilter);
        if (!targetClass) {
          alert('Không tìm thấy lớp học!');
          return;
        }

        const classData = monthlyClassData || (await StorageService.getClassMonthlyAttendance(targetClass.id, selectedMonth));
        const enrichedExportRows = classData.rows.map((row) => ({
          ...row,
          studentAddresses: getRowDisplayAddress(row, targetClass.id) || row.studentAddresses,
        }));
        await exportAttendanceMonthlyClassExcel({
          settings,
          campusName,
          yearMonth: selectedMonth,
          classItem: targetClass,
          teacherName: resolveTeacherName(targetClass.class_name, classData.teacher?.full_name),
          rows: enrichedExportRows,
          signatureSettings,
        });

        setBoardingExportMessage(`Đã xuất thành công biểu mẫu Báo cáo sĩ số Lớp ${targetClass.class_name} Tháng ${selectedMonth}!`);
        setTimeout(() => setBoardingExportMessage(null), 4000);
      } else {
        if (!allClassesData) {
          alert('Chưa có dữ liệu tổng hợp!');
          return;
        }

        const enrichedClassesDayRows = allClassesData.classesDayRows.map((cGroup) => ({
          ...cGroup,
          rows: cGroup.rows.map((row) => ({
            ...row,
            studentAddresses: getRowDisplayAddress(row, cGroup.classItem.id) || row.studentAddresses,
          })),
        }));

        await exportAttendanceMonthlyAllClassesExcel({
          settings,
          campusName,
          yearMonth: selectedMonth,
          summaryRows: allClassesData.summaryRows,
          classesDayRows: enrichedClassesDayRows,
          signatureSettings,
        });

        setBoardingExportMessage(`Đã xuất thành công file Excel biểu mẫu sĩ số tất cả các lớp Tháng ${selectedMonth}!`);
        setTimeout(() => setBoardingExportMessage(null), 4000);
      }
    } catch (err: any) {
      console.error('Lỗi xuất biểu mẫu sĩ số tháng:', err);
      alert('Có lỗi khi xuất file Excel: ' + (err?.message || err));
    } finally {
      setIsExportingStandard(false);
    }
  };

  // Xuất biểu tổng hợp ăn bán trú tháng (Sổ chấm cơm) cho GVCN
  const handleExportBoardingForGVCN = async (targetClassId?: string) => {
    const cId = targetClassId || selectedClassFilter !== 'all' ? selectedClassFilter : assignedClass?.id;
    const targetCls = classes.find((c) => c.id === cId);
    if (!targetCls) {
      alert('Vui lòng chọn một lớp cụ thể để xuất Sổ chấm cơm!');
      return;
    }

    const targetCampus = campuses.find((cmp) => cmp.id === targetCls.campus_id);
    setIsExportingBoarding(true);
    setBoardingExportMessage(null);
    try {
      await exportMonthlyBoardingExcel({
        classId: targetCls.id,
        className: targetCls.class_name,
        campusName: targetCampus?.name || 'Suối Lư',
        schoolName: settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG',
        monthStr: selectedMonth,
        students,
        teacherName: resolveTeacherName(targetCls.class_name, currentUser?.full_name),
        principalName: settings?.principal_name || 'Hiệu trưởng',
      });
      const [y, m] = selectedMonth.split('-');
      setBoardingExportMessage(`Đã xuất file Excel Sổ Chấm Cơm Lớp ${targetCls.class_name} Tháng ${m}/${y} thành công!`);
      setTimeout(() => setBoardingExportMessage(null), 4000);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Có lỗi khi xuất biểu mẫu ăn bán trú!');
    } finally {
      setIsExportingBoarding(false);
    }
  };

  // Tên tháng tiếng Việt
  const [yearStr, monthStr] = selectedMonth.split('-');
  const displayTitle = viewMode === 'class_detail' && currentClassObj
    ? `BÁO CÁO TỔNG HỢP SĨ SỐ HỌC SINH THÁNG ${parseInt(monthStr, 10)} NĂM ${yearStr}`
    : `BÁO CÁO TỔNG HỢP SĨ SỐ HỌC SINH THÁNG ${parseInt(monthStr, 10)} NĂM ${yearStr} (TẤT CẢ CÁC LỚP)`;

  const formattedSchoolName = (settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG').toUpperCase();
  const campusName = campuses.find((c) => c.id === selectedCampusId)?.name || 'Khu chính';

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {boardingExportMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{boardingExportMessage}</span>
        </div>
      )}

      {/* Top Bar with Controls (Ẩn khi in ấn) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col gap-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              BÁO CÁO TỔNG HỢP SĨ SỐ THEO THÁNG
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Thống kê chuyên cần và tổng hợp biểu mẫu báo cáo sĩ số chuẩn (13 cột) của từng lớp hoặc toàn trường y như hình gốc
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => {
                setViewMode('all_classes_summary');
                setSelectedClassFilter('all');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'all_classes_summary'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>TỔNG HỢP TẤT CẢ LỚP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('class_detail');
                if (selectedClassFilter === 'all') {
                  const firstCls = displayClasses[0]?.id || classes[0]?.id || '';
                  setSelectedClassFilter(firstCls);
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'class_detail'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>CHI TIẾT THEO NGÀY CỦA LỚP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('boarding_sheet');
                if (selectedClassFilter === 'all') {
                  const firstCls = displayClasses[0]?.id || classes[0]?.id || '';
                  setSelectedClassFilter(firstCls);
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'boarding_sheet'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>SỔ CHẤM CƠM BÁN TRÚ</span>
            </button>
          </div>
        </div>

        {/* Filter and Actions line */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <CampusSelector selectedCampusId={selectedCampusId} onChange={setSelectedCampusId} />

            {/* Chọn Tháng */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-bold text-slate-700">Tháng:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent border-0 focus:outline-hidden cursor-pointer"
              />
            </div>

            {/* Chọn lớp */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <label className="text-xs font-bold text-slate-700">Lớp:</label>
              <select
                value={selectedClassFilter}
                onChange={(e) => handleSelectClass(e.target.value)}
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

            {/* Tùy chọn lọc: Chỉ hiện các ngày đã nộp báo cáo (khi xem chi tiết lớp) */}
            {viewMode === 'class_detail' && (
              <button
                type="button"
                onClick={() => setOnlyReportedDays(!onlyReportedDays)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  onlyReportedDays
                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                    : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
                title="Bật/Tắt hiển thị chỉ các ngày đã nộp báo cáo sĩ số trong tháng"
              >
                <Check className={`w-3.5 h-3.5 ${onlyReportedDays ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{onlyReportedDays ? 'Chỉ ngày đã nộp' : 'Tất cả các ngày (01 - 31)'}</span>
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Nút In Báo Cáo A4 Landscape */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
              title="In biểu mẫu báo cáo sĩ số chuẩn ra giấy A4 nằm ngang y hệt hình gốc"
            >
              <Printer className="w-4 h-4" />
              <span>IN BÁO CÁO</span>
            </button>

            {/* Nút Xuất Excel Biểu mẫu Sĩ số chuẩn 13 cột */}
            <button
              type="button"
              onClick={handleExportStandardMonthlyExcel}
              disabled={isExportingStandard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
              title="Xuất file Excel đúng biểu mẫu 13 cột quy định (Quốc hiệu tiêu ngữ, Báo cáo sĩ số học sinh, chữ ký)"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>
                {isExportingStandard
                  ? 'ĐANG XUẤT...'
                  : selectedClassFilter === 'all'
                  ? 'XUẤT EXCEL (TẤT CẢ LỚP)'
                  : `XUẤT EXCEL (LỚP ${currentClassObj?.class_name})`}
              </span>
            </button>

            {/* Nút Xuất Excel Sổ Chấm Cơm Bán Trú Tháng */}
            {(selectedClassFilter !== 'all' || (isGVCN && assignedClass)) && (
              <button
                type="button"
                onClick={() => handleExportBoardingForGVCN()}
                disabled={isExportingBoarding}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                title={`Xuất Excel Sổ chấm cơm và biểu tổng hợp ăn bán trú Tháng ${selectedMonth}`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {isExportingBoarding
                    ? 'Đang xuất...'
                    : `Sổ Chấm Cơm Lớp ${currentClassObj?.class_name || assignedClass?.class_name}`}
                </span>
                <Download className="w-3.5 h-3.5 ml-0.5" />
              </button>
            )}

            {/* Nút Bảng Vàng Thi Đua */}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('/reports/ranking')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors cursor-pointer"
                title="Xem xếp hạng và vinh danh lớp duy trì sĩ số tốt nhất"
              >
                <Trophy className="w-4 h-4 text-amber-600" />
                <span>Bảng vàng thi đua</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Monthly KPI Stats Cards (Ẩn khi in ấn) */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 no-print">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ngày đã báo cáo</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {viewMode === 'class_detail' && monthlyClassData
                ? monthlyClassData.summary.totalDaysReported
                : stats.totalDaysReported}{' '}
              <span className="text-xs text-slate-500 font-normal">ngày</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Trong tháng {parseInt(monthStr, 10)}/{yearStr}</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tổng lượt vắng</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-600">
              {viewMode === 'class_detail' && monthlyClassData
                ? monthlyClassData.summary.sumAbsentAll
                : stats.totalAbsentAccumulated}{' '}
              <span className="text-xs text-slate-500 font-normal">lượt</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Tích lũy các ngày học</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tỷ lệ vắng TB</span>
              <span className="text-xs font-bold text-amber-600">%</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {(viewMode === 'class_detail' && monthlyClassData
                ? monthlyClassData.summary.avgAbsentRate
                : stats.avgAbsentRate
              ).toFixed(2)}
              %
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Chuyên cần:{' '}
              {(
                100 -
                (viewMode === 'class_detail' && monthlyClassData
                  ? monthlyClassData.summary.avgAbsentRate
                  : stats.avgAbsentRate)
              ).toFixed(2)}
              %
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Chuyên cần cao nhất</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-bold text-emerald-700 truncate">
              {stats.lowestAbsentClass ? stats.lowestAbsentClass.className : (currentClassObj ? `Lớp ${currentClassObj.class_name}` : '---')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.lowestAbsentClass ? `Vắng ${(stats.lowestAbsentClass.rate || 0).toFixed(2)}%` : 'Chưa có số liệu'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Vắng nhiều nhất</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-bold text-amber-700 truncate">
              {stats.highestAbsentClass ? stats.highestAbsentClass.className : (currentClassObj ? `Lớp ${currentClassObj.class_name}` : '---')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.highestAbsentClass ? `Vắng ${(stats.highestAbsentClass.rate || 0).toFixed(2)}%` : 'Chưa có số liệu'}
            </div>
          </div>
        </div>
      )}

      {/* Khi chọn xem Sổ chấm cơm bán trú */}
      {viewMode === 'boarding_sheet' && (
        <MonthlyBoardingSheet
          selectedClassId={selectedClassFilter !== 'all' ? selectedClassFilter : (assignedClass?.id || displayClasses[0]?.id || '')}
          onClassChange={(cid) => handleSelectClass(cid)}
        />
      )}

      {/* Main Document Layout - Đúng 100% chuẩn biểu mẫu gốc 13 cột (Ẩn khi xem Sổ chấm cơm bán trú) */}
      {viewMode !== 'boarding_sheet' && (
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
                PHÂN HIỆU: {campusName}
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
          {viewMode === 'class_detail' && currentClassObj && (
            <div className="text-xs sm:text-sm font-bold text-slate-800 font-serif mt-1.5 uppercase">
              LỚP: {currentClassObj.class_name} &nbsp;&nbsp;|&nbsp;&nbsp; GIÁO VIÊN CHỦ NHIỆM:{' '}
              {resolveTeacherName(currentClassObj.class_name, monthlyClassData?.teacher?.full_name).toUpperCase()}
            </div>
          )}
          {viewMode === 'all_classes_summary' && (
            <div className="text-xs sm:text-sm font-bold text-slate-800 font-serif mt-1.5 uppercase">
              TỔNG HỢP {displayClasses.length} LỚP &nbsp;&nbsp;|&nbsp;&nbsp; PHÂN HIỆU:{' '}
              {selectedCampusId !== 'all' ? campusName.toUpperCase() : 'TOÀN TRƯỜNG'}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Đang tải và tổng hợp dữ liệu tháng...</div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table with Full Solid Borders (Đúng chuẩn 13 cột theo hình gốc) */}
            <table className="w-full border-collapse border-2 border-black text-xs font-serif">
              <thead>
                {/* Header Row 1 */}
                <tr className="bg-slate-50 text-black font-bold text-center">
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-16">
                    {viewMode === 'class_detail' ? 'Ngày' : 'Lớp'}
                  </th>
                  <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[150px] text-center">
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
                    {viewMode === 'class_detail' ? 'Tên học sinh nghỉ' : 'Tình hình nộp báo cáo'}
                  </th>
                  <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[130px] text-center">
                    Địa chỉ
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-24 text-center">
                    Tỉ lệ phần trăm vắng (%)
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-28 text-center">
                    Tỉ lệ phần trăm chuyên cần (%)
                  </th>
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
                {/* TRƯỜNG HỢP 1: XEM CHI TIẾT THEO CÁC NGÀY TRONG THÁNG CỦA LỚP */}
                {viewMode === 'class_detail' && (
                  <>
                    {displayMonthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="border border-black py-8 text-center text-slate-400 text-xs">
                          Chưa có báo cáo sĩ số nào của Lớp {currentClassObj?.class_name} trong tháng {monthStr}/{yearStr}.
                        </td>
                      </tr>
                    ) : (
                      displayMonthlyRows.map((r) => (
                        <tr key={r.date} className="text-center hover:bg-slate-50/70">
                          {/* 1. Ngày */}
                          <td className="border border-black py-1.5 px-2 font-bold text-black text-center whitespace-nowrap">
                            {r.dayLabel}
                          </td>

                          {/* 2. Giáo viên chủ nhiệm */}
                          <td className="border border-black py-1.5 px-2.5 text-left text-black font-medium">
                            {resolveTeacherName(currentClassObj?.class_name, r.teacherName || monthlyClassData?.teacher?.full_name)}
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
                            {getRowDisplayAddress(r, monthlyClassData?.classItem?.id)}
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
                      ))
                    )}

                    {/* Summary Row Theo Tháng của Lớp */}
                    {monthlyClassData && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-black">
                        <td colSpan={2} className="border border-black py-2 px-2 text-center text-xs font-black">
                          TỔNG CỘNG / TRUNG BÌNH THÁNG
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {monthlyClassData.summary.totalDaysReported > 0
                            ? Math.round(monthlyClassData.summary.sumTotalAll / monthlyClassData.summary.totalDaysReported)
                            : '-'}
                        </td>
                        <td
                          className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                            monthlyClassData.summary.sumAbsentAll > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {monthlyClassData.summary.totalDaysReported > 0 ? monthlyClassData.summary.sumAbsentAll : '-'}
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {monthlyClassData.summary.totalDaysReported > 0
                            ? Math.round(monthlyClassData.summary.sumTotalBoarding / monthlyClassData.summary.totalDaysReported)
                            : '-'}
                        </td>
                        <td
                          className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                            monthlyClassData.summary.sumAbsentBoarding > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {monthlyClassData.summary.totalDaysReported > 0 ? monthlyClassData.summary.sumAbsentBoarding : '-'}
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-blue-900 bg-blue-100/70 text-center">
                          {monthlyClassData.summary.totalDaysReported > 0 ? monthlyClassData.summary.sumBaoAnBoarding : '-'}
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {monthlyClassData.summary.totalDaysReported > 0
                            ? Math.round(monthlyClassData.summary.sumTotalNgoaiTru / monthlyClassData.summary.totalDaysReported)
                            : '-'}
                        </td>
                        <td
                          className={`border border-black py-2 px-1 text-xs font-bold text-center ${
                            monthlyClassData.summary.sumAbsentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {monthlyClassData.summary.totalDaysReported > 0 ? monthlyClassData.summary.sumAbsentNgoaiTru : '-'}
                        </td>
                        <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                          Đã nộp: {monthlyClassData.summary.totalDaysReported}/{monthlyClassData.rows.length} ngày
                        </td>
                        <td className="border border-black py-2 px-2 text-center text-[11px] font-semibold text-slate-700">
                          -
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {monthlyClassData.summary.avgAbsentRate.toFixed(2).replace('.', ',')}%
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {monthlyClassData.summary.avgPresentRate.toFixed(2).replace('.', ',')}%
                        </td>
                      </tr>
                    )}
                  </>
                )}

                {/* TRƯỜNG HỢP 2: BẢNG TỔNG HỢP TẤT CẢ CÁC LỚP TRONG THÁNG (Mỗi dòng là 1 lớp học) */}
                {viewMode === 'all_classes_summary' && (
                  <>
                    {!allClassesData || allClassesData.summaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="border border-black py-8 text-center text-slate-400 text-xs">
                          Chưa có dữ liệu tổng hợp tháng {monthStr}/{yearStr}.
                        </td>
                      </tr>
                    ) : (
                      allClassesData.summaryRows.map((r) => (
                        <tr
                          key={r.classId}
                          onClick={() => handleSelectClass(r.classId)}
                          className="text-center hover:bg-blue-50/50 cursor-pointer transition-colors"
                          title={`Bấm để xem chi tiết từng ngày của Lớp ${r.className}`}
                        >
                          {/* 1. Lớp */}
                          <td className="border border-black py-2 px-2 font-bold text-black text-center">
                            {r.className}
                          </td>

                          {/* 2. Giáo viên chủ nhiệm */}
                          <td className="border border-black py-2 px-2.5 text-left text-black font-medium">
                            {r.teacherName}
                          </td>

                          {/* 3. Tổng sĩ số */}
                          <td className="border border-black py-2 px-1 font-medium text-center">
                            {r.totalAll}
                          </td>

                          {/* 4. Tổng lượt vắng */}
                          <td
                            className={`border border-black py-2 px-1 font-bold text-center ${
                              r.absentAll > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {r.isReported ? r.absentAll : '-'}
                          </td>

                          {/* 5. Bán trú tổng */}
                          <td className="border border-black py-2 px-1 font-medium text-center">
                            {r.totalBoarding}
                          </td>

                          {/* 6. Bán trú vắng */}
                          <td
                            className={`border border-black py-2 px-1 font-bold text-center ${
                              r.absentBoarding > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {r.isReported ? r.absentBoarding : '-'}
                          </td>

                          {/* 7. Suất ăn bán trú */}
                          <td className="border border-black py-2 px-1 font-bold text-center text-blue-900 bg-blue-50/40">
                            {r.isReported ? r.baoAnBoarding : '-'}
                          </td>

                          {/* 8. Ngoại trú tổng */}
                          <td className="border border-black py-2 px-1 font-medium text-center">
                            {r.totalNgoaiTru}
                          </td>

                          {/* 9. Ngoại trú vắng */}
                          <td
                            className={`border border-black py-2 px-1 font-bold text-center ${
                              r.absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                            }`}
                          >
                            {r.isReported ? r.absentNgoaiTru : '-'}
                          </td>

                          {/* 10. Tình hình nộp báo cáo */}
                          <td className="border border-black py-2 px-2.5 text-left text-[11px] text-black">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.isReported
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {r.studentNames}
                            </span>
                          </td>

                          {/* 11. Địa chỉ */}
                          <td className="border border-black py-2 px-2 text-center text-[11px] text-slate-400">
                            -
                          </td>

                          {/* 12. % Vắng TB */}
                          <td className="border border-black py-2 px-1 font-bold text-center text-black">
                            {r.isReported ? `${r.absentRate.toFixed(2).replace('.', ',')}%` : '-'}
                          </td>

                          {/* 13. % Chuyên cần TB */}
                          <td className="border border-black py-2 px-1 font-bold text-center text-emerald-800">
                            {r.isReported ? `${r.presentRate.toFixed(2).replace('.', ',')}%` : '-'}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Summary Row Cho Toàn Trường / Toàn Phân Hiệu */}
                    {allClassesData && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-black">
                        <td colSpan={2} className="border border-black py-2.5 px-2 text-center text-xs font-black">
                          TỔNG CỘNG TOÀN {selectedCampusId !== 'all' ? campusName.toUpperCase() : 'TRƯỜNG'}
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-black text-center">
                          {allClassesData.totals.totalAll}
                        </td>
                        <td
                          className={`border border-black py-2.5 px-1 text-xs font-bold text-center ${
                            allClassesData.totals.absentAll > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {allClassesData.totals.absentAll}
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-black text-center">
                          {allClassesData.totals.totalBoarding}
                        </td>
                        <td
                          className={`border border-black py-2.5 px-1 text-xs font-bold text-center ${
                            allClassesData.totals.absentBoarding > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {allClassesData.totals.absentBoarding}
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-blue-900 bg-blue-100/70 text-center">
                          {allClassesData.totals.baoAnBoarding}
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-black text-center">
                          {allClassesData.totals.totalNgoaiTru}
                        </td>
                        <td
                          className={`border border-black py-2.5 px-1 text-xs font-bold text-center ${
                            allClassesData.totals.absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                          }`}
                        >
                          {allClassesData.totals.absentNgoaiTru}
                        </td>
                        <td className="border border-black py-2.5 px-2 text-left text-[11px] font-semibold text-slate-700">
                          Đã báo cáo: {allClassesData.totals.reportedClassesCount}/{allClassesData.totals.totalClassesCount} lớp
                        </td>
                        <td className="border border-black py-2.5 px-2 text-center text-[11px] font-semibold text-slate-700">
                          -
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-black text-center">
                          {allClassesData.totals.avgAbsentRate.toFixed(2).replace('.', ',')}%
                        </td>
                        <td className="border border-black py-2.5 px-1 text-xs font-bold text-emerald-800 text-center">
                          {allClassesData.totals.avgPresentRate.toFixed(2).replace('.', ',')}%
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info & Signatures (Chuẩn 100% hình gốc) */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center font-serif text-black print-break-inside-avoid">
          <div>
            <div className="text-xs uppercase font-bold">
              {viewMode === 'class_detail' && currentClassObj
                ? 'GIÁO VIÊN CHỦ NHIỆM'
                : signatureSettings.reporter_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">
              {viewMode === 'class_detail' && currentClassObj
                ? resolveTeacherName(currentClassObj.class_name, monthlyClassData?.teacher?.full_name)
                : signatureSettings.reporter_name}
            </div>
          </div>

          <div>
            <div className="text-xs italic text-slate-700 mb-1">
              Tháng {parseInt(monthStr, 10)} năm {yearStr}
            </div>
            <div className="text-xs uppercase font-bold">{signatureSettings.principal_title}</div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.principal_name}</div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
