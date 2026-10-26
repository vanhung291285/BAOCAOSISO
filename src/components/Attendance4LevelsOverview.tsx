import React, { useState, useEffect, useCallback } from 'react';
import { StorageService, subscribeRealtime } from '../services/storage';
import {
  CalendarDays,
  Calendar,
  CalendarRange,
  GraduationCap,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  BarChart3,
  Building2,
  Users,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';

interface Attendance4LevelsOverviewProps {
  campusId?: string;
  classId?: string;
  showTitle?: boolean;
  onNavigate?: (path: string) => void;
}

export const Attendance4LevelsOverview: React.FC<Attendance4LevelsOverviewProps> = ({
  campusId,
  classId,
  showTitle = true,
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    daily: any;
    weekly: any;
    monthly: any;
    semester: any;
  } | null>(null);

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const summary = await StorageService.getAttendanceSummary4Levels({
        campusId,
        classId,
      });
      setData(summary);
    } catch (err) {
      console.error('Failed to load 4-level attendance summary:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [campusId, classId]);

  useEffect(() => {
    loadData(true);

    let debounceTimer: any = null;
    const unsub = subscribeRealtime((event) => {
      if (['daily_reports', 'daily_report_values', 'boarding_reports'].includes(event?.table)) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadData(false);
        }, 500);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [loadData]);

  const getBadgeStyle = (rate: number) => {
    if (rate >= 98) return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: 'Xuất sắc 🟢', fill: '#10b981' };
    if (rate >= 95) return { bg: 'bg-blue-50 text-blue-800 border-blue-200', text: 'Tốt 🔵', fill: '#3b82f6' };
    if (rate >= 90) return { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'Đạt 🟡', fill: '#f59e0b' };
    return { bg: 'bg-rose-50 text-rose-800 border-rose-200', text: 'Cần nhắc 🔴', fill: '#ef4444' };
  };

  const chartData = data
    ? [
        {
          name: 'Theo Ngày',
          rate: data.daily.attendanceRate,
          absentRate: data.daily.absentRate,
          label: `Ngày (${data.daily.reportedClasses}/${data.daily.totalClasses} lớp)`,
          fill: getBadgeStyle(data.daily.attendanceRate).fill,
        },
        {
          name: 'Theo Tuần',
          rate: data.weekly.attendanceRate,
          absentRate: data.weekly.absentRate,
          label: `Tuần ${data.weekly.weekNumber} (${data.weekly.reportedDaysCount} buổi)`,
          fill: getBadgeStyle(data.weekly.attendanceRate).fill,
        },
        {
          name: 'Theo Tháng',
          rate: data.monthly.attendanceRate,
          absentRate: data.monthly.absentRate,
          label: `${data.monthly.monthLabel} (${data.monthly.reportedDaysCount} ngày)`,
          fill: getBadgeStyle(data.monthly.attendanceRate).fill,
        },
        {
          name: 'Theo Học kỳ',
          rate: data.semester.attendanceRate,
          absentRate: data.semester.absentRate,
          label: `${data.semester.semesterLabel} (${data.semester.reportedDaysCount} ngày)`,
          fill: getBadgeStyle(data.semester.attendanceRate).fill,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* 1. Section Header */}
      {showTitle && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-blue-100 text-blue-700">
                <BarChart3 className="w-4 h-4" />
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                TỈ LỆ CHUYÊN CẦN 4 CẤP ĐỘ (NGÀY - TUẦN - THÁNG - HỌC KỲ)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tự động loại bỏ các ngày chưa điểm danh (dữ liệu trống) để đảm bảo chỉ số trung bình chuẩn xác 100%
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
            title="Làm mới số liệu 4 cấp độ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">Đang tổng hợp tỉ lệ chuyên cần 4 cấp độ...</p>
        </div>
      ) : !data ? null : (
        <>
          {/* 2. Four Interactive Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* CARD 1: THEO NGÀY */}
            <div
              onClick={() => onNavigate?.('/reports/daily')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Theo Ngày
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getBadgeStyle(data.daily.attendanceRate).bg}`}>
                  {getBadgeStyle(data.daily.attendanceRate).text}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <div className="text-2xl font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                    {data.daily.attendanceRate.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Chuyên cần ngày {data.daily.date.split('-').reverse().join('/')}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 p-1.5 rounded-lg text-center">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Đã báo</span>
                  <span className="font-extrabold text-blue-700">{data.daily.reportedClasses}/{data.daily.totalClasses} lớp</span>
                </div>
                <div className="bg-rose-50/70 p-1.5 rounded-lg text-center">
                  <span className="text-rose-500 text-[10px] uppercase font-bold block">Tổng vắng</span>
                  <span className="font-extrabold text-rose-600">{data.daily.totalAbsent} em</span>
                </div>
              </div>
            </div>

            {/* CARD 2: THEO TUẦN */}
            <div
              onClick={() => onNavigate?.('/reports/weekly')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Calendar className="w-3.5 h-3.5" />
                  Theo Tuần (Tuần {data.weekly.weekNumber})
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getBadgeStyle(data.weekly.attendanceRate).bg}`}>
                  {getBadgeStyle(data.weekly.attendanceRate).text}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <div className="text-2xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {data.weekly.attendanceRate.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Trung bình {data.weekly.reportedDaysCount} buổi điểm danh
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 p-1.5 rounded-lg text-center">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">TB Có mặt</span>
                  <span className="font-extrabold text-emerald-700">{data.weekly.dailyAveragePresent} em/ngày</span>
                </div>
                <div className="bg-rose-50/70 p-1.5 rounded-lg text-center">
                  <span className="text-rose-500 text-[10px] uppercase font-bold block">Tổng vắng tuần</span>
                  <span className="font-extrabold text-rose-600">{data.weekly.totalAbsent} lượt</span>
                </div>
              </div>
            </div>

            {/* CARD 3: THEO THÁNG */}
            <div
              onClick={() => onNavigate?.('/reports/monthly')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all cursor-pointer relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  <CalendarRange className="w-3.5 h-3.5" />
                  Theo Tháng ({data.monthly.monthLabel})
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getBadgeStyle(data.monthly.attendanceRate).bg}`}>
                  {getBadgeStyle(data.monthly.attendanceRate).text}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <div className="text-2xl font-black text-slate-900 group-hover:text-amber-800 transition-colors">
                    {data.monthly.attendanceRate.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Tổng cộng {data.monthly.reportedDaysCount} ngày học đã điểm danh
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 p-1.5 rounded-lg text-center">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">TB Có mặt</span>
                  <span className="font-extrabold text-amber-800">{data.monthly.dailyAveragePresent} em/ngày</span>
                </div>
                <div className="bg-rose-50/70 p-1.5 rounded-lg text-center">
                  <span className="text-rose-500 text-[10px] uppercase font-bold block">Tổng vắng tháng</span>
                  <span className="font-extrabold text-rose-600">{data.monthly.totalAbsent} lượt</span>
                </div>
              </div>
            </div>

            {/* CARD 4: THEO HỌC KỲ */}
            <div
              onClick={() => onNavigate?.('/charts')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all cursor-pointer relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  <GraduationCap className="w-3.5 h-3.5" />
                  {data.semester.semesterLabel}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getBadgeStyle(data.semester.attendanceRate).bg}`}>
                  {getBadgeStyle(data.semester.attendanceRate).text}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <div className="text-2xl font-black text-slate-900 group-hover:text-purple-800 transition-colors">
                    {data.semester.attendanceRate.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Tổng số {data.semester.reportedDaysCount} ngày đã thực hiện báo cáo
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 p-1.5 rounded-lg text-center">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">TB Có mặt HK</span>
                  <span className="font-extrabold text-purple-800">{data.semester.dailyAveragePresent} em/ngày</span>
                </div>
                <div className="bg-rose-50/70 p-1.5 rounded-lg text-center">
                  <span className="text-rose-500 text-[10px] uppercase font-bold block">Tổng vắng HK</span>
                  <span className="font-extrabold text-rose-600">{data.semester.totalAbsent} lượt</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Visual Comparative Bar Chart Section */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                  SO SÁNH TỈ LỆ CHUYÊN CẦN GIỮA CÁC CẤP ĐỘ MỐC THỜI GIAN
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Xuất sắc (≥98%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Tốt (≥95%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Đạt (≥90%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Cần nhắc (&lt;90%)
                </span>
              </div>
            </div>

            <div className="h-44 sm:h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toFixed(1)}%`, 'Chuyên cần']}
                    labelFormatter={(label, items) => {
                      const item = items[0]?.payload;
                      return item ? `${label}: ${item.label}` : label;
                    }}
                    contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="rate" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
