import React, { useState, useEffect, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { CampusSelector } from '../components/CampusSelector';
import { ClassItem } from '../types';
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
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Trophy,
  Utensils,
  CheckCircle2,
  Filter,
  Eye,
} from 'lucide-react';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';

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

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });

  // Bộ lọc Lớp: 'all' hoặc ID lớp cụ thể
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    return 'all';
  });

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

  const displayClasses = useMemo(() => {
    let list = classes.filter((c) => c.active);
    if (selectedCampusId !== 'all') {
      list = list.filter((c) => c.campus_id === selectedCampusId);
    }
    return list;
  }, [classes, selectedCampusId]);

  useEffect(() => {
    setLoading(true);
    StorageService.getMonthlyAggregate(selectedMonth, selectedCampusId)
      .then((data) => setStats(data))
      .finally(() => setLoading(false));
  }, [selectedMonth, selectedCampusId]);

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

  // Xuất file Excel chuẩn 13 cột theo đúng bảng quy định
  const handleExportStandardMonthlyExcel = async () => {
    setIsExportingStandard(true);
    try {
      const targetCampus = campuses.find((c) => c.id === selectedCampusId);
      const campusName = targetCampus?.name || (selectedCampusId !== 'all' ? selectedCampusId : undefined);

      if (selectedClassFilter !== 'all') {
        // Xuất cho 1 lớp cụ thể theo các ngày trong tháng (Chuẩn 13 cột)
        const targetClass = classes.find((c) => c.id === selectedClassFilter);
        if (!targetClass) {
          alert('Không tìm thấy lớp học!');
          return;
        }

        const classData = await StorageService.getClassMonthlyAttendance(targetClass.id, selectedMonth);
        await exportAttendanceMonthlyClassExcel({
          settings,
          campusName,
          yearMonth: selectedMonth,
          classItem: targetClass,
          teacherName: resolveTeacherName(targetClass.class_name, classData.teacher?.full_name),
          rows: classData.rows,
          signatureSettings,
        });

        setBoardingExportMessage(`Đã xuất thành công biểu mẫu Báo cáo sĩ số Lớp ${targetClass.class_name} Tháng ${selectedMonth}!`);
        setTimeout(() => setBoardingExportMessage(null), 4000);
      } else {
        // Xuất cho TẤT CẢ các lớp trong tháng (Sheet Tổng hợp + Sheet từng lớp chi tiết)
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

          const clsTotal = students.filter((s) => s.class_id === cls.id).length || 35;
          const clsBoarding = students.filter((s) => s.class_id === cls.id && s.isBoarding !== false).length || Math.min(25, clsTotal);
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

        await exportAttendanceMonthlyAllClassesExcel({
          settings,
          campusName,
          yearMonth: selectedMonth,
          summaryRows,
          classesDayRows,
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
    const cId = targetClassId || assignedClass?.id;
    const targetCls = classes.find((c) => c.id === cId);
    if (!targetCls) {
      alert('Không tìm thấy lớp học!');
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
        teacherName: currentUser?.full_name || 'GVCN Lớp ' + targetCls.class_name,
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

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {boardingExportMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{boardingExportMessage}</span>
        </div>
      )}

      {/* Top Bar with Controls */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            BÁO CÁO TỔNG HỢP SĨ SỐ THEO THÁNG
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thống kê chuyên cần và xuất biểu mẫu báo cáo sĩ số chuẩn (13 cột) của từng lớp hoặc toàn trường
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <CampusSelector selectedCampusId={selectedCampusId} onChange={setSelectedCampusId} />

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

          {/* Chọn lớp để xuất */}
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
                ? 'XUẤT EXCEL CHUẨN (TẤT CẢ LỚP)'
                : `XUẤT EXCEL CHUẨN (LỚP ${classes.find((c) => c.id === selectedClassFilter)?.class_name})`}
            </span>
          </button>

          {/* Nút Xem Biểu mẫu Chi tiết */}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/reports/daily')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
              title="Mở Biểu mẫu Báo cáo sĩ số học sinh trực quan để xem bảng 13 cột theo ngày hoặc theo tháng"
            >
              <Eye className="w-4 h-4 text-blue-600" />
              <span>XEM BIỂU MẪU SĨ SỐ</span>
            </button>
          )}

          {/* Nút Xuất Excel Sổ Chấm Cơm Bán Trú Tháng dành cho GVCN */}
          {isGVCN && assignedClass ? (
            <button
              type="button"
              onClick={() => handleExportBoardingForGVCN()}
              disabled={isExportingBoarding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title={`Xuất Excel Sổ chấm cơm và biểu tổng hợp các ngày ăn bán trú Tháng ${selectedMonth} của Lớp ${assignedClass.class_name}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isExportingBoarding ? 'Đang xuất...' : `Sổ Chấm Cơm Lớp ${assignedClass.class_name}`}</span>
              <Download className="w-3.5 h-3.5 ml-0.5" />
            </button>
          ) : (
            onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('/reports/boarding-monthly')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
                title="Xem và xuất Sổ chấm cơm tháng tất cả các lớp"
              >
                <Utensils className="w-4 h-4 text-slate-600" />
                <span>Sổ chấm cơm</span>
              </button>
            )
          )}

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

      {/* Monthly KPI Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ngày đã báo cáo</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {stats.totalDaysReported} <span className="text-xs text-slate-500 font-normal">ngày</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Trong tháng {selectedMonth.split('-')[1]}</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tổng lượt vắng</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-600">
              {stats.totalAbsentAccumulated} <span className="text-xs text-slate-500 font-normal">lượt</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Tích lũy các ngày học</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tỷ lệ vắng TB</span>
              <span className="text-xs font-bold text-amber-600">%</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {stats.avgAbsentRate.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Chuyên cần: {(100 - stats.avgAbsentRate).toFixed(2)}%
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Chuyên cần cao nhất</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-bold text-emerald-700 truncate">
              {stats.lowestAbsentClass ? stats.lowestAbsentClass.className : '---'}
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
              {stats.highestAbsentClass ? stats.highestAbsentClass.className : '---'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.highestAbsentClass ? `Vắng ${(stats.highestAbsentClass.rate || 0).toFixed(2)}%` : 'Chưa có số liệu'}
            </div>
          </div>
        </div>
      )}

      {/* Main Table: Day by Day aggregate */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Chi tiết sĩ số các ngày trong tháng {selectedMonth.split('-').reverse().join('/')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh sách số liệu tổng hợp từng ngày học có giáo viên nộp báo cáo
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Đang tải dữ liệu tổng hợp tháng...</div>
        ) : !stats || stats.dayStats.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Chưa có báo cáo sĩ số nào trong tháng {selectedMonth}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4">Ngày</th>
                  <th className="py-3 px-4 text-center">Số lớp đã báo cáo</th>
                  <th className="py-3 px-4 text-center">Tổng sĩ số</th>
                  <th className="py-3 px-4 text-center">Có mặt</th>
                  <th className="py-3 px-4 text-center">Vắng</th>
                  <th className="py-3 px-4 text-center">Tỷ lệ vắng</th>
                  <th className="py-3 px-4 text-center">Tỷ lệ chuyên cần</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.dayStats.map((d, index) => {
                  const present = d.totalStudents - d.absentStudents;
                  const presentRate = d.totalStudents > 0 ? (present / d.totalStudents) * 100 : 0;
                  return (
                    <tr key={d.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center text-slate-400">{index + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {d.date.split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {d.reportedCount} lớp
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">{d.totalStudents}</td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-700">{present}</td>
                      <td className="py-3 px-4 text-center font-bold text-rose-600">
                        {d.absentStudents > 0 ? d.absentStudents : '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {d.rate.toFixed(2).replace('.', ',')}%
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-700">
                        {presentRate.toFixed(2).replace('.', ',')}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
