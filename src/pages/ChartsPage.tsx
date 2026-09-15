import React, { useState, useEffect, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { StorageService } from '../services/storage';
import { ClassReportRow } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';

type TimeFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR';

export const ChartsPage: React.FC = () => {
  const { settings, classes } = useSchool();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');
  const [selectedDate, setSelectedDate] = useState('2026-09-15');
  const [dailyData, setDailyData] = useState<{
    date: string;
    rows: ClassReportRow[];
    overallSchool: { total: number; present: number; absent: number; rate: number };
  } | null>(null);

  const [monthlyData, setMonthlyData] = useState<{
    dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[];
  } | null>(null);

  useEffect(() => {
    StorageService.getDailyAggregate(selectedDate).then((res) => {
      setDailyData({
        date: res.date,
        rows: res.rows,
        overallSchool: res.overallSchool,
      });
    });

    StorageService.getMonthlyAggregate(selectedDate.substring(0, 7)).then((m) => {
      setMonthlyData(m);
    });
  }, [selectedDate]);

  // Chart 1: Tỷ lệ vắng theo lớp
  const classRateChartData = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.rows
      .filter((r) => r.status !== 'NOT_REPORTED')
      .map((r) => ({
        name: r.classItem.class_name,
        absentRate: parseFloat(r.overallRate.toFixed(2)),
        absentCount: r.values['ig_all']?.absent || 0,
        grade: r.classItem.grade,
      }))
      .sort((a, b) => b.absentRate - a.absentRate);
  }, [dailyData]);

  // Chart 2: Có mặt và vắng toàn trường (Donut)
  const attendancePieData = useMemo(() => {
    if (!dailyData) return [];
    const present = dailyData.overallSchool.present;
    const absent = dailyData.overallSchool.absent;
    return [
      { name: 'Có mặt', value: present, color: '#10b981' },
      { name: 'Vắng', value: absent, color: '#ef4444' },
    ];
  }, [dailyData]);

  // Chart 3: Số học sinh theo từng lớp
  const classSizeChartData = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.rows.map((r) => ({
      name: r.classItem.class_name,
      total: r.values['ig_all']?.total || 24,
      grade: r.classItem.grade,
    }));
  }, [dailyData]);

  // Chart 4: Xu hướng vắng theo ngày (Line)
  const trendChartData = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.dayStats.map((d) => ({
      date: d.date.split('-').slice(1).join('/'),
      absentRate: parseFloat(d.rate.toFixed(2)),
      absentCount: d.absentStudents,
    }));
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              BIỂU ĐỒ THỐNG KÊ SĨ SỐ HỌC SINH
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Trực quan hóa tỷ lệ chuyên cần, phân bổ học sinh và diễn biến theo thời gian
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-700">
            <button
              onClick={() => setTimeFilter('TODAY')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                timeFilter === 'TODAY' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setTimeFilter('WEEK')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                timeFilter === 'WEEK' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              7 ngày qua
            </button>
            <button
              onClick={() => setTimeFilter('MONTH')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                timeFilter === 'MONTH' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              Tháng này
            </button>
            <button
              onClick={() => setTimeFilter('YEAR')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                timeFilter === 'YEAR' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              Cả năm
            </button>
          </div>
        </div>
      </div>

      {/* Grid of 4 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tỷ lệ vắng theo lớp */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                1. Tỷ lệ vắng theo từng lớp (%)
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
                Sắp xếp giảm dần
              </span>
            </div>
            <p className="text-xs text-slate-500">Giúp BGH phát hiện nhanh các lớp có tỷ lệ vắng cao</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classRateChartData.slice(0, 14)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => [`${value}%`, 'Tỷ lệ vắng']}
                  labelFormatter={(label) => `Lớp ${label}`}
                />
                <Bar dataKey="absentRate" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Có mặt & Vắng toàn trường (Donut Pie) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                2. Cơ cấu Có mặt và Vắng toàn trường
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Tổng {dailyData?.overallSchool.total} HS
              </span>
            </div>
            <p className="text-xs text-slate-500">Tỷ lệ chuyên cần học sinh ngày {selectedDate}</p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={attendancePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`}
                >
                  {attendancePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any) => [`${val} học sinh`, 'Số lượng']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Số học sinh theo lớp */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                3. Quy mô số học sinh theo từng lớp
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {classes.length} Lớp học
              </span>
            </div>
            <p className="text-xs text-slate-500">Phân bố sĩ số học sinh giữa các khối 6, 7, 8, 9</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classSizeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: any) => [`${value} học sinh`, 'Tổng sĩ số']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Tình hình vắng theo ngày (Trend) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                4. Xu hướng tỷ lệ vắng theo các ngày trong tháng
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                Theo dõi diễn biến
              </span>
            </div>
            <p className="text-xs text-slate-500">Biểu đồ đường theo dõi biến động tỷ lệ nghỉ học</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any) => [`${val}%`, 'Tỷ lệ vắng']} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="absentRate"
                  name="Tỷ lệ vắng (%)"
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
