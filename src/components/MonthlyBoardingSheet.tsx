import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { getSupabaseClient, isSupabaseConnected } from '../services/supabase';
import { Student, BoardingDailyReport, BoardingMealRecord } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords, generateDefaultBoardingStudentsForClass } from '../utils/boardingRules';
import { formatDateVN, getTodayDateStr } from '../utils/schoolWeeks';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';
import { DEFAULT_CLASS_TEACHER_MAP } from '../utils/exportAttendanceStandardExcel';
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
  Trash2,
  ClipboardList,
  Check,
  PenTool,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface MonthlyBoardingSheetProps {
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
}

export const MonthlyBoardingSheet: React.FC<MonthlyBoardingSheetProps> = ({
  selectedClassId,
  onClassChange,
}) => {
  const { classes, campuses, students, settings } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Current Month-Year: 'YYYY-MM'
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const hasLoadedOnce = useRef<Record<string, boolean>>({});
  const isInitialLoad = useRef<boolean>(true);
  const saveTimersRef = useRef<Record<string, any>>({});
  const autoSaveTimeoutRef = useRef<any>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Unified RAF-throttled crosshair state to guarantee 60fps/120fps buttery-smooth motion without lag
  const [activeCrosshair, setActiveCrosshair] = useState<{
    studentId: string | null;
    dateStr: string | null;
    meal: 'breakfast' | 'lunch' | 'dinner' | null;
  }>({ studentId: null, dateStr: null, meal: null });

  const hoveredStudentId = activeCrosshair.studentId;
  const hoveredDateStr = activeCrosshair.dateStr;
  const hoveredMealType = activeCrosshair.meal;

  const hoverRef = useRef<{
    studentId: string | null;
    dateStr: string | null;
    meal: 'breakfast' | 'lunch' | 'dinner' | null;
  }>({ studentId: null, dateStr: null, meal: null });

  const hoverRafId = useRef<number | null>(null);

  const updateCrosshair = useCallback((
    studentId: string | null,
    dateStr: string | null,
    meal: 'breakfast' | 'lunch' | 'dinner' | null
  ) => {
    // If exact same cell/target, avoid any state updates
    if (
      hoverRef.current.studentId === studentId &&
      hoverRef.current.dateStr === dateStr &&
      hoverRef.current.meal === meal
    ) {
      return;
    }
    hoverRef.current = { studentId, dateStr, meal };

    if (hoverRafId.current !== null) {
      cancelAnimationFrame(hoverRafId.current);
    }
    hoverRafId.current = requestAnimationFrame(() => {
      setActiveCrosshair({ studentId, dateStr, meal });
    });
  }, []);

  const clearCrosshair = useCallback(() => {
    if (
      hoverRef.current.studentId === null &&
      hoverRef.current.dateStr === null &&
      hoverRef.current.meal === null
    ) {
      return;
    }
    hoverRef.current = { studentId: null, dateStr: null, meal: null };
    if (hoverRafId.current !== null) {
      cancelAnimationFrame(hoverRafId.current);
    }
    hoverRafId.current = requestAnimationFrame(() => {
      setActiveCrosshair({ studentId: null, dateStr: null, meal: null });
    });
  }, []);

  const handleTbodyMouseOver = useCallback((e: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    const td = target.closest<HTMLElement>('td[data-cell="meal"]');
    if (td) {
      const sId = td.dataset.studentId || null;
      const dStr = td.dataset.dateStr || null;
      const mType = (td.dataset.meal as 'breakfast' | 'lunch' | 'dinner') || null;
      updateCrosshair(sId, dStr, mType);
      return;
    }
    const tr = target.closest<HTMLElement>('tr[data-student-id]');
    if (tr) {
      const sId = tr.dataset.studentId || null;
      updateCrosshair(sId, hoverRef.current.dateStr, hoverRef.current.meal);
    }
  }, [updateCrosshair]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Class info
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const currentCampus = useMemo(() => {
    if (!currentClass?.campus_id) return null;
    return campuses.find((cp) => cp.id === currentClass.campus_id) || null;
  }, [campuses, currentClass]);

  const validClassIds = useMemo(() => {
    return new Set([
      selectedClassId,
      currentClass?.id,
      currentClass?.class_name,
    ].filter(Boolean) as string[]);
  }, [selectedClassId, currentClass]);

  // Boarding students
  const classBoardingStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const rawSts = students.filter((s) => validClassIds.has(s.class_id));
    const seenIds = new Set<string>();
    const classSts: Student[] = [];
    for (const s of rawSts) {
      if (!s || !s.full_name) continue;
      if (seenIds.has(s.id)) continue;
      seenIds.add(s.id);
      classSts.push(s);
    }
    return classSts;
  }, [students, selectedClassId, validClassIds, currentClass]);

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

  const [reportedDates, setReportedDates] = useState<Set<string>>(new Set());

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

  // Hovered item details for visual crosshair indicator
  const hoveredStudent = useMemo(() => {
    if (!hoveredStudentId) return null;
    return classBoardingStudents.find((s) => s.id === hoveredStudentId) || null;
  }, [hoveredStudentId, classBoardingStudents]);

  const hoveredDayInfo = useMemo(() => {
    if (!hoveredDateStr) return null;
    return monthDays.find((d) => d.dateStr === hoveredDateStr) || null;
  }, [hoveredDateStr, monthDays]);

  const [overrideBreakfast, setOverrideBreakfast] = useState<number | null>(null);
  const [overrideLunch, setOverrideLunch] = useState<number | null>(null);
  const [overrideDinner, setOverrideDinner] = useState<number | null>(null);

  const { defaultStandardBreakfast, defaultStandardLunch, defaultStandardDinner } = useMemo(() => {
    let bCount = 0;
    let lCount = 0;
    let dCount = 0;
    
    // Nếu chưa có ngày nào được báo cáo, tính định mức cho cả tháng theo lịch
    const useWholeMonth = reportedDates.size === 0;

    monthDays.forEach((d) => {
      if (useWholeMonth || reportedDates.has(d.dateStr)) {
        if (d.allowedMeals.breakfast) bCount++;
        if (d.allowedMeals.lunch) lCount++;
        if (d.allowedMeals.dinner) dCount++;
      }
    });
    return {
      defaultStandardBreakfast: bCount,
      defaultStandardLunch: lCount,
      defaultStandardDinner: dCount,
    };
  }, [monthDays, reportedDates]);

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

  // --- Cấu hình chữ ký & Địa danh ký (Tự động cập nhật theo ngày) ---
  const [signingLocation, setSigningLocation] = useState<string>(() => {
    return localStorage.getItem('sso_boarding_signing_location') || settings?.commune?.replace(/^Xã\s+/i, '') || 'Xa Dung';
  });

  // Tự động nhận diện họ tên GVCN theo lớp học
  const defaultTeacherName = useMemo(() => {
    if (isGVCN && currentUser?.assigned_class_id === selectedClassId && currentUser.full_name) {
      return currentUser.full_name;
    }
    if (currentClass?.class_name && DEFAULT_CLASS_TEACHER_MAP[currentClass.class_name]) {
      return DEFAULT_CLASS_TEACHER_MAP[currentClass.class_name];
    }
    return currentUser?.full_name || 'Vũ Văn Hùng';
  }, [selectedClassId, currentClass, isGVCN, currentUser]);

  const [customTeacherName, setCustomTeacherName] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem(`sso_boarding_teacher_${selectedClassId}`);
    if (saved) {
      setCustomTeacherName(saved);
    } else {
      setCustomTeacherName(defaultTeacherName);
    }
  }, [selectedClassId, defaultTeacherName]);

  const effectiveTeacherName = customTeacherName || defaultTeacherName;

  // Tính ngày ký tự động theo ngày:
  // - Trang 1 (1 - 15): Tự động lấy ngày 15 của tháng
  // - Trang 2 (16 - cuối tháng) & Cả tháng: Tự động lấy ngày cuối của tháng (28/29/30/31)
  const effectiveSigningDay = useMemo(() => {
    if (viewMode === 'page1') {
      return 15;
    }
    return daysInMonth;
  }, [viewMode, daysInMonth]);

  const effectiveSigningDateText = useMemo(() => {
    const loc = signingLocation.trim() || 'Xa Dung';
    return `${loc}, ngày ${effectiveSigningDay} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`;
  }, [signingLocation, effectiveSigningDay, monthNum, yearNum]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load monthly meal data
  const loadMonthData = async (isSilent = false) => {
    if (!selectedClassId || !selectedMonth) return;
    const cacheKey = `${selectedClassId}_${selectedMonth}`;
    const alreadyLoaded = Boolean(hasLoadedOnce.current[cacheKey]);

    // Chỉ hiển thị màn hình đang tải lúc mở lớp/tháng lần đầu tiên khi chưa có dữ liệu trong bộ nhớ
    // Khi đang chấm trực tiếp: TUYỆT ĐỐI KHÔNG HIỂN THỊ "Đang tải dữ liệu..." để thao tác mượt mà 100%
    if (!isSilent && !alreadyLoaded) {
      setIsLoading(true);
    }
    try {
      const todayStr = getTodayDateStr();

      // 1. Lấy danh sách báo ăn bán trú đã lưu trong tháng (Supabase + Local)
      const reports = await StorageService.getBoardingReportsByClassAndMonth(selectedClassId, selectedMonth);
      const reportMap = new Map<string, BoardingDailyReport>();
      reports.forEach((r) => {
        if (!r) return;
        const cleanDate = String(r.date).split('T')[0].trim();

        let recs = r.records;
        if (typeof recs === 'string') {
          try { recs = JSON.parse(recs); } catch { recs = []; }
        }
        if (!Array.isArray(recs) || recs.length === 0) {
          recs = buildDefaultMealRecords(classBoardingStudents, cleanDate, selectedClassId);
        }
        reportMap.set(cleanDate, {
          ...r,
          date: cleanDate,
          records: recs,
        });
      });

      // 2. Tự động kiểm tra Báo cáo sĩ số ngày của GVCN (Cloud & Local)
      // Nếu ngày nào GVCN đã nộp báo cáo sĩ số ngày mà chưa có phiếu chấm ăn riêng, tự động đồng bộ sang báo ăn
      try {
        const classDaily = await StorageService.getDailyReportsByMonth(selectedClassId, selectedMonth);
        const autoSyncReports: BoardingDailyReport[] = [];

        classDaily.forEach((dr) => {
          const cleanDate = String(dr.report_date).split('T')[0].trim();

          if (!reportMap.has(cleanDate)) {
            const absentMap = new Map<string, { reason?: string }>();
            if (dr.absent_students) {
              dr.absent_students.forEach((ab) => {
                if (ab.id) absentMap.set(ab.id, { reason: ab.reason });
                if (ab.full_name) absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
              });
            }
            const synthRecords = buildDefaultMealRecords(classBoardingStudents, cleanDate, selectedClassId, absentMap);
            let bCount = 0;
            let lCount = 0;
            let dCount = 0;
            let abCount = 0;
            synthRecords.forEach((r) => {
              if (r.breakfast) bCount++;
              if (r.lunch) lCount++;
              if (r.dinner) dCount++;
              if (r.is_absent) abCount++;
            });

            const synthReport: BoardingDailyReport = {
              id: `boarding_rep_${selectedClassId}_${cleanDate}`,
              class_id: selectedClassId,
              date: cleanDate,
              status: 'SUBMITTED',
              total_boarding_students: classBoardingStudents.length,
              breakfast_count: bCount,
              lunch_count: lCount,
              dinner_count: dCount,
              absent_count: abCount,
              total_meals: bCount + lCount + dCount,
              notes: dr.notes || 'Tự động đồng bộ từ Báo cáo sĩ số ngày',
              records: synthRecords,
              submitted_at: dr.updated_at || dr.created_at || new Date().toISOString(),
              created_at: dr.created_at || new Date().toISOString(),
              updated_at: dr.updated_at || new Date().toISOString(),
            };

            reportMap.set(cleanDate, synthReport);
            autoSyncReports.push(synthReport);
          }
        });

        if (autoSyncReports.length > 0) {
          StorageService.saveBoardingReportsBulk(autoSyncReports).catch(console.warn);
        }
      } catch (err) {
        console.warn('Sync daily reports check error:', err);
      }

      // Track actually reported dates for dynamic standard calculations
      const reportedSet = new Set<string>();
      reportMap.forEach((_, dateStr) => {
        reportedSet.add(dateStr);
      });
      setReportedDates(reportedSet);

      const initialMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};

      classBoardingStudents.forEach((st) => {
        initialMatrix[st.id] = {};
        const normName = st.full_name.trim().toLowerCase();

        monthDays.forEach((day) => {
          // Ngày nào GVCN đã báo ăn (trong reportMap) thì hiển thị dấu (+), ngày chưa báo thì để trống hoàn toàn
          const rep = reportMap.get(day.dateStr);
          if (!rep) {
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
            return;
          }

          // Lấy đúng số liệu GVCN đã chấm cho học sinh (tìm theo ID hoặc tên)
          let recs = rep.records;
          if (typeof recs === 'string') {
            try { recs = JSON.parse(recs); } catch { recs = []; }
          }
          const stRec = Array.isArray(recs)
            ? recs.find((r) => r.student_id === st.id || (r.student_name && r.student_name.trim().toLowerCase() === normName))
            : undefined;

          if (stRec) {
            if (stRec.is_absent) {
              initialMatrix[st.id][day.dateStr] = {
                breakfast: false,
                lunch: false,
                dinner: false,
              };
            } else {
              initialMatrix[st.id][day.dateStr] = {
                breakfast: Boolean(stRec.breakfast),
                lunch: Boolean(stRec.lunch),
                dinner: Boolean(stRec.dinner),
              };
            }
          } else {
            // Ngày này lớp có báo ăn nhưng học sinh chưa có trong bản ghi cũ (mới bổ sung):
            // Mặc định để trống (false) để tránh tự động điền thêm số ngày ăn sai lệch
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
          }
        });
      });

      setMealMatrix(initialMatrix);
    } catch (e) {
      console.error('Error loading month data:', e);
    } finally {
      setIsLoading(false);
      isInitialLoad.current = false;
      hasLoadedOnce.current[`${selectedClassId}_${selectedMonth}`] = true;
    }
  };

  useEffect(() => {
    loadMonthData(false);

    // Lắng nghe sự kiện lưu báo ăn từ Tab 1 (Báo cáo sĩ số ngày) để tự động đồng bộ tức thì vào biểu
    // Lưu ý: Tuyệt đối KHÔNG lắng nghe 'boarding_reports' tại đây để tránh vòng lặp tự reload và giật lag khi chấm ăn
    const unsubscribe = subscribeRealtime((event) => {
      if (event.table === 'daily_reports') {
        loadMonthData(true);
      }
    });

    return () => {
      unsubscribe();
      // Clear all pending save timers on unmount
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [selectedClassId, selectedMonth, classBoardingStudents.length]);

  // Đồng bộ thủ công từ tất cả báo cáo ngày của GVCN
  const handleSyncFromDailyReports = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsLoading(true);
    try {
      const classDaily = await StorageService.getDailyReportsByMonth(selectedClassId, selectedMonth);
      const reportsToSave: BoardingDailyReport[] = [];

      classDaily.forEach((dr) => {
        const cleanDate = String(dr.report_date).split('T')[0].trim();
        const absentMap = new Map<string, { reason?: string }>();
        if (dr.absent_students) {
          dr.absent_students.forEach((ab) => {
            if (ab.id) absentMap.set(ab.id, { reason: ab.reason });
            if (ab.full_name) absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
          });
        }
        const synthRecords = buildDefaultMealRecords(classBoardingStudents, cleanDate, selectedClassId, absentMap);
        let bCount = 0;
        let lCount = 0;
        let dCount = 0;
        let abCount = 0;
        synthRecords.forEach((r) => {
          if (r.breakfast) bCount++;
          if (r.lunch) lCount++;
          if (r.dinner) dCount++;
          if (r.is_absent) abCount++;
        });

        reportsToSave.push({
          id: `boarding_rep_${selectedClassId}_${cleanDate}`,
          class_id: selectedClassId,
          date: cleanDate,
          status: 'SUBMITTED',
          total_boarding_students: classBoardingStudents.length,
          breakfast_count: bCount,
          lunch_count: lCount,
          dinner_count: dCount,
          absent_count: abCount,
          total_meals: bCount + lCount + dCount,
          notes: dr.notes || 'Đồng bộ từ Báo cáo sĩ số ngày',
          records: synthRecords,
          submitted_by: currentUser?.id,
          submitted_by_name: currentUser?.full_name || 'GVCN',
          submitted_at: dr.updated_at || dr.created_at || new Date().toISOString(),
          created_at: dr.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });

      if (reportsToSave.length > 0) {
        await StorageService.saveBoardingReportsBulk(reportsToSave, currentUser || undefined);
      }

      await loadMonthData();
      const distinctDates = new Set(reportsToSave.map(r => r.date));
      showToast(`Đã đồng bộ thành công! Hiện có ${distinctDates.size} ngày báo ăn được cập nhật đầy đủ vào biểu.`);
    } catch (e) {
      console.error('Error syncing daily reports:', e);
      showToast('Lỗi khi đồng bộ số liệu báo ăn!', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Background auto-save helper for single date
  const autoSaveMealDate = async (dateStr: string, currentMatrix: typeof mealMatrix) => {
    if (!selectedClassId || !selectedMonth) return;

    try {
      const schedule = getMealScheduleForDate(dateStr);
      let bCount = 0;
      let lCount = 0;
      let dCount = 0;
      let abCount = 0;

      const records: BoardingMealRecord[] = classBoardingStudents.map((st) => {
        const dayMeal = currentMatrix[st.id]?.[dateStr] || {
          breakfast: false,
          lunch: false,
          dinner: false,
        };
        const isAbsent = !dayMeal.breakfast && !dayMeal.lunch && !dayMeal.dinner && schedule.isMealDay;
        if (dayMeal.breakfast) bCount++;
        if (dayMeal.lunch) lCount++;
        if (dayMeal.dinner) dCount++;
        if (isAbsent) abCount++;

        return {
          id: `meal_${selectedClassId}_${dateStr}_${st.id}`,
          class_id: selectedClassId,
          date: dateStr,
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

      const totalMeals = bCount + lCount + dCount;

      // Nếu tất cả học sinh đều không ăn (để trống), xóa báo cáo của ngày này để trả về trạng thái rỗng
      if (totalMeals === 0) {
        const allReports = await StorageService.getBoardingReports();
        const cleaned = allReports.filter(
          (r) => !(r.class_id === selectedClassId && r.date === dateStr)
        );
        localStorage.setItem('sso_boarding_reports_v1', JSON.stringify(cleaned));
        const supabase = getSupabaseClient();
        if (supabase && isSupabaseConnected()) {
          await supabase.from('boarding_reports').delete().eq('class_id', selectedClassId).eq('date', dateStr);
        }
        return;
      }

      const report: BoardingDailyReport = {
        id: `boarding_rep_${selectedClassId}_${dateStr}`,
        class_id: selectedClassId,
        date: dateStr,
        status: 'SUBMITTED',
        total_boarding_students: classBoardingStudents.length,
        breakfast_count: bCount,
        lunch_count: lCount,
        dinner_count: dCount,
        absent_count: abCount,
        total_meals: totalMeals,
        notes: '',
        records,
        submitted_by: currentUser?.id,
        submitted_by_name: currentUser?.full_name || 'GVCN',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await StorageService.saveBoardingReport(report, currentUser || undefined);
    } catch (e) {
      console.error('Error in autoSaveMealDate:', e);
    }
  };

  // Toggle meal cell - Cập nhật tức thì (optimistic) không reload, tự động lưu ngầm mượt mà
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

      setAutoSaveStatus('saving');

      // Tự động lưu ngầm mượt mà (debounced 350ms), không làm đơ giật UI và không reload màn hình
      if (saveTimersRef.current[dateStr]) {
        clearTimeout(saveTimersRef.current[dateStr]);
      }
      saveTimersRef.current[dateStr] = setTimeout(async () => {
        await autoSaveMealDate(dateStr, updated);
        delete saveTimersRef.current[dateStr];
        setAutoSaveStatus('saved');
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 2500);
      }, 350);

      return updated;
    });
  };

  // Đặt lại sổ chấm cơm: Xóa sạch các ngày chưa báo ăn, để trống hoàn toàn đúng yêu cầu
  const handleResetToOnlyReported = async () => {
    if (
      window.confirm(
        `Bạn có chắc muốn làm sạch Sổ chấm cơm Tháng ${monthNum}/${yearNum}?\n\n- Các ngày tương lai (sau hôm nay) và các ngày chưa được GVCN báo ăn hằng ngày sẽ để trống hoàn toàn (không có dấu +).\n- Chỉ những ngày GVCN đã thực sự nộp báo ăn hằng ngày mới hiển thị dấu (+).`
      )
    ) {
      setIsLoading(true);
      try {
        const todayStr = getTodayDateStr();
        const allReports = await StorageService.getBoardingReports();
        // Giữ lại các báo cáo của lớp khác, và của lớp này nhưng ngày <= todayStr và có ít nhất 1 suất ăn
        const cleaned = allReports.filter((r) => {
          if (r.class_id !== selectedClassId) return true;
          if (!r.date.startsWith(selectedMonth)) return true;
          return r.date <= todayStr && (r.total_meals || 0) > 0 && r.status === 'SUBMITTED';
        });

        localStorage.setItem('sso_boarding_reports_v1', JSON.stringify(cleaned));
        const supabase = getSupabaseClient();
        if (supabase && isSupabaseConnected()) {
          await supabase.from('boarding_reports').delete().eq('class_id', selectedClassId).gt('date', todayStr);
        }
      } catch (e) {
        console.warn('Reset reports error:', e);
      }
      await loadMonthData();
      showToast('Đã đặt lại sổ: Để trống tất cả các ngày chưa báo ăn và ngày tương lai!');
    }
  };

  // Xóa sạch toàn bộ chấm ăn trong tháng: Đưa sổ về trạng thái rỗng 100% (không có dấu + ở bất kỳ ngày nào)
  const handleClearAllMonth = async () => {
    if (
      window.confirm(
        `Bạn có chắc muốn XÓA SẠCH toàn bộ dấu chấm ăn Tháng ${monthNum}/${yearNum} của lớp ${currentClass?.class_name}?\n\nToàn bộ các ngày trong tháng sẽ để trống 100% (không có bất kỳ dấu + nào). Khi nào GVCN báo ăn ngày nào thì ngày đó mới hiện dấu (+).`
      )
    ) {
      setIsLoading(true);
      try {
        const allReports = await StorageService.getBoardingReports();
        const cleaned = allReports.filter(
          (r) => !(r.class_id === selectedClassId && r.date.startsWith(selectedMonth))
        );
        localStorage.setItem('sso_boarding_reports_v1', JSON.stringify(cleaned));
        const supabase = getSupabaseClient();
        if (supabase && isSupabaseConnected()) {
          await supabase
            .from('boarding_reports')
            .delete()
            .eq('class_id', selectedClassId)
            .gte('date', `${selectedMonth}-01`)
            .lte('date', `${selectedMonth}-31`);
        }

        // Đưa ma trận về rỗng 100%
        const emptyMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
        classBoardingStudents.forEach((st) => {
          emptyMatrix[st.id] = {};
          monthDays.forEach((d) => {
            emptyMatrix[st.id][d.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
          });
        });
        setMealMatrix(emptyMatrix);
        showToast(`Đã xóa sạch chấm ăn Tháng ${monthNum}/${yearNum}! Sổ đã để trống 100% sẵn sàng cho GVCN báo ăn từng ngày.`);
      } catch (e) {
        console.error('Clear all month error:', e);
        showToast('Lỗi khi xóa dữ liệu tháng!', 'error');
      } finally {
        setIsLoading(false);
      }
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
      let distinctEatenDays = 0;

      monthDays.forEach((d) => {
        const dayRecord = stDays[d.dateStr];
        const hasMeal = dayRecord?.breakfast || dayRecord?.lunch || dayRecord?.dinner;
        if (hasMeal) {
          distinctEatenDays++;
        }

        if (dayRecord) {
          if (dayRecord.breakfast) eatenB++;
          if (dayRecord.lunch) eatenL++;
          if (dayRecord.dinner) eatenD++;
        }
      });

      // Quy tắc kế toán bán trú: Số ngày báo ăn (S, T, T) + Số ngày không báo ăn (S, T, T) = Định mức báo (S, T, T)
      const missedB = Math.max(0, standardBreakfastDays - eatenB);
      const missedL = Math.max(0, standardLunchDays - eatenL);
      const missedD = Math.max(0, standardDinnerDays - eatenD);

      // Số ngày báo ăn thực tế: Số ngày học sinh có ăn cơm thực tế trong tháng
      const actualDays = distinctEatenDays;

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

  // Thống kê ngày đã báo / chưa báo trong tháng
  const monthReportStats = useMemo(() => {
    const todayStr = getTodayDateStr();
    let reportedDays = 0;
    let unreportedDays = 0;
    let futureDays = 0;

    monthDays.forEach((d) => {
      if (d.dateStr > todayStr) {
        futureDays++;
      } else {
        const hasAnyMeal = classBoardingStudents.some((st) => {
          const m = mealMatrix[st.id]?.[d.dateStr];
          return m?.breakfast || m?.lunch || m?.dinner;
        });
        if (hasAnyMeal) {
          reportedDays++;
        } else {
          unreportedDays++;
        }
      }
    });

    return { reportedDays, unreportedDays, futureDays, totalDays: monthDays.length };
  }, [monthDays, classBoardingStudents, mealMatrix]);

  // Save all days in month
  const handleSaveMonth = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsSaving(true);
    try {
      const todayStr = getTodayDateStr();
      const reportsToSave: BoardingDailyReport[] = [];
      const datesToDelete: string[] = [];

      monthDays.forEach((day) => {
        // 1. Tuyệt đối không lưu các ngày tương lai
        if (day.dateStr > todayStr) {
          datesToDelete.push(day.dateStr);
          return;
        }

        // 2. Chỉ lưu những ngày có ít nhất 1 học sinh được chấm ăn (đã báo ăn thực tế)
        const hasAnyMeal = classBoardingStudents.some((st) => {
          const m = mealMatrix[st.id]?.[day.dateStr];
          return m?.breakfast || m?.lunch || m?.dinner;
        });

        if (!hasAnyMeal) {
          datesToDelete.push(day.dateStr);
          return;
        }

        const schedule = getMealScheduleForDate(day.dateStr);
        let bCount = 0;
        let lCount = 0;
        let dCount = 0;
        let abCount = 0;

        const records: BoardingMealRecord[] = classBoardingStudents.map((st) => {
          const dayMeal = mealMatrix[st.id]?.[day.dateStr] || {
            breakfast: false,
            lunch: false,
            dinner: false,
          };
          const isAbsent = !dayMeal.breakfast && !dayMeal.lunch && !dayMeal.dinner && schedule.isMealDay;
          if (dayMeal.breakfast) bCount++;
          if (dayMeal.lunch) lCount++;
          if (dayMeal.dinner) dCount++;
          if (isAbsent) abCount++;

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

      // Xóa các ngày trống / ngày tương lai khỏi storage & Supabase
      if (datesToDelete.length > 0) {
        const allReports = await StorageService.getBoardingReports();
        const cleaned = allReports.filter(
          (r) => !(r.class_id === selectedClassId && datesToDelete.includes(r.date))
        );
        localStorage.setItem('sso_boarding_reports_v1', JSON.stringify(cleaned));
        const supabase = getSupabaseClient();
        if (supabase && isSupabaseConnected()) {
          await supabase.from('boarding_reports').delete().eq('class_id', selectedClassId).in('date', datesToDelete);
        }
      }

      if (reportsToSave.length > 0) {
        await StorageService.saveBoardingReportsBulk(reportsToSave, currentUser || undefined);
      }
      showToast(`Đã lưu thành công Sổ chấm cơm lớp ${currentClass?.class_name} Tháng ${monthNum}/${yearNum}! (${reportsToSave.length} ngày đã báo ăn, các ngày còn lại để trống)`);
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
        schoolName: settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG',
        locationName: signingLocation.trim() || 'Xa Dung',
        monthStr: selectedMonth,
        students: students, // Pass all students so export function can auto-generate if empty
        teacherName: effectiveTeacherName,
        principalName: settings?.principal_name || 'Hiệu trưởng',
        signingDate: effectiveSigningDateText,
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
    <div className={`space-y-4 transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-100 overflow-y-auto p-4 sm:p-8 shadow-2xl' : ''}`}>
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-xs font-bold text-white transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600'
              : toastMessage.type === 'info'
              ? 'bg-blue-600'
              : 'bg-rose-600'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : toastMessage.type === 'info' ? (
            <Info className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
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
            onClick={handleResetToOnlyReported}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Làm sạch sổ: Để trống tất cả các ngày chưa báo ăn và ngày tương lai, chỉ giữ lại những ngày GVCN đã báo ăn thực tế"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Để trống ngày chưa báo</span>
          </button>

          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 animate-pulse shadow-xs">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Đang tự động lưu...</span>
            </div>
          )}
          {autoSaveStatus === 'saved' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>✓ Đã lưu tự động</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleClearAllMonth}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Xóa toàn bộ chấm ăn của tháng này để sổ trống 100%, sẵn sàng cho GVCN chấm từng ngày"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Xóa sạch chấm lại</span>
          </button>

          <button
            type="button"
            onClick={handleSyncFromDailyReports}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Đồng bộ tất cả ngày GVCN đã báo ăn (từ phiếu báo ăn ngày hoặc báo cáo sĩ số ngày) vào biểu"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Đồng bộ từ báo ăn ngày</span>
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
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              isFullscreen
                ? 'bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
            title={isFullscreen ? 'Thu nhỏ màn hình' : 'Phóng to toàn màn hình chấm ăn rõ nét'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
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
          <p className="text-[11px] text-slate-600 font-medium">
            Quy tắc chuẩn: <strong>Số ngày báo ăn (S, T, T) + Số ngày không báo ăn (S, T, T) = Định mức báo (S, T, T)</strong>. GVCN có thể nhập đè số ngày để điều chỉnh định mức khi có nghỉ lễ, nghỉ thời tiết...
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

      {/* Cấu hình chữ ký & Địa danh ký */}
      <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 no-print -mt-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-black text-blue-900 flex items-center gap-1.5 uppercase tracking-wide">
            <PenTool className="w-4 h-4 text-blue-600" />
            <span>Cấu hình chữ ký & Địa danh ký (Tự động cập nhật theo ngày)</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Trang 1 (Ngày 1 - 15): Bỏ chữ ký của cả GVCN và Hiệu trưởng. Trang 2 (Ngày 16 - cuối tháng) & Cả tháng: Chỉ lấy chữ ký của GVCN, bỏ chữ ký Hiệu trưởng. Địa danh và ngày tháng tự động cập nhật theo ngày.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Địa danh ký */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Địa danh:</span>
            <input
              type="text"
              value={signingLocation}
              onChange={(e) => {
                const val = e.target.value;
                setSigningLocation(val);
                localStorage.setItem('sso_boarding_signing_location', val);
              }}
              className="w-28 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
              placeholder="Xa Dung"
              title="Địa danh ký (ví dụ: Xa Dung, Điện Biên Đông...)"
            />
          </div>

          {/* Họ tên GVCN */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Họ tên GVCN ký:</span>
            <input
              type="text"
              value={customTeacherName}
              onChange={(e) => {
                const val = e.target.value;
                setCustomTeacherName(val);
                localStorage.setItem(`sso_boarding_teacher_${selectedClassId}`, val);
              }}
              className="w-36 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
              placeholder="Họ tên GVCN"
              title="Họ và tên Giáo viên chủ nhiệm ký"
            />
          </div>

          {/* Ngày tháng ký tự động hiển thị */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">
              Ngày ký tự động:{' '}
              <strong className="text-blue-700 font-bold">
                {viewMode === 'page1'
                  ? `ngày 15/${String(monthNum).padStart(2, '0')}/${yearNum}`
                  : `ngày ${daysInMonth}/${String(monthNum).padStart(2, '0')}/${yearNum} (cuối tháng)`}
              </strong>
            </span>
          </div>
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

        {/* Month Reporting Status Banner */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-extrabold text-blue-900 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-blue-600" />
              Chấm báo ăn Tháng {monthNum}/{yearNum}:
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100/90 text-emerald-800 font-black border border-emerald-300">
              <Check className="w-3.5 h-3.5" />
              Đã chấm: {monthReportStats.reportedDays} ngày
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold border border-slate-300">
              Chưa chấm (đang để trống): {monthReportStats.unreportedDays} ngày
            </span>
            {monthReportStats.futureDays > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                Ngày chưa tới (để trống): {monthReportStats.futureDays} ngày
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 italic">
            * Nguyên tắc: Chỉ ngày nào GVCN nộp báo ăn thì ngày đó mới có dấu (+). Các ngày chưa báo luôn để trống.
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
          <div>
            <div
              className="relative max-h-[calc(100vh-220px)] min-h-[480px] overflow-auto border border-slate-300 rounded-xl shadow-sm bg-white select-none"
              onMouseLeave={clearCrosshair}
            >
              <table className="w-full text-center border-collapse text-[10px] sm:text-[11px] border-separate border-spacing-0">
                <thead>
                  {/* Row 1: STT, Họ và tên, Ngày, Số ngày ăn trong tháng */}
                  <tr className="bg-slate-100 font-black text-slate-900 sticky top-0 z-30">
                    <th rowSpan={3} className="py-2 px-1 w-9 min-w-[36px] border-r border-b border-slate-300 sticky top-0 left-0 z-50 bg-slate-100">STT</th>
                    <th rowSpan={3} className="py-2 px-2 min-w-[140px] text-left border-r border-b border-slate-300 sticky top-0 left-9 z-50 bg-slate-100">
                      Họ và tên
                    </th>
                    {displayedMonthDays.map((d) => {
                      const todayStr = getTodayDateStr();
                      const isFuture = d.dateStr > todayStr;
                      const isReported = classBoardingStudents.some(
                        (st) => mealMatrix[st.id]?.[d.dateStr]?.breakfast || mealMatrix[st.id]?.[d.dateStr]?.lunch || mealMatrix[st.id]?.[d.dateStr]?.dinner
                      );
                      const isDateHovered = hoveredDateStr === d.dateStr;

                      return (
                        <th
                          key={d.dayNum}
                          colSpan={3}
                          onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, hoverRef.current.meal)}
                          className={`py-1 px-1 border-r border-b border-slate-300 text-center cursor-pointer sticky top-0 z-30 ${
                            isDateHovered
                              ? 'bg-amber-300 text-blue-950 font-black ring-1 ring-inset ring-blue-600'
                              : !d.isSchoolMealDay
                              ? 'bg-slate-200/70 text-slate-500'
                              : isReported
                              ? 'bg-emerald-50 text-emerald-950 font-black'
                              : isFuture
                              ? 'bg-slate-50 text-slate-400'
                              : 'bg-slate-100'
                          }`}
                          title={
                            isReported
                              ? `Ngày ${d.dayNum} (${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : `Thứ ${d.dayOfWeekShort}`}) - Đã chấm báo ăn`
                              : isFuture
                              ? `Ngày ${d.dayNum} (${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : `Thứ ${d.dayOfWeekShort}`}) - Chưa tới (Để trống)`
                              : `Ngày ${d.dayNum} (${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : `Thứ ${d.dayOfWeekShort}`}) - Chưa chấm báo ăn (Để trống)`
                          }
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span className="leading-tight font-black">{d.dayNum}</span>
                          </div>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <th colSpan={6} className="py-1 px-2 border-r border-b border-slate-300 bg-amber-50 text-amber-950 font-black sticky top-0 z-30">
                          Số ngày ăn trong tháng
                        </th>
                        <th rowSpan={3} className="py-2 px-1.5 w-14 bg-emerald-50 text-emerald-950 font-black border-b border-slate-300 sticky top-0 z-30">
                          Ngày thực
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 2: Thứ, Nhóm Số ngày báo ăn, Số ngày không báo ăn */}
                  <tr className="bg-slate-50 font-bold text-slate-800 sticky top-[33px] z-30">
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      const isWeekend = d.dayOfWeekShort === '7' || d.dayOfWeekShort === 'CN';
                      return (
                        <th
                          key={d.dayNum}
                          colSpan={3}
                          onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, hoverRef.current.meal)}
                          className={`py-0.5 px-1 border-r border-b border-slate-300 text-center cursor-pointer sticky top-[33px] z-30 ${
                            isDateHovered
                              ? 'bg-amber-200 text-blue-950 font-black ring-1 ring-inset ring-blue-600'
                              : isWeekend
                              ? 'bg-rose-50/80 text-red-600 font-black'
                              : 'bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            <span className={isDateHovered ? 'text-blue-950 font-black' : isWeekend ? 'text-red-600 font-black' : 'text-slate-800'}>
                              {d.dayOfWeekShort === 'CN' ? 'CN' : `T${d.dayOfWeekShort}`}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-300 bg-blue-50 text-blue-900 font-bold sticky top-[33px] z-30">
                          Số ngày báo ăn
                        </th>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-300 bg-rose-50 text-rose-900 font-bold sticky top-[33px] z-30">
                          Số ngày không báo ăn
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 3: S, T, T headers */}
                  <tr className="bg-slate-100 font-bold text-slate-600 sticky top-[59px] z-30 border-b-2 border-slate-300">
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <React.Fragment key={d.dayNum}>
                          <th
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'breakfast')}
                            className={`py-0.5 w-4 border-r border-b border-slate-200 cursor-pointer sticky top-[59px] z-30 bg-slate-100 ${
                              isDateHovered && hoveredMealType === 'breakfast'
                                ? 'bg-blue-600 text-white font-black ring-1 ring-inset ring-blue-800 z-40 shadow-xs'
                                : isDateHovered
                                ? 'bg-amber-200 text-blue-950 font-black'
                                : 'text-blue-600 font-bold'
                            }`}
                            title={`Ngày ${d.dayNum} - Bữa Sáng (S)`}
                          >
                            S
                          </th>
                          <th
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'lunch')}
                            className={`py-0.5 w-4 border-r border-b border-slate-200 cursor-pointer sticky top-[59px] z-30 bg-slate-100 ${
                              isDateHovered && hoveredMealType === 'lunch'
                                ? 'bg-amber-600 text-white font-black ring-1 ring-inset ring-amber-800 z-40 shadow-xs'
                                : isDateHovered
                                ? 'bg-amber-200 text-blue-950 font-black'
                                : 'text-amber-700 font-bold'
                            }`}
                            title={`Ngày ${d.dayNum} - Bữa Trưa (T)`}
                          >
                            T
                          </th>
                          <th
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'dinner')}
                            className={`py-0.5 w-4 border-r border-b border-slate-300 cursor-pointer sticky top-[59px] z-30 bg-slate-100 ${
                              isDateHovered && hoveredMealType === 'dinner'
                                ? 'bg-purple-600 text-white font-black ring-1 ring-inset ring-purple-800 z-40 shadow-xs'
                                : isDateHovered
                                ? 'bg-amber-200 text-blue-950 font-black'
                                : 'text-purple-700 font-bold'
                            }`}
                            title={`Ngày ${d.dayNum} - Bữa Tối (T)`}
                          >
                            T
                          </th>
                        </React.Fragment>
                      );
                    })}
                  {showSummaryColumns && (
                    <>
                      {/* Summary S,T,T for eaten */}
                      <th className="py-0.5 w-6 border-r border-b border-slate-200 bg-blue-50 text-blue-700 font-bold sticky top-[59px] z-30">S</th>
                      <th className="py-0.5 w-6 border-r border-b border-slate-200 bg-blue-50 text-blue-700 font-bold sticky top-[59px] z-30">T</th>
                      <th className="py-0.5 w-6 border-r border-b border-slate-300 bg-blue-50 text-blue-700 font-bold sticky top-[59px] z-30">T</th>
                      {/* Summary S,T,T for missed */}
                      <th className="py-0.5 w-6 border-r border-b border-slate-200 bg-rose-50 text-rose-700 font-bold sticky top-[59px] z-30">S</th>
                      <th className="py-0.5 w-6 border-r border-b border-slate-200 bg-rose-50 text-rose-700 font-bold sticky top-[59px] z-30">T</th>
                      <th className="py-0.5 w-6 border-r border-b border-slate-300 bg-rose-50 text-rose-700 font-bold sticky top-[59px] z-30">T</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200" onMouseOver={handleTbodyMouseOver}>
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

                  const isStudentHovered = hoveredStudentId === st.id;

                  return (
                    <tr
                      key={st.id}
                      data-student-id={st.id}
                      className={`relative ${
                        isStudentHovered
                          ? 'bg-amber-100/80 border-y border-amber-300'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50/60'
                      }`}
                    >
                      <td
                        className={`py-1.5 px-1 w-9 min-w-[36px] font-bold border-r border-b border-slate-200 sticky left-0 z-20 ${
                          isStudentHovered
                            ? 'bg-amber-200 text-blue-950 font-black'
                            : idx % 2 === 0 ? 'bg-white text-slate-500' : 'bg-slate-50 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        className={`py-1.5 px-2 min-w-[140px] text-left font-bold border-r border-b border-slate-300 whitespace-nowrap sticky left-9 z-20 ${
                          isStudentHovered
                            ? 'bg-amber-100 text-blue-950 font-black'
                            : idx % 2 === 0 ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-900'
                        }`}
                      >
                        <span className="truncate">{st.full_name}</span>
                      </td>

                      {/* Daily cells: S, T, T */}
                      {displayedMonthDays.map((d) => {
                        const todayStr = getTodayDateStr();
                        const isFuture = d.dateStr > todayStr;
                        const dMeal = stDays[d.dateStr] || { breakfast: false, lunch: false, dinner: false };
                        const isWeekend = d.dayOfWeekShort === '7' || d.dayOfWeekShort === 'CN';
                        const isDateHovered = hoveredDateStr === d.dateStr;

                        const isSameDayStudent = isStudentHovered && isDateHovered;
                        const isRowBeam = isStudentHovered && !isDateHovered;
                        const isColBeam = !isStudentHovered && isDateHovered;

                        const isCenterB = isSameDayStudent && hoveredMealType === 'breakfast';
                        const isCenterL = isSameDayStudent && hoveredMealType === 'lunch';
                        const isCenterD = isSameDayStudent && hoveredMealType === 'dinner';

                        return (
                          <React.Fragment key={d.dayNum}>
                            {/* Sáng */}
                            <td
                              data-cell="meal"
                              data-student-id={st.id}
                              data-date-str={d.dateStr}
                              data-meal="breakfast"
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'breakfast')}
                              className={`py-1 w-4 border-r border-slate-200 select-none font-black cursor-pointer ${
                                isCenterB
                                  ? 'bg-amber-300 text-blue-950 ring-1 ring-inset ring-blue-600'
                                  : isSameDayStudent
                                  ? dMeal.breakfast
                                    ? 'text-white bg-blue-600'
                                    : 'bg-amber-200 text-blue-900'
                                  : isRowBeam
                                  ? dMeal.breakfast
                                    ? 'text-white bg-blue-600'
                                    : 'bg-amber-50/80'
                                  : isColBeam
                                  ? dMeal.breakfast
                                    ? 'text-blue-900 bg-blue-100'
                                    : hoveredMealType === 'breakfast'
                                    ? 'bg-amber-100/50'
                                    : 'bg-blue-50/40'
                                  : dMeal.breakfast
                                  ? 'text-blue-700 bg-blue-50/60'
                                  : isWeekend
                                  ? 'bg-slate-100/70'
                                  : isFuture
                                  ? 'bg-slate-50/30'
                                  : 'hover:bg-slate-100'
                              }`}
                              title={`${st.full_name} | Thứ ${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Sáng: ${dMeal.breakfast ? 'Có ăn (+)' : 'Để trống'}`}
                            >
                              {dMeal.breakfast ? '+' : ''}
                            </td>

                            {/* Trưa */}
                            <td
                              data-cell="meal"
                              data-student-id={st.id}
                              data-date-str={d.dateStr}
                              data-meal="lunch"
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'lunch')}
                              className={`py-1 w-4 border-r border-slate-200 select-none font-black cursor-pointer ${
                                isCenterL
                                  ? 'bg-amber-300 text-amber-950 ring-1 ring-inset ring-blue-600'
                                  : isSameDayStudent
                                  ? dMeal.lunch
                                    ? 'text-white bg-amber-600'
                                    : 'bg-amber-200 text-amber-950'
                                  : isRowBeam
                                  ? dMeal.lunch
                                    ? 'text-white bg-amber-600'
                                    : 'bg-amber-50/80'
                                  : isColBeam
                                  ? dMeal.lunch
                                    ? 'text-amber-950 bg-amber-100'
                                    : hoveredMealType === 'lunch'
                                    ? 'bg-amber-100/50'
                                    : 'bg-blue-50/40'
                                  : dMeal.lunch
                                  ? 'text-amber-700 bg-amber-50/60'
                                  : isWeekend
                                  ? 'bg-slate-100/70'
                                  : isFuture
                                  ? 'bg-slate-50/30'
                                  : 'hover:bg-slate-100'
                              }`}
                              title={`${st.full_name} | Thứ ${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Trưa: ${dMeal.lunch ? 'Có ăn (+)' : 'Để trống'}`}
                            >
                              {dMeal.lunch ? '+' : ''}
                            </td>

                            {/* Tối */}
                            <td
                              data-cell="meal"
                              data-student-id={st.id}
                              data-date-str={d.dateStr}
                              data-meal="dinner"
                              onClick={() => handleToggleCell(st.id, d.dateStr, 'dinner')}
                              className={`py-1 w-4 border-r border-slate-300 select-none font-black cursor-pointer ${
                                isCenterD
                                  ? 'bg-amber-300 text-purple-950 ring-1 ring-inset ring-blue-600'
                                  : isSameDayStudent
                                  ? dMeal.dinner
                                    ? 'text-white bg-purple-600'
                                    : 'bg-amber-200 text-purple-950'
                                  : isRowBeam
                                  ? dMeal.dinner
                                    ? 'text-white bg-purple-600'
                                    : 'bg-amber-50/80'
                                  : isColBeam
                                  ? dMeal.dinner
                                    ? 'text-purple-950 bg-purple-100'
                                    : hoveredMealType === 'dinner'
                                    ? 'bg-amber-100/50'
                                    : 'bg-blue-50/40'
                                  : dMeal.dinner
                                  ? 'text-purple-700 bg-purple-50/60'
                                  : isWeekend || d.dayOfWeekShort === '6'
                                  ? 'bg-slate-100/70'
                                  : isFuture
                                  ? 'bg-slate-50/30'
                                  : 'hover:bg-slate-100'
                              }`}
                              title={`${st.full_name} | Thứ ${d.dayOfWeekShort === 'CN' ? 'Chủ Nhật' : d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Tối: ${dMeal.dinner ? 'Có ăn (+)' : 'Để trống'}`}
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
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-200 ${isStudentHovered ? 'bg-blue-100 text-blue-950 font-black' : 'text-blue-900 bg-blue-50/40'}`}>
                            {sum.eatenBreakfast}
                          </td>
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-200 ${isStudentHovered ? 'bg-blue-100 text-blue-950 font-black' : 'text-blue-900 bg-blue-50/40'}`}>
                            {sum.eatenLunch}
                          </td>
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-300 ${isStudentHovered ? 'bg-blue-100 text-blue-950 font-black' : 'text-blue-900 bg-blue-50/40'}`}>
                            {sum.eatenDinner}
                          </td>

                          {/* Summary Missed: S, T, T */}
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-200 ${isStudentHovered ? 'bg-rose-100 text-rose-950 font-black' : 'text-rose-700 bg-rose-50/40'}`}>
                            {sum.missedBreakfast}
                          </td>
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-200 ${isStudentHovered ? 'bg-rose-100 text-rose-950 font-black' : 'text-rose-700 bg-rose-50/40'}`}>
                            {sum.missedLunch}
                          </td>
                          <td className={`py-1.5 px-1 font-bold border-r border-slate-300 ${isStudentHovered ? 'bg-rose-100 text-rose-950 font-black' : 'text-rose-700 bg-rose-50/40'}`}>
                            {sum.missedDinner}
                          </td>

                          {/* Actual Days */}
                          <td className={`py-1.5 px-1 font-black ${isStudentHovered ? 'bg-amber-200 text-amber-950 font-black' : 'text-emerald-800 bg-emerald-50/60'}`}>
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
                    const isDateHovered = hoveredDateStr === d.dateStr;
                    return (
                      <React.Fragment key={d.dayNum}>
                        <td className={`py-1.5 px-0.5 border-r border-slate-200 font-bold ${isDateHovered ? 'bg-amber-200 text-blue-950 font-black' : 'text-blue-800'}`}>
                          {totals.breakfast > 0 ? totals.breakfast : ''}
                        </td>
                        <td className={`py-1.5 px-0.5 border-r border-slate-200 font-bold ${isDateHovered ? 'bg-amber-200 text-blue-950 font-black' : 'text-amber-800'}`}>
                          {totals.lunch > 0 ? totals.lunch : ''}
                        </td>
                        <td className={`py-1.5 px-0.5 border-r border-slate-300 font-bold ${isDateHovered ? 'bg-amber-200 text-blue-950 font-black' : 'text-purple-800'}`}>
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
        </div>
      )}

        {/* Signatures block for printing / review */}
        {classBoardingStudents.length > 0 && !isLoading && (
          <div className="mt-8 pt-4">
            {viewMode === 'page1' ? (
              /* TRANG 1 (NGÀY 1-15): BỎ CHỮ KÝ CỦA CẢ GVCN VÀ HIỆU TRƯỞNG */
              null
            ) : (
              /* TRANG 2 (NGÀY 16 - CUỐI THÁNG) & CẢ THÁNG: CHỈ LẤY CHỮ KÝ CỦA GVCN, BỎ CHỮ KÝ HIỆU TRƯỞNG */
              <div className="flex justify-end pr-4 sm:pr-16">
                <div className="flex flex-col items-center w-72 text-center">
                  <div className="text-[11px] text-slate-600 italic mb-1">
                    {effectiveSigningDateText}
                  </div>
                  <div className="text-xs font-bold text-slate-900 uppercase">
                    GIÁO VIÊN CHỦ NHIỆM
                  </div>
                  <div className="text-[11px] text-slate-500 italic mb-16">
                    (Ký và ghi rõ họ tên)
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    {effectiveTeacherName}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
