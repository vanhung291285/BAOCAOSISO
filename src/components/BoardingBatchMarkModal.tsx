import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Calendar,
  CheckCircle2,
  Check,
  Trash2,
  Sun,
  Sunrise,
  Moon,
  Users,
  CheckSquare,
  Square,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Student } from '../types';
import { getTodayDateStr } from '../utils/schoolWeeks';

interface DayInfo {
  dayNum: number;
  dateStr: string;
  dayOfWeekShort: string;
  isSchoolMealDay: boolean;
  allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
}

interface BoardingBatchMarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthDays: DayInfo[];
  students: Student[];
  classNameStr: string;
  monthNum: number;
  yearNum: number;
  onApplyBatch: (
    dates: string[],
    mealOption: 'all_day' | 'breakfast' | 'lunch' | 'dinner' | 'clear',
    studentIds?: string[]
  ) => Promise<void>;
}

export const BoardingBatchMarkModal: React.FC<BoardingBatchMarkModalProps> = ({
  isOpen,
  onClose,
  monthDays,
  students,
  classNameStr,
  monthNum,
  yearNum,
  onApplyBatch,
}) => {
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    // Default to today if in current month, or first school day
    const today = getTodayDateStr();
    const todayInMonth = monthDays.find((d) => d.dateStr === today);
    if (todayInMonth) return [today];
    const firstSchoolDay = monthDays.find((d) => d.isSchoolMealDay);
    return firstSchoolDay ? [firstSchoolDay.dateStr] : [];
  });

  const [mealAction, setMealAction] = useState<
    'all_day' | 'breakfast' | 'lunch' | 'dinner' | 'clear'
  >('all_day');

  const [applyToAllStudents, setApplyToAllStudents] = useState<boolean>(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() =>
    students.map((s) => s.id)
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Quick Date Range Presets
  const handleSelectPreset = (preset: 'today' | 'week' | 'page1' | 'page2' | 'all_school_days' | 'all_month') => {
    const today = getTodayDateStr();
    if (preset === 'today') {
      const match = monthDays.find((d) => d.dateStr === today);
      setSelectedDates(match ? [match.dateStr] : []);
    } else if (preset === 'week') {
      // Find current week days in this month
      const todayDate = new Date();
      const currentDay = todayDate.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() + mondayOffset);

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        weekDates.push(`${y}-${m}-${day}`);
      }

      const inMonthWeekDates = monthDays
        .filter((d) => weekDates.includes(d.dateStr) && d.isSchoolMealDay)
        .map((d) => d.dateStr);

      setSelectedDates(inMonthWeekDates.length > 0 ? inMonthWeekDates : monthDays.filter((d) => d.isSchoolMealDay).slice(0, 5).map((d) => d.dateStr));
    } else if (preset === 'page1') {
      setSelectedDates(monthDays.slice(0, 15).filter((d) => d.isSchoolMealDay).map((d) => d.dateStr));
    } else if (preset === 'page2') {
      setSelectedDates(monthDays.slice(15).filter((d) => d.isSchoolMealDay).map((d) => d.dateStr));
    } else if (preset === 'all_school_days') {
      setSelectedDates(monthDays.filter((d) => d.isSchoolMealDay).map((d) => d.dateStr));
    } else if (preset === 'all_month') {
      setSelectedDates(monthDays.map((d) => d.dateStr));
    }
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  const handleSelectAllDates = () => {
    if (selectedDates.length === monthDays.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates(monthDays.map((d) => d.dateStr));
    }
  };

  const handleToggleStudent = (stId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(stId) ? prev.filter((id) => id !== stId) : [...prev, stId]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
  };

  const handleExecute = async () => {
    if (selectedDates.length === 0) {
      alert('Vui lòng chọn ít nhất 1 ngày để thực hiện chấm ăn hoặc xóa chấm ăn!');
      return;
    }

    if (!applyToAllStudents && selectedStudentIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 học sinh!');
      return;
    }

    setIsProcessing(true);
    try {
      await onApplyBatch(
        selectedDates,
        mealAction,
        applyToAllStudents ? undefined : selectedStudentIds
      );
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-xs shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight">
                Chấm Ăn Nhanh Theo Ngày & Theo Buổi
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                Lớp {classNameStr} • Tháng {monthNum}/{yearNum}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-800">
          {/* Section 1: Choose Action */}
          <div>
            <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-black">1</span>
              <span>Chọn thao tác chấm ăn</span>
            </label>

            <div className="space-y-2.5">
              {/* Option 1: Chấm Cả Ngày - Hero Highlight Card */}
              <button
                type="button"
                onClick={() => setMealAction('all_day')}
                className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                  mealAction === 'all_day'
                    ? 'border-blue-600 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/90 ring-2 ring-blue-500/50 shadow-md'
                    : 'border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${mealAction === 'all_day' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-100 text-blue-700'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900">Chấm Cả Ngày</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-black shadow-2xs">
                        Khuyên dùng (S + T + T)
                      </span>
                    </div>
                    {mealAction === 'all_day' && (
                      <span className="text-xs font-black text-blue-700 flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-lg border border-blue-200">
                        <Check className="w-3.5 h-3.5" /> Đang chọn
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    Tự động tích (+) đầy đủ cả 3 bữa <strong>Sáng, Trưa, Tối</strong> cho toàn bộ học sinh theo đúng lịch học của từng ngày được chọn.
                  </div>
                </div>
              </button>

              {/* Sub-grid: 3 buổi Sáng, Trưa, Tối */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Option: Buổi Sáng */}
                <button
                  type="button"
                  onClick={() => setMealAction('breakfast')}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    mealAction === 'breakfast'
                      ? 'border-amber-600 bg-amber-50/90 ring-2 ring-amber-400/50 shadow-sm'
                      : 'border-slate-200 hover:border-amber-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${mealAction === 'breakfast' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    <Sunrise className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900">Chấm Buổi Sáng (S)</div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                      Tích ăn sáng (+)
                    </div>
                  </div>
                </button>

                {/* Option: Buổi Trưa */}
                <button
                  type="button"
                  onClick={() => setMealAction('lunch')}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    mealAction === 'lunch'
                      ? 'border-orange-600 bg-orange-50/90 ring-2 ring-orange-400/50 shadow-sm'
                      : 'border-slate-200 hover:border-orange-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${mealAction === 'lunch' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                    <Sun className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900">Chấm Buổi Trưa (T)</div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                      Tích ăn trưa (+)
                    </div>
                  </div>
                </button>

                {/* Option: Buổi Tối */}
                <button
                  type="button"
                  onClick={() => setMealAction('dinner')}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    mealAction === 'dinner'
                      ? 'border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-400/50 shadow-sm'
                      : 'border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${mealAction === 'dinner' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                    <Moon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900">Chấm Buổi Tối (T)</div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                      Tích ăn tối (+)
                    </div>
                  </div>
                </button>
              </div>

              {/* Option: Xóa chấm ngày */}
              <button
                type="button"
                onClick={() => setMealAction('clear')}
                className={`w-full p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  mealAction === 'clear'
                    ? 'border-rose-600 bg-rose-50/90 ring-2 ring-rose-400/50 shadow-sm'
                    : 'border-slate-200 hover:border-rose-300 bg-white hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${mealAction === 'clear' ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-700'}`}>
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-rose-900">Xóa Chấm Ăn Ngày Này (Để trống)</div>
                  <div className="text-[11px] text-slate-600 font-medium mt-0.5 leading-snug">
                    Xóa sạch toàn bộ dấu (+) của các ngày đã chọn để đưa về trạng thái chưa chấm ăn
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Choose Dates */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-black">2</span>
                Chọn ngày áp dụng ({selectedDates.length} ngày đã chọn)
              </label>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('today')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold cursor-pointer border border-slate-200"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('week')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold cursor-pointer border border-slate-200"
                >
                  Tuần này
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('page1')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold cursor-pointer border border-slate-200"
                >
                  Ngày 1 - 15
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('page2')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold cursor-pointer border border-slate-200"
                >
                  Ngày 16 - cuối
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('all_school_days')}
                  className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold cursor-pointer border border-blue-200"
                >
                  Tất cả ngày đi học
                </button>
              </div>
            </div>

            {/* Date Grid */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl max-h-[160px] overflow-y-auto">
              <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                {monthDays.map((d) => {
                  const isSelected = selectedDates.includes(d.dateStr);
                  const isSchoolDay = d.isSchoolMealDay;

                  return (
                    <button
                      key={d.dayNum}
                      type="button"
                      onClick={() => toggleDate(d.dateStr)}
                      className={`p-1.5 rounded-xl text-center border transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 border-blue-700 text-white shadow-xs font-bold'
                          : isSchoolDay
                          ? 'bg-white border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-blue-50/40'
                          : 'bg-slate-100/80 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold opacity-80">T{d.dayOfWeekShort}</span>
                      <span className="text-xs font-black">{d.dayNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Scope (All students or customized) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-black">3</span>
                Đối tượng học sinh áp dụng
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setApplyToAllStudents(true)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                    applyToAllStudents
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tất cả {students.length} học sinh
                </button>
                <button
                  type="button"
                  onClick={() => setApplyToAllStudents(false)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                    !applyToAllStudents
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Chọn từng học sinh ({selectedStudentIds.length})
                </button>
              </div>
            </div>

            {!applyToAllStudents && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl max-h-[140px] overflow-y-auto space-y-1">
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <span>Danh sách học sinh bán trú</span>
                  <button
                    type="button"
                    onClick={handleSelectAllStudents}
                    className="text-blue-600 hover:underline cursor-pointer text-[11px]"
                  >
                    {selectedStudentIds.length === students.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {students.map((st, idx) => {
                    const isChecked = selectedStudentIds.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer select-none transition-all ${
                          isChecked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleStudent(st.id)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-slate-400 w-4">{idx + 1}.</span>
                        <span className="truncate">{st.full_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {mealAction === 'clear' ? (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Sẽ xóa chấm ăn của {selectedDates.length} ngày cho {applyToAllStudents ? students.length : selectedStudentIds.length} học sinh
              </span>
            ) : (
              <span className="text-slate-700 font-medium">
                Áp dụng: <strong className="text-blue-700">{selectedDates.length} ngày</strong> × <strong className="text-blue-700">{applyToAllStudents ? students.length : selectedStudentIds.length} học sinh</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 cursor-pointer transition-all disabled:opacity-50"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isProcessing || selectedDates.length === 0}
              className={`px-5 py-2 rounded-xl text-xs font-black text-white shadow-md flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 ${
                mealAction === 'clear'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : mealAction === 'clear' ? (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa chấm ăn {selectedDates.length} ngày</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Thực hiện chấm ăn</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
