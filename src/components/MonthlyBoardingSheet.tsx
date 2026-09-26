import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { Student, BoardingDailyReport, BoardingMealRecord } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords } from '../utils/boardingRules';
import { formatDateVN } from '../utils/schoolWeeks';
import {
  Calendar,
  Download,
  Printer,
  Sparkles,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  School,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';

interface MonthlyBoardingSheetProps {
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
}

export const MonthlyBoardingSheet: React.FC<MonthlyBoardingSheetProps> = ({
  selectedClassId,
  onClassChange,
}) => {
  const { classes, campuses, students } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Current Month-Year: 'YYYY-MM'
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Class info
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const currentCampus = useMemo(() => {
    if (!currentClass?.campus_id) return null;
    return campuses.find((cp) => cp.id === currentClass.campus_id) || null;
  }, [campuses, currentClass]);

  // Boarding students
  const classBoardingStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter((s) => s.class_id === selectedClassId && s.isBoarding !== false);
  }, [students, selectedClassId]);

  // Parse Year and Month
  const { yearNum, monthNum, daysInMonth } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const numDays = new Date(y, m, 0).getDate();
    return { yearNum: y, monthNum: m, daysInMonth: numDays };
  }, [selectedMonth]);

  // Array of days info in the month
  const monthDays = useMemo(() => {
    const days: Array<{
      dayNum: number;
      dateStr: string;
      dayOfWeekShort: string; // '2', '3', '4', '5', '6', '7', 'CN'
      isSchoolMealDay: boolean; // T2-T6
      allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
    }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const schedule = getMealScheduleForDate(dateStr);
      const dateObj = new Date(yearNum, monthNum - 1, d);
      const dow = dateObj.getDay();
      let dowShort = 'CN';
      if (dow === 1) dowShort = '2';
      else if (dow === 2) dowShort = '3';
      else if (dow === 3) dowShort = '4';
      else if (dow === 4) dowShort = '5';
      else if (dow === 5) dowShort = '6';
      else if (dow === 6) dowShort = '7';

      days.push({
        dayNum: d,
        dateStr,
        dayOfWeekShort: dowShort,
        isSchoolMealDay: schedule.isMealDay,
        allowedMeals: {
          breakfast: schedule.breakfastAllowed,
          lunch: schedule.lunchAllowed,
          dinner: schedule.dinnerAllowed,
        },
      });
    }

    return days;
  }, [yearNum, monthNum, daysInMonth]);

  // Matrix of meal data: studentId -> { dateStr -> { breakfast: boolean, lunch: boolean, dinner: boolean } }
  const [mealMatrix, setMealMatrix] = useState<
    Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>>
  >({});

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load monthly meal data
  const loadMonthData = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsLoading(true);
    try {
      const reports = await StorageService.getBoardingReportsByClassAndMonth(selectedClassId, selectedMonth);
      const reportMap = new Map<string, BoardingDailyReport>();
      reports.forEach((r) => reportMap.set(r.date, r));

      const initialMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};

      classBoardingStudents.forEach((st) => {
        initialMatrix[st.id] = {};
        monthDays.forEach((day) => {
          const rep = reportMap.get(day.dateStr);
          if (rep && rep.records) {
            const stRec = rep.records.find((r) => r.student_id === st.id);
            if (stRec) {
              initialMatrix[st.id][day.dateStr] = {
                breakfast: Boolean(stRec.breakfast),
                lunch: Boolean(stRec.lunch),
                dinner: Boolean(stRec.dinner),
              };
              return;
            }
          }

          // Default fallback according to standard weekday rules
          initialMatrix[st.id][day.dateStr] = {
            breakfast: day.allowedMeals.breakfast,
            lunch: day.allowedMeals.lunch,
            dinner: day.allowedMeals.dinner,
          };
        });
      });

      setMealMatrix(initialMatrix);
    } catch (e) {
      console.error('Error loading month data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMonthData();
  }, [selectedClassId, selectedMonth, classBoardingStudents.length]);

  // Toggle meal cell
  const handleToggleCell = (studentId: string, dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner') => {
    setMealMatrix((prev) => {
      const studentDays = prev[studentId] || {};
      const currentDay = studentDays[dateStr] || { breakfast: false, lunch: false, dinner: false };
      return {
        ...prev,
        [studentId]: {
          ...studentDays,
          [dateStr]: {
            ...currentDay,
            [meal]: !currentDay[meal],
          },
        },
      };
    });
  };

  // Auto fill entire month according to school rules (T2-T5: S,T,T; T6: S,T; T7,CN: off)
  const handleAutoFillDefaultMonth = () => {
    if (window.confirm(`Bạn có chắc muốn tự động điền cả Tháng ${monthNum}/${yearNum} theo quy chuẩn trường (Thứ 2-5: 3 bữa; Thứ 6: Sáng+Trưa; Thứ 7 & CN: Nghỉ)?`)) {
      const newMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
      classBoardingStudents.forEach((st) => {
        newMatrix[st.id] = {};
        monthDays.forEach((day) => {
          newMatrix[st.id][day.dateStr] = {
            breakfast: day.allowedMeals.breakfast,
            lunch: day.allowedMeals.lunch,
            dinner: day.allowedMeals.dinner,
          };
        });
      });
      setMealMatrix(newMatrix);
      showToast('Đã tự động điền toàn bộ sổ chấm cơm tháng!');
    }
  };

  // Student summary calculation in the month
  const studentSummaries = useMemo(() => {
    // Total scheduled meal sessions in month according to standard calendar
    let standardBreakfastDays = 0;
    let standardLunchDays = 0;
    let standardDinnerDays = 0;

    monthDays.forEach((d) => {
      if (d.allowedMeals.breakfast) standardBreakfastDays++;
      if (d.allowedMeals.lunch) standardLunchDays++;
      if (d.allowedMeals.dinner) standardDinnerDays++;
    });

    const summaries: Record<
      string,
      {
        eatenBreakfast: number;
        eatenLunch: number;
        eatenDinner: number;
        missedBreakfast: number;
        missedLunch: number;
        missedDinner: number;
        actualDays: number;
      }
    > = {};

    classBoardingStudents.forEach((st) => {
      const stDays = mealMatrix[st.id] || {};
      let eatenB = 0;
      let eatenL = 0;
      let eatenD = 0;

      monthDays.forEach((d) => {
        const dayRecord = stDays[d.dateStr];
        if (dayRecord) {
          if (dayRecord.breakfast) eatenB++;
          if (dayRecord.lunch) eatenL++;
          if (dayRecord.dinner) eatenD++;
        }
      });

      const missedB = Math.max(0, standardBreakfastDays - eatenB);
      const missedL = Math.max(0, standardLunchDays - eatenL);
      const missedD = Math.max(0, standardDinnerDays - eatenD);
      // Quy đổi số ngày ăn thực = (eatenB + eatenL + eatenD) / 3 hoặc theo bữa trưa
      const actualDays = Math.round(((eatenB + eatenL + eatenD) / 3) * 10) / 10;

      summaries[st.id] = {
        eatenBreakfast: eatenB,
        eatenLunch: eatenL,
        eatenDinner: eatenD,
        missedBreakfast: missedB,
        missedLunch: missedL,
        missedDinner: missedD,
        actualDays,
      };
    });

    return {
      standardBreakfastDays,
      standardLunchDays,
      standardDinnerDays,
      summaries,
    };
  }, [classBoardingStudents, mealMatrix, monthDays]);

  // Save all days in month
  const handleSaveMonth = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsSaving(true);
    try {
      const reportsToSave: BoardingDailyReport[] = [];

      monthDays.forEach((day) => {
        const records: BoardingMealRecord[] = classBoardingStudents.map((st) => {
          const dayMeal = mealMatrix[st.id]?.[day.dateStr] || {
            breakfast: false,
            lunch: false,
            dinner: false,
          };
          const isAbsent = !dayMeal.breakfast && !dayMeal.lunch && !dayMeal.dinner && day.isSchoolMealDay;

          return {
            id: `meal_${selectedClassId}_${day.dateStr}_${st.id}`,
            class_id: selectedClassId,
            date: day.dateStr,
            student_id: st.id,
            student_name: st.full_name,
            gender: st.gender,
            village: st.village || st.address,
            breakfast: dayMeal.breakfast,
            lunch: dayMeal.lunch,
            dinner: dayMeal.dinner,
            is_absent: isAbsent,
            absent_reason: isAbsent ? 'Nghỉ ăn' : '',
            notes: '',
          };
        });

        let bCount = 0;
        let lCount = 0;
        let dCount = 0;
        let abCount = 0;
        records.forEach((r) => {
          if (r.breakfast) bCount++;
          if (r.lunch) lCount++;
          if (r.dinner) dCount++;
          if (r.is_absent) abCount++;
        });

        reportsToSave.push({
          id: `boarding_rep_${selectedClassId}_${day.dateStr}`,
          class_id: selectedClassId,
          date: day.dateStr,
          status: 'SUBMITTED',
          total_boarding_students: classBoardingStudents.length,
          breakfast_count: bCount,
          lunch_count: lCount,
          dinner_count: dCount,
          absent_count: abCount,
          total_meals: bCount + lCount + dCount,
          notes: '',
          records,
          submitted_by: currentUser?.id,
          submitted_by_name: currentUser?.full_name || 'GVCN',
          submitted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });

      await StorageService.saveBoardingReportsBulk(reportsToSave, currentUser || undefined);
      showToast(`Đã lưu thành công Sổ chấm cơm lớp ${currentClass?.class_name} Tháng ${monthNum}/${yearNum}!`);
    } catch (e) {
      console.error(e);
      showToast('Có lỗi xảy ra khi lưu sổ chấm cơm!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Export exact matching Excel form
  const handleExportExcel = () => {
    try {
      const rows: any[][] = [];

      // Row 1: Header Trường
      rows.push(['TRƯỜNG PTDTBT THCS XA DUNG', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      // Row 2: Header Phân hiệu
      rows.push([`PHÂN HIỆU: ${currentCampus?.name?.toUpperCase() || 'SUỐI LƯ'}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      // Row 3: Blank
      rows.push([]);
      // Row 4: Main Title
      rows.push(['', '', '', '', '', '', '', '', '', '', '', `SỔ CHẤM CƠM LỚP: ${currentClass?.class_name?.toUpperCase() || ''} THÁNG ${monthNum}/${yearNum}`]);
      // Row 5: Blank
      rows.push([]);

      // Row 6: Table Header 1 (Ngày)
      const hRow1: any[] = ['STT', 'Họ và tên'];
      monthDays.forEach((d) => {
        hRow1.push(d.dayNum, '', '');
      });
      hRow1.push('Số ngày ăn trong tháng', '', '', '', '', '', 'Ngày ăn thực');
      rows.push(hRow1);

      // Row 7: Table Header 2 (Thứ)
      const hRow2: any[] = ['', ''];
      monthDays.forEach((d) => {
        hRow2.push(d.dayOfWeekShort, '', '');
      });
      hRow2.push('Số ngày báo ăn', '', '', 'Số ngày không báo ăn', '', '', '');
      rows.push(hRow2);

      // Row 8: Table Header 3 (Bữa: S, T, T)
      const hRow3: any[] = ['', ''];
      monthDays.forEach(() => {
        hRow3.push('S', 'T', 'T');
      });
      hRow3.push('S', 'T', 'T', 'S', 'T', 'T', '');
      rows.push(hRow3);

      // Rows for each student
      classBoardingStudents.forEach((st, idx) => {
        const rData: any[] = [idx + 1, st.full_name];
        const stDays = mealMatrix[st.id] || {};

        monthDays.forEach((d) => {
          const dRec = stDays[d.dateStr];
          rData.push(
            dRec?.breakfast ? '+' : '',
            dRec?.lunch ? '+' : '',
            dRec?.dinner ? '+' : ''
          );
        });

        const sum = studentSummaries.summaries[st.id] || {
          eatenBreakfast: 0,
          eatenLunch: 0,
          eatenDinner: 0,
          missedBreakfast: 0,
          missedLunch: 0,
          missedDinner: 0,
          actualDays: 0,
        };

        rData.push(
          sum.eatenBreakfast,
          sum.eatenLunch,
          sum.eatenDinner,
          sum.missedBreakfast,
          sum.missedLunch,
          sum.missedDinner,
          sum.actualDays
        );

        rows.push(rData);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Create Merges for headers
      const merges: XLSX.Range[] = [
        // Title merge
        { s: { r: 3, c: 5 }, e: { r: 3, c: 25 } },
        // STT & Họ và tên merges
        { s: { r: 5, c: 0 }, e: { r: 7, c: 0 } },
        { s: { r: 5, c: 1 }, e: { r: 7, c: 1 } },
      ];

      // Merge days (every 3 columns)
      let colIdx = 2;
      monthDays.forEach(() => {
        // Merge Ngày row
        merges.push({ s: { r: 5, c: colIdx }, e: { r: 5, c: colIdx + 2 } });
        // Merge Thứ row
        merges.push({ s: { r: 6, c: colIdx }, e: { r: 6, c: colIdx + 2 } });
        colIdx += 3;
      });

      // Merge summary group
      merges.push({ s: { r: 5, c: colIdx }, e: { r: 5, c: colIdx + 5 } }); // Số ngày ăn trong tháng
      merges.push({ s: { r: 6, c: colIdx }, e: { r: 6, c: colIdx + 2 } }); // Số ngày báo ăn
      merges.push({ s: { r: 6, c: colIdx + 3 }, e: { r: 6, c: colIdx + 5 } }); // Số ngày không báo ăn

      ws['!merges'] = merges;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `SoChamCom_T${monthNum}`);
      XLSX.writeFile(wb, `So_Cham_Com_Lop_${currentClass?.class_name || ''}_Thang_${monthNum}_${yearNum}.xlsx`);
      showToast('Đã xuất file Excel Sổ Chấm Cơm chuẩn biểu mẫu!');
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi xuất file Excel!', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-xs font-bold text-white transition-all ${
            toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Picker */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tháng:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Class selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lớp:</label>
            {isGVCN && currentUser?.assigned_class_id ? (
              <span className="bg-blue-50 text-blue-900 font-black text-xs sm:text-sm px-3 py-1.5 rounded-xl border border-blue-200">
                Lớp {currentClass?.class_name}
              </span>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => onClassChange?.(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none"
              >
                {classes
                  .filter((c) => c.active && !c.is_locked)
                  .map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      Lớp {cls.class_name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFillDefaultMonth}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 flex items-center gap-1.5 transition-all"
            title="Tự động điền đầy đủ cả tháng (Thứ 2-5: 3 bữa; Thứ 6: Sáng+Trưa; T7,CN: Nghỉ)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Điền chuẩn cả tháng</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel chuẩn mẫu</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>In sổ A3/A4</span>
          </button>

          <button
            type="button"
            onClick={handleSaveMonth}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu Sổ Chấm Cơm'}</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet View matching the official photo */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden print:p-0 print:border-none print:shadow-none">
        {/* Print Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 pb-4 mb-4 border-b border-slate-200 print:border-black">
          <div>
            <div className="font-extrabold text-xs sm:text-sm text-slate-900 uppercase tracking-tight">
              TRƯỜNG PTDTBT THCS XA DUNG
            </div>
            <div className="font-bold text-xs text-slate-700 uppercase">
              PHÂN HIỆU: {currentCampus?.name?.toUpperCase() || 'SUỐI LƯ'}
            </div>
          </div>

          <div className="text-center md:text-right">
            <h2 className="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tight">
              SỔ CHẤM CƠM LỚP: {currentClass?.class_name || ''} THÁNG {monthNum}/{yearNum}
            </h2>
            <div className="text-[11px] text-slate-500 font-medium">
              Sĩ số bán trú: <strong className="text-slate-900">{classBoardingStudents.length} học sinh</strong>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải dữ liệu sổ chấm cơm tháng...</span>
          </div>
        ) : classBoardingStudents.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Lớp này chưa có học sinh bán trú. Thầy/Cô vui lòng chuyển sang tab "Danh sách HS bán trú" để thêm học sinh.
          </div>
        ) : (
          /* Table Sheet Grid */
          <div className="overflow-x-auto border border-slate-300 rounded-xl">
            <table className="w-full text-center border-collapse text-[10px] sm:text-[11px]">
              <thead>
                {/* Row 1: STT, Họ và tên, Ngày (1..daysInMonth), Số ngày ăn trong tháng */}
                <tr className="bg-slate-100 font-black text-slate-900 border-b border-slate-300">
                  <th rowSpan={3} className="py-2 px-1 w-8 border-r border-slate-300">STT</th>
                  <th rowSpan={3} className="py-2 px-2 min-w-[130px] text-left border-r border-slate-300">
                    Họ và tên
                  </th>
                  {monthDays.map((d) => (
                    <th
                      key={d.dayNum}
                      colSpan={3}
                      className={`py-1 px-1 border-r border-slate-300 text-center ${
                        !d.isSchoolMealDay ? 'bg-slate-200/70 text-slate-500' : ''
                      }`}
                    >
                      {d.dayNum}
                    </th>
                  ))}
                  <th colSpan={6} className="py-1 px-2 border-r border-slate-300 bg-amber-50/70 text-amber-950 font-black">
                    Số ngày ăn trong tháng
                  </th>
                  <th rowSpan={3} className="py-2 px-1.5 w-14 bg-emerald-50 text-emerald-950 font-black">
                    Ngày thực
                  </th>
                </tr>

                {/* Row 2: Thứ (2,3,4,5,6,7,CN), Nhóm Số ngày báo ăn (S,T,T), Số ngày không báo ăn (S,T,T) */}
                <tr className="bg-slate-50 font-bold text-slate-800 border-b border-slate-300">
                  {monthDays.map((d) => (
                    <th
                      key={d.dayNum}
                      colSpan={3}
                      className={`py-0.5 px-1 border-r border-slate-300 text-center ${
                        d.dayOfWeekShort === '7' || d.dayOfWeekShort === 'CN'
                          ? 'bg-slate-200/80 text-rose-600 font-extrabold'
                          : ''
                      }`}
                    >
                      {d.dayOfWeekShort}
                    </th>
                  ))}
                  <th colSpan={3} className="py-0.5 px-1 border-r border-slate-300 bg-blue-50/70 text-blue-900">
                    Số ngày báo ăn
                  </th>
                  <th colSpan={3} className="py-0.5 px-1 border-r border-slate-300 bg-rose-50/70 text-rose-900">
                    Số ngày không báo ăn
                  </th>
                </tr>

                {/* Row 3: S, T, T headers */}
                <tr className="bg-slate-100 font-bold text-slate-600 border-b-2 border-slate-300">
                  {monthDays.map((d) => (
                    <React.Fragment key={d.dayNum}>
                      <th className="py-0.5 w-4 border-r border-slate-200 text-blue-700">S</th>
                      <th className="py-0.5 w-4 border-r border-slate-200 text-amber-700">T</th>
                      <th className="py-0.5 w-4 border-r border-slate-300 text-purple-700">T</th>
                    </React.Fragment>
                  ))}
                  {/* Summary S,T,T for eaten */}
                  <th className="py-0.5 w-6 border-r border-slate-200 bg-blue-50 text-blue-800">S</th>
                  <th className="py-0.5 w-6 border-r border-slate-200 bg-blue-50 text-blue-800">T</th>
                  <th className="py-0.5 w-6 border-r border-slate-300 bg-blue-50 text-blue-800">T</th>
                  {/* Summary S,T,T for missed */}
                  <th className="py-0.5 w-6 border-r border-slate-200 bg-rose-50 text-rose-800">S</th>
                  <th className="py-0.5 w-6 border-r border-slate-200 bg-rose-50 text-rose-800">T</th>
                  <th className="py-0.5 w-6 border-r border-slate-300 bg-rose-50 text-rose-800">T</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {classBoardingStudents.map((st, idx) => {
                  const stDays = mealMatrix[st.id] || {};
                  const sum = studentSummaries.summaries[st.id] || {
                    eatenBreakfast: 0,
                    eatenLunch: 0,
                    eatenDinner: 0,
                    missedBreakfast: 0,
                    missedLunch: 0,
                    missedDinner: 0,
                    actualDays: 0,
                  };

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-1.5 px-1 font-bold text-slate-400 border-r border-slate-200">{idx + 1}</td>
                      <td className="py-1.5 px-2 text-left font-extrabold text-slate-900 border-r border-slate-300 whitespace-nowrap">
                        {st.full_name}
                      </td>

                      {/* Daily cells: S, T, T */}
                      {monthDays.map((d) => {
                        const dMeal = stDays[d.dateStr] || { breakfast: false, lunch: false, dinner: false };
                        const isWeekend = d.dayOfWeekShort === '7' || d.dayOfWeekShort === 'CN';

                        return (
                          <React.Fragment key={d.dayNum}>
                            {/* Sáng */}
                            <td
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'breakfast')}
                              className={`py-1 w-4 border-r border-slate-200 cursor-pointer font-black select-none ${
                                dMeal.breakfast ? 'text-blue-700 bg-blue-50/30' : isWeekend ? 'bg-slate-100/60' : ''
                              }`}
                              title={`Ngày ${d.dayNum} - Sáng: ${dMeal.breakfast ? 'Có ăn' : 'Nghỉ'}`}
                            >
                              {dMeal.breakfast ? '+' : ''}
                            </td>

                            {/* Trưa */}
                            <td
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'lunch')}
                              className={`py-1 w-4 border-r border-slate-200 cursor-pointer font-black select-none ${
                                dMeal.lunch ? 'text-amber-700 bg-amber-50/30' : isWeekend ? 'bg-slate-100/60' : ''
                              }`}
                              title={`Ngày ${d.dayNum} - Trưa: ${dMeal.lunch ? 'Có ăn' : 'Nghỉ'}`}
                            >
                              {dMeal.lunch ? '+' : ''}
                            </td>

                            {/* Tối */}
                            <td
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'dinner')}
                              className={`py-1 w-4 border-r border-slate-300 cursor-pointer font-black select-none ${
                                dMeal.dinner ? 'text-purple-700 bg-purple-50/30' : isWeekend || d.dayOfWeekShort === '6' ? 'bg-slate-100/60' : ''
                              }`}
                              title={`Ngày ${d.dayNum} - Tối: ${dMeal.dinner ? 'Có ăn' : 'Nghỉ'}`}
                            >
                              {dMeal.dinner ? '+' : ''}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Summary Eaten: S, T, T */}
                      <td className="py-1.5 px-1 font-bold text-blue-900 bg-blue-50/40 border-r border-slate-200">
                        {sum.eatenBreakfast}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-blue-900 bg-blue-50/40 border-r border-slate-200">
                        {sum.eatenLunch}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-blue-900 bg-blue-50/40 border-r border-slate-300">
                        {sum.eatenDinner}
                      </td>

                      {/* Summary Missed: S, T, T */}
                      <td className="py-1.5 px-1 font-bold text-rose-700 bg-rose-50/40 border-r border-slate-200">
                        {sum.missedBreakfast}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-rose-700 bg-rose-50/40 border-r border-slate-200">
                        {sum.missedLunch}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-rose-700 bg-rose-50/40 border-r border-slate-300">
                        {sum.missedDinner}
                      </td>

                      {/* Actual Days */}
                      <td className="py-1.5 px-1 font-black text-emerald-800 bg-emerald-50/60">
                        {sum.actualDays}
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
