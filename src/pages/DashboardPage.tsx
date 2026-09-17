import React, { useState, useEffect, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { ClassReportRow, ReportStatus } from '../types';
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
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
  onSelectClassForInput?: (classId: string, date: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onSelectClassForInput }) => {
  const { settings, classes, indicators, campuses } = useSchool();
  const { currentUser, isAdmin, isBGH, isGVCN } = useAuth();

  const getCampusName = (campusId?: string) => {
    if (!campusId) return 'Khu chính';
    const campus = campuses.find(c => c.id === campusId);
    return campus ? campus.name : 'Khu chính';
  };

  const getCampusBadgeColor = (campusId?: string) => {
    if (!campusId) return 'bg-slate-100 text-slate-700 border-slate-200';
    const index = campuses.findIndex(c => c.id === campusId);
    if (index === -1) return 'bg-slate-100 text-slate-700 border-slate-200';
    const colors = [
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
      'bg-teal-100 text-teal-700 border-teal-200',
      'bg-orange-100 text-orange-700 border-orange-200',
      'bg-pink-100 text-pink-700 border-pink-200',
    ];
    return colors[index % colors.length];
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
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [showUnreportedChips, setShowUnreportedChips] = useState(true);

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

  useEffect(() => {
    loadData(selectedDate, selectedCampus);

    // Subscribe to realtime changes so any GVCN save triggers instant UI reload
    const unsub = subscribeRealtime(() => {
      loadData(selectedDate, selectedCampus);
    });

    return () => {
      unsub();
    };
  }, [selectedDate, selectedCampus]);

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
    if (window.confirm(`Bạn có chắc chắn muốn khóa tất cả các lớp (${campusLabel}) cho ngày ${formattedDate}?\n\nCác lớp chưa báo cáo cũng sẽ bị khóa và không thể nhập số liệu được nữa.`)) {
      await StorageService.lockAllReportsForDate(selectedDate, true, currentUser!, selectedCampus);
      await loadData(selectedDate, selectedCampus);
    }
  };

  const handleUnlockAll = async () => {
    if (!isAdmin) return;
    const formattedDate = selectedDate.split('-').reverse().join('/');
    const campusLabel = selectedCampus === 'all' ? 'toàn trường' : getCampusName(selectedCampus);
    if (window.confirm(`Bạn có chắc chắn muốn mở khóa tất cả các lớp (${campusLabel}) cho ngày ${formattedDate}?`)) {
      await StorageService.lockAllReportsForDate(selectedDate, false, currentUser!, selectedCampus);
      await loadData(selectedDate, selectedCampus);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!aggregateData) return [];
    return aggregateData.rows.filter((r) => {
      if (selectedGrade !== 'ALL' && r.classItem.grade !== selectedGrade) return false;
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
      if (selectedCampus !== 'all' && r.classItem.campus_id !== selectedCampus) return false;
      if (selectedClassId !== 'all' && r.classItem.id !== selectedClassId) return false;
      return true;
    });
  }, [aggregateData, selectedGrade, selectedStatus, selectedCampus, selectedClassId]);

  // Find enabled indicators
  const enabledIndicators = useMemo(() => {
    return indicators.filter((i) => i.enabled).sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  const boardingHalf = indicators.find((i) => i.code === 'BOARDING_HALF' && i.enabled);

  // Unreported classes list for quick overview
  const unreportedRows = useMemo(() => {
    if (!aggregateData) return [];
    return aggregateData.rows.filter((r) => r.status === 'NOT_REPORTED');
  }, [aggregateData]);

  const reportingRate = aggregateData
    ? Math.round((aggregateData.reportedClasses / (aggregateData.totalClasses || 1)) * 100)
    : 0;

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Top Banner & Date Picker - Compact on Mobile */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                <Sparkles className="w-3 h-3" /> CẬP NHẬT TRỰC TIẾP
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500 font-medium">Hệ thống Realtime</span>
            </div>
            <h1 className="text-base sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 sm:mt-1">
              BÁO CÁO SĨ SỐ HỌC SINH
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-600 font-medium">
              {settings?.school_name ? `${settings.school_name} - Tình hình có mặt & vắng học sinh` : 'Tình hình theo dõi sĩ số & chuyên cần học sinh hằng ngày'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <CampusSelector
              selectedCampusId={selectedCampus}
              onChange={setSelectedCampus}
            />
            <DateNavigator selectedDate={selectedDate} onChangeDate={setSelectedDate} />
            
            <button
              type="button"
              onClick={() => onNavigate('/reports/daily')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-2xs transition-colors flex-shrink-0"
              title="Xem mẫu biểu báo cáo xuất excel/in ấn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Mẫu biểu</span>
            </button>
          </div>
        </div>
      </div>

      {/* GVCN Quick Action Card */}
      {(() => {
        const myClass = classes.find((c) => c.id === currentUser?.assigned_class_id);
        if (!myClass) return null;
        const myClassRow = aggregateData?.rows.find((r) => r.classItem?.id === myClass.id);
        const isReported = myClassRow?.status === 'REPORTED';
        const mainIndicatorId = enabledIndicators[0]?.id;
        const mainVals = mainIndicatorId && myClassRow ? myClassRow.values[mainIndicatorId] : null;
        const total = mainVals?.total || 0;
        const present = mainVals?.present || 0;
        const absent = mainVals?.absent || 0;

        return (
          <div className="bg-linear-to-r from-blue-700 via-blue-800 to-indigo-800 text-white rounded-2xl p-3.5 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center flex-shrink-0 text-white">
                  <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded text-blue-100">
                      LỚP PHỤ TRÁCH
                    </span>
                    <span className="text-xs font-black text-amber-300">
                      Lớp {myClass.class_name}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 mt-0.5 truncate">
                    {isReported ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300 font-bold">
                        <CheckCircle className="w-3.5 h-3.5" /> Đã gửi: {present}/{total} có mặt (Vắng: {absent})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                        <Clock className="w-3.5 h-3.5" /> Hôm nay chưa gửi báo cáo sĩ số
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onSelectClassForInput) {
                    onSelectClassForInput(myClass.id, selectedDate);
                  } else {
                    onNavigate('/attendance');
                  }
                }}
                className={`w-full sm:w-auto h-9 sm:h-10 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs ${
                  isReported
                    ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-900 ring-2 ring-amber-200'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>{isReported ? 'Xem / Sửa' : 'GỬI BÁO CÁO NGAY'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* OVERVIEW PANEL: Tiến độ báo cáo & Các chỉ số quan sát tổng quan */}
      {aggregateData && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 sm:p-5 space-y-3">
          {/* Header Row: Progress Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
                  TỔNG QUAN TIẾN ĐỘ BÁO CÁO
                </h2>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                  aggregateData.unreportedClasses === 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {aggregateData.reportedClasses}/{aggregateData.totalClasses} Lớp ({reportingRate}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {aggregateData.unreportedClasses === 0
                  ? 'Toàn bộ 100% các lớp đã hoàn thành nộp báo cáo sĩ số hôm nay.'
                  : `Hiện tại còn ${aggregateData.unreportedClasses} lớp chưa gửi báo cáo sĩ số.`}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
              {isAdmin && (
                <div className="flex items-center gap-1.5 mr-1 pr-1 border-r border-slate-200">
                  <button
                    type="button"
                    onClick={handleLockAll}
                    className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors shadow-2xs"
                    title={`Khóa tất cả các lớp (${selectedCampus === 'all' ? 'toàn trường' : getCampusName(selectedCampus)}) cho ngày này`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Khóa tất cả</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnlockAll}
                    className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                    title={`Mở khóa tất cả các lớp (${selectedCampus === 'all' ? 'toàn trường' : getCampusName(selectedCampus)}) cho ngày này`}
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mở khóa</span>
                  </button>
                </div>
              )}
              {aggregateData.unreportedClasses > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedStatus(selectedStatus === 'NOT_REPORTED' ? 'ALL' : 'NOT_REPORTED')}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                      selectedStatus === 'NOT_REPORTED'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{selectedStatus === 'NOT_REPORTED' ? 'Đang lọc lớp chưa báo' : `Xem ${aggregateData.unreportedClasses} lớp chưa báo`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnreportedChips(!showUnreportedChips)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    title="Ẩn/Hiện danh sách lớp chưa nộp"
                  >
                    {showUnreportedChips ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Reporting Visual Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-2 transition-all duration-500 rounded-l-full"
                style={{ width: `${reportingRate}%` }}
                title={`Đã báo cáo: ${aggregateData.reportedClasses} lớp`}
              />
              <div
                className="bg-amber-400 h-2 transition-all duration-500 rounded-r-full"
                style={{ width: `${100 - reportingRate}%` }}
                title={`Chưa báo cáo: ${aggregateData.unreportedClasses} lớp`}
              />
            </div>
          </div>

          {/* Quick Missing Classes Chip Strip (Crucial for BGH/Admin overview) */}
          {aggregateData.unreportedClasses > 0 && showUnreportedChips && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  Các lớp chưa gửi báo cáo ({unreportedRows.length} lớp):
                </span>
                <span className="text-[10px] text-amber-700">Chạm vào lớp để nhập</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {unreportedRows.map((r) => (
                  <button
                    key={r.classItem.id}
                    type="button"
                    onClick={() => {
                      if (onSelectClassForInput) {
                        onSelectClassForInput(r.classItem.id, selectedDate);
                      } else {
                        onNavigate('/attendance');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-colors shadow-2xs"
                  >
                    <span>Lớp {r.classItem.class_name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({r.teacher?.full_name.split(' ').pop() || 'GVCN'})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6 Key Overview Metrics - Highly Compact on Mobile, Spacious on Desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 pt-1">
            {/* Card 1: Tổng số lớp */}
            <div className="bg-slate-50/80 p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Tổng số lớp</span>
                <Layers className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                {aggregateData.totalClasses}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Toàn trường</div>
            </div>

            {/* Card 2: Đã báo cáo */}
            <div
              onClick={() => setSelectedStatus('REPORTED')}
              className={`p-2.5 sm:p-3.5 rounded-xl border shadow-2xs cursor-pointer transition-all flex flex-col justify-between ${
                selectedStatus === 'REPORTED'
                  ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300'
                  : 'bg-emerald-50/60 border-emerald-200/80 hover:bg-emerald-100/60'
              }`}
            >
              <div className="flex items-center justify-between text-emerald-800">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Đã báo cáo</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-black text-emerald-900 leading-tight">
                {aggregateData.reportedClasses}
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                Đạt {reportingRate}%
              </div>
            </div>

            {/* Card 3: Chưa báo cáo */}
            <div
              onClick={() => setSelectedStatus('NOT_REPORTED')}
              className={`p-2.5 sm:p-3.5 rounded-xl border shadow-2xs cursor-pointer transition-all flex flex-col justify-between ${
                selectedStatus === 'NOT_REPORTED'
                  ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                  : 'bg-amber-50/60 border-amber-200/80 hover:bg-amber-100/60'
              }`}
            >
              <div className="flex items-center justify-between text-amber-800">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Chưa báo cáo</span>
                <Clock className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-black text-amber-900 leading-tight">
                {aggregateData.unreportedClasses}
              </div>
              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                {aggregateData.unreportedClasses > 0 ? 'Cần đôn đốc' : 'Hoàn thành'}
              </div>
            </div>

            {/* Card 4: Tổng học sinh & Có mặt */}
            <div className="bg-slate-50/80 p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Có mặt / Tổng</span>
                <Users className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="mt-1 text-lg sm:text-xl font-black text-slate-900 leading-tight">
                <span className="text-emerald-700">{aggregateData.overallSchool.present}</span>
                <span className="text-slate-400 text-sm font-normal"> / {aggregateData.overallSchool.total}</span>
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                Tỷ lệ: {aggregateData.overallSchool.presentRate.toFixed(1).replace('.', ',')}%
              </div>
            </div>

            {/* Card 5: Vắng & Tỷ lệ */}
            <div className="bg-red-50/50 p-2.5 sm:p-3.5 rounded-xl border border-red-200/60 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-red-800">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Vắng</span>
                <TrendingDown className="w-3.5 h-3.5 text-red-600" />
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-black text-red-700 leading-tight">
                {aggregateData.overallSchool.absent}
              </div>
              <div className="text-[10px] text-red-700 font-bold mt-0.5">
                Tỷ lệ vắng: {aggregateData.overallSchool.rate.toFixed(2).replace('.', ',')}%
              </div>
            </div>

            {/* Card 6: Bán trú */}
            {boardingHalf ? (
              <div className="bg-amber-50/40 p-2.5 sm:p-3.5 rounded-xl border border-amber-200/50 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Bán trú</span>
                  <Bed className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="mt-1 text-lg sm:text-xl font-black text-slate-900 leading-tight">
                  <span className="text-amber-900">{aggregateData.totals[boardingHalf.id]?.present || 0}</span>
                  <span className="text-slate-400 text-sm font-normal"> / {aggregateData.totals[boardingHalf.id]?.total || 0}</span>
                </div>
                <div className="text-[10px] text-amber-800 font-semibold mt-0.5">
                  Vắng: {aggregateData.totals[boardingHalf.id]?.absent || 0} em
                </div>
              </div>
            ) : (
              <div className="bg-slate-50/80 p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Phân hiệu</span>
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                  {campuses.length || 3}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Khu chính & phân hiệu</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Class Attendance Status: Filter and Mobile-friendly Class Cards + Desktop Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Filters Header */}
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/70 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                Chi tiết từng lớp ({filteredRows.length}/{aggregateData?.totalClasses || 0} lớp)
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Theo dõi tình hình sĩ số cụ thể theo từng khối và từng lớp
              </p>
            </div>

            {/* Status Quick Filter Buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedStatus('ALL')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedStatus === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({classes.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('REPORTED')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedStatus === 'REPORTED' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                🟢 Đã báo ({aggregateData?.reportedClasses || 0})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('NOT_REPORTED')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedStatus === 'NOT_REPORTED' ? 'bg-amber-600 text-white font-bold' : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                🔴 Chưa báo ({aggregateData?.unreportedClasses || 0})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
            {/* Grade filter buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
              {(['ALL', 6, 7, 8, 9] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGrade(g)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md transition-colors ${
                    selectedGrade === g ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g === 'ALL' ? 'Tất cả khối' : `Khối ${g}`}
                </button>
              ))}
            </div>

            {/* Class filter */}
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                <option value="all">Tất cả các lớp</option>
                {classes
                  .filter(c => selectedCampus === 'all' || c.campus_id === selectedCampus)
                  .filter(c => selectedGrade === 'ALL' || c.grade === selectedGrade)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.class_name}
                    </option>
                  ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 1. MOBILE CARD VIEW: Hiển thị cực kỳ rõ ràng, dễ nhìn trên điện thoại (hidden on md and larger) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredRows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-medium px-4">
              {classes.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-slate-600 font-semibold">Chưa có lớp học nào trong hệ thống.</p>
                  <p className="text-slate-400 text-[11px]">Dữ liệu đang ở trạng thái mặc định rỗng để bạn cấu hình lại từ đầu.</p>
                  {(isAdmin || isBGH) && (
                    <button
                      type="button"
                      onClick={() => onNavigate('/classes')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 mt-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm lớp học ngay</span>
                    </button>
                  )}
                </div>
              ) : (
                'Không tìm thấy lớp nào phù hợp với bộ lọc.'
              )}
            </div>
          ) : (
            filteredRows.map((row) => {
              const isUserClass = currentUser?.assigned_class_id === row.classItem.id;
              const canEdit =
                isAdmin ||
                (isGVCN && isUserClass && row.status !== 'LOCKED');

              const mainTotal = row.values[enabledIndicators[0]?.id]?.total || 0;
              const mainPresent = row.values[enabledIndicators[0]?.id]?.present || 0;
              const mainAbsent = row.values[enabledIndicators[0]?.id]?.absent || 0;
              const bHalfVal = boardingHalf ? row.values[boardingHalf.id] : null;

              return (
                <div
                  key={row.classItem.id}
                  className={`p-3 transition-colors ${isUserClass ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-sm text-slate-900">
                          Lớp {row.classItem.class_name}
                        </span>
                        {isUserClass && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                            Lớp của bạn
                          </span>
                        )}
                        {campuses.length > 0 && row.classItem.campus_id && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getCampusBadgeColor(row.classItem.campus_id)}`}>
                            {getCampusName(row.classItem.campus_id)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        GVCN: <span className="font-semibold text-slate-800">{row.teacher?.full_name || 'Chưa phân công'}</span>
                      </div>
                    </div>

                    <div>
                      {row.status === 'REPORTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã báo
                        </span>
                      )}
                      {row.status === 'NOT_REPORTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Chưa báo
                        </span>
                      )}
                      {row.status === 'LOCKED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                          <Lock className="w-3 h-3 text-slate-500" /> Đã khóa
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Attendance figures row */}
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {row.status === 'NOT_REPORTED' ? (
                      <div className="text-xs text-amber-700 font-semibold italic">
                        Chưa có dữ liệu báo cáo sĩ số
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 text-[10px]">Có mặt: </span>
                          <span className="font-extrabold text-emerald-700">{mainPresent}</span>
                          <span className="text-slate-400 text-[10px]">/{mainTotal}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px]">Vắng: </span>
                          <span className={`font-extrabold ${mainAbsent > 0 ? 'text-red-600 bg-red-50 px-1 py-0.2 rounded' : 'text-slate-700'}`}>
                            {mainAbsent}
                          </span>
                        </div>
                        {bHalfVal && (
                          <div className="text-[11px] text-slate-500">
                            BT: {bHalfVal.present}/{bHalfVal.total}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(canEdit || isAdmin || isBGH) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectClassForInput) {
                              onSelectClassForInput(row.classItem.id, selectedDate);
                            } else {
                              onNavigate('/attendance');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            row.status === 'NOT_REPORTED'
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {row.status === 'NOT_REPORTED' ? 'Nhập ngay' : 'Xem / Sửa'}
                        </button>
                      )}

                      {isAdmin && row.report && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleLock(e, row)}
                          title={row.report.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'}
                          className="p-1 text-slate-400 hover:text-slate-700"
                        >
                          {row.report.status === 'LOCKED' ? (
                            <Lock className="w-3.5 h-3.5 text-red-600" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. DESKTOP FULL TABLE VIEW (hidden on mobile, shown on md screens and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Lớp</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">GVCN</th>
                {settings?.enable_campuses && <th className="py-3 px-4 hidden md:table-cell">Phân hiệu</th>}
                <th className="py-3 px-3 text-right">Tổng HS</th>
                <th className="py-3 px-3 text-right">Có mặt</th>
                <th className="py-3 px-3 text-right">Vắng</th>
                <th className="py-3 px-3 text-right">Tỷ lệ vắng</th>
                {boardingHalf && <th className="py-3 px-3 text-right hidden sm:table-cell">Bán trú (vắng)</th>}
                <th className="py-3 px-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 font-medium">
                    {classes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center space-y-2 max-w-md mx-auto">
                        <p className="text-slate-700 font-semibold text-sm">Chưa có lớp học nào trong hệ thống</p>
                        <p className="text-slate-500 text-xs">
                          Dữ liệu đã được đặt lại mặc định rỗng. Quản trị viên vui lòng Cấu hình trường và Thêm lớp học để bắt đầu theo dõi sĩ số.
                        </p>
                        {(isAdmin || isBGH) && (
                          <button
                            type="button"
                            onClick={() => onNavigate('/classes')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 mt-2 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm lớp học</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      'Không tìm thấy lớp nào phù hợp với bộ lọc.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isUserClass = currentUser?.assigned_class_id === row.classItem.id;
                  const canEdit =
                    isAdmin ||
                    (isGVCN && isUserClass && row.status !== 'LOCKED');

                  const mainTotal = row.values[enabledIndicators[0]?.id]?.total || 0;
                  const mainPresent = row.values[enabledIndicators[0]?.id]?.present || 0;
                  const mainAbsent = row.values[enabledIndicators[0]?.id]?.absent || 0;
                  const bHalfVal = boardingHalf ? row.values[boardingHalf.id] : null;

                  return (
                    <tr
                      key={row.classItem.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isUserClass ? 'bg-blue-50/40 font-medium' : ''
                      }`}
                    >
                      {/* Class name & Campus */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-slate-900 w-12">{row.classItem.class_name}</span>
                          {campuses.length > 0 && row.classItem.campus_id && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCampusBadgeColor(row.classItem.campus_id)}`}>
                              {getCampusName(row.classItem.campus_id)}
                            </span>
                          )}
                          {isUserClass && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                              Lớp của bạn
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {row.status === 'REPORTED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã báo cáo
                          </span>
                        )}
                        {row.status === 'NOT_REPORTED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Chưa báo cáo
                          </span>
                        )}
                        {row.status === 'LOCKED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800">
                            <Lock className="w-3 h-3 text-slate-500" /> Đã khóa
                          </span>
                        )}
                      </td>

                      {/* Teacher */}
                      <td className="py-3 px-4">
                        <span className="text-slate-800 font-medium">{row.teacher?.full_name || 'Chưa phân công'}</span>
                      </td>

                      {/* Campus */}
                      {settings?.enable_campuses && (
                        <td className="py-3 px-4 hidden md:table-cell text-slate-500">
                          {campuses.find((c) => c.id === row.classItem.campus_id)?.name.replace('Phân hiệu ', '') || 'Chính'}
                        </td>
                      )}

                      {/* Numbers */}
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {row.status !== 'NOT_REPORTED' ? mainTotal : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-700">
                        {row.status !== 'NOT_REPORTED' ? mainPresent : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-red-600">
                        {row.status !== 'NOT_REPORTED' ? (
                          mainAbsent > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                              {mainAbsent}
                            </span>
                          ) : (
                            '0'
                          )
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800">
                        {row.status !== 'NOT_REPORTED' ? (
                          <span>{row.overallRate.toFixed(2).replace('.', ',')}%</span>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* Boarding Half */}
                      {boardingHalf && (
                        <td className="py-3 px-3 text-right hidden sm:table-cell">
                          {row.status !== 'NOT_REPORTED' && bHalfVal ? (
                            <span>
                              {bHalfVal.present}/{bHalfVal.total}
                              {bHalfVal.absent > 0 && (
                                <span className="ml-1 text-red-600 font-bold">(-{bHalfVal.absent})</span>
                              )}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {(canEdit || isAdmin || isBGH) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectClassForInput) {
                                  onSelectClassForInput(row.classItem.id, selectedDate);
                                } else {
                                  onNavigate('/attendance');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                                row.status === 'NOT_REPORTED'
                                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {row.status === 'NOT_REPORTED' ? 'Nhập ngay' : 'Xem / Sửa'}
                            </button>
                          )}

                          {isAdmin && row.report && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleLock(e, row)}
                              title={row.report.status === 'LOCKED' ? 'Mở khóa báo cáo' : 'Khóa báo cáo'}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              {row.report.status === 'LOCKED' ? (
                                <Lock className="w-3.5 h-3.5 text-red-600" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-slate-400" />
                              )}
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
      </div>
    </div>
  );
};
