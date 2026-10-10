import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { getSupabaseClient, isSupabaseConnected } from '../services/supabase';
import { Student, BoardingDailyReport, BoardingMealRecord, BoardingSignatureConfig, BoardingMonthSignature, SchoolOffDay, BoardingStandardMealConfig } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords } from '../utils/boardingRules';
import { formatDateVN, getTodayDateStr } from '../utils/schoolWeeks';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';
import { DEFAULT_CLASS_TEACHER_MAP } from '../utils/exportAttendanceStandardExcel';
import { BoardingPrintPreviewModal } from './BoardingPrintPreviewModal';
import { BoardingDigitalSignatureModal } from './BoardingDigitalSignatureModal';
import { BoardingBatchMarkModal } from './BoardingBatchMarkModal';
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
  Eye,
  FileDown,
  ShieldCheck,
  CheckSquare,
  Sun,
  Sunrise,
  Moon,
  Zap,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Calculator,
  Utensils,
  Home,
  Users,
  X,
} from 'lucide-react';

interface MonthlyBoardingSheetProps {
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
}

export const MonthlyBoardingSheet: React.FC<MonthlyBoardingSheetProps> = ({
  selectedClassId,
  onClassChange,
}) => {
  const { classes, campuses, students, settings, addStudent, updateStudent, refreshAll } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Class Boarding & Day Students Roster Modal State
  const [showClassRosterModal, setShowClassRosterModal] = useState<boolean>(false);
  const [rosterFilter, setRosterFilter] = useState<'ALL' | 'BOARDING' | 'DAY'>('ALL');

  // Quick inline add student
  const [isAddingStudent, setIsAddingStudent] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const newStudentInputRef = useRef<HTMLInputElement>(null);

  const handleSaveNewStudent = async () => {
    if (!newStudentName.trim() || !selectedClassId) return;
    try {
      await addStudent({
        full_name: newStudentName.trim(),
        class_id: selectedClassId,
        gender: 'Nam',
        isBoarding: true,
        village: '',
      });
      setNewStudentName('');
      setIsAddingStudent(false);
      showToast(`Đã thêm học sinh ${newStudentName.trim()} vào lớp thành công!`);
    } catch (e) {
      console.error('Error adding student:', e);
      showToast('Lỗi khi thêm học sinh!', 'error');
    }
  };

  const handleKeyDownNewStudent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveNewStudent();
    } else if (e.key === 'Escape') {
      setIsAddingStudent(false);
      setNewStudentName('');
    }
  };

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
  const loadSequenceRef = useRef<number>(0);
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
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [dayMenuAnchor, setDayMenuAnchor] = useState<{
    x: number;
    y: number;
    dateStr: string;
    dayNum: number;
    dayOfWeekShort: string;
  } | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(true);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleScrollToDate = (targetDateStr?: string) => {
    if (!tableScrollRef.current) return;
    if (!targetDateStr) {
      tableScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const thElement = tableScrollRef.current.querySelector<HTMLElement>(`th[data-date-str="${targetDateStr}"]`);
    if (thElement) {
      const leftPos = thElement.offsetLeft - 140;
      tableScrollRef.current.scrollTo({ left: Math.max(0, leftPos), behavior: 'smooth' });
    }
  };

  // Auto-close active day popover menu on clicking outside or escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDayMenuAnchor(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Class info
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const currentCampus = useMemo(() => {
    if (!currentClass?.campus_id) return null;
    return campuses.find((cp) => cp.id === currentClass.campus_id) || null;
  }, [campuses, currentClass]);

  const validClassIds = useMemo(() => {
    return new Set(
      [
        selectedClassId,
        currentClass?.id,
        currentClass?.class_name,
        (currentClass as any)?.code,
      ]
        .filter(Boolean)
        .flatMap((x) => [
          String(x).trim().toLowerCase(),
          String(x).replace(/^c_/, '').trim().toLowerCase(),
          String(x).replace(/^lớp\s*/i, '').trim().toLowerCase(),
        ])
    );
  }, [selectedClassId, currentClass]);

  const [asyncBoardingStudents, setAsyncBoardingStudents] = useState<Student[]>([]);

  // Class student statistics (Total vs Boarding vs Day students)
  const totalClassStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter((s) => {
      const sCls = String(s.class_id || '').trim().toLowerCase();
      const sClsClean = sCls.replace(/^c_/, '').replace(/^lớp\s*/i, '');
      return validClassIds.has(sCls) || validClassIds.has(sClsClean);
    });
  }, [students, validClassIds, selectedClassId]);

  const classDayStudentsCount = useMemo(() => {
    return totalClassStudents.filter((s) => s.isBoarding === false).length;
  }, [totalClassStudents]);

  // Boarding students: STRICTLY filter only boarding students (isBoarding !== false)
  // Học sinh ngoại trú (isBoarding === false) tuyệt đối không xuất hiện trên sổ chấm cơm!
  const classBoardingStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const rawSts = students.filter((s) => {
      const sCls = String(s.class_id || '').trim().toLowerCase();
      const sClsClean = sCls.replace(/^c_/, '').replace(/^lớp\s*/i, '');
      return validClassIds.has(sCls) || validClassIds.has(sClsClean);
    });
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const classSts: Student[] = [];
    for (const s of rawSts) {
      if (!s || !s.full_name) continue;
      // Lọc chuẩn xác: Loại bỏ học sinh ngoại trú (isBoarding === false)
      if (s.isBoarding === false) continue;

      const sId = String(s.id || '').trim();
      const normName = String(s.full_name || '').trim().toLowerCase();

      if (sId && seenIds.has(sId)) continue;
      if (normName && seenNames.has(normName)) continue;

      if (sId) seenIds.add(sId);
      if (normName) seenNames.add(normName);
      classSts.push(s);
    }
    return classSts;
  }, [students, selectedClassId, validClassIds, currentClass]);

  // Danh sách học sinh bán trú hiệu lực (kết hợp Context và danh sách nạp từ Storage hoặc tạo tự động mẫu 35 em)
  const effectiveBoardingStudents = useMemo(() => {
    if (classBoardingStudents.length > 0) return classBoardingStudents;
    if (asyncBoardingStudents.length > 0) return asyncBoardingStudents;
    return [];
  }, [classBoardingStudents, asyncBoardingStudents]);

  // Parse Year and Month
  const { yearNum, monthNum, daysInMonth } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const numDays = new Date(y, m, 0).getDate();
    return { yearNum: y, monthNum: m, daysInMonth: numDays };
  }, [selectedMonth]);

  // School off days (lịch nghỉ lễ, tết, thời tiết) để tính chuẩn xác định mức ngày ăn
  const [offDays, setOffDays] = useState<SchoolOffDay[]>([]);

  useEffect(() => {
    StorageService.getOffDays()
      .then((list) => {
        if (Array.isArray(list)) setOffDays(list);
      })
      .catch((e) => console.warn('Could not load school off days:', e));
  }, []);

  const offDaysMap = useMemo(() => {
    const map = new Map<string, string>();
    offDays.forEach((o) => {
      if (o && o.date) map.set(o.date, o.name || 'Ngày nghỉ');
    });
    return map;
  }, [offDays]);

  // Array of days info in the month (tự động loại trừ các ngày nghỉ lễ/đột xuất trong lịch trường)
  const monthDays = useMemo(() => {
    const days: Array<{
      dayNum: number;
      dateStr: string;
      dayOfWeekShort: string; // '2', '3', '4', '5', '6', '7', 'CN'
      isSchoolMealDay: boolean; // T2-T6 (trừ ngày nghỉ)
      allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
      offName?: string;
    }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const schedule = getMealScheduleForDate(dateStr, offDaysMap, settings);
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
        offName: offDaysMap.get(dateStr),
      });
    }

    return days;
  }, [yearNum, monthNum, daysInMonth, offDaysMap, settings]);

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
    return effectiveBoardingStudents.find((s) => s.id === hoveredStudentId) || null;
  }, [hoveredStudentId, effectiveBoardingStudents]);

  const hoveredDayInfo = useMemo(() => {
    if (!hoveredDateStr) return null;
    return monthDays.find((d) => d.dateStr === hoveredDateStr) || null;
  }, [hoveredDateStr, monthDays]);

  const [overrideBreakfast, setOverrideBreakfast] = useState<number | null>(null);
  const [overrideLunch, setOverrideLunch] = useState<number | null>(null);
  const [overrideDinner, setOverrideDinner] = useState<number | null>(null);
  const [isAutoSyncReported, setIsAutoSyncReported] = useState<boolean>(true);

  // Tính số ngày ăn chuẩn mặc định theo lịch cả tháng (T2-T6, trừ ngày nghỉ lễ/thời tiết)
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

  // Tính số ngày ăn thực tế GVCN đã báo ăn / chấm ăn trong tháng theo từng bữa
  const autoReportedMealDays = useMemo(() => {
    let bCount = 0;
    let lCount = 0;
    let dCount = 0;

    monthDays.forEach((d) => {
      let dayHasB = false;
      let dayHasL = false;
      let dayHasD = false;

      // Kiểm tra từ ma trận chấm ăn của học sinh: chỉ tính nếu CÓ ÍT NHẤT 1 học sinh được chấm ăn bữa tương ứng
      for (const st of effectiveBoardingStudents) {
        const meal = mealMatrix[st.id]?.[d.dateStr];
        if (meal?.breakfast) dayHasB = true;
        if (meal?.lunch) dayHasL = true;
        if (meal?.dinner) dayHasD = true;
        if (dayHasB && dayHasL && dayHasD) break;
      }

      if (dayHasB) bCount++;
      if (dayHasL) lCount++;
      if (dayHasD) dCount++;
    });

    return {
      autoBreakfast: bCount,
      autoLunch: lCount,
      autoDinner: dCount,
      hasAnyReported: bCount > 0 || lCount > 0 || dCount > 0,
    };
  }, [monthDays, effectiveBoardingStudents, mealMatrix]);

  const standardSaveTimerRef = useRef<any>(null);

  // Load custom standard days config from localStorage & Supabase Cloud
  useEffect(() => {
    if (!selectedClassId || !selectedMonth) return;
    let isMounted = true;

    // Bước 1: Đọc nhanh từ bộ nhớ cục bộ (nếu có) để giao diện tức thì, không gián đoạn
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      if (savedRaw) {
        const configs = JSON.parse(savedRaw);
        const configKey = `${selectedClassId}_${selectedMonth}`;
        const savedConfig = configs[configKey];
        if (savedConfig) {
          const hasManual = savedConfig.breakfast !== undefined || savedConfig.lunch !== undefined || savedConfig.dinner !== undefined;
          if (savedConfig.mode === 'CUSTOM' || hasManual) {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(savedConfig.breakfast !== undefined ? savedConfig.breakfast : null);
            setOverrideLunch(savedConfig.lunch !== undefined ? savedConfig.lunch : null);
            setOverrideDinner(savedConfig.dinner !== undefined ? savedConfig.dinner : null);
          } else if (savedConfig.mode === 'CALENDAR' || (savedConfig.mode as string) === 'FIXED_SCHEDULE') {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(savedConfig.breakfast !== undefined ? savedConfig.breakfast : null);
            setOverrideLunch(savedConfig.lunch !== undefined ? savedConfig.lunch : null);
            setOverrideDinner(savedConfig.dinner !== undefined ? savedConfig.dinner : null);
          } else if (savedConfig.auto_sync || savedConfig.mode === 'AUTO_REPORTED') {
            setIsAutoSyncReported(true);
            setOverrideBreakfast(null);
            setOverrideLunch(null);
            setOverrideDinner(null);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading local standard config:', e);
    }

    // Bước 2: Đồng bộ từ Supabase Cloud để dữ liệu luôn chính xác khi mở trên thiết bị khác
    StorageService.getBoardingStandardConfig(selectedClassId, selectedMonth)
      .then((cfg) => {
        if (!isMounted) return;
        if (cfg) {
          const hasManual = cfg.breakfast !== undefined || cfg.lunch !== undefined || cfg.dinner !== undefined;
          if (cfg.mode === 'CUSTOM' || hasManual) {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
            setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
            setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
          } else if (cfg.mode === 'CALENDAR' || (cfg.mode as string) === 'FIXED_SCHEDULE') {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
            setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
            setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
          } else if (cfg.auto_sync || cfg.mode === 'AUTO_REPORTED') {
            setIsAutoSyncReported(true);
            setOverrideBreakfast(null);
            setOverrideLunch(null);
            setOverrideDinner(null);
          }
        }
      })
      .catch((e) => {
        console.warn('Lỗi khi tải định mức báo ăn từ Supabase:', e);
      });

    return () => {
      isMounted = false;
      if (standardSaveTimerRef.current) {
        clearTimeout(standardSaveTimerRef.current);
      }
    };
  }, [selectedClassId, selectedMonth]);

  // Helper to persist custom standard days config locally and to Supabase Cloud
  const saveCustomStandardConfig = async (
    breakfast: number | null,
    lunch: number | null,
    dinner: number | null,
    autoSync = false
  ) => {
    if (!selectedClassId || !selectedMonth) return;
    const isReset = !autoSync && breakfast === null && lunch === null && dinner === null;
    const configKey = `${selectedClassId}_${selectedMonth}`;

    const configToSave: BoardingStandardMealConfig = {
      breakfast: breakfast !== null ? breakfast : undefined,
      lunch: lunch !== null ? lunch : undefined,
      dinner: dinner !== null ? dinner : undefined,
      auto_sync: autoSync,
      mode: autoSync ? 'AUTO_REPORTED' : 'CUSTOM',
    };

    // 1. Cập nhật localStorage ngay lập tức để UI và cache giữ giá trị 100%
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      const configs = savedRaw ? JSON.parse(savedRaw) : {};
      
      if (isReset) {
        delete configs[configKey];
      } else {
        configs[configKey] = configToSave;
      }
      
      localStorage.setItem('sso_boarding_standard_configs_v1', JSON.stringify(configs));
    } catch (e) {
      console.warn('Error saving custom standard config locally:', e);
    }

    // 2. Debounce lưu trực tiếp lên Supabase Cloud để tránh tranh chấp dữ liệu khi gõ phím
    if (standardSaveTimerRef.current) {
      clearTimeout(standardSaveTimerRef.current);
    }

    standardSaveTimerRef.current = setTimeout(async () => {
      try {
        await StorageService.saveBoardingStandardConfig(
          selectedClassId,
          selectedMonth,
          isReset ? null : configToSave
        );
      } catch (e) {
        console.warn('Error saving custom standard config to Supabase Cloud:', e);
      }
    }, 350);
  };

  const updateOverrideBreakfast = (val: number | null) => {
    setIsAutoSyncReported(false);
    const effL = overrideLunch !== null ? overrideLunch : standardLunchDays;
    const effD = overrideDinner !== null ? overrideDinner : standardDinnerDays;
    setOverrideBreakfast(val);
    setOverrideLunch(effL);
    setOverrideDinner(effD);
    saveCustomStandardConfig(val, effL, effD, false);
  };

  const updateOverrideLunch = (val: number | null) => {
    setIsAutoSyncReported(false);
    const effB = overrideBreakfast !== null ? overrideBreakfast : standardBreakfastDays;
    const effD = overrideDinner !== null ? overrideDinner : standardDinnerDays;
    setOverrideBreakfast(effB);
    setOverrideLunch(val);
    setOverrideDinner(effD);
    saveCustomStandardConfig(effB, val, effD, false);
  };

  const updateOverrideDinner = (val: number | null) => {
    setIsAutoSyncReported(false);
    const effB = overrideBreakfast !== null ? overrideBreakfast : standardBreakfastDays;
    const effL = overrideLunch !== null ? overrideLunch : standardLunchDays;
    setOverrideBreakfast(effB);
    setOverrideLunch(effL);
    setOverrideDinner(val);
    saveCustomStandardConfig(effB, effL, val, false);
  };

  const handleToggleAutoSyncReported = async () => {
    const nextVal = !isAutoSyncReported;
    setIsAutoSyncReported(nextVal);
    if (nextVal) {
      setOverrideBreakfast(null);
      setOverrideLunch(null);
      setOverrideDinner(null);
      await saveCustomStandardConfig(null, null, null, true);
      showToast(
        `Đã bật chế độ TỰ ĐỘNG ĐỒNG BỘ ĐỊNH MỨC theo số ngày báo ăn thực tế của GVCN: Sáng ${autoReportedMealDays.autoBreakfast} ngày, Trưa ${autoReportedMealDays.autoLunch} ngày, Tối ${autoReportedMealDays.autoDinner} ngày!`
      );
    } else {
      const curB = standardBreakfastDays;
      const curL = standardLunchDays;
      const curD = standardDinnerDays;
      setOverrideBreakfast(curB);
      setOverrideLunch(curL);
      setOverrideDinner(curD);
      await saveCustomStandardConfig(curB, curL, curD, false);
      showToast(
        `Đã chuyển sang cấu hình ĐỊNH MỨC THỦ CÔNG: Sáng ${curB} ngày, Trưa ${curL} ngày, Tối ${curD} ngày! Thầy/Cô có thể chỉnh sửa số ngày theo ý muốn.`
      );
    }
  };

  const handleResetStandardConfig = async () => {
    setIsAutoSyncReported(true);
    setOverrideBreakfast(null);
    setOverrideLunch(null);
    setOverrideDinner(null);
    await saveCustomStandardConfig(null, null, null, true);
    showToast(
      `Đã reset định mức ngày báo ăn Tháng ${monthNum}/${yearNum} về mặc định "✓ Đang tự động theo báo ăn": Sáng ${autoReportedMealDays.autoBreakfast} ngày, Trưa ${autoReportedMealDays.autoLunch} ngày, Tối ${autoReportedMealDays.autoDinner} ngày!`
    );
  };

  // Định mức ngày ăn có hiệu lực (S, T, T)
  const standardBreakfastDays = useMemo(() => {
    if (isAutoSyncReported) {
      return autoReportedMealDays.autoBreakfast;
    }
    return overrideBreakfast !== null ? overrideBreakfast : defaultStandardBreakfast;
  }, [isAutoSyncReported, autoReportedMealDays.autoBreakfast, overrideBreakfast, defaultStandardBreakfast]);

  const standardLunchDays = useMemo(() => {
    if (isAutoSyncReported) {
      return autoReportedMealDays.autoLunch;
    }
    return overrideLunch !== null ? overrideLunch : defaultStandardLunch;
  }, [isAutoSyncReported, autoReportedMealDays.autoLunch, overrideLunch, defaultStandardLunch]);

  const standardDinnerDays = useMemo(() => {
    if (isAutoSyncReported) {
      return autoReportedMealDays.autoDinner;
    }
    return overrideDinner !== null ? overrideDinner : defaultStandardDinner;
  }, [isAutoSyncReported, autoReportedMealDays.autoDinner, overrideDinner, defaultStandardDinner]);

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
  const [sigConfig, setSigConfig] = useState<BoardingSignatureConfig>({
    id: `sig_config_${selectedClassId}`,
    class_id: selectedClassId,
    location_name: 'Xa Dung',
    teacher_title: 'GIÁO VIÊN CHỦ NHIỆM',
    teacher_name: '',
    enable_digital_signature: true,
  });
  const [monthSig, setMonthSig] = useState<BoardingMonthSignature | null>(null);
  const [showDigitalSigModal, setShowDigitalSigModal] = useState<boolean>(false);

  useEffect(() => {
    async function loadSignatureData() {
      if (!selectedClassId) return;
      try {
        const cfg = await StorageService.getBoardingSignatureConfig(selectedClassId);
        setSigConfig(cfg);
        if (cfg.location_name) setSigningLocation(cfg.location_name);
        if (cfg.teacher_name) setCustomTeacherName(cfg.teacher_name);

        const mSig = await StorageService.getBoardingMonthSignature(selectedClassId, selectedMonth);
        setMonthSig(mSig);
      } catch (e) {
        console.warn('Error loading signature config:', e);
      }
    }
    loadSignatureData();
  }, [selectedClassId, selectedMonth]);

  useEffect(() => {
    const saved = localStorage.getItem(`sso_boarding_teacher_${selectedClassId}`);
    if (saved) {
      setCustomTeacherName(saved);
    } else {
      setCustomTeacherName(defaultTeacherName);
    }
  }, [selectedClassId, defaultTeacherName]);

  const effectiveTeacherName = customTeacherName || defaultTeacherName;

  // Tính ngày ký tự động theo tháng:
  // - Trang 1 (1 - 15): Ngày 15 của tháng
  // - Trang 2 (16 - cuối tháng) & Cả tháng: Tự động cập nhật chuẩn xác ngày cuối cùng của tháng (ví dụ: ngày 31 tháng 10 năm 2026, ngày 30 tháng 09 năm 2026, ngày 28/29 tháng 02, ...)
  const effectiveSigningDay = useMemo(() => {
    if (viewMode === 'page1') {
      return 15;
    }
    return daysInMonth;
  }, [viewMode, daysInMonth]);

  const effectiveSigningDateText = useMemo(() => {
    const loc = sigConfig.location_name?.trim() || signingLocation.trim() || 'Xa Dung';
    return `${loc}, ngày ${effectiveSigningDay} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`;
  }, [sigConfig.location_name, signingLocation, effectiveSigningDay, monthNum, yearNum]);

  const monthEndSigningDateText = useMemo(() => {
    const loc = sigConfig.location_name?.trim() || signingLocation.trim() || 'Xa Dung';
    return `${loc}, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`;
  }, [sigConfig.location_name, signingLocation, daysInMonth, monthNum, yearNum]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load monthly meal data
  const loadMonthData = async (isSilent = false) => {
    if (!selectedClassId || !selectedMonth) return;
    const reqSeq = ++loadSequenceRef.current;
    const cacheKey = `${selectedClassId}_${selectedMonth}`;
    const alreadyLoaded = Boolean(hasLoadedOnce.current[cacheKey]);

    // Chỉ hiển thị màn hình đang tải lúc mở lớp/tháng lần đầu tiên khi chưa có dữ liệu trong bộ nhớ
    // Khi đang chấm trực tiếp: TUYỆT ĐỐI KHÔNG HIỂN THỊ "Đang tải dữ liệu..." để thao tác mượt mà 100%
    if (!isSilent && !alreadyLoaded) {
      setIsLoading(true);
    }
    try {
      // 1. Lấy danh sách báo ăn bán trú đã lưu trong tháng (Supabase + Local)
      const reports = await StorageService.getBoardingReportsByClassAndMonth(selectedClassId, selectedMonth);
      if (reqSeq !== loadSequenceRef.current) return;

      const reportMap = new Map<string, BoardingDailyReport>();
      reports.forEach((r) => {
        if (!r) return;
        const cleanDate = String(r.date).split('T')[0].trim();

        let recs = r.records;
        if (typeof recs === 'string') {
          try { recs = JSON.parse(recs); } catch { recs = []; }
        }
        if (!Array.isArray(recs)) {
          recs = [];
        }
        reportMap.set(cleanDate, {
          ...r,
          date: cleanDate,
          records: recs,
        });
      });

      // 2. Tự động tổng hợp số liệu từ các ngày đã nộp Báo cáo sĩ số (daily_reports)
      // Đảm bảo Sổ chấm cơm tháng tự động hiển thị đầy đủ số liệu chính xác ngay cả khi GVCN chưa lưu thủ công ở tab chấm ăn
      let targetStudents = effectiveBoardingStudents.length > 0 ? effectiveBoardingStudents : classBoardingStudents;
      if (targetStudents.length === 0 && asyncBoardingStudents.length > 0) {
        targetStudents = asyncBoardingStudents;
      }
      if (targetStudents.length === 0) {
        const clsStudents = await StorageService.getStudentsByClass(selectedClassId, currentClass?.class_name);
        targetStudents = clsStudents.filter((s) => s.isBoarding !== false);
      }
      setAsyncBoardingStudents(targetStudents);

      try {
        const classDaily = await StorageService.getDailyReportsByMonth(selectedClassId, selectedMonth);
        const synthToSave: BoardingDailyReport[] = [];
        const submittedDailyDates = new Set<string>();

        classDaily.forEach((dr) => {
          // Chỉ đồng bộ khi GVCN ĐÃ NỘP BÁO CÁO SĨ SỐ THỰC SỰ (SUBMITTED hoặc LOCKED)
          if (!dr || (dr.status !== 'SUBMITTED' && dr.status !== 'LOCKED')) return;
          const cleanDate = String(dr.report_date).split('T')[0].trim();
          if (!cleanDate.startsWith(selectedMonth)) return;

          submittedDailyDates.add(cleanDate);

          // Nếu ngày này chưa có bản ghi báo ăn cụ thể nào trong reportMap
          if (!reportMap.has(cleanDate)) {
            const absentMap = new Map<string, { reason?: string }>();
            if (dr.absent_students && Array.isArray(dr.absent_students)) {
              dr.absent_students.forEach((ab: any) => {
                if (ab.id) {
                  absentMap.set(ab.id, { reason: ab.reason });
                }
                if (ab.full_name) {
                  absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
                }
              });
            }

            const synthRecords = buildDefaultMealRecords(targetStudents, cleanDate, selectedClassId, absentMap, settings);
            let bCount = 0;
            let lCount = 0;
            let dCount = 0;
            let abCount = 0;

            synthRecords.forEach((rec) => {
              if (rec.breakfast) bCount++;
              if (rec.lunch) lCount++;
              if (rec.dinner) dCount++;
              if (rec.is_absent) abCount++;
            });

            const newRep: BoardingDailyReport = {
              id: `boarding_rep_${selectedClassId}_${cleanDate}`,
              class_id: selectedClassId,
              date: cleanDate,
              status: 'SUBMITTED',
              total_boarding_students: targetStudents.length,
              breakfast_count: bCount,
              lunch_count: lCount,
              dinner_count: dCount,
              absent_count: abCount,
              total_meals: bCount + lCount + dCount,
              notes: dr.notes || 'Tổng hợp từ Báo cáo sĩ số ngày',
              records: synthRecords,
              submitted_by: currentUser?.id,
              submitted_by_name: currentUser?.full_name || 'GVCN',
              submitted_at: dr.updated_at || dr.created_at || new Date().toISOString(),
              created_at: dr.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            reportMap.set(cleanDate, newRep);
            synthToSave.push(newRep);
          }
        });

        // BẢO VỆ DỮ LIỆU: Nếu ngày này trong quá khứ/hiện tại GVCN CHƯA BÁO CÁO SĨ SỐ,
        // xóa bỏ các bản ghi tự động đồng bộ cũ để trên sổ chấm cơm KHÔNG hiển thị chấm ăn
        const todayStr = getTodayDateStr();
        const invalidDatesToRemove: string[] = [];
        reportMap.forEach((rep, cleanDate) => {
          if (cleanDate <= todayStr && !submittedDailyDates.has(cleanDate)) {
            const isAuto = Boolean(rep.notes?.includes('Tổng hợp') || rep.notes?.includes('đồng bộ') || rep.notes?.includes('Báo cáo sĩ số'));
            if (isAuto) {
              invalidDatesToRemove.push(cleanDate);
            }
          }
        });
        invalidDatesToRemove.forEach((d) => reportMap.delete(d));

        if (synthToSave.length > 0) {
          StorageService.saveBoardingReportsBulk(synthToSave, currentUser || undefined).catch(console.warn);
        }
      } catch (errSync) {
        console.warn('Auto-sync daily reports to boarding sheet error:', errSync);
      }

      // Track actually reported dates for dynamic standard calculations
      const reportedSet = new Set<string>();
      reportMap.forEach((rep, dateStr) => {
        // Chỉ coi là ngày có báo ăn nếu thực sự có ít nhất 1 học sinh được chấm ăn trong ngày đó
        const recs = rep.records;
        const hasMeal = Array.isArray(recs) && recs.some((m) => m && (m.breakfast || m.lunch || m.dinner));
        if (hasMeal) {
          reportedSet.add(dateStr);
        }
      });
      setReportedDates(reportedSet);

      const initialMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
      const studentsToRender = targetStudents.length > 0 ? targetStudents : effectiveBoardingStudents;

      studentsToRender.forEach((st) => {
        initialMatrix[st.id] = {};
        const normName = st.full_name.trim().toLowerCase();

        monthDays.forEach((day) => {
          const rep = reportMap.get(day.dateStr);
          if (!rep) {
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
            return;
          }

          let recs = rep.records;
          if (typeof recs === 'string') {
            try { recs = JSON.parse(recs); } catch { recs = []; }
          }

          const stRec = Array.isArray(recs)
            ? recs.find((r) => r.student_id === st.id) ||
              recs.find((r) => r.student_name && r.student_name.trim().toLowerCase() === normName)
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
            initialMatrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
          }
        });
      });

      if (reqSeq === loadSequenceRef.current) {
        setMealMatrix(initialMatrix);
      }
    } catch (e) {
      console.error('Error loading month data:', e);
    } finally {
      if (reqSeq === loadSequenceRef.current) {
        setIsLoading(false);
        isInitialLoad.current = false;
        hasLoadedOnce.current[`${selectedClassId}_${selectedMonth}`] = true;
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadMonthData(false);

    // Lắng nghe sự kiện lưu báo ăn từ Tab 1 (Báo cáo sĩ số ngày) để tự động đồng bộ tức thì vào biểu
    // Lưu ý: Tuyệt đối KHÔNG lắng nghe 'boarding_reports' tại đây để tránh vòng lặp tự reload và giật lag khi chấm ăn
    let debounceTimer: any = null;
    const unsubscribe = subscribeRealtime((event) => {
      if (event.table === 'daily_reports') {
        const payloadClassId = event.payload?.classId;
        const payloadDate = event.payload?.reportDate || event.payload?.date;

        const cleanPayloadCls = String(payloadClassId || '').trim().toLowerCase();
        const cleanPayloadClsNoPrefix = cleanPayloadCls.replace(/^c_/, '').replace(/^lớp\s*/i, '');

        // Bỏ qua các sự kiện của lớp khác hoặc tháng khác để tránh giật lag khi nhiều GVCN cùng báo cáo
        if (payloadClassId && !validClassIds.has(cleanPayloadCls) && !validClassIds.has(cleanPayloadClsNoPrefix)) return;
        if (payloadDate && !payloadDate.startsWith(selectedMonth)) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (isMounted) {
            loadMonthData(true);
          }
        }, 400);
      }
      if (event.table === 'boarding_standard_configs' || event.table === 'boarding_month_signatures') {
        const payloadClassId = event.payload?.classId;
        const payloadMonth = event.payload?.month;
        if (payloadClassId && payloadClassId !== selectedClassId) return;
        if (payloadMonth && payloadMonth !== selectedMonth) return;

        StorageService.getBoardingStandardConfig(selectedClassId, selectedMonth).then((cfg) => {
          if (!isMounted) return;
          if (cfg) {
            const hasManual = cfg.breakfast !== undefined || cfg.lunch !== undefined || cfg.dinner !== undefined;
            if (cfg.mode === 'CUSTOM' || hasManual) {
              setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
              setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
              setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
              setIsAutoSyncReported(false);
            } else if (cfg.mode === 'CALENDAR' || (cfg.mode as string) === 'FIXED_SCHEDULE') {
              setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
              setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
              setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
              setIsAutoSyncReported(false);
            } else if (cfg.auto_sync || cfg.mode === 'AUTO_REPORTED') {
              setOverrideBreakfast(null);
              setOverrideLunch(null);
              setOverrideDinner(null);
              setIsAutoSyncReported(true);
            }
          }
        });
      }
      if (event.table === 'school_off_days') {
        StorageService.getOffDays()
          .then((list) => {
            if (Array.isArray(list)) setOffDays(list);
          })
          .catch(console.warn);
      }
    });

    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
      // Clear all pending save timers on unmount
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [selectedClassId, selectedMonth, effectiveBoardingStudents.length, validClassIds]);

  // Đồng bộ thủ công từ tất cả báo cáo ngày của GVCN
  const handleSyncFromDailyReports = async () => {
    if (!selectedClassId || !selectedMonth) return;
    setIsLoading(true);
    try {
      // 1. Đảm bảo có danh sách học sinh đầy đủ
      let currentStudents = effectiveBoardingStudents;
      if (!currentStudents || currentStudents.length === 0) {
        currentStudents = await StorageService.getStudentsByClass(selectedClassId, currentClass?.class_name);
        currentStudents = currentStudents.filter((s) => s.isBoarding !== false);
      }
      setAsyncBoardingStudents(currentStudents);

      if (currentStudents.length === 0) {
        showToast('Lớp này chưa có danh sách học sinh bán trú. Thầy/Cô vui lòng tải lên danh sách học sinh trước!', 'info');
        return;
      }

      const classDaily = await StorageService.getDailyReportsByMonth(selectedClassId, selectedMonth);
      const reportsToSave: BoardingDailyReport[] = [];

      classDaily.forEach((dr) => {
        // Chỉ đồng bộ khi GVCN ĐÃ NỘP BÁO CÁO SĨ SỐ THỰC SỰ (SUBMITTED hoặc LOCKED)
        if (!dr || (dr.status !== 'SUBMITTED' && dr.status !== 'LOCKED')) return;
        const cleanDate = String(dr.report_date).split('T')[0].trim();
        if (!cleanDate.startsWith(selectedMonth)) return;

        const absentMap = new Map<string, { reason?: string }>();
        if (dr.absent_students && Array.isArray(dr.absent_students)) {
          dr.absent_students.forEach((ab) => {
            if (ab.id) {
              absentMap.set(ab.id, { reason: ab.reason });
            }
            if (ab.full_name) {
              absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
            }
          });
        }
        const synthRecords = buildDefaultMealRecords(currentStudents, cleanDate, selectedClassId, absentMap);
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
          total_boarding_students: currentStudents.length,
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
        try {
          localStorage.removeItem(`sso_cleared_boarding_${selectedClassId}_${selectedMonth}`);
        } catch {}
        await StorageService.saveBoardingReportsBulk(reportsToSave, currentUser || undefined);
        await loadMonthData();
        const distinctDates = new Set(reportsToSave.map((r) => r.date));
        showToast(
          `Đã đồng bộ thành công! Có ${distinctDates.size} ngày báo cáo sĩ số tháng ${monthNum}/${yearNum} đã được cập nhật đầy đủ vào sổ chấm ăn.`
        );
      } else {
        await loadMonthData();
        showToast(
          `Không tìm thấy báo cáo sĩ số nào của tháng ${monthNum}/${yearNum} cho lớp ${currentClass?.class_name || ''}. Thầy/Cô vui lòng kiểm tra lại tháng đã chọn hoặc vào mục Báo cáo sĩ số ngày để nộp báo cáo.`,
          'info'
        );
      }
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
      const schedule = getMealScheduleForDate(dateStr, offDaysMap, settings);
      let bCount = 0;
      let lCount = 0;
      let dCount = 0;
      let abCount = 0;

      const records: BoardingMealRecord[] = effectiveBoardingStudents.map((st) => {
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
        setReportedDates((prev) => {
          const next = new Set(prev);
          next.delete(dateStr);
          return next;
        });
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

      setReportedDates((prev) => {
        const next = new Set(prev);
        next.add(dateStr);
        return next;
      });
      try {
        localStorage.removeItem(`sso_cleared_boarding_${selectedClassId}_${selectedMonth}`);
      } catch {}

      const report: BoardingDailyReport = {
        id: `boarding_rep_${selectedClassId}_${dateStr}`,
        class_id: selectedClassId,
        date: dateStr,
        status: 'SUBMITTED',
        total_boarding_students: effectiveBoardingStudents.length,
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

  // Batch toggle an entire meal session (breakfast / lunch / dinner) for all students on a given date
  const handleBatchToggleSession = (
    dateStr: string,
    meal: 'breakfast' | 'lunch' | 'dinner',
    forcedState?: boolean
  ) => {
    if (effectiveBoardingStudents.length === 0) return;

    const dayInfo = monthDays.find((d) => d.dateStr === dateStr);
    const dayNum = dayInfo?.dayNum || dateStr.slice(8);
    const mealLabel = meal === 'breakfast' ? 'Sáng' : meal === 'lunch' ? 'Trưa' : 'Tối';

    setMealMatrix((prev) => {
      // Check if all students currently have this meal checked
      const allChecked = effectiveBoardingStudents.every(
        (st) => prev[st.id]?.[dateStr]?.[meal] === true
      );
      const targetState = forcedState !== undefined ? forcedState : !allChecked;

      const updated = { ...prev };
      effectiveBoardingStudents.forEach((st) => {
        const currentStudentDays = updated[st.id] || {};
        const currentDay = currentStudentDays[dateStr] || {
          breakfast: false,
          lunch: false,
          dinner: false,
        };
        updated[st.id] = {
          ...currentStudentDays,
          [dateStr]: {
            ...currentDay,
            [meal]: targetState,
          },
        };
      });

      setAutoSaveStatus('saving');

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
      }, 200);

      showToast(
        targetState
          ? `Đã chấm bữa ${mealLabel} ngày ${dayNum}/${monthNum} cho ${effectiveBoardingStudents.length} học sinh!`
          : `Đã hủy chấm bữa ${mealLabel} ngày ${dayNum}/${monthNum}!`
      );

      return updated;
    });
  };

  // Batch mark or clear entire day (all meals) for all students
  const handleBatchMarkDay = (dateStr: string, targetState: boolean = true) => {
    if (effectiveBoardingStudents.length === 0) return;

    const dayInfo = monthDays.find((d) => d.dateStr === dateStr);
    const dayNum = dayInfo?.dayNum || dateStr.slice(8);
    const schedule = getMealScheduleForDate(dateStr, offDaysMap, settings);

    setMealMatrix((prev) => {
      const updated = { ...prev };
      effectiveBoardingStudents.forEach((st) => {
        const currentStudentDays = updated[st.id] || {};
        updated[st.id] = {
          ...currentStudentDays,
          [dateStr]: {
            breakfast: targetState ? schedule.breakfastAllowed : false,
            lunch: targetState ? schedule.lunchAllowed : false,
            dinner: targetState ? schedule.dinnerAllowed : false,
          },
        };
      });

      setAutoSaveStatus('saving');

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
        }, 200);
      }, 200);

      showToast(
        targetState
          ? `Đã chấm ăn cả ngày ${dayNum}/${monthNum} cho ${effectiveBoardingStudents.length} học sinh!`
          : `Đã xóa sạch toàn bộ chấm ăn ngày ${dayNum}/${monthNum}!`
      );

      return updated;
    });
  };

  // Apply batch modal execution for multiple dates
  const handleApplyBatchModal = async (
    dates: string[],
    mealOption: 'all_day' | 'breakfast' | 'lunch' | 'dinner' | 'clear',
    targetStudentIds?: string[]
  ) => {
    if (dates.length === 0 || effectiveBoardingStudents.length === 0) return;

    const targetStudents = targetStudentIds
      ? effectiveBoardingStudents.filter((st) => targetStudentIds.includes(st.id))
      : effectiveBoardingStudents;

    let updatedMatrix = { ...mealMatrix };

    dates.forEach((dateStr) => {
      const schedule = getMealScheduleForDate(dateStr, offDaysMap, settings);

      targetStudents.forEach((st) => {
        const currentStudentDays = updatedMatrix[st.id] || {};
        const currentDay = currentStudentDays[dateStr] || {
          breakfast: false,
          lunch: false,
          dinner: false,
        };

        let nextB = currentDay.breakfast;
        let nextL = currentDay.lunch;
        let nextD = currentDay.dinner;

        if (mealOption === 'all_day') {
          nextB = schedule.breakfastAllowed;
          nextL = schedule.lunchAllowed;
          nextD = schedule.dinnerAllowed;
        } else if (mealOption === 'breakfast') {
          nextB = true;
        } else if (mealOption === 'lunch') {
          nextL = true;
        } else if (mealOption === 'dinner') {
          nextD = true;
        } else if (mealOption === 'clear') {
          nextB = false;
          nextL = false;
          nextD = false;
        }

        updatedMatrix[st.id] = {
          ...currentStudentDays,
          [dateStr]: {
            breakfast: nextB,
            lunch: nextL,
            dinner: nextD,
          },
        };
      });
    });

    setMealMatrix(updatedMatrix);
    setAutoSaveStatus('saving');

    // Save all affected dates
    for (const dStr of dates) {
      await autoSaveMealDate(dStr, updatedMatrix);
    }

    setAutoSaveStatus('saved');
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      setAutoSaveStatus('idle');
    }, 2500);

    const actionText =
      mealOption === 'all_day'
        ? 'Chấm ăn cả ngày'
        : mealOption === 'breakfast'
        ? 'Chấm ăn bữa Sáng'
        : mealOption === 'lunch'
        ? 'Chấm ăn bữa Trưa'
        : mealOption === 'dinner'
        ? 'Chấm ăn bữa Tối'
        : 'Xóa chấm ăn';

    showToast(
      `Đã ${actionText.toLowerCase()} thành công cho ${dates.length} ngày (${targetStudents.length} học sinh)!`
    );
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
        try {
          const supabase = getSupabaseClient();
          if (supabase && isSupabaseConnected()) {
            await supabase.from('boarding_reports').delete().eq('class_id', selectedClassId).gt('date', todayStr);
          }
        } catch (e) {
          console.warn('Supabase delete future reports warning:', e);
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
        `Bạn có chắc muốn XÓA SẠCH toàn bộ dấu chấm ăn Tháng ${monthNum}/${yearNum} của lớp ${currentClass?.class_name}?\n\n- Toàn bộ các ngày trong tháng sẽ để trống 100% (không có bất kỳ dấu + nào).\n- Định mức ăn tự động sẽ về 0 sáng, 0 trưa, 0 tối (sẵn sàng tự động tăng khi GVCN chấm từng ngày).`
      )
    ) {
      setIsLoading(true);
      try {
        // 1. Xóa trong Storage và Supabase thông qua hàm chuyên dụng
        await StorageService.deleteBoardingReportsByClassAndMonth(selectedClassId, selectedMonth);

        // 2. Đưa ma trận về rỗng 100%
        const emptyMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
        effectiveBoardingStudents.forEach((st) => {
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
        setReportedDates(new Set());
        setOverrideBreakfast(null);
        setOverrideLunch(null);
        setOverrideDinner(null);
        setIsAutoSyncReported(true);

        try {
          await saveCustomStandardConfig(null, null, null, true);
        } catch (errCfg) {
          console.warn('Warning saving standard config on clear:', errCfg);
        }

        showToast(`Đã xóa sạch chấm ăn Tháng ${monthNum}/${yearNum}! Định mức báo ăn đã đưa về 0S - 0T - 0T, sẵn sàng chấm mới.`);
      } catch (e) {
        console.error('Clear all month error:', e);
        // Fallback tự phục hồi: Vẫn làm rỗng ma trận bộ nhớ để không làm gián đoạn công việc của giáo viên
        const emptyMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
        effectiveBoardingStudents.forEach((st) => {
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
        setReportedDates(new Set());
        setOverrideBreakfast(null);
        setOverrideLunch(null);
        setOverrideDinner(null);
        setIsAutoSyncReported(true);

        showToast(`Đã xóa sạch chấm ăn Tháng ${monthNum}/${yearNum}!`);
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

    effectiveBoardingStudents.forEach((st) => {
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
  }, [effectiveBoardingStudents, mealMatrix, monthDays, standardBreakfastDays, standardLunchDays, standardDinnerDays]);

  // Daily column meal counts for footer CỘNG
  const columnTotals = useMemo(() => {
    const dailyTotals: Record<string, { breakfast: number; lunch: number; dinner: number }> = {};

    displayedMonthDays.forEach((d) => {
      let b = 0;
      let l = 0;
      let dn = 0;
      effectiveBoardingStudents.forEach((st) => {
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

    effectiveBoardingStudents.forEach((st) => {
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
  }, [displayedMonthDays, effectiveBoardingStudents, mealMatrix, studentSummaries]);

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
        const hasAnyMeal = effectiveBoardingStudents.some((st) => {
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
  }, [monthDays, effectiveBoardingStudents, mealMatrix]);

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
        const hasAnyMeal = effectiveBoardingStudents.some((st) => {
          const m = mealMatrix[st.id]?.[day.dateStr];
          return m?.breakfast || m?.lunch || m?.dinner;
        });

        if (!hasAnyMeal) {
          datesToDelete.push(day.dateStr);
          return;
        }

        const schedule = getMealScheduleForDate(day.dateStr, offDaysMap, settings);
        let bCount = 0;
        let lCount = 0;
        let dCount = 0;
        let abCount = 0;

        const records: BoardingMealRecord[] = effectiveBoardingStudents.map((st) => {
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
          total_boarding_students: effectiveBoardingStudents.length,
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
        try {
          localStorage.removeItem(`sso_cleared_boarding_${selectedClassId}_${selectedMonth}`);
        } catch {}
        await StorageService.saveBoardingReportsBulk(reportsToSave, currentUser || undefined);
      }
      // Lưu đồng bộ định mức ăn đã đặt hoặc đã đặt lại lên Supabase Cloud
      const stdConfigToSave: BoardingStandardMealConfig = isAutoSyncReported
        ? {
            auto_sync: true,
            mode: 'AUTO_REPORTED',
          }
        : {
            breakfast: overrideBreakfast !== null ? overrideBreakfast : standardBreakfastDays,
            lunch: overrideLunch !== null ? overrideLunch : standardLunchDays,
            dinner: overrideDinner !== null ? overrideDinner : standardDinnerDays,
            auto_sync: false,
            mode: 'CUSTOM',
          };

      await StorageService.saveBoardingStandardConfig(
        selectedClassId,
        selectedMonth,
        stdConfigToSave
      );
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
        students: effectiveBoardingStudents, // Đúng 100% danh sách học sinh bán trú đang hiển thị
        teacherName: effectiveTeacherName,
        teacherTitle: sigConfig.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM',
        principalName: settings?.principal_name || 'Hiệu trưởng',
        signingDate: monthEndSigningDateText,
        existingMatrix: Object.keys(mealMatrix).length > 0 ? mealMatrix : undefined,
        standardBreakfastDays,
        standardLunchDays,
        standardDinnerDays,
        sigConfig,
        monthSig,
        sheetTitle: settings?.boarding_sheet_title || 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ',
      });
      showToast('Đã xuất file Excel Sổ Chấm Cơm chuẩn biểu mẫu thành công!');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Lỗi khi xuất file Excel!', 'error');
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

      {/* 1. THANH ĐIỀU KHIỂN & TÁC VỤ CHÍNH (KHOA HỌC - CHUẨN MỰC - TỐI ƯU ĐIỆN THOẠI) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm no-print overflow-hidden">
        {/* Hàng 1: Bộ lọc Tháng/Lớp & Nhóm nút Xuất bản / In ấn / Lưu trữ */}
        <div className="p-2.5 sm:p-4 border-b border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3 bg-gradient-to-r from-slate-50/70 via-white to-slate-50/40">
          {/* Cụm Bộ lọc bên trái */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Chọn Tháng */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-white px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
              <label className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Tháng:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer w-full"
              />
            </div>

            {/* Chọn Lớp */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-white px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
              <School className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
              <label className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Lớp:</label>
              {isGVCN && currentUser?.assigned_class_id ? (
                <span className="text-blue-900 font-black text-xs sm:text-sm truncate">
                  {currentClass?.class_name}
                </span>
              ) : (
                <select
                  value={selectedClassId}
                  onChange={(e) => onClassChange?.(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer w-full"
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

            {/* Trạng thái tự động lưu (Mobile & Desktop) */}
            {autoSaveStatus === 'saving' && (
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 animate-pulse shadow-2xs">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span>Đang lưu tự động...</span>
              </div>
            )}
            {autoSaveStatus === 'saved' && (
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đã lưu đám mây</span>
              </div>
            )}
          </div>

          {/* Cụm Xuất bản & Nút LƯU SỔ CHẤM CƠM bên phải */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="px-2.5 sm:px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Xem trước bản in chuẩn khổ giấy A4 ngang và xuất file PDF"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>In PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-2.5 sm:px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Xuất file Excel chuẩn Bộ GD&ĐT tự động chia 2 trang (Trang 1: Ngày 1-15, Trang 2: Ngày 16-hết) khi in không bị co chữ"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Xuất Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`px-2.5 sm:px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                isFullscreen
                  ? 'bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
              }`}
              title={isFullscreen ? 'Thu nhỏ màn hình' : 'Phóng to toàn màn hình chấm ăn rõ nét'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 shrink-0" /> : <Maximize2 className="w-3.5 h-3.5 shrink-0" />}
              <span>{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
            </button>

            {/* Nút LƯU SỔ CHẤM CƠM - Chiếm trọn 2 cột trên điện thoại cực kỳ dễ bấm */}
            <button
              type="button"
              onClick={handleSaveMonth}
              disabled={isSaving}
              className="col-span-2 sm:col-span-1 px-4 sm:px-4.5 py-2.5 sm:py-2 rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu Sổ Chấm Cơm'}</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Dải công cụ nghiệp vụ chấm cơm bán trú (Vuốt ngang mượt mà trên điện thoại) */}
        <div className="px-2.5 sm:px-4 py-2 sm:py-2.5 bg-slate-50/90 flex items-center justify-between gap-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 max-w-[calc(100vw-70px)] sm:max-w-none">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 mr-0.5 hidden md:inline shrink-0">
              Tác vụ:
            </span>

            {/* Chấm theo ngày/buổi */}
            <button
              type="button"
              onClick={() => setShowBatchModal(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              title="Mở bảng chọn chấm ăn nhanh theo ngày, theo buổi sáng/trưa/tối hoặc xóa chấm ăn nhiều ngày"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-200" />
              <span>Chấm theo ngày/buổi</span>
            </button>

            {/* Đồng bộ báo ăn ngày */}
            <button
              type="button"
              onClick={handleSyncFromDailyReports}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
              title="Đồng bộ tất cả ngày GVCN đã báo ăn (từ phiếu báo ăn ngày hoặc báo cáo sĩ số ngày) vào biểu"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Đồng bộ báo ăn ngày</span>
            </button>

            {/* Để trống ngày chưa báo */}
            <button
              type="button"
              onClick={handleResetToOnlyReported}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
              title="Làm sạch sổ: Để trống tất cả các ngày chưa báo ăn và ngày tương lai, chỉ giữ lại những ngày GVCN đã báo ăn thực tế"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Để trống ngày chưa báo</span>
            </button>

            {/* Xóa sạch chấm lại */}
            <button
              type="button"
              onClick={handleClearAllMonth}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
              title="Xóa toàn bộ chấm ăn của tháng này để sổ trống 100%, sẵn sàng cho GVCN chấm từng ngày"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Xóa sạch chấm lại</span>
            </button>

            {/* Reset định mức tháng */}
            <button
              type="button"
              onClick={handleResetStandardConfig}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0 ${
                isAutoSyncReported
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300'
                  : overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black ring-2 ring-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
              }`}
              title={`Reset ngày báo ăn định mức tháng ${monthNum}/${yearNum} về chuẩn theo lịch học: Sáng ${defaultStandardBreakfast}, Trưa ${defaultStandardLunch}, Tối ${defaultStandardDinner} ngày`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
              <span>Reset định mức</span>
              {isAutoSyncReported ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-950 font-black">
                  Tự động
                </span>
              ) : (overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null) ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-950 font-black">
                  Có đè
                </span>
              ) : null}
            </button>
          </div>

          {/* Nút Ẩn/Hiện bảng cấu hình định mức & chữ ký */}
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-all flex items-center gap-1 cursor-pointer bg-white border border-slate-200 shadow-2xs shrink-0"
            title="Ẩn hoặc hiện bảng cấu hình số ngày định mức ăn và chữ ký"
          >
            <span className="hidden sm:inline">{isConfigOpen ? 'Thu gọn cấu hình' : 'Hiện cấu hình'}</span>
            {isConfigOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* 2. BẢNG CẤU HÌNH ĐỊNH MỨC ĂN & CHỮ KÝ (TỐI ƯU MÀN HÌNH ĐIỆN THOẠI & MÁY TÍNH) */}
      {isConfigOpen && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5 sm:gap-3.5 no-print animate-fadeIn -mt-1 sm:-mt-2">
          {/* Card Trái: Định Mức Ngày Báo Ăn Chuẩn */}
          <div className="bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-orange-50/30 rounded-2xl p-3 sm:p-4 border border-amber-200/90 shadow-2xs flex flex-col justify-between gap-2.5 sm:gap-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-1">
                <div className="text-[11px] sm:text-xs font-black text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
                  <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                  <span>Định mức ngày ăn tháng {monthNum}/{yearNum}</span>
                </div>
                {isAutoSyncReported ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-900 border border-emerald-400 flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    {autoReportedMealDays.hasAnyReported
                      ? `Tự động: ${standardBreakfastDays}S - ${standardLunchDays}T - ${standardDinnerDays}T`
                      : `Tự động (Chưa có)`}
                  </span>
                ) : overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-amber-200 text-amber-950 border border-amber-400 flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                    Đè thủ công: {standardBreakfastDays}S - ${standardLunchDays}T - ${standardDinnerDays}T
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-300">
                    Lịch học: {defaultStandardBreakfast}S - {defaultStandardLunch}T - {defaultStandardDinner}T
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium leading-relaxed">
                Chuẩn kế toán: <strong>Ngày ăn + Ngày không ăn = Định mức</strong>.
              </p>
            </div>

            {/* Dải điều khiển & Nhập liệu Sáng - Trưa - Tối (Co giãn linh hoạt trên mobile) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white/95 p-2 rounded-xl border border-amber-200 shadow-2xs">
              <div className="flex items-center justify-between gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleToggleAutoSyncReported}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                    isAutoSyncReported
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-1 ring-emerald-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}
                  title="Tự động tính định mức theo số ngày báo ăn thực tế"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span className="whitespace-nowrap">{isAutoSyncReported ? '✓ Tự động' : '⚡ Bật tự động'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetStandardConfig}
                  className="sm:hidden px-2 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-amber-50 text-slate-700 border border-slate-300 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs shrink-0"
                  title="Reset theo lịch học"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2.5 justify-center w-full sm:w-auto">
                {/* Sáng */}
                <div className="flex items-center justify-center gap-1 bg-amber-50/50 sm:bg-transparent p-1 sm:p-0 rounded-lg border sm:border-0 border-amber-200">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">Sáng:</span>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={standardBreakfastDays}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      updateOverrideBreakfast(val);
                    }}
                    className={`w-10 sm:w-12.5 border rounded-lg px-1 py-1 text-xs sm:text-sm font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                      isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
                    }`}
                    placeholder={String(defaultStandardBreakfast)}
                    title="Định mức số ngày ăn sáng chuẩn trong tháng"
                  />
                </div>

                {/* Trưa */}
                <div className="flex items-center justify-center gap-1 bg-amber-50/50 sm:bg-transparent p-1 sm:p-0 rounded-lg border sm:border-0 border-amber-200">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">Trưa:</span>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={standardLunchDays}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      updateOverrideLunch(val);
                    }}
                    className={`w-10 sm:w-12.5 border rounded-lg px-1 py-1 text-xs sm:text-sm font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                      isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
                    }`}
                    placeholder={String(defaultStandardLunch)}
                    title="Định mức số ngày ăn trưa chuẩn trong tháng"
                  />
                </div>

                {/* Tối */}
                <div className="flex items-center justify-center gap-1 bg-amber-50/50 sm:bg-transparent p-1 sm:p-0 rounded-lg border sm:border-0 border-amber-200">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">Tối:</span>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={standardDinnerDays}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      updateOverrideDinner(val);
                    }}
                    className={`w-10 sm:w-12.5 border rounded-lg px-1 py-1 text-xs sm:text-sm font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                      isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
                    }`}
                    placeholder={String(defaultStandardDinner)}
                    title="Định mức số ngày ăn tối chuẩn trong tháng"
                  />
                </div>
              </div>

              {/* Nút Reset lịch (Desktop) */}
              <button
                type="button"
                onClick={handleResetStandardConfig}
                className="hidden sm:flex px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-amber-50 text-slate-700 border border-slate-300 hover:border-amber-400 items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
                title={`Khôi phục lại định mức ngày ăn chuẩn theo lịch tháng (S: ${defaultStandardBreakfast}, Trưa: ${defaultStandardLunch}, Tối: ${defaultStandardDinner})`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">Reset lịch</span>
              </button>
            </div>
          </div>

          {/* Card Phải: Cấu Hình Chữ Ký & Địa Danh Ký */}
          <div className="bg-gradient-to-br from-blue-50/90 via-blue-50/40 to-indigo-50/30 rounded-2xl p-3 sm:p-4 border border-blue-200/90 shadow-2xs flex flex-col justify-between gap-2.5 sm:gap-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-1">
                <div className="text-[11px] sm:text-xs font-black text-blue-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <PenTool className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                  <span>Chữ ký & Địa danh ký</span>
                </div>
                {/* Nút Chữ ký số & Supabase */}
                <button
                  type="button"
                  onClick={() => setShowDigitalSigModal(true)}
                  className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs flex items-center gap-1 cursor-pointer transition-all shrink-0"
                  title="Cấu hình chữ ký số điện tử, con dấu đỏ và đồng bộ Supabase Cloud"
                >
                  <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-200" />
                  <span>Chữ ký số & Cloud</span>
                  {monthSig?.is_signed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-relaxed">
                Trang 1: Ẩn chữ ký. Trang 2 & Cả tháng: Ký GVCN. Ngày ký tự động cập nhật.
              </p>
            </div>

            {/* Dải nhập liệu Địa danh, Họ tên GVCN và Ngày ký (Co giãn linh hoạt trên mobile) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 bg-white/95 p-2 rounded-xl border border-blue-200 shadow-2xs">
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 flex-1">
                {/* Địa danh */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">Nơi ký:</span>
                  <input
                    type="text"
                    value={signingLocation}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSigningLocation(val);
                      localStorage.setItem('sso_boarding_signing_location', val);
                    }}
                    className="w-full sm:w-28 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    placeholder="Xa Dung"
                    title="Địa danh ký"
                  />
                </div>

                {/* Họ tên GVCN */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">GVCN:</span>
                  <input
                    type="text"
                    value={customTeacherName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomTeacherName(val);
                      localStorage.setItem(`sso_boarding_teacher_${selectedClassId}`, val);
                    }}
                    className="w-full sm:w-36 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    placeholder="Họ tên GVCN"
                    title="Họ và tên Giáo viên chủ nhiệm ký"
                  />
                </div>
              </div>

              {/* Ngày ký tự động */}
              <div className="flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-900 rounded-lg text-[11px] sm:text-xs font-semibold shrink-0 border border-blue-200 shadow-2xs" title="Ngày ký tự động cập nhật theo cấu hình trang">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="whitespace-nowrap font-bold text-blue-800">
                  {viewMode === 'page1'
                    ? `15/${String(monthNum).padStart(2, '0')}/${yearNum}`
                    : `${daysInMonth}/${String(monthNum).padStart(2, '0')}/${yearNum} (cuối tháng)`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet View matching the official photo */}
      <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-6 overflow-visible ${isPreviewOpen ? 'print:hidden' : 'print:p-0 print:border-none print:shadow-none'}`}>
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
              {(settings?.boarding_sheet_title || 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ').toUpperCase()} - LỚP: {currentClass?.class_name || ''} THÁNG {monthNum}/{yearNum}
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
            {viewMode === 'all' && (
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                (TOÀN BỘ CÁC NGÀY TRONG THÁNG: TỪ NGÀY 01 ĐẾN NGÀY {daysInMonth})
              </div>
            )}
            <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center justify-center md:justify-end gap-1.5 mt-0.5">
              <span>
                Sĩ số ăn bán trú: <strong className="text-emerald-700 font-black">{effectiveBoardingStudents.length} học sinh</strong>
              </span>
              {classDayStudentsCount > 0 && (
                <span className="text-slate-500 font-normal">
                  (Tổng sĩ số lớp: {totalClassStudents.length} HS • <strong className="text-amber-700 font-bold">{classDayStudentsCount}</strong> HS ngoại trú)
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowClassRosterModal(true)}
                className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold cursor-pointer inline-flex items-center gap-1 transition-all ml-1 shadow-2xs"
                title="Xem toàn bộ danh sách lớp và quản lý phân loại Bán trú / Ngoại trú"
              >
                <Users className="w-3 h-3 text-blue-600" />
                <span>Quản lý Bán trú / Ngoại trú ({totalClassStudents.length})</span>
              </button>
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

        {/* View Mode Toggle (Trang 1 / Trang 2 / Cả tháng) & Mobile Scroll Navigation */}
        {effectiveBoardingStudents.length > 0 && !isLoading && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5 no-print">
            {/* View Switcher: Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar touch-manipulation">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                  viewMode === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Cả tháng (1 - {daysInMonth})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('page1')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                  viewMode === 'page1'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Trang 1 (Ngày 01 - 15)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('page2')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                  viewMode === 'page2'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Trang 2 (Ngày 16 - {daysInMonth})
              </button>
            </div>

            {/* Mobile Scroll Helpers & Tips */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 text-[11px] text-slate-500">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleScrollToDate()}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-all cursor-pointer active:scale-95 text-[10px] sm:text-xs"
                  title="Cuộn về đầu tháng"
                >
                  ⏮ Đầu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayDateStr();
                    handleScrollToDate(today);
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition-all cursor-pointer active:scale-95 text-[10px] sm:text-xs"
                  title="Cuộn tới hôm nay"
                >
                  📅 Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tableScrollRef.current) {
                      tableScrollRef.current.scrollTo({ left: 9999, behavior: 'smooth' });
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-all cursor-pointer active:scale-95 text-[10px] sm:text-xs"
                  title="Cuộn về cuối tháng"
                >
                  ⏭ Cuối
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tableScrollRef.current) {
                      tableScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition-all cursor-pointer active:scale-95 text-[10px] sm:text-xs"
                  title="Cuộn lên đầu danh sách học sinh"
                >
                  🔼 Đầu DS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tableScrollRef.current) {
                      tableScrollRef.current.scrollTo({ top: 99999, behavior: 'smooth' });
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition-all cursor-pointer active:scale-95 text-[10px] sm:text-xs"
                  title="Cuộn xuống cuối danh sách học sinh"
                >
                  🔽 Cuối DS
                </button>
              </div>

              <div className="text-[10px] text-slate-500 italic hidden md:inline">
                💡 Bấm <strong>Trang 1</strong> hoặc <strong>Trang 2</strong> để xem và in chuẩn A4 ngang.
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải dữ liệu sổ chấm cơm tháng...</span>
          </div>
        ) : effectiveBoardingStudents.length === 0 ? (
          <div className="py-12 px-4 text-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Lớp {currentClass?.class_name || ''} chưa có danh sách học sinh bán trú
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              GVCN vui lòng chuyển sang tab "Chấm ăn" hoặc "Danh sách HS bán trú" để tải lên file danh sách học sinh từ Excel hoặc bấm nút Xuất Excel bên dưới để tải biểu mẫu trống.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Xuất file Excel mẫu biểu</span>
              </button>
            </div>
          </div>
        ) : (
          /* Table Sheet Grid */
          <div>
            <div
              ref={tableScrollRef}
              className={`relative ${
                isFullscreen
                  ? 'max-h-[calc(100vh-120px)]'
                  : 'max-h-[68vh] sm:max-h-[75vh] min-h-[240px] sm:min-h-[380px]'
              } overflow-auto border border-slate-400 rounded-xl shadow-xs bg-white overscroll-contain touch-auto`}
              onMouseLeave={clearCrosshair}
            >
              <table className="w-full text-center border-collapse text-[11px] border-separate border-spacing-0">
                <thead>
                  {/* Row 1: STT (spans 3 rows), [Thứ - Ngày], Day numbers 1..N */}
                  <tr className="bg-slate-100 font-bold text-slate-900 sticky top-0 z-30 h-[28px]">
                    <th
                      rowSpan={3}
                      className="py-1 px-0.5 sm:px-1 w-8 sm:w-9 min-w-[32px] sm:min-w-[36px] max-w-[32px] sm:max-w-[36px] border-r border-b border-slate-400 sticky top-0 left-0 z-50 bg-slate-100 text-center font-bold text-slate-900"
                    >
                      STT
                    </th>
                    <th
                      className="py-1 px-1 sm:px-2 w-[115px] sm:w-[150px] min-w-[115px] sm:min-w-[150px] max-w-[115px] sm:max-w-[150px] border-r border-b border-slate-400 sticky top-0 left-[32px] sm:left-9 z-50 bg-slate-100 font-bold text-slate-900"
                    >
                      <div className="flex items-center justify-between px-1 text-[10px] sm:text-[11px] font-bold text-slate-900">
                        <span>Thứ</span>
                        <span>Ngày</span>
                      </div>
                    </th>
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      const isMenuOpen = dayMenuAnchor?.dateStr === d.dateStr;
                      return (
                        <th
                          key={d.dayNum}
                          colSpan={3}
                          data-date-str={d.dateStr}
                          onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, hoverRef.current.meal)}
                          className={`relative py-0.5 px-0.5 border-r border-b border-slate-400 text-center cursor-pointer sticky top-0 transition-colors group z-30 ${
                            isMenuOpen
                              ? 'bg-amber-300 text-slate-950 font-black ring-2 ring-inset ring-amber-500'
                              : isDateHovered
                              ? 'bg-amber-100 text-slate-950 font-black'
                              : 'bg-slate-100 text-slate-900 font-bold'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] sm:text-[11px] font-bold">{d.dayNum}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (dayMenuAnchor?.dateStr === d.dateStr) {
                                  setDayMenuAnchor(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const menuWidth = Math.min(280, window.innerWidth - 24);
                                  let targetX = rect.left + rect.width / 2;
                                  if (targetX - menuWidth / 2 < 12) {
                                    targetX = 12 + menuWidth / 2;
                                  } else if (targetX + menuWidth / 2 > window.innerWidth - 12) {
                                    targetX = window.innerWidth - 12 - menuWidth / 2;
                                  }

                                  const menuHeight = 295;
                                  let targetY = rect.bottom + 6;
                                  if (targetY + menuHeight > window.innerHeight - 10) {
                                    targetY = Math.max(10, rect.top - menuHeight - 6);
                                  }

                                  setDayMenuAnchor({
                                    x: targetX,
                                    y: targetY,
                                    dateStr: d.dateStr,
                                    dayNum: d.dayNum,
                                    dayOfWeekShort: d.dayOfWeekShort,
                                  });
                                }
                              }}
                              className={`px-1 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                                isMenuOpen
                                  ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-700 shadow-xs'
                                  : 'text-slate-400 group-hover:text-blue-700 hover:bg-amber-200'
                              }`}
                              title={`Bấm để chọn: Chấm cả ngày, Chấm từng buổi (S/T/T) hoặc Xóa chấm ngày ${d.dayNum}/${monthNum}`}
                            >
                              ⚡
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <th colSpan={6} className="py-1 px-1 sm:px-2 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-0 z-30 text-[10px] sm:text-xs">
                        Số ngày ăn trong tháng
                      </th>
                    )}
                  </tr>

                  {/* Row 2: Họ và tên (spans 2 rows), Day of week: 5, 6, 7, CN, 2, 3... */}
                  <tr className="bg-slate-100 font-bold text-slate-800 sticky top-[28px] z-30 h-[24px]">
                    <th
                      rowSpan={2}
                      className="py-1 px-1 sm:px-2 w-[115px] sm:w-[150px] min-w-[115px] sm:min-w-[150px] max-w-[115px] sm:max-w-[150px] text-center border-r border-b border-slate-400 sticky top-[28px] left-[32px] sm:left-9 z-50 bg-slate-100 font-bold text-slate-900 text-[10px] sm:text-xs"
                    >
                      Họ và tên
                    </th>
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <th
                          key={d.dayNum}
                          colSpan={3}
                          onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, hoverRef.current.meal)}
                          className={`py-0.5 px-0.5 border-r border-b border-slate-400 text-center cursor-pointer sticky top-[28px] z-30 transition-colors ${
                            isDateHovered
                              ? 'bg-amber-100 text-slate-950 font-black'
                              : 'bg-slate-100 text-slate-800 font-bold'
                          }`}
                        >
                          <span className="text-[10px] sm:text-[11px] font-bold">
                            {d.dayOfWeekShort}
                          </span>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-[28px] z-30 text-[10px]">
                          Báo ăn
                        </th>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-[28px] z-30 text-[10px]">
                          Không báo
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 3: S, T, T headers */}
                  <tr className="bg-slate-100 font-bold text-slate-800 sticky top-[52px] z-30 border-b border-slate-400 h-[22px]">
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <React.Fragment key={d.dayNum}>
                          <th
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBatchToggleSession(d.dateStr, 'breakfast');
                            }}
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'breakfast')}
                            className={`py-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold group/meal transition-colors text-[10px] sm:text-xs ${
                              isDateHovered && hoveredMealType === 'breakfast'
                                ? 'bg-amber-200 text-black font-black ring-1 ring-inset ring-amber-500'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-800'
                            }`}
                            title={`Bấm để chấm/hủy toàn bộ bữa Sáng ngày ${d.dayNum}/${monthNum}`}
                          >
                            <span className="group-hover/meal:underline">S</span>
                          </th>
                          <th
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBatchToggleSession(d.dateStr, 'lunch');
                            }}
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'lunch')}
                            className={`py-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold group/meal transition-colors text-[10px] sm:text-xs ${
                              isDateHovered && hoveredMealType === 'lunch'
                                ? 'bg-amber-200 text-black font-black ring-1 ring-inset ring-amber-500'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 hover:bg-orange-100 hover:text-orange-900 text-slate-800'
                            }`}
                            title={`Bấm để chấm/hủy toàn bộ bữa Trưa ngày ${d.dayNum}/${monthNum}`}
                          >
                            <span className="group-hover/meal:underline">T</span>
                          </th>
                          <th
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBatchToggleSession(d.dateStr, 'dinner');
                            }}
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'dinner')}
                            className={`py-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold group/meal transition-colors text-[10px] sm:text-xs ${
                              isDateHovered && hoveredMealType === 'dinner'
                                ? 'bg-amber-200 text-black font-black ring-1 ring-inset ring-amber-500'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 hover:bg-indigo-100 hover:text-indigo-900 text-slate-800'
                            }`}
                            title={`Bấm để chấm/hủy toàn bộ bữa Tối ngày ${d.dayNum}/${monthNum}`}
                          >
                            <span className="group-hover/meal:underline">T</span>
                          </th>
                        </React.Fragment>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        {/* Summary S,T,T for eaten */}
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">S</th>
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">T</th>
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">T</th>
                        {/* Summary S,T,T for missed */}
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">S</th>
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">T</th>
                        <th className="py-0.5 w-5 sm:w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30 text-[10px]">T</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-300" onMouseOver={handleTbodyMouseOver}>
                  {effectiveBoardingStudents.map((st, idx) => {
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
                            ? 'bg-amber-50/80'
                            : 'bg-white'
                        }`}
                      >
                        <td
                          className={`py-1 px-0.5 sm:px-1 w-8 sm:w-9 min-w-[32px] sm:min-w-[36px] max-w-[32px] sm:max-w-[36px] font-medium border-r border-b border-slate-300 text-center sticky left-0 z-20 ${
                            isStudentHovered
                              ? 'bg-amber-100 text-slate-950 font-bold'
                              : 'bg-white text-slate-800'
                          }`}
                        >
                          {idx + 1}
                        </td>
                        <td
                          className={`py-1 px-1.5 sm:px-2 w-[115px] sm:w-[150px] min-w-[115px] sm:min-w-[150px] max-w-[115px] sm:max-w-[150px] text-left font-medium border-r border-b border-slate-300 sticky left-[32px] sm:left-9 z-20 ${
                            isStudentHovered
                              ? 'bg-amber-50 text-slate-950 font-bold'
                              : 'bg-white text-slate-900'
                          }`}
                        >
                          <span className="truncate block font-semibold text-[11px] sm:text-xs" title={st.full_name}>
                            {st.full_name}
                          </span>
                        </td>

                        {/* Daily cells: S, T, T */}
                        {displayedMonthDays.map((d) => {
                          const dMeal = stDays[d.dateStr] || { breakfast: false, lunch: false, dinner: false };
                          const isDateHovered = hoveredDateStr === d.dateStr;

                          const isColBeam = isDateHovered;
                          const isRowBeam = isStudentHovered;

                          return (
                            <React.Fragment key={d.dayNum}>
                              {/* Sáng */}
                              <td
                                data-cell="meal"
                                data-student-id={st.id}
                                data-date-str={d.dateStr}
                                data-meal="breakfast"
                                onClick={() => handleToggleCell(st.id, d.dateStr, 'breakfast')}
                                className={`py-1.5 px-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 select-none text-center font-black text-xs sm:text-sm cursor-pointer transition-colors active:bg-amber-300 ${
                                  isColBeam && isRowBeam
                                    ? 'bg-amber-200 text-slate-950 font-black'
                                    : isColBeam
                                    ? 'bg-[#fff9d6]'
                                    : isRowBeam
                                    ? 'bg-amber-50/70'
                                    : 'bg-white hover:bg-slate-50'
                                }`}
                                title={`${st.full_name} | Thứ ${d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Sáng (S)`}
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
                                className={`py-1.5 px-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 select-none text-center font-black text-xs sm:text-sm cursor-pointer transition-colors active:bg-amber-300 ${
                                  isColBeam && isRowBeam
                                    ? 'bg-amber-200 text-slate-950 font-black'
                                    : isColBeam
                                    ? 'bg-[#fff9d6]'
                                    : isRowBeam
                                    ? 'bg-amber-50/70'
                                    : 'bg-white hover:bg-slate-50'
                                }`}
                                title={`${st.full_name} | Thứ ${d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Trưa (T)`}
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
                                className={`py-1.5 px-0.5 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 select-none text-center font-black text-xs sm:text-sm cursor-pointer transition-colors active:bg-amber-300 ${
                                  isColBeam && isRowBeam
                                    ? 'bg-amber-200 text-slate-950 font-black'
                                    : isColBeam
                                    ? 'bg-[#fff9d6]'
                                    : isRowBeam
                                    ? 'bg-amber-50/70'
                                    : 'bg-white hover:bg-slate-50'
                                }`}
                                title={`${st.full_name} | Thứ ${d.dayOfWeekShort}, Ngày ${d.dayNum}/${monthNum} - Bữa Tối (T)`}
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
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenBreakfast}
                            </td>
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenLunch}
                            </td>
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenDinner}
                            </td>

                            {/* Summary Missed: S, T, T */}
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedBreakfast}
                            </td>
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedLunch}
                            </td>
                            <td className={`py-1 px-0.5 font-bold border-r border-b border-slate-300 text-slate-900 text-[10px] sm:text-xs ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedDinner}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* Row: + Thêm học sinh mới... as in Image 1 */}
                  <tr className="bg-white hover:bg-slate-50/80">
                    <td className="py-1.5 px-0.5 sm:px-1 w-8 sm:w-9 min-w-[32px] sm:min-w-[36px] max-w-[32px] sm:max-w-[36px] font-black text-emerald-700 border-r border-b border-slate-300 text-center sticky left-0 z-20 bg-white">
                      +
                    </td>
                    <td className="py-1.5 px-1.5 sm:px-2 w-[115px] sm:w-[150px] min-w-[115px] sm:min-w-[150px] max-w-[115px] sm:max-w-[150px] text-left border-r border-b border-slate-300 sticky left-[32px] sm:left-9 z-20 bg-white">
                      {isAddingStudent ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={newStudentInputRef}
                            type="text"
                            value={newStudentName}
                            onChange={(e) => setNewStudentName(e.target.value)}
                            onKeyDown={handleKeyDownNewStudent}
                            placeholder="Nhập họ và tên..."
                            className="px-2 py-0.5 border border-emerald-500 rounded text-xs font-semibold focus:outline-hidden w-full bg-white text-slate-900"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleSaveNewStudent}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingStudent(false);
                              setNewStudentName('');
                            }}
                            className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsAddingStudent(true)}
                          className="text-emerald-700 hover:text-emerald-800 hover:underline font-semibold text-xs flex items-center gap-1 cursor-pointer w-full text-left"
                        >
                          Thêm học sinh mới...
                        </button>
                      )}
                    </td>
                    {displayedMonthDays.map((d) => (
                      <React.Fragment key={d.dayNum}>
                        <td className="py-1 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 w-[21px] sm:w-[22px] min-w-[20px] sm:min-w-[22px] border-r border-b border-slate-300 bg-white" />
                      </React.Fragment>
                    ))}
                    {showSummaryColumns && (
                      <>
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 border-r border-b border-slate-300 bg-white" />
                      </>
                    )}
                  </tr>
                </tbody>

                {/* Table Footer: CỘNG */}
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                    <td colSpan={2} className="py-1.5 px-1 sm:px-2 text-center border-r border-b border-slate-400 sticky left-0 bg-slate-100 z-10 font-bold text-[10px] sm:text-xs">
                      CỘNG
                    </td>
                    {displayedMonthDays.map((d) => {
                      const totals = columnTotals.dailyTotals[d.dateStr] || { breakfast: 0, lunch: 0, dinner: 0 };
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <React.Fragment key={d.dayNum}>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold text-[10px] sm:text-xs ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.breakfast > 0 ? totals.breakfast : ''}
                          </td>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold text-[10px] sm:text-xs ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.lunch > 0 ? totals.lunch : ''}
                          </td>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold text-[10px] sm:text-xs ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.dinner > 0 ? totals.dinner : ''}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <td className="py-1 px-0.5 border-r border-b border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalEatenB}
                        </td>
                        <td className="py-1 px-0.5 border-r border-b border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalEatenL}
                        </td>
                        <td className="py-1 px-0.5 border-r border-b border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalEatenD}
                        </td>
                        <td className="py-1 px-0.5 border-r border-b border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalMissedB}
                        </td>
                        <td className="py-1 px-0.5 border-r border-b border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalMissedL}
                        </td>
                        <td className="py-1 px-0.5 border-r border-slate-400 text-slate-900 font-bold text-[10px]">
                          {columnTotals.totalMissedD}
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
        {effectiveBoardingStudents.length > 0 && !isLoading && (
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
                    {sigConfig.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM'}
                  </div>

                  {/* Digital Signature Image / Badge / Stamp */}
                  {sigConfig.enable_digital_signature && (monthSig?.is_signed || sigConfig.signature_image_url || sigConfig.stamp_image_url) ? (
                    <div className="my-1.5 py-1 flex flex-col items-center justify-center relative min-h-[52px]">
                      {sigConfig.signature_image_url && (
                        <img src={sigConfig.signature_image_url} alt="Chữ ký" className="h-10 object-contain" />
                      )}
                      {sigConfig.stamp_image_url && (
                        <img src={sigConfig.stamp_image_url} alt="Con dấu" className="h-12 object-contain absolute opacity-85 pointer-events-none" />
                      )}
                      {monthSig?.is_signed ? (
                        <div className="border border-emerald-600 bg-emerald-50/90 rounded-lg px-2 py-0.5 text-[9px] font-bold text-emerald-800 flex items-center gap-1 shadow-2xs mt-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>ĐÃ KÝ ĐIỆN TỬ</span>
                          {monthSig.certificate_hash && (
                            <span className="font-mono text-[8px] text-emerald-700">({monthSig.certificate_hash})</span>
                          )}
                        </div>
                      ) : !sigConfig.signature_image_url ? (
                        <div className="text-[10px] text-slate-500 italic py-2">(Chữ ký điện tử)</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic mb-16">
                      (Ký và ghi rõ họ tên)
                    </div>
                  )}

                  <div className="text-xs font-bold text-slate-900">
                    {effectiveTeacherName}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CẨM NANG & HƯỚNG DẪN CHI TIẾT SỔ CHẤM CƠM BÁN TRÚ (TINH TẾ - CHUẨN NGHIỆP VỤ) */}
      <div className="mt-8 no-print select-none">
        <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/40 rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all">
          {/* Header Bar */}
          <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-xs shadow-inner border border-white/15">
                <BookOpen className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                    Cẩm Nang & Hướng Dẫn Nghiệp Vụ Sổ Chấm Cơm Bán Trú
                  </h3>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/30 text-blue-200 border border-blue-400/30">
                    Chuẩn Bộ GD&ĐT
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  Quy định quản lý hồ sơ bán trú, chấm cơm hằng ngày và thanh quyết toán chế độ học sinh
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-white/15"
            >
              <span>{isGuideOpen ? 'Thu gọn' : 'Xem chi tiết'}</span>
              {isGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Guide Content Body */}
          {isGuideOpen && (
            <div className="p-6 space-y-6 animate-fadeIn">
              {/* 4 Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Cột 1: 5 Thao Tác Chấm Ăn Siêu Tốc */}
                <div className="bg-white rounded-2xl p-4.5 border border-blue-200/80 shadow-2xs flex flex-col justify-between hover:shadow-md transition-all group">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-blue-100">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-black">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          1. Chấm Ăn Siêu Tốc
                        </h4>
                        <span className="text-[10px] text-blue-600 font-bold">5 thao tác linh hoạt</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 leading-relaxed font-normal">
                      <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-100/80">
                        <strong className="text-blue-950 font-bold flex items-center gap-1">
                          ⚡ Chấm Cả Ngày (S+T+T):
                        </strong>
                        Bấm biểu tượng <strong>⚡</strong> trên tiêu đề số ngày của bảng, chọn <em>"Chấm Cả Ngày"</em> để tự động tích (+) đủ 3 bữa theo lịch học.
                      </div>
                      <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-100/80">
                        <strong className="text-amber-950 font-bold flex items-center gap-1">
                          🌅 Chấm riêng từng buổi:
                        </strong>
                        Có thể chọn chấm riêng bữa <strong>Sáng (S)</strong>, <strong>Trưa (T)</strong> hoặc <strong>Tối (T)</strong> cho cả lớp.
                      </div>
                      <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-100/80">
                        <strong className="text-rose-950 font-bold flex items-center gap-1">
                          🗑️ Xóa chấm ngày (Để trống):
                        </strong>
                        Chọn <em>"Xóa chấm ngày này"</em> để đưa toàn bộ bữa ăn của ngày về ô trống ban đầu.
                      </div>
                      <div className="p-2 rounded-xl bg-indigo-50/60 border border-indigo-100/80">
                        <strong className="text-indigo-950 font-bold flex items-center gap-1">
                          📅 Chấm hàng loạt nhiều ngày:
                        </strong>
                        Bấm nút <strong>"Chấm theo ngày/buổi"</strong> trên thanh công cụ để chọn nhiều ngày cùng lúc.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cột 2: Quy Tắc Kế Toán & Định Mức Ăn */}
                <div className="bg-white rounded-2xl p-4.5 border border-amber-200/80 shadow-2xs flex flex-col justify-between hover:shadow-md transition-all group">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-amber-100">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-black">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          2. Định Mức & Kế Toán
                        </h4>
                        <span className="text-[10px] text-amber-700 font-bold">Cân đối tài chính chuẩn</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 leading-relaxed font-normal">
                      <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200/70 text-amber-950 font-medium">
                        <strong className="font-extrabold text-amber-900 block mb-0.5">📐 Công thức bắt buộc:</strong>
                        <code className="text-[11px] font-black text-indigo-700 block bg-white px-2 py-1 rounded border border-amber-200 text-center">
                          Số ngày ăn + Số ngày không ăn = Định mức
                        </code>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100/80">
                        <strong className="text-emerald-950 font-bold block mb-0.5">🔄 Chế độ tự động nhảy (Khuyên dùng):</strong>
                        Định mức ăn tự động khớp theo số ngày thực tế GVCN đã báo ăn (tự động loại trừ các ngày nghỉ, lễ tết, mưa bão).
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <strong className="text-slate-900 font-bold block mb-0.5">✏️ Cấu hình đè thủ công:</strong>
                        GVCN gõ số ngày Sáng, Trưa, Tối vào ô định mức. Hệ thống lưu vĩnh viễn trên Supabase Cloud và không bao giờ bị nhảy về mặc định.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cột 3: Xuất Excel & In Ấn 2 Trang A4 */}
                <div className="bg-white rounded-2xl p-4.5 border border-emerald-200/80 shadow-2xs flex flex-col justify-between hover:shadow-md transition-all group">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-emerald-100">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-black">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          3. Xuất Excel & In Ấn
                        </h4>
                        <span className="text-[10px] text-emerald-700 font-bold">Khổ A4 ngang không co chữ</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 leading-relaxed font-normal">
                      <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100/80">
                        <strong className="text-emerald-950 font-bold block mb-0.5">📄 Trang 1 (Ngày 01 - 15):</strong>
                        Bao gồm nửa đầu tháng, tự động ẩn chữ ký để dành tối đa diện tích cho các cột ngày, in rõ nét không bị tràn.
                      </div>
                      <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-100/80">
                        <strong className="text-blue-950 font-bold block mb-0.5">📄 Trang 2 (Ngày 16 - Cuối tháng):</strong>
                        Bao gồm nửa cuối tháng + 6 cột tổng hợp bữa ăn (S, T, T) + Cột ngày thực + Chữ ký GVCN kèm địa danh tự động.
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <strong className="text-slate-900 font-bold block mb-0.5">🖨️ Xem trước & In PDF:</strong>
                        Bấm <em>"Xem trước & In PDF"</em> để kiểm tra trước bản in, chọn máy in A4 ngang chuẩn tỉ lệ 100%.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cột 4: Lưu Trữ & An Toàn Dữ Liệu */}
                <div className="bg-white rounded-2xl p-4.5 border border-purple-200/80 shadow-2xs flex flex-col justify-between hover:shadow-md transition-all group">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-purple-100">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 font-black">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          4. Lưu Trữ & Đám Mây
                        </h4>
                        <span className="text-[10px] text-purple-700 font-bold">Bảo vệ dữ liệu tức thì</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 leading-relaxed font-normal">
                      <div className="p-2 rounded-xl bg-purple-50/60 border border-purple-100/80">
                        <strong className="text-purple-950 font-bold block mb-0.5">💾 Tự động lưu tức thì (Auto-save):</strong>
                        Mỗi khi tích ô (+) hoặc thay đổi cấu hình, biểu tượng "Đang lưu... / Đã lưu" sẽ hiện lên góc trên bên phải.
                      </div>
                      <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-100/80">
                        <strong className="text-blue-950 font-bold block mb-0.5">☁️ Lưu Sổ Chấm Cơm (Supabase Cloud):</strong>
                        Sau khi hoàn thành chấm cả tháng, bấm <strong>"Lưu Sổ Chấm Cơm"</strong> để đồng bộ toàn bộ bảng lên đám mây trường.
                      </div>
                      <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-100/80">
                        <strong className="text-amber-950 font-bold block mb-0.5">🔏 Ký số điện tử:</strong>
                        Hỗ trợ gắn con dấu đỏ và chữ ký số kèm mã băm chứng thực điện tử bảo vệ tính pháp lý của hồ sơ.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bảng Tra Cứu Ký Hiệu & Lưu Ý Nghiệp Vụ */}
              <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
                  <span className="font-black text-slate-900 flex items-center gap-1.5 uppercase">
                    <Info className="w-4 h-4 text-blue-600" />
                    Ký hiệu quy ước:
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-xs border border-emerald-300">
                      +
                    </span>
                    <span>Có ăn bữa đó</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-white text-slate-400 font-normal flex items-center justify-center text-xs border border-slate-300">
                      &nbsp;
                    </span>
                    <span>Ô trống: Nghỉ ăn / Ngày chưa báo</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-900">S:</strong> Sáng
                  </span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-900">T:</strong> Trưa
                  </span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-900">T:</strong> Tối
                  </span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-900">Ngày thực:</strong> Tổng số ngày học sinh có ăn cơm tại trường
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 italic shrink-0">
                  * Hệ thống tuân thủ Nghị định 116/2016/NĐ-CP và hướng dẫn tài chính bán trú Sở GD&ĐT Điện Biên.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Day Quick Actions Popover (outside table to prevent clipping) */}
      {dayMenuAnchor && (
        <div
          className="fixed inset-0 z-[100] select-none bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center p-3"
          onClick={() => setDayMenuAnchor(null)}
        >
          <div
            style={{
              position: 'fixed',
              left: `${Math.max(145, Math.min(dayMenuAnchor.x, typeof window !== 'undefined' ? window.innerWidth - 145 : dayMenuAnchor.x))}px`,
              top: `${dayMenuAnchor.y}px`,
              transform: 'translateX(-50%)',
              width: `${Math.min(285, typeof window !== 'undefined' ? window.innerWidth - 24 : 285)}px`,
              maxWidth: 'calc(100vw - 24px)',
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-300 rounded-2xl shadow-2xl p-3 text-left text-xs font-normal ring-4 ring-blue-500/20 animate-fadeIn"
          >
            <div className="px-3 py-2 text-xs font-black uppercase text-slate-800 bg-slate-100 rounded-xl border border-slate-200 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-900">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Ngày {dayMenuAnchor.dayNum}/{monthNum}</span>
              </span>
              <span className="text-blue-700 font-extrabold text-[11px] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                Thứ {dayMenuAnchor.dayOfWeekShort}
              </span>
            </div>

            <div className="space-y-2">
              {/* Nút Chấm cả ngày nổi bật nhất */}
              <button
                type="button"
                onClick={() => {
                  const dateStr = dayMenuAnchor.dateStr;
                  setDayMenuAnchor(null);
                  handleBatchMarkDay(dateStr, true);
                }}
                className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold flex items-start gap-2.5 cursor-pointer transition-all shadow-md group"
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black flex items-center justify-between">
                    <span>Chấm Cả Ngày</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 text-white font-extrabold">
                      S + T + T
                    </span>
                  </div>
                  <div className="text-[10px] text-blue-100 font-medium leading-snug mt-0.5">
                    Tự động tích (+) cả 3 bữa theo lịch học
                  </div>
                </div>
              </button>

              {/* 3 nút chấm từng buổi: Sáng, Trưa, Tối */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const dateStr = dayMenuAnchor.dateStr;
                    setDayMenuAnchor(null);
                    handleBatchToggleSession(dateStr, 'breakfast', true);
                  }}
                  className="text-center p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-[1.02]"
                  title="Chấm ăn buổi Sáng cho cả lớp"
                >
                  <Sunrise className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px] font-black">Sáng (S)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const dateStr = dayMenuAnchor.dateStr;
                    setDayMenuAnchor(null);
                    handleBatchToggleSession(dateStr, 'lunch', true);
                  }}
                  className="text-center p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-950 border border-orange-200 font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-[1.02]"
                  title="Chấm ăn buổi Trưa cho cả lớp"
                >
                  <Sun className="w-4 h-4 text-orange-600" />
                  <span className="text-[11px] font-black">Trưa (T)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const dateStr = dayMenuAnchor.dateStr;
                    setDayMenuAnchor(null);
                    handleBatchToggleSession(dateStr, 'dinner', true);
                  }}
                  className="text-center p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-[1.02]"
                  title="Chấm ăn buổi Tối cho cả lớp"
                >
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-black">Tối (T)</span>
                </button>
              </div>

              <div className="h-px bg-slate-200 my-1.5" />

              {/* Nút Xóa chấm ngày này */}
              <button
                type="button"
                onClick={() => {
                  const dateStr = dayMenuAnchor.dateStr;
                  setDayMenuAnchor(null);
                  handleBatchMarkDay(dateStr, false);
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-rose-50 text-rose-700 font-bold flex items-center gap-2 cursor-pointer transition-all border border-transparent hover:border-rose-200"
              >
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-rose-900">Xóa chấm ngày này</span>
                  <span className="text-[10px] text-slate-500 font-normal">Để trống các bữa ăn của ngày {dayMenuAnchor.dayNum}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Mark / Quick Meal Selection Modal */}
      <BoardingBatchMarkModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        monthDays={monthDays}
        students={effectiveBoardingStudents}
        classNameStr={currentClass?.class_name || ''}
        monthNum={monthNum}
        yearNum={yearNum}
        onApplyBatch={handleApplyBatchModal}
      />

      {/* Print Preview & PDF Modal */}
      <BoardingPrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        classNameStr={currentClass?.class_name || ''}
        campusName={currentCampus?.name || 'Suối Lư'}
        selectedMonth={selectedMonth}
        monthNum={monthNum}
        yearNum={yearNum}
        daysInMonth={daysInMonth}
        monthDays={monthDays}
        students={effectiveBoardingStudents}
        mealMatrix={mealMatrix}
        studentSummaries={studentSummaries}
        columnTotals={columnTotals}
        effectiveTeacherName={effectiveTeacherName}
        effectiveSigningDateText={effectiveSigningDateText}
        sigConfig={sigConfig}
        monthSig={monthSig}
        onExportExcel={handleExportExcel}
        sheetTitle={settings?.boarding_sheet_title || 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ'}
      />

      {/* Digital Signature & Supabase Config Modal */}
      <BoardingDigitalSignatureModal
        isOpen={showDigitalSigModal}
        onClose={() => setShowDigitalSigModal(false)}
        classId={selectedClassId}
        classNameStr={currentClass?.class_name || ''}
        selectedMonth={selectedMonth}
        monthNum={monthNum}
        yearNum={yearNum}
        currentTeacherName={effectiveTeacherName}
        currentLocation={signingLocation}
        sigConfig={sigConfig}
        monthSig={monthSig}
        onConfigSaved={(updated) => {
          setSigConfig(updated);
          if (updated.location_name) setSigningLocation(updated.location_name);
          if (updated.teacher_name) setCustomTeacherName(updated.teacher_name);
        }}
        onMonthSigSaved={(updatedSig) => {
          setMonthSig(updatedSig);
        }}
      />

      {/* Class Roster Management Modal (Boarding vs Day Students) */}
      {showClassRosterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    Danh Sách Học Sinh Lớp {currentClass?.class_name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Phân loại Bán trú (hiển thị trên sổ chấm cơm) & Ngoại trú (không chấm ăn)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClassRosterModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Statistics Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700">
                  Tổng số: <strong className="text-blue-700 font-extrabold">{totalClassStudents.length}</strong> học sinh
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-extrabold text-emerald-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Bán trú: {totalClassStudents.filter((s) => s.isBoarding !== false).length} em (chấm ăn)
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-extrabold text-amber-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Ngoại trú: {totalClassStudents.filter((s) => s.isBoarding === false).length} em
                </span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setRosterFilter('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rosterFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Tất cả ({totalClassStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setRosterFilter('BOARDING')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rosterFilter === 'BOARDING'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Bán trú ({totalClassStudents.filter((s) => s.isBoarding !== false).length})
              </button>
              <button
                type="button"
                onClick={() => setRosterFilter('DAY')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rosterFilter === 'DAY'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Ngoại trú ({totalClassStudents.filter((s) => s.isBoarding === false).length})
              </button>
            </div>

            {/* Student List Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72">
              {totalClassStudents
                .filter((st) => {
                  if (rosterFilter === 'BOARDING' && st.isBoarding === false) return false;
                  if (rosterFilter === 'DAY' && st.isBoarding !== false) return false;
                  return true;
                })
                .map((st, idx) => {
                  const isBoarding = st.isBoarding !== false;
                  return (
                    <div
                      key={st.id}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 w-6 text-center">{idx + 1}.</span>
                        <span className="font-extrabold text-slate-900">{st.full_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          {st.gender}
                        </span>
                        <span className="text-slate-500 text-[11px] hidden sm:inline">
                          {st.village || st.address || 'Chưa rõ thôn'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const nextVal = st.isBoarding === false ? true : false;
                              await updateStudent(st.id, { isBoarding: nextVal });
                              showToast(
                                `Đã chuyển ${st.full_name} sang diện: ${nextVal ? 'Bán trú' : 'Ngoại trú'}`
                              );
                            } catch (e) {
                              console.error(e);
                              showToast('Lỗi khi cập nhật diện ở của học sinh!', 'error');
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isBoarding
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                              : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
                          }`}
                          title="Bấm để chuyển đổi giữa Bán trú (chấm ăn) và Ngoại trú (không chấm ăn)"
                        >
                          {isBoarding ? (
                            <>
                              <Utensils className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Bán trú</span>
                            </>
                          ) : (
                            <>
                              <Home className="w-3.5 h-3.5 text-amber-600" />
                              <span>Ngoại trú</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-500 italic">
                * Học sinh Bán trú xuất hiện trên sổ chấm cơm. Học sinh Ngoại trú không chấm ăn.
              </span>
              <button
                type="button"
                onClick={() => setShowClassRosterModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
