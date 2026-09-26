import React, { useState, useEffect, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { ClassReportRow, ReportStatus, ClassAttendanceRank } from '../types';
import { DateNavigator } from '../components/DateNavigator';
import { CampusSelector } from '../components/CampusSelector';
import {
  Users,
  CheckCircle,
  AlertCircle,
  Clock,
  Lock,
  Unlock,
  Building2,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  TrendingDown,
  Sparkles,
  Bed,
  Layers,
  GraduationCap,
  ArrowRight,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Trophy,
  Award,
  RotateCcw,
  BellRing,
  ExternalLink,
  Globe,
  FileCheck2,
  School,
  Code2,
  Phone,
  BarChart3,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Utensils,
  Home,
  FileText,
} from 'lucide-react';
import { formatDateVN } from '../utils/schoolWeeks';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
  onSelectClassForInput?: (classId: string, date: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onSelectClassForInput }) => {
  const { settings, classes, indicators, campuses } = useSchool();
  const { currentUser, isAdmin, isBGH, isGVCN } = useAuth();
  const { sendBGHManualReminder } = useNotifications();

  const getCampusName = (campusId?: string) => {
    if (!campusId) return 'Khu chính';
    const campus = campuses.find((c) => c.id === campusId);
    return campus ? campus.name : 'Khu chính';
  };

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [aggregateData, setAggregateData] = useState<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    unreportedClasses: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus | 'ALL'>('ALL');
  const [selectedCampus, setSelectedCampus] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showUnreportedDetail, setShowUnreportedDetail] = useState(true);
  const [myClassRanking, setMyClassRanking] = useState<ClassAttendanceRank | null>(null);
  const [resetTargetRow, setResetTargetRow] = useState<ClassReportRow | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toastNotice, setToastNotice] = useState<string>('');
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  // Active indicators sorted by sort_order
  const enabledIndicators = useMemo(() => {
    return [...indicators]
      .filter((i) => i.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  const boardingHalf = indicators.find((i) => i.code === 'BOARDING_HALF' && i.enabled);
  const nonBoarding = indicators.find((i) => (i.code === 'NON_BOARDING' || i.name.toLowerCase().includes('ngoại trú')) && i.enabled);

  const loadData = async (dateStr: string, campusId: string) => {
    try {
      const data = await StorageService.getDailyAggregate(dateStr, campusId === 'all' ? undefined : campusId);
      setAggregateData(data);
    } catch (err) {
      console.error('Failed to load daily aggregate:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMyClassRanking = async () => {
    if (isGVCN && currentUser?.assigned_class_id) {
      try {
        const rank = await StorageService.getClassAttendanceRanking(currentUser.assigned_class_id, 'WEEK');
        setMyClassRanking(rank);
      } catch (err) {
        console.error('Failed to load class ranking:', err);
      }
    }
  };

  useEffect(() => {
    loadData(selectedDate, selectedCampus);
    loadMyClassRanking();

    // Realtime subscription
    const unsub = subscribeRealtime(() => {
      loadData(selectedDate, selectedCampus);
      loadMyClassRanking();
    });

    return () => {
      unsub();
    };
  }, [selectedDate, selectedCampus, isGVCN, currentUser?.assigned_class_id]);

  const handleSendManualReminders = async () => {
    setIsSendingReminders(true);
    try {
      const res = await sendBGHManualReminder(selectedDate);
      if (res.sentCount > 0) {
        setToastNotice(`🔔 Đã gửi thông báo nhắc nhở đến ${res.sentCount} GVCN các lớp: ${res.remindedClasses.join(', ')}!`);
      } else if (res.remindedClasses.length === 0 && res.skippedClasses.length > 0) {
        setToastNotice(`Các lớp chưa nộp (${res.skippedClasses.join(', ')}) hiện chưa có tài khoản GVCN.`);
      } else {
        setToastNotice(`Tất cả GVCN của các lớp chưa nộp đều đã nhận thông báo nhắc nhở.`);
      }
      setTimeout(() => setToastNotice(''), 6000);
    } catch (err) {
      console.error('Error sending manual reminders:', err);
    } finally {
      setIsSendingReminders(false);
    }
  };

  const handleToggleLock = async (e: React.MouseEvent, row: ClassReportRow) => {
    e.stopPropagation();
    if (!isAdmin || !row.report) return;
    const newLockState = row.report.status !== 'LOCKED';
    await StorageService.lockReport(row.report.id, newLockState, currentUser!);
    await loadData(selectedDate, selectedCampus);
  };

  const handleLockAll = async () => {
    if (!isAdmin) return;
    const formattedDate = selectedDate.split('-').reverse().join('/');
    const campusLabel = selectedCampus === 'all' ? 'toàn trường' : getCampusName(selectedCampus);
    if (window.confirm(`Bạn có chắc muốn khóa tất cả các lớp (${campusLabel}) ngày ${formattedDate}?`)) {
      await StorageService.lockAllReportsForDate(selectedDate, true, currentUser!, selectedCampus);
      await loadData(selectedDate, selectedCampus);
    }
  };

  const handleUnlockAll = async () => {
    if (!isAdmin) return;
    const formattedDate = selectedDate.split('-').reverse().join('/');
    const campusLabel = selectedCampus === 'all' ? 'toàn trường' : getCampusName(selectedCampus);
    if (window.confirm(`Bạn có chắc muốn mở khóa tất cả các lớp (${campusLabel}) ngày ${formattedDate}?`)) {
      await StorageService.lockAllReportsForDate(selectedDate, false, currentUser!, selectedCampus);
      await loadData(selectedDate, selectedCampus);
    }
  };

  const handlePromptReset = (e: React.MouseEvent, row: ClassReportRow) => {
    e.stopPropagation();
    setResetTargetRow(row);
  };

  const handleConfirmReset = async () => {
    if (!resetTargetRow || !currentUser) return;
    setIsResetting(true);
    try {
      const ok = await StorageService.deleteDailyReport(resetTargetRow.classItem.id, selectedDate, currentUser);
      if (ok) {
        setToastNotice(`Đã đặt lại trạng thái báo cáo lớp ${resetTargetRow.classItem.class_name} về Chưa báo cáo!`);
        setTimeout(() => setToastNotice(''), 5000);
        setResetTargetRow(null);
        await loadData(selectedDate, selectedCampus);
      }
    } catch (err) {
      console.error('Reset report error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!aggregateData) return [];
    return aggregateData.rows.filter((r) => {
      if (selectedGrade !== 'ALL' && r.classItem.grade !== selectedGrade) return false;
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
      if (selectedCampus !== 'all' && r.classItem.campus_id !== selectedCampus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchClass = r.classItem.class_name.toLowerCase().includes(q);
        const matchTeacher = r.teacher?.full_name?.toLowerCase().includes(q);
        if (!matchClass && !matchTeacher) return false;
      }
      return true;
    });
  }, [aggregateData, selectedGrade, selectedStatus, selectedCampus, searchQuery]);

  // Unreported rows
  const unreportedRows = useMemo(() => {
    if (!aggregateData) return [];
    return aggregateData.rows.filter((r) => r.status === 'NOT_REPORTED');
  }, [aggregateData]);

  // Reported rows
  const reportedRows = useMemo(() => {
    if (!aggregateData) return [];
    return aggregateData.rows.filter((r) => r.status === 'REPORTED' || r.status === 'LOCKED');
  }, [aggregateData]);

  const reportingRate = aggregateData
    ? Math.round((aggregateData.reportedClasses / (aggregateData.totalClasses || 1)) * 100)
    : 0;

  // Grade-by-grade stats for visualization
  const gradeStats = useMemo(() => {
    if (!aggregateData) return [];
    const grades = [6, 7, 8, 9];
    return grades.map((g) => {
      const gradeRows = aggregateData.rows.filter((r) => r.classItem.grade === g);
      const totalClasses = gradeRows.length;
      const reportedClasses = gradeRows.filter((r) => r.status === 'REPORTED' || r.status === 'LOCKED').length;
      let totalStudents = 0;
      let presentStudents = 0;
      let absentStudents = 0;

      gradeRows.forEach((r) => {
        const firstInd = enabledIndicators[0]?.id;
        if (firstInd && r.values[firstInd]) {
          totalStudents += r.values[firstInd].total || 0;
          presentStudents += r.values[firstInd].present || 0;
          absentStudents += r.values[firstInd].absent || 0;
        }
      });

      const rate = totalStudents > 0 ? ((presentStudents / totalStudents) * 100).toFixed(1) : '0';

      return {
        grade: g,
        totalClasses,
        reportedClasses,
        totalStudents,
        presentStudents,
        absentStudents,
        rate: Number(rate),
      };
    });
  }, [aggregateData, enabledIndicators]);

  // GVCN assigned class helper
  const myAssignedClass = useMemo(() => {
    if (!isGVCN || !currentUser?.assigned_class_id) return null;
    return classes.find((c) => c.id === currentUser.assigned_class_id) || null;
  }, [isGVCN, currentUser, classes]);

  const myAssignedClassRow = useMemo(() => {
    if (!myAssignedClass || !aggregateData) return null;
    return aggregateData.rows.find((r) => r.classItem.id === myAssignedClass.id) || null;
  }, [myAssignedClass, aggregateData]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {toastNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-200 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed font-medium">{toastNotice}</div>
          <button
            onClick={() => setToastNotice('')}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 1. TOP WELCOME & DATE HEADER (Clean Modern Educational Dashboard) */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 rounded-lg">
                {currentUser?.role === 'ADMIN'
                  ? 'Quản trị viên'
                  : currentUser?.role === 'BGH'
                  ? 'Ban Giám Hiệu'
                  : myAssignedClass
                  ? `GVCN Lớp ${myAssignedClass.class_name}`
                  : 'Giáo viên'}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 font-semibold">
                {settings?.school_name || 'Trường PTDTBT THCS Xa Dung'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5 uppercase">
              XIN CHÀO, {currentUser?.full_name?.toUpperCase() || 'THẦY/CÔ'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
              Hôm nay, {formatDateVN(selectedDate)}
            </p>
          </div>

          {/* Controls: Campus, Date picker & Quick Reports */}
          <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <CampusSelector selectedCampusId={selectedCampus} onChange={setSelectedCampus} />
            <DateNavigator selectedDate={selectedDate} onChangeDate={setSelectedDate} />

            <button
              type="button"
              onClick={() => onNavigate('/reports/daily')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer shrink-0"
              title="Xem mẫu biểu báo cáo xuất excel / in ấn"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Biểu mẫu</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. FOUR BIG PRIMARY STAT CARDS (Specification 4: 👨‍🎓 TỔNG SỐ, 🟢 CÓ MẶT, 🔴 VẮNG, 📊 TỶ LỆ CHUYÊN CẦN) */}
      {aggregateData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Stat 1: TỔNG SỐ HỌC SINH */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                👨‍🎓 TỔNG SỐ HỌC SINH
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                {aggregateData.overallSchool.total}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">
                Toàn trường ({aggregateData.totalClasses} lớp)
              </div>
            </div>
          </div>

          {/* Stat 2: CÓ MẶT */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200/90 shadow-xs flex flex-col justify-between transition-all hover:shadow-md bg-gradient-to-b from-white to-emerald-50/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                🟢 CÓ MẶT
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight tabular-nums">
                {aggregateData.overallSchool.present}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-1">
                Chiếm {aggregateData.overallSchool.presentRate}% sĩ số
              </div>
            </div>
          </div>

          {/* Stat 3: VẮNG */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-rose-200/90 shadow-xs flex flex-col justify-between transition-all hover:shadow-md bg-gradient-to-b from-white to-rose-50/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-800">
                🔴 VẮNG
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight tabular-nums">
                {aggregateData.overallSchool.absent}
              </div>
              <div className="text-[11px] text-rose-600 font-medium mt-1">
                Tỷ lệ vắng {aggregateData.overallSchool.rate}%
              </div>
            </div>
          </div>

          {/* Stat 4: TỶ LỆ CHUYÊN CẦN */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-indigo-200/90 shadow-xs flex flex-col justify-between transition-all hover:shadow-md bg-gradient-to-b from-white to-indigo-50/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-900">
                📊 TỶ LỆ CHUYÊN CẦN
              </span>
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <TrendingDown className="w-4 h-4 rotate-180" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="text-2xl sm:text-3xl font-black text-indigo-900 tracking-tight tabular-nums">
                {aggregateData.overallSchool.presentRate}%
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${aggregateData.overallSchool.presentRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECONDARY MEAL STATS (Bán trú ăn tại trường / Ngoại trú) */}
      {aggregateData && (boardingHalf || nonBoarding) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boardingHalf && aggregateData.totals[boardingHalf.id] && (
            <div className="bg-white rounded-xl p-3.5 border border-teal-200 bg-teal-50/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-teal-900 uppercase">
                    🍱 Ăn bán trú tại trường
                  </div>
                  <div className="text-xs text-slate-500">
                    Báo ăn: <strong className="text-teal-800 font-bold">{aggregateData.totals[boardingHalf.id].present}</strong> / {aggregateData.totals[boardingHalf.id].total} học sinh
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-teal-800 tabular-nums">
                  {aggregateData.totals[boardingHalf.id].present}
                </span>
                <span className="text-[10px] text-teal-600 block">suất ăn trưa</span>
              </div>
            </div>
          )}

          {nonBoarding && aggregateData.totals[nonBoarding.id] && (
            <div className="bg-white rounded-xl p-3.5 border border-amber-200 bg-amber-50/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Home className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-amber-900 uppercase">
                    🏡 Học sinh ngoại trú
                  </div>
                  <div className="text-xs text-slate-500">
                    Có mặt: <strong className="text-amber-800 font-bold">{aggregateData.totals[nonBoarding.id].present}</strong> / {aggregateData.totals[nonBoarding.id].total} học sinh
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-amber-800 tabular-nums">
                  {aggregateData.totals[nonBoarding.id].present}
                </span>
                <span className="text-[10px] text-amber-600 block">học sinh</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl p-3.5 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-800 uppercase">
                  Tiến độ nộp báo cáo
                </div>
                <div className="text-xs text-slate-500">
                  {aggregateData.reportedClasses}/{aggregateData.totalClasses} lớp ({reportingRate}%)
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${
                aggregateData.unreportedClasses === 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}>
                {aggregateData.unreportedClasses === 0 ? 'Hoàn thành 100%' : `Còn ${aggregateData.unreportedClasses} lớp`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. CẢNH BÁO SĨ SỐ (Specification 5: ⚠️ CẢNH BÁO SĨ SỐ - Nổi bật, hiển thị danh sách các lớp chưa báo cáo) */}
      {aggregateData && (
        <div className={`rounded-2xl p-4 sm:p-5 border transition-all ${
          aggregateData.unreportedClasses > 0
            ? 'bg-amber-50/80 border-amber-300/80 shadow-xs'
            : 'bg-emerald-50/70 border-emerald-200 shadow-xs'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                aggregateData.unreportedClasses > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {aggregateData.unreportedClasses > 0 ? (
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <span>{aggregateData.unreportedClasses > 0 ? '⚠️ CẢNH BÁO SĨ SỐ HÔM NAY' : '✅ TÌNH HÌNH BÁO CÁO TOÀN TRƯỜNG'}</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {aggregateData.unreportedClasses > 0
                    ? `Hiện có ${aggregateData.unreportedClasses} lớp chưa hoàn thành báo cáo sĩ số cho ngày ${formatDateVN(selectedDate)}`
                    : `Tất cả ${aggregateData.totalClasses} lớp đã hoàn thành báo cáo sĩ số hôm nay.`}
                </p>
              </div>
            </div>

            {/* Alert Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {aggregateData.unreportedClasses > 0 && (isBGH || isAdmin) && (
                <button
                  type="button"
                  onClick={handleSendManualReminders}
                  disabled={isSendingReminders}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-transform active:scale-95 disabled:opacity-50"
                  title="Phát cảnh báo tức thì về tài khoản các GVCN lớp chưa nộp"
                >
                  <BellRing className="w-3.5 h-3.5 animate-bounce" />
                  <span>{isSendingReminders ? 'Đang gửi nhắc...' : `Báo về GVCN (${aggregateData.unreportedClasses})`}</span>
                </button>
              )}

              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleLockAll}
                    className="px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors shadow-2xs"
                    title="Khóa báo cáo tất cả các lớp"
                  >
                    <Lock className="w-3.5 h-3.5 inline mr-1" />
                    <span className="hidden sm:inline">Khóa tất cả</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnlockAll}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors shadow-2xs"
                    title="Mở khóa tất cả các lớp"
                  >
                    <Unlock className="w-3.5 h-3.5 inline mr-1" />
                    <span className="hidden sm:inline">Mở khóa</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowUnreportedDetail(!showUnreportedDetail)}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors shadow-2xs"
              >
                {showUnreportedDetail ? 'Thu gọn' : 'Xem chi tiết'}
              </button>
            </div>
          </div>

          {/* List of Unreported & Reported Class Status Chips */}
          {showUnreportedDetail && (
            <div className="pt-3 space-y-2">
              {aggregateData.unreportedClasses > 0 ? (
                <>
                  <div className="text-xs font-extrabold text-amber-900 uppercase">
                    Danh sách lớp chưa nộp ({unreportedRows.length} lớp):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {unreportedRows.map((r) => (
                      <div
                        key={r.classItem.id}
                        onClick={() => {
                          if (onSelectClassForInput) {
                            onSelectClassForInput(r.classItem.id, selectedDate);
                          } else {
                            onNavigate('/attendance');
                          }
                        }}
                        className="bg-white p-2.5 rounded-xl border border-rose-300 hover:border-rose-400 hover:bg-rose-50/50 shadow-2xs transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                          <div className="truncate">
                            <span className="text-xs font-black text-slate-900">
                              Lớp {r.classItem.class_name}
                            </span>
                            <span className="text-[11px] text-slate-500 ml-1.5 truncate">
                              ({r.teacher?.full_name || 'Chưa gán GVCN'})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                            Chưa báo cáo
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-2 text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tất cả các lớp đã hoàn thành báo cáo sĩ số hôm nay.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. KHU VỰC BÁO CÁO NHANH (Specification 6: 📋 BÁO CÁO SĨ SỐ HÔM NAY) */}
      {isGVCN && myAssignedClass && (
        <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white rounded-2xl p-5 shadow-sm border border-blue-600/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-blue-100">
                    BÁO CÁO SĨ SỐ HÔM NAY
                  </span>
                  <span className="text-xs font-black text-amber-300">
                    Lớp {myAssignedClass.class_name} ({getCampusName(myAssignedClass.campus_id)})
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black mt-1">
                  {myAssignedClassRow?.status === 'REPORTED' || myAssignedClassRow?.status === 'LOCKED'
                    ? 'ĐÃ GỬI BÁO CÁO SĨ SỐ'
                    : 'CHƯA GỬI BÁO CÁO SĨ SỐ'}
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  {myAssignedClassRow?.status === 'REPORTED' || myAssignedClassRow?.status === 'LOCKED' ? (
                    <span>
                      Tổng: <strong>{myAssignedClassRow.values[enabledIndicators[0]?.id]?.total || 0}</strong> học sinh |
                      Có mặt: <strong>{myAssignedClassRow.values[enabledIndicators[0]?.id]?.present || 0}</strong> |
                      Vắng: <strong>{myAssignedClassRow.values[enabledIndicators[0]?.id]?.absent || 0}</strong>
                    </span>
                  ) : (
                    'Vui lòng cập nhật số lượng học sinh có mặt, vắng và chế độ ăn trước giờ quy định.'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onSelectClassForInput) {
                  onSelectClassForInput(myAssignedClass.id, selectedDate);
                } else {
                  onNavigate('/attendance');
                }
              }}
              className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md self-stretch sm:self-auto shrink-0 cursor-pointer"
            >
              <span>{myAssignedClassRow?.status === 'REPORTED' ? '✓ XEM / CHỈNH SỬA' : '✓ GỬI BÁO CÁO NGAY'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. BẢNG DANH SÁCH LỚP (Specification 7: Bảng hiện đại với Badge trạng thái & Mobile Card view) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Controls & Filters */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <School className="w-4 h-4 text-blue-600" />
              <span>DANH SÁCH BÁO CÁO CÁC LỚP ({filteredRows.length} Lớp)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chi tiết sĩ số và tiến độ nộp báo cáo ngày {formatDateVN(selectedDate)}
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[140px] sm:min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm lớp, GVCN..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Grade filter */}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tất cả khối</option>
              <option value="6">Khối 6</option>
              <option value="7">Khối 7</option>
              <option value="8">Khối 8</option>
              <option value="9">Khối 9</option>
            </select>

            {/* Status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as ReportStatus | 'ALL')}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="REPORTED">🟢 Đã báo cáo</option>
              <option value="NOT_REPORTED">🔴 Chưa báo cáo</option>
              <option value="LOCKED">🔒 Đã khóa</option>
            </select>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider select-none">
              <tr>
                <th className="py-3 px-4">Lớp & GVCN</th>
                <th className="py-3 px-3">Điểm trường</th>
                <th className="py-3 px-3 text-center">Tổng số</th>
                <th className="py-3 px-3 text-center text-emerald-700">Có mặt</th>
                <th className="py-3 px-3 text-center text-rose-600">Vắng</th>
                <th className="py-3 px-3 text-center">Tỷ lệ</th>
                {boardingHalf && <th className="py-3 px-3 text-center text-teal-700">Bán trú</th>}
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Không tìm thấy lớp học nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const firstIndId = enabledIndicators[0]?.id;
                  const vals = firstIndId ? row.values[firstIndId] : null;
                  const total = vals?.total || 0;
                  const present = vals?.present || 0;
                  const absent = vals?.absent || 0;
                  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
                  const boardingVal = boardingHalf ? row.values[boardingHalf.id]?.present : null;

                  const isReported = row.status === 'REPORTED';
                  const isLocked = row.status === 'LOCKED';
                  const isNotReported = row.status === 'NOT_REPORTED';

                  return (
                    <tr
                      key={row.classItem.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => {
                        if (onSelectClassForInput) {
                          onSelectClassForInput(row.classItem.id, selectedDate);
                        } else {
                          onNavigate('/attendance');
                        }
                      }}
                    >
                      {/* Lớp & GVCN */}
                      <td className="py-3 px-4">
                        <div className="font-black text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                          Lớp {row.classItem.class_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                          {row.teacher?.full_name || 'Chưa phân công GVCN'}
                        </div>
                      </td>

                      {/* Điểm trường */}
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {getCampusName(row.classItem.campus_id)}
                      </td>

                      {/* Tổng số */}
                      <td className="py-3 px-3 text-center font-bold text-slate-800 tabular-nums">
                        {total}
                      </td>

                      {/* Có mặt */}
                      <td className="py-3 px-3 text-center font-bold text-emerald-700 tabular-nums">
                        {isNotReported ? '-' : present}
                      </td>

                      {/* Vắng */}
                      <td className="py-3 px-3 text-center font-bold text-rose-600 tabular-nums">
                        {isNotReported ? '-' : absent}
                      </td>

                      {/* Tỷ lệ */}
                      <td className="py-3 px-3 text-center tabular-nums">
                        {isNotReported ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className="font-extrabold text-slate-800">{rate}%</span>
                        )}
                      </td>

                      {/* Bán trú */}
                      {boardingHalf && (
                        <td className="py-3 px-3 text-center tabular-nums text-teal-800 font-bold">
                          {isNotReported || boardingVal === null || boardingVal === undefined ? '-' : boardingVal}
                        </td>
                      )}

                      {/* Trạng thái (Specification Badge) */}
                      <td className="py-3 px-3 text-center">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            <Lock className="w-3 h-3 text-slate-500" />
                            <span>Đã khóa</span>
                          </span>
                        ) : isReported ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Đã báo cáo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Chưa báo cáo</span>
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectClassForInput) {
                                onSelectClassForInput(row.classItem.id, selectedDate);
                              } else {
                                onNavigate('/attendance');
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-colors"
                          >
                            {isReported ? 'Xem/Sửa' : 'Nhập'}
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleLock(e, row)}
                              title={isLocked ? 'Mở khóa lớp này' : 'Khóa số liệu lớp này'}
                              className={`p-1 rounded-lg border text-xs ${
                                isLocked
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (Specification 7: Responsive auto-card) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredRows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 font-medium text-xs">
              Không tìm thấy lớp học nào phù hợp.
            </div>
          ) : (
            filteredRows.map((row) => {
              const firstIndId = enabledIndicators[0]?.id;
              const vals = firstIndId ? row.values[firstIndId] : null;
              const total = vals?.total || 0;
              const present = vals?.present || 0;
              const absent = vals?.absent || 0;
              const rate = total > 0 ? Math.round((present / total) * 100) : 0;
              const boardingVal = boardingHalf ? row.values[boardingHalf.id]?.present : null;

              const isReported = row.status === 'REPORTED';
              const isLocked = row.status === 'LOCKED';

              return (
                <div
                  key={row.classItem.id}
                  onClick={() => {
                    if (onSelectClassForInput) {
                      onSelectClassForInput(row.classItem.id, selectedDate);
                    } else {
                      onNavigate('/attendance');
                    }
                  }}
                  className="p-3.5 hover:bg-slate-50 transition-colors space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-slate-900">
                        Lớp {row.classItem.class_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        GVCN: {row.teacher?.full_name || 'Chưa phân công'} · {getCampusName(row.classItem.campus_id)}
                      </div>
                    </div>

                    <div>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          <Lock className="w-3 h-3" /> Đã khóa
                        </span>
                      ) : isReported ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Đã báo cáo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          <AlertCircle className="w-3 h-3" /> Chưa báo cáo
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-50 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Tổng</span>
                      <span className="font-extrabold text-slate-800">{total}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-600 block font-bold">Có mặt</span>
                      <span className="font-extrabold text-emerald-700">{isReported ? present : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-600 block font-bold">Vắng</span>
                      <span className="font-extrabold text-rose-600">{isReported ? absent : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-600 block font-bold">Tỷ lệ</span>
                      <span className="font-extrabold text-blue-700">{isReported ? `${rate}%` : '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 6. BIỂU ĐỒ THỐNG KÊ SĨ SỐ (Specification 8: Biểu đồ đơn giản, trực quan, phân tích theo khối) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>THỐNG KÊ SĨ SỐ THEO KHỐI LỚP</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              So sánh tỷ lệ chuyên cần và số lượng học sinh có mặt hôm nay
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/charts')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Xem biểu đồ chi tiết</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Visual Bar Chart Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {gradeStats.map((stat) => (
            <div
              key={stat.grade}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  KHỐI {stat.grade} ({stat.totalClasses} Lớp)
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  stat.reportedClasses === stat.totalClasses
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}>
                  {stat.reportedClasses}/{stat.totalClasses} nộp
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-500 font-medium">Chuyên cần:</span>
                  <span className="text-lg font-black text-blue-800 tabular-nums">{stat.rate}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-1 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${stat.rate}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200/60 font-medium">
                <span>Có mặt: <strong className="text-emerald-700">{stat.presentStudents}</strong></span>
                <span>Vắng: <strong className="text-rose-600">{stat.absentStudents}</strong></span>
                <span>Tổng: <strong className="text-slate-800">{stat.totalStudents}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
