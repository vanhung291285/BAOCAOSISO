import React, { useState, useEffect } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { StorageService } from '../services/storage';
import * as XLSX from 'xlsx';
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
} from 'lucide-react';

export const MonthlyReportPage: React.FC = () => {
  const { settings } = useSchool();
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
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

  useEffect(() => {
    setLoading(true);
    StorageService.getMonthlyAggregate(selectedMonth)
      .then((data) => setStats(data))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const handleExportMonthlyExcel = () => {
    if (!stats) return;

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    wsData.push([settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG']);
    wsData.push([`BÁO CÁO TỔNG HỢP SĨ SỐ THÁNG ${selectedMonth.split('-').reverse().join('/')}`]);
    wsData.push([]);

    // KPI Summary
    wsData.push(['Số ngày đã báo cáo:', stats.totalDaysReported]);
    wsData.push(['Tổng số lượt vắng trong tháng:', stats.totalAbsentAccumulated]);
    wsData.push(['Tỷ lệ vắng trung bình:', `${stats.avgAbsentRate.toFixed(2).replace('.', ',')}%`]);
    wsData.push(['Lớp có tỷ lệ vắng cao nhất:', stats.highestAbsentClass ? `${stats.highestAbsentClass.className} (${stats.highestAbsentClass.rate.toFixed(2)}%)` : '-']);
    wsData.push(['Lớp có tỷ lệ vắng thấp nhất:', stats.lowestAbsentClass ? `${stats.lowestAbsentClass.className} (${stats.lowestAbsentClass.rate.toFixed(2)}%)` : '-']);
    wsData.push([]);

    // Table Header
    wsData.push(['STT', 'Ngày', 'Số lớp đã báo cáo', 'Tổng sĩ số', 'Có mặt', 'Vắng', 'Tỷ lệ vắng (%)']);

    stats.dayStats.forEach((d, idx) => {
      wsData.push([
        idx + 1,
        d.date.split('-').reverse().join('/'),
        d.reportedCount,
        d.totalStudents,
        d.totalStudents - d.absentStudents,
        d.absentStudents,
        `${d.rate.toFixed(2).replace('.', ',')}%`,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Thang_' + selectedMonth);
    XLSX.writeFile(wb, `Bao_cao_thang_${selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Month Selector */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            BÁO CÁO TỔNG HỢP SĨ SỐ THEO THÁNG
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thống kê chuyên cần và tình hình chuyên cần học sinh trường {settings?.short_name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            <label className="text-xs font-bold text-slate-700">Chọn tháng:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent border-0 focus:outline-hidden cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleExportMonthlyExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>Xuất Excel Tháng</span>
          </button>
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

          <div className="bg-red-50/60 p-4 rounded-2xl border border-red-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-red-700">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tổng lượt vắng</span>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-red-700">
              {stats.totalAbsentAccumulated} <span className="text-xs text-red-600 font-normal">lượt</span>
            </div>
            <div className="text-[11px] text-red-700 mt-1 font-medium">Toàn trường tích lũy</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tỷ lệ vắng TB</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {stats.avgAbsentRate.toFixed(2).replace('.', ',')}%
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1">
              Có mặt TB: {(100 - stats.avgAbsentRate).toFixed(2).replace('.', ',')}%
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Vắng cao nhất</span>
              <ArrowUpRight className="w-4 h-4 text-red-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-slate-900">
              {stats.highestAbsentClass ? stats.highestAbsentClass.className : '-'}
            </div>
            <div className="text-[11px] text-red-600 font-bold mt-1">
              {stats.highestAbsentClass ? `${stats.highestAbsentClass.rate.toFixed(2).replace('.', ',')}% vắng` : ''}
            </div>
          </div>

          <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80 shadow-2xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-[11px] font-bold uppercase tracking-wider">Chuyên cần nhất</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-900">
              {stats.lowestAbsentClass ? stats.lowestAbsentClass.className : '-'}
            </div>
            <div className="text-[11px] text-emerald-700 font-bold mt-1">
              {stats.lowestAbsentClass ? `${stats.lowestAbsentClass.rate.toFixed(2).replace('.', ',')}% vắng` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Diễn biến sĩ số từng ngày trong tháng {selectedMonth.split('-').reverse().join('/')}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4">STT</th>
                <th className="py-3 px-4">Ngày</th>
                <th className="py-3 px-4 text-center">Số lớp đã báo cáo</th>
                <th className="py-3 px-4 text-right">Tổng học sinh</th>
                <th className="py-3 px-4 text-right">Có mặt</th>
                <th className="py-3 px-4 text-right">Vắng</th>
                <th className="py-3 px-4 text-right">Tỷ lệ vắng (%)</th>
                <th className="py-3 px-4 text-center">Đánh giá chuyên cần</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats?.dayStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                    Không có dữ liệu báo cáo nào trong tháng {selectedMonth}.
                  </td>
                </tr>
              ) : (
                stats?.dayStats.map((d, idx) => (
                  <tr key={d.date} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-medium text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-extrabold text-slate-900">
                      {d.date.split('-').reverse().join('/')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-800 text-[11px]">
                        {d.reportedCount} lớp
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">{d.totalStudents}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {d.totalStudents - d.absentStudents}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-red-600">
                      {d.absentStudents > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-extrabold">
                          {d.absentStudents}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {d.rate.toFixed(2).replace('.', ',')}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      {d.rate <= 2.5 ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          Tốt (≥97.5%)
                        </span>
                      ) : d.rate <= 4.0 ? (
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                          Khá
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                          Cần đôn đốc
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
