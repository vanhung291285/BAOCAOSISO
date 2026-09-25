import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from 'lucide-react';
import { addDaysToDateStr, getTodayDateStr } from '../utils/schoolWeeks';

interface DateNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onChangeDate?: (newDate: string) => void;
  className?: string;
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  selectedDate,
  onChangeDate,
  className = '',
}) => {
  const today = getTodayDateStr();

  const handleDateChange = (newDate: string) => {
    if (typeof onChangeDate === 'function') {
      onChangeDate(newDate);
    }
  };

  const handlePrevDay = () => {
    handleDateChange(addDaysToDateStr(selectedDate, -1));
  };

  const handleNextDay = () => {
    handleDateChange(addDaysToDateStr(selectedDate, 1));
  };

  const handleToday = () => {
    handleDateChange(today);
  };

  // Format date display in Vietnamese: Thứ ..., Ngày DD/MM/YYYY
  const formatVietnameseDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const dayOfWeek = dayNames[d.getDay()];
      return `${dayOfWeek}, ${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start rounded-xl bg-white border border-slate-200 shadow-xs p-1">
        <button
          type="button"
          onClick={handlePrevDay}
          title="Ngày trước"
          className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-700 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1 text-xs font-semibold">Ngày trước</span>
        </button>

        <div className="relative mx-1 flex items-center flex-1 sm:flex-initial justify-center">
          <Calendar className="w-4 h-4 text-blue-600 absolute left-2 pointer-events-none" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && handleDateChange(e.target.value)}
            className="w-full sm:w-auto pl-8 pr-2 py-1 text-xs sm:text-sm font-bold text-slate-800 bg-transparent border-0 focus:ring-0 focus:outline-hidden cursor-pointer text-center"
          />
        </div>

        <button
          type="button"
          onClick={handleNextDay}
          title="Ngày sau"
          className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-700 active:scale-95 transition-all"
        >
          <span className="sr-only sm:not-sr-only sm:mr-1 text-xs font-semibold">Ngày sau</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {selectedDate !== today && (
        <button
          type="button"
          onClick={handleToday}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 active:scale-95 transition-all shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Về hôm nay
        </button>
      )}

      <div className="text-xs font-medium text-slate-600 hidden md:block bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/60">
        📅 {formatVietnameseDate(selectedDate)}
      </div>
    </div>
  );
};
