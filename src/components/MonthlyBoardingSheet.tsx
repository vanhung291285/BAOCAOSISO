import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { getSupabaseClient, isSupabaseConnected } from '../services/supabase';
import { Student, BoardingDailyReport, BoardingMealRecord } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords, generateDefaultBoardingStudentsForClass } from '../utils/boardingRules';
import { formatDateVN } from '../utils/schoolWeeks';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';
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

  // View mode: 'all' | 'page1' (1-15) | 'page2' (16-end)
  const [viewMode, setViewMode] = useState<'all' | 'page1' | 'page2'>('all');

  // Days to display according to current view mode
  const displayedMonthDays = useMemo(() => {
    if (viewMode === 'page1') {
      return monthDays.filter((d) => d.dayNum <= 15);
    }
    if (viewMode === 'page2') {
      return monthDays.filter((d) => d.dayNum >= 16);
    }
    return monthDays;
  }, [monthDays, viewMode]);

  const showSummaryColumns = viewMode === 'all' || viewMode === 'page2';

  const [overrideBreakfast, setOverrideBreakfast] = useState<number | null>(null);
  const [overrideLunch, setOverrideLunch] = useState<number | null>(null);
  const [overrideDinner, setOverrideDinner] = useState<number | null>(null);

  const { defaultStandardBreakfast, defaultStandardLunch, defaultStandardDinner } = useMemo(() => {
    let bCount = 0;
    let lCount = 0;
    let dCount = 0;
    monthDays.forEach((d) => {
      if (d.allowedMeals.breakfast) bCount++;
      if (d.allowedMeals.lunch) lCount++;
      if (d.allowedMeals.dinner) dCount++;
    });
    return {
      defaultStandardBreakfast: bCount,
      defaultStandardLunch: lCount,
      defaultStandardDinner: dCount,
    };
  }, [monthDays]);

  // Load custom standard days config from localStorage
  useEffect(() => {
    if (!selectedClassId || !selectedMonth) return;
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      if (savedRaw) {
        const configs = JSON.parse(savedRaw);
        const configKey = `${selectedClassId}_${selectedMonth}`;
        const savedConfig = configs[configKey];
        if (savedConfig) {
          setOverrideBreakfast(savedConfig.breakfast !== undefined ? savedConfig.breakfast : null);
          setOverrideLunch(savedConfig.lunch !== undefined ? savedConfig.lunch : null);
          setOverrideDinner(savedConfig.dinner !== undefined ? savedConfig.dinner : null);
          return;
        }
      }
    } catch (e) {
      console.warn('Error loading custom standard config:', e);
    }
    setOverrideBreakfast(null);
    setOverrideLunch(null);
    setOverrideDinner(null);
  }, [selectedClassId, selectedMonth]);

  // Helper to persist custom standard days config
  const saveCustomStandardConfig = (
    breakfast: number | null,
    lunch: number | null,
    dinner: number | null
  ) => {
    if (!selectedClassId || !selectedMonth) return;
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      const configs = savedRaw ? JSON.parse(savedRaw) : {};
      const configKey = `${selectedClassId}_${selectedMonth}`;
      
      if (breakfast === null && lunch === null && dinner === null) {
        delete configs[configKey];
      } else {
        configs[configKey] = {
          breakfast: breakfast !== null ? breakfast : undefined,
          lunch: lunch !== null ? lunch : undefined,
          dinner: dinner !== null ? dinner : undefined,
        };
      }
      
      localStorage.setItem('sso_boarding_standard_configs_v1', JSON.stringify(configs));
    } catch (e) {
      console.warn('Error saving custom standard config:', e);
    }
  };

  const updateOverrideBreakfast = (val: number | null) => {
    setOverrideBreakfast(val);
    saveCustomStandardConfig(val, overrideLunch, overrideDinner);
  };

  const updateOverrideLunch = (val: number | null) => {
    setOverrideLunch(val);
    saveCustomStandardConfig(overrideBreakfast, val, overrideDinner);
  };

  const updateOverrideDinner = (val: number | null) => {
    setOverrideDinner(val);
    saveCustomStandardConfig(overrideBreakfast, overrideLunch, val);
  };

  const standardBreakfastDays = overrideBreakfast !== null ? overrideBreakfast : defaultStandardBreakfast;
  const standardLunchDays = overrideLunch !== null ? overrideLunch : defaultStandardLunch;
  const standardDinnerDays = overrideDinner !== null ? overrideDinner : defaultStandardDinner;

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load monthly meal data
  const loadMonthData = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsLoading(true);
    try {
      // 1. Fetch boarding reports
      const reports = await StorageService.getBoardingReportsByClassAndMonth(selectedClassId, selectedMonth);
      const reportMap = new Map<string, BoardingDailyReport>();
      reports.forEach((r) => reportMap.set(r.date, r));

      // 2. Fetch daily attendance reports to see who is absent on each date
      let classDailyReports: any[] = [];
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          const { data: repData, error: repErr } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('class_id', selectedClassId)
            .gte('report_date', `${selectedMonth}-01`)
            .lte('report_date', `${selectedMonth}-31`);
          if (!repErr && repData) {
            classDailyReports = repData;
          }
        } catch (e) {
          console.warn('Error fetching daily reports from Supabase:', e);
        }
      }

      if (classDailyReports.length === 0) {
        try {
          const raw = localStorage.getItem('sso_daily_reports_v1');
          if (raw) {
            const list: any[] = JSON.parse(raw);
            classDailyReports = list.filter(r => r.class_id === selectedClassId && r.report_date.startsWith(selectedMonth));
          }
        } catch (e) {}
      }

      // Map of absent students per date: dateStr -> Set of student IDs / normalized names
      const absentMapByDate = new Map<string, Set<string>>();
      classDailyReports.forEach((rep) => {
        let absentList: any[] = [];
        if (typeof rep.absent_students === 'string') {
          try { absentList = JSON.parse(rep.absent_students); } catch {}
        } else if (Array.isArray(rep.absent_students)) {
          absentList = rep.absent_students;
        }

        const absentSet = new Set<string>();
        absentList.forEach((abs) => {
          if (abs.id) absentSet.add(abs.id);
          if (abs.student_id) absentSet.add(abs.student_id);
          if (abs.full_name) absentSet.add(abs.full_name.trim().toLowerCase());
          if (abs.name) absentSet.add(abs.name.trim().toLowerCase());
        });

        absentMapByDate.set(rep.report_date, absentSet);
      });

      const initialMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};

      classBoardingStudents.forEach((st) => {
        initialMatrix[st.id] = {};
        monthDays.forEach((day) => {
          const rep = reportMap.get(day.dateStr);

          // Check if there is an actual attendance report or boarding report for this day
          const isDateReported = classDailyReports.some(r => r.report_date === day.dateStr) || reportMap.has(day.dateStr);

          if (!isDateReported) {
            // Măc định báo ăn để trống tức là chưa chấm khi GVCN chưa báo
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
            return;
          }

          // Check if student was reported absent in daily report on this date
          const isStudentAbsentOnDay = (() => {
            const absentSet = absentMapByDate.get(day.dateStr);
            if (!absentSet) return false;
            return absentSet.has(st.id) || absentSet.has(st.full_name.trim().toLowerCase());
          })();

          if (isStudentAbsentOnDay) {
            // "nếu là HS bán trú vắng thì cả ngày hôm đó không ăn và tự động đồng bộ sang phiếu chấm ăn"
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
            return;
          }

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

  // Background auto-save helper
  const autoSaveMealMatrix = async (currentMatrix: typeof mealMatrix) => {
    if (!selectedClassId || !selectedMonth) return;
    try {
      const reportsToSave: BoardingDailyReport[] = [];

      monthDays.forEach((day) => {
        const records: BoardingMealRecord[] = classBoardingStudents.map((st) => {
          const dayMeal = currentMatrix[st.id]?.[day.dateStr] || {
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

      await StorageService.saveBoardingReportsBulk(reportsToSave);
    } catch (e) {
      console.error('Error in background auto-save:', e);
    }
  };

  // Toggle meal cell
  const handleToggleCell = (studentId: string, dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner') => {
    setMealMatrix((prev) => {
      const studentDays = prev[studentId] || {};
      const currentDay = studentDays[dateStr] || { breakfast: false, lunch: false, dinner: false };
      const updated = {
        ...prev,
        [studentId]: {
          ...studentDays,
          [dateStr]: {
            ...currentDay,
            [meal]: !currentDay[meal],
          },
        },
      };
      autoSaveMealMatrix(updated);
      return updated;
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
  }, [classBoardingStudents, mealMatrix, monthDays, standardBreakfastDays, standardLunchDays, standardDinnerDays]);

  // Daily column meal counts for footer CỘNG
  const columnTotals = useMemo(() => {
    const dailyTotals: Record<string, { breakfast: number; lunch: number; dinner: number }> = {};

    displayedMonthDays.forEach((d) => {
      let b = 0;
      let l = 0;
      let dn = 0;
      classBoardingStudents.forEach((st) => {
        const dMeal = mealMatrix[st.id]?.[d.dateStr];
        if (dMeal?.breakfast) b++;
        if (dMeal?.lunch) l++;
        if (dMeal?.dinner) dn++;
      });
      dailyTotals[d.dateStr] = { breakfast: b, lunch: l, dinner: dn };
    });

    let totalEatenB = 0;
    let totalEatenL = 0;
    let totalEatenD = 0;
    let totalMissedB = 0;
    let totalMissedL = 0;
    let totalMissedD = 0;
    let totalActualDays = 0;

    classBoardingStudents.forEach((st) => {
      const sum = studentSummaries.summaries[st.id];
      if (sum) {
        totalEatenB += sum.eatenBreakfast;
        totalEatenL += sum.eatenLunch;
        totalEatenD += sum.eatenDinner;
        totalMissedB += sum.missedBreakfast;
        totalMissedL += sum.missedLunch;
        totalMissedD += sum.missedDinner;
        totalActualDays += sum.actualDays;
      }
    });

    return {
      dailyTotals,
      totalEatenB,
      totalEatenL,
      totalEatenD,
      totalMissedB,
      totalMissedL,
      totalMissedD,
      totalActualDays: Math.round(totalActualDays * 10) / 10,
    };
  }, [displayedMonthDays, classBoardingStudents, mealMatrix, studentSummaries]);

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
  const handleExportExcel = async () => {
    try {
      if (!currentClass) return;
      await exportMonthlyBoardingExcel({
        classId: selectedClassId,
        className: currentClass.class_name,
        campusName: currentCampus?.name || 'Suối Lư',
        schoolName: 'TRƯỜNG PTDTBT THCS XA DUNG',
        monthStr: selectedMonth,
        students: students, // Pass all students so export function can auto-generate if empty
        teacherName: currentUser?.full_name || 'Giáo viên chủ nhiệm',
        principalName: 'Hiệu trưởng',
        existingMatrix: Object.keys(mealMatrix).length > 0 ? mealMatrix : undefined,
        standardBreakfastDays,
        standardLunchDays,
        standardDinnerDays,
      });
      showToast('Đã xuất file Excel Sổ Chấm Cơm chuẩn biểu mẫu thành công!');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Lỗi khi xuất file Excel!', 'error');
    }
  };

  const [isGeneratingStudents, setIsGeneratingStudents] = useState(false);
  const handleGenerateDefaultStudents = async () => {
    if (!currentClass) return;
    setIsGeneratingStudents(true);
    try {
      const defaultStds = generateDefaultBoardingStudentsForClass(selectedClassId, currentClass.class_name);
      await StorageService.saveStudents(defaultStds);
      showToast(`Đã khởi tạo thành công 35 học sinh bán trú lớp ${currentClass.class_name}!`);
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi khởi tạo danh sách học sinh!', 'error');
    } finally {
      setIsGeneratingStudents(false);
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
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Xuất file Excel chuẩn Bộ GD&ĐT tự động chia 2 trang (Trang 1: Ngày 1-15, Trang 2: Ngày 16-hết) khi in không bị co chữ"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel (2 Trang chuẩn mẫu)</span>
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

      {/* Custom standard meal days configuration */}
      <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 no-print -mt-2">
        <div className="flex flex-col gap-1 col-span-2">
          <div className="text-xs font-black text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
            <Info className="w-4 h-4 text-amber-600" />
            <span>Định mức số ngày ăn chuẩn trong tháng (Mặc định tự động tính theo lịch)</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Giáo viên có thể nhập đè số ngày để điều chỉnh định mức khi có ngày nghỉ lễ, nghỉ thời tiết...
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Sáng */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">Ăn Sáng (S):</span>
            <input
              type="number"
              min={0}
              max={31}
              value={overrideBreakfast !== null ? overrideBreakfast : defaultStandardBreakfast}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideBreakfast(val);
              }}
              className="w-14 bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-bold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              placeholder={String(defaultStandardBreakfast)}
            />
          </div>

          {/* Trưa */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">Ăn Trưa (T):</span>
            <input
              type="number"
              min={0}
              max={31}
              value={overrideLunch !== null ? overrideLunch : defaultStandardLunch}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideLunch(val);
              }}
              className="w-14 bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-bold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              placeholder={String(defaultStandardLunch)}
            />
          </div>

          {/* Tối */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">Ăn Tối (T):</span>
            <input
              type="number"
              min={0}
              max={31}
              value={overrideDinner !== null ? overrideDinner : defaultStandardDinner}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideDinner(val);
              }}
              className="w-14 bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-bold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              placeholder={String(defaultStandardDinner)}
            />
          </div>

          {/* Reset button */}
          {(overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null) && (
            <button
              type="button"
              onClick={() => {
                updateOverrideBreakfast(null);
                updateOverrideLunch(null);
                updateOverrideDinner(null);
              }}
              className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-900 hover:bg-rose-200 cursor-pointer"
              title="Khôi phục lại định mức mặc định tính tự động theo lịch"
            >
              Đặt lại
            </button>
          )}
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
            {viewMode === 'page1' && (
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                (TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN NGÀY 15)
              </div>
            )}
            {viewMode === 'page2' && (
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                (TRANG 2: NỬA CUỐI THÁNG - TỪ NGÀY 16 ĐẾN NGÀY {daysInMonth} & TỔNG HỢP)
              </div>
            )}
            <div className="text-[11px] text-slate-500 font-medium">
              Sĩ số bán trú: <strong className="text-slate-900">{classBoardingStudents.length} học sinh</strong>
            </div>
          </div>
        </div>

        {/* View Mode Toggle (Trang 1 / Trang 2 / Cả tháng) */}
        {classBoardingStudents.length > 0 && !isLoading && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cả tháng (1 - {daysInMonth})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('page1')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'page1'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Trang 1 (Ngày 01 - 15)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('page2')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'page2'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Trang 2 (Ngày 16 - {daysInMonth})
              </button>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              💡 Bấm <strong>Trang 1</strong> hoặc <strong>Trang 2</strong> để xem và in gọn gàng từng trang A4 không bị co chữ.
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải dữ liệu sổ chấm cơm tháng...</span>
          </div>
        ) : classBoardingStudents.length === 0 ? (
          <div className="py-12 px-4 text-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Lớp {currentClass?.class_name || ''} chưa có danh sách học sinh bán trú
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Thầy/Cô có thể bấm nút bên dưới để tạo nhanh danh sách 35 học sinh bán trú mẫu theo đặc thù trường PTDTBT THCS Xa Dung, hoặc bấm nút Xuất Excel ở trên để hệ thống tự động điền và tạo file.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleGenerateDefaultStudents}
                disabled={isGeneratingStudents}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{isGeneratingStudents ? 'Đang tạo danh sách...' : `Tạo nhanh DS 35 học sinh lớp ${currentClass?.class_name || ''}`}</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-700" />
                <span>Xuất file Excel mẫu ngay</span>
              </button>
            </div>
          </div>
        ) : (
          /* Table Sheet Grid */
          <div className="overflow-x-auto border border-slate-300 rounded-xl">
            <table className="w-full text-center border-collapse text-[10px] sm:text-[11px]">
              <thead>
                {/* Row 1: STT, Họ và tên, Ngày, Số ngày ăn trong tháng */}
                <tr className="bg-slate-100 font-black text-slate-900 border-b border-slate-300">
                  <th rowSpan={3} className="py-2 px-1 w-8 border-r border-slate-300 sticky left-0 bg-slate-100 z-20">STT</th>
                  <th rowSpan={3} className="py-2 px-2 min-w-[130px] text-left border-r border-slate-300 sticky left-8 bg-slate-100 z-20">
                    Họ và tên
                  </th>
                  {displayedMonthDays.map((d) => (
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
                  {showSummaryColumns && (
                    <>
                      <th colSpan={6} className="py-1 px-2 border-r border-slate-300 bg-amber-50/70 text-amber-950 font-black">
                        Số ngày ăn trong tháng
                      </th>
                      <th rowSpan={3} className="py-2 px-1.5 w-14 bg-emerald-50 text-emerald-950 font-black">
                        Ngày thực
                      </th>
                    </>
                  )}
                </tr>

                {/* Row 2: Thứ, Nhóm Số ngày báo ăn, Số ngày không báo ăn */}
                <tr className="bg-slate-50 font-bold text-slate-800 border-b border-slate-300">
                  {displayedMonthDays.map((d) => (
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
                  {showSummaryColumns && (
                    <>
                      <th colSpan={3} className="py-0.5 px-1 border-r border-slate-300 bg-blue-50/70 text-blue-900">
                        Số ngày báo ăn
                      </th>
                      <th colSpan={3} className="py-0.5 px-1 border-r border-slate-300 bg-rose-50/70 text-rose-900">
                        Số ngày không báo ăn
                      </th>
                    </>
                  )}
                </tr>

                {/* Row 3: S, T, T headers */}
                <tr className="bg-slate-100 font-bold text-slate-600 border-b-2 border-slate-300">
                  {displayedMonthDays.map((d) => (
                    <React.Fragment key={d.dayNum}>
                      <th className="py-0.5 w-4 border-r border-slate-200 text-blue-700">S</th>
                      <th className="py-0.5 w-4 border-r border-slate-200 text-amber-700">T</th>
                      <th className="py-0.5 w-4 border-r border-slate-300 text-purple-700">T</th>
                    </React.Fragment>
                  ))}
                  {showSummaryColumns && (
                    <>
                      {/* Summary S,T,T for eaten */}
                      <th className="py-0.5 w-6 border-r border-slate-200 bg-blue-50 text-blue-800">S</th>
                      <th className="py-0.5 w-6 border-r border-slate-200 bg-blue-50 text-blue-800">T</th>
                      <th className="py-0.5 w-6 border-r border-slate-300 bg-blue-50 text-blue-800">T</th>
                      {/* Summary S,T,T for missed */}
                      <th className="py-0.5 w-6 border-r border-slate-200 bg-rose-50 text-rose-800">S</th>
                      <th className="py-0.5 w-6 border-r border-slate-200 bg-rose-50 text-rose-800">T</th>
                      <th className="py-0.5 w-6 border-r border-slate-300 bg-rose-50 text-rose-800">T</th>
                    </>
                  )}
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
                      <td className="py-1.5 px-1 font-bold text-slate-400 border-r border-slate-200 sticky left-0 bg-white z-10">{idx + 1}</td>
                      <td className="py-1.5 px-2 text-left font-extrabold text-slate-900 border-r border-slate-300 whitespace-nowrap sticky left-8 bg-white z-10">
                        {st.full_name}
                      </td>

                      {/* Daily cells: S, T, T */}
                      {displayedMonthDays.map((d) => {
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

                      {/* Summary Columns */}
                      {showSummaryColumns && (
                        <>
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
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer: CỘNG */}
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={2} className="py-2 px-2 text-center border-r border-slate-300 sticky left-0 bg-slate-100 z-10">
                    CỘNG
                  </td>
                  {displayedMonthDays.map((d) => {
                    const totals = columnTotals.dailyTotals[d.dateStr] || { breakfast: 0, lunch: 0, dinner: 0 };
                    return (
                      <React.Fragment key={d.dayNum}>
                        <td className="py-1.5 px-0.5 border-r border-slate-200 text-blue-800 font-bold">
                          {totals.breakfast > 0 ? totals.breakfast : ''}
                        </td>
                        <td className="py-1.5 px-0.5 border-r border-slate-200 text-amber-800 font-bold">
                          {totals.lunch > 0 ? totals.lunch : ''}
                        </td>
                        <td className="py-1.5 px-0.5 border-r border-slate-300 text-purple-800 font-bold">
                          {totals.dinner > 0 ? totals.dinner : ''}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {showSummaryColumns && (
                    <>
                      <td className="py-1.5 px-1 border-r border-slate-200 text-blue-900 bg-blue-100/50 font-black">
                        {columnTotals.totalEatenB}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-200 text-blue-900 bg-blue-100/50 font-black">
                        {columnTotals.totalEatenL}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-300 text-blue-900 bg-blue-100/50 font-black">
                        {columnTotals.totalEatenD}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-200 text-rose-800 bg-rose-100/50 font-black">
                        {columnTotals.totalMissedB}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-200 text-rose-800 bg-rose-100/50 font-black">
                        {columnTotals.totalMissedL}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-300 text-rose-800 bg-rose-100/50 font-black">
                        {columnTotals.totalMissedD}
                      </td>
                      <td className="py-1.5 px-1 text-emerald-900 bg-emerald-100/50 font-black">
                        {columnTotals.totalActualDays}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Signatures block for printing / review */}
        {classBoardingStudents.length > 0 && !isLoading && (
          <div className="mt-8 pt-4 grid grid-cols-2 gap-4 text-center">
            <div className="flex flex-col items-center">
              <div className="text-xs font-bold text-slate-900 uppercase">
                GIÁO VIÊN CHỦ NHIỆM
              </div>
              <div className="text-[11px] text-slate-500 italic mb-16">
                (Ký và ghi rõ họ tên)
              </div>
              <div className="text-xs font-bold text-slate-900">
                {currentUser?.full_name || 'Giáo viên chủ nhiệm'}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-[11px] text-slate-600 italic mb-1">
                {viewMode === 'page1'
                  ? `Xa Dung, ngày 15 tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`
                  : `Xa Dung, ngày ${String(daysInMonth).padStart(2, '0')} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`}
              </div>
              <div className="text-xs font-bold text-slate-900 uppercase">
                {viewMode === 'page1' ? 'BAN GIÁM HIỆU' : 'HIỆU TRƯỞNG'}
              </div>
              <div className="text-[11px] text-slate-500 italic mb-16">
                {viewMode === 'page1' ? '(Ký duyệt)' : '(Ký, đóng dấu)'}
              </div>
              <div className="text-xs font-bold text-slate-900">
                Hiệu trưởng
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
