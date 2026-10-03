import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { getSupabaseClient, isSupabaseConnected } from '../services/supabase';
import { Student, BoardingDailyReport, BoardingMealRecord, BoardingSignatureConfig, BoardingMonthSignature, SchoolOffDay } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords, generateDefaultBoardingStudentsForClass } from '../utils/boardingRules';
import { formatDateVN, getTodayDateStr } from '../utils/schoolWeeks';
import { exportMonthlyBoardingExcel } from '../utils/exportBoardingExcel';
import { DEFAULT_CLASS_TEACHER_MAP } from '../utils/exportAttendanceStandardExcel';
import { BoardingPrintPreviewModal } from './BoardingPrintPreviewModal';
import { BoardingDigitalSignatureModal } from './BoardingDigitalSignatureModal';
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
} from 'lucide-react';

interface MonthlyBoardingSheetProps {
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
}

export const MonthlyBoardingSheet: React.FC<MonthlyBoardingSheetProps> = ({
  selectedClassId,
  onClassChange,
}) => {
  const { classes, campuses, students, settings, addStudent } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

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
    const seenNames = new Set<string>();
    const classSts: Student[] = [];
    for (const s of rawSts) {
      if (!s || !s.full_name) continue;
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
      const schedule = getMealScheduleForDate(dateStr, offDaysMap);
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
  }, [yearNum, monthNum, daysInMonth, offDaysMap]);

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
  const [isAutoSyncReported, setIsAutoSyncReported] = useState<boolean>(false);

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

      // 1. Kiểm tra từ ma trận chấm ăn của học sinh
      classBoardingStudents.forEach((st) => {
        const meal = mealMatrix[st.id]?.[d.dateStr];
        if (meal?.breakfast) dayHasB = true;
        if (meal?.lunch) dayHasL = true;
        if (meal?.dinner) dayHasD = true;
      });

      // 2. Kiểm tra từ danh sách các ngày đã nộp báo ăn
      if (reportedDates.has(d.dateStr)) {
        if (d.allowedMeals.breakfast) dayHasB = true;
        if (d.allowedMeals.lunch) dayHasL = true;
        if (d.allowedMeals.dinner) dayHasD = true;
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
  }, [monthDays, classBoardingStudents, mealMatrix, reportedDates]);

  // Load custom standard days config from localStorage & Supabase Cloud
  useEffect(() => {
    if (!selectedClassId || !selectedMonth) return;
    let isMounted = true;

    // Bước 1: Đọc nhanh từ bộ nhớ cục bộ (nếu có) để giao diện không bị gián đoạn
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      if (savedRaw) {
        const configs = JSON.parse(savedRaw);
        const configKey = `${selectedClassId}_${selectedMonth}`;
        const savedConfig = configs[configKey];
        if (savedConfig) {
          if (savedConfig.auto_sync || savedConfig.mode === 'AUTO_REPORTED') {
            setIsAutoSyncReported(true);
            setOverrideBreakfast(null);
            setOverrideLunch(null);
            setOverrideDinner(null);
          } else {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(savedConfig.breakfast !== undefined ? savedConfig.breakfast : null);
            setOverrideLunch(savedConfig.lunch !== undefined ? savedConfig.lunch : null);
            setOverrideDinner(savedConfig.dinner !== undefined ? savedConfig.dinner : null);
          }
        } else {
          setIsAutoSyncReported(false);
          setOverrideBreakfast(null);
          setOverrideLunch(null);
          setOverrideDinner(null);
        }
      } else {
        setIsAutoSyncReported(false);
        setOverrideBreakfast(null);
        setOverrideLunch(null);
        setOverrideDinner(null);
      }
    } catch {
      setIsAutoSyncReported(false);
      setOverrideBreakfast(null);
      setOverrideLunch(null);
      setOverrideDinner(null);
    }

    // Bước 2: Đồng bộ từ Supabase Cloud để dữ liệu luôn chính xác khi mở trên trình duyệt khác hoặc sau khi tải lại trang
    StorageService.getBoardingStandardConfig(selectedClassId, selectedMonth)
      .then((cfg) => {
        if (!isMounted) return;
        if (cfg) {
          if (cfg.auto_sync || cfg.mode === 'AUTO_REPORTED') {
            setIsAutoSyncReported(true);
            setOverrideBreakfast(null);
            setOverrideLunch(null);
            setOverrideDinner(null);
          } else {
            setIsAutoSyncReported(false);
            setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
            setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
            setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
          }
        } else {
          setIsAutoSyncReported(false);
          setOverrideBreakfast(null);
          setOverrideLunch(null);
          setOverrideDinner(null);
        }
      })
      .catch((e) => {
        console.warn('Lỗi khi tải định mức báo ăn từ Supabase:', e);
      });

    return () => {
      isMounted = false;
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

    // 1. Cập nhật localStorage ngay lập tức
    try {
      const savedRaw = localStorage.getItem('sso_boarding_standard_configs_v1');
      const configs = savedRaw ? JSON.parse(savedRaw) : {};
      
      if (isReset) {
        delete configs[configKey];
      } else {
        configs[configKey] = {
          breakfast: breakfast !== null ? breakfast : undefined,
          lunch: lunch !== null ? lunch : undefined,
          dinner: dinner !== null ? dinner : undefined,
          auto_sync: autoSync,
          mode: autoSync ? 'AUTO_REPORTED' : (breakfast !== null || lunch !== null || dinner !== null ? 'CUSTOM' : 'CALENDAR'),
        };
      }
      
      localStorage.setItem('sso_boarding_standard_configs_v1', JSON.stringify(configs));
    } catch (e) {
      console.warn('Error saving custom standard config locally:', e);
    }

    // 2. Lưu trực tiếp lên Supabase Cloud
    try {
      await StorageService.saveBoardingStandardConfig(
        selectedClassId,
        selectedMonth,
        isReset
          ? null
          : {
              breakfast: breakfast !== null ? breakfast : undefined,
              lunch: lunch !== null ? lunch : undefined,
              dinner: dinner !== null ? dinner : undefined,
              auto_sync: autoSync,
              mode: autoSync ? 'AUTO_REPORTED' : (breakfast !== null || lunch !== null || dinner !== null ? 'CUSTOM' : 'CALENDAR'),
            }
      );
    } catch (e) {
      console.warn('Error saving custom standard config to Supabase Cloud:', e);
    }
  };

  const updateOverrideBreakfast = (val: number | null) => {
    setIsAutoSyncReported(false);
    setOverrideBreakfast(val);
    saveCustomStandardConfig(val, overrideLunch, overrideDinner, false);
  };

  const updateOverrideLunch = (val: number | null) => {
    setIsAutoSyncReported(false);
    setOverrideLunch(val);
    saveCustomStandardConfig(overrideBreakfast, val, overrideDinner, false);
  };

  const updateOverrideDinner = (val: number | null) => {
    setIsAutoSyncReported(false);
    setOverrideDinner(val);
    saveCustomStandardConfig(overrideBreakfast, overrideLunch, val, false);
  };

  const handleToggleAutoSyncReported = async () => {
    const nextVal = !isAutoSyncReported;
    setIsAutoSyncReported(nextVal);
    setOverrideBreakfast(null);
    setOverrideLunch(null);
    setOverrideDinner(null);
    await saveCustomStandardConfig(null, null, null, nextVal);
    if (nextVal) {
      showToast(
        `Đã bật chế độ TỰ ĐỘNG ĐỒNG BỘ ĐỊNH MỨC theo số ngày báo ăn thực tế của GVCN: Sáng ${autoReportedMealDays.autoBreakfast} ngày, Trưa ${autoReportedMealDays.autoLunch} ngày, Tối ${autoReportedMealDays.autoDinner} ngày!`
      );
    } else {
      showToast(
        `Đã chuyển về định mức MẶC ĐỊNH THEO LỊCH HỌC: Sáng ${defaultStandardBreakfast} ngày, Trưa ${defaultStandardLunch} ngày, Tối ${defaultStandardDinner} ngày!`
      );
    }
  };

  const handleResetStandardConfig = async () => {
    setIsAutoSyncReported(false);
    setOverrideBreakfast(null);
    setOverrideLunch(null);
    setOverrideDinner(null);
    await saveCustomStandardConfig(null, null, null, false);
    showToast(
      `Đã reset định mức ngày báo ăn Tháng ${monthNum}/${yearNum} về chuẩn lịch: Sáng ${defaultStandardBreakfast} ngày, Trưa ${defaultStandardLunch} ngày, Tối ${defaultStandardDinner} ngày!`
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
          // Chỉ đồng bộ những ngày GVCN ĐÃ THỰC SỰ NỘP BÁO CÁO SĨ SỐ (SUBMITTED hoặc LOCKED)
          // Tuyệt đối KHÔNG tự động chấm ăn các ngày chưa báo (ví dụ 06/10 chưa báo thì để trống)
          if (dr.status !== 'SUBMITTED' && dr.status !== 'LOCKED') return;
          const cleanDate = String(dr.report_date).split('T')[0].trim();

          if (!reportMap.has(cleanDate)) {
            const absentMap = new Map<string, { reason?: string }>();
            if (dr.absent_students) {
              dr.absent_students.forEach((ab) => {
                if (ab.id) {
                  absentMap.set(ab.id, { reason: ab.reason });
                } else if (ab.full_name) {
                  absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
                }
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

          // Lấy đúng số liệu GVCN đã chấm cho học sinh (tìm theo ID trước, chỉ fallback tên khi tên là duy nhất)
          let recs = rep.records;
          if (typeof recs === 'string') {
            try { recs = JSON.parse(recs); } catch { recs = []; }
          }
          const sameNameCount = classBoardingStudents.filter(
            (s) => s.full_name.trim().toLowerCase() === normName
          ).length;

          const stRec = Array.isArray(recs)
            ? recs.find((r) => r.student_id === st.id) ||
              (sameNameCount === 1
                ? recs.find((r) => !r.student_id && r.student_name && r.student_name.trim().toLowerCase() === normName)
                : undefined)
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
    let debounceTimer: any = null;
    const unsubscribe = subscribeRealtime((event) => {
      if (event.table === 'daily_reports') {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadMonthData(true);
        }, 400);
      }
      if (event.table === 'boarding_standard_configs' || event.table === 'boarding_month_signatures') {
        StorageService.getBoardingStandardConfig(selectedClassId, selectedMonth).then((cfg) => {
          if (cfg) {
            setOverrideBreakfast(cfg.breakfast !== undefined ? cfg.breakfast : null);
            setOverrideLunch(cfg.lunch !== undefined ? cfg.lunch : null);
            setOverrideDinner(cfg.dinner !== undefined ? cfg.dinner : null);
          } else {
            setOverrideBreakfast(null);
            setOverrideLunch(null);
            setOverrideDinner(null);
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
      if (debounceTimer) clearTimeout(debounceTimer);
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
        // Chỉ đồng bộ những ngày GVCN ĐÃ THỰC SỰ NỘP BÁO CÁO SĨ SỐ (SUBMITTED hoặc LOCKED)
        if (dr.status !== 'SUBMITTED' && dr.status !== 'LOCKED') return;
        const cleanDate = String(dr.report_date).split('T')[0].trim();
        const absentMap = new Map<string, { reason?: string }>();
        if (dr.absent_students) {
          dr.absent_students.forEach((ab) => {
            if (ab.id) {
              absentMap.set(ab.id, { reason: ab.reason });
            } else if (ab.full_name) {
              absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
            }
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
      // Lưu đồng bộ định mức ăn đã đặt hoặc đã đặt lại lên Supabase Cloud
      await StorageService.saveBoardingStandardConfig(
        selectedClassId,
        selectedMonth,
        (overrideBreakfast === null && overrideLunch === null && overrideDinner === null)
          ? null
          : {
              breakfast: overrideBreakfast !== null ? overrideBreakfast : undefined,
              lunch: overrideLunch !== null ? overrideLunch : undefined,
              dinner: overrideDinner !== null ? overrideDinner : undefined,
            }
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
        students: classBoardingStudents, // Đúng 100% danh sách học sinh bán trú đang hiển thị
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
      await StorageService.deleteStudentsByClass(selectedClassId, currentClass.class_name);
      const defaultStds = generateDefaultBoardingStudentsForClass(selectedClassId, currentClass.class_name);
      await StorageService.saveStudents(defaultStds);
      await StorageService.getStudents();
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

        {/* Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nhóm 1: Thao tác dữ liệu báo ăn */}
          <button
            type="button"
            onClick={handleSyncFromDailyReports}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Đồng bộ tất cả ngày GVCN đã báo ăn (từ phiếu báo ăn ngày hoặc báo cáo sĩ số ngày) vào biểu"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Đồng bộ báo ăn ngày</span>
          </button>

          <button
            type="button"
            onClick={handleResetToOnlyReported}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Làm sạch sổ: Để trống tất cả các ngày chưa báo ăn và ngày tương lai, chỉ giữ lại những ngày GVCN đã báo ăn thực tế"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Để trống ngày chưa báo</span>
          </button>

          <button
            type="button"
            onClick={handleClearAllMonth}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Xóa toàn bộ chấm ăn của tháng này để sổ trống 100%, sẵn sàng cho GVCN chấm từng ngày"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Xóa sạch chấm lại</span>
          </button>

          {/* Nút Reset ngày báo ăn định mức của tháng */}
          <button
            type="button"
            onClick={handleResetStandardConfig}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
              isAutoSyncReported
                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border border-emerald-300'
                : overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black ring-2 ring-amber-300 shadow-amber-500/20'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
            }`}
            title={`Reset ngày báo ăn định mức tháng ${monthNum}/${yearNum} về chuẩn theo lịch học: Sáng ${defaultStandardBreakfast}, Trưa ${defaultStandardLunch}, Tối ${defaultStandardDinner} ngày (Không làm ảnh hưởng đến dữ liệu chấm ăn và học sinh)`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
            <span>Reset định mức tháng</span>
            {isAutoSyncReported ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-950 font-black">
                Tự động
              </span>
            ) : (overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null) ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black">
                Có đè
              </span>
            ) : null}
          </button>

          {/* Dải phân cách */}
          <div className="h-5 w-px bg-slate-300 mx-0.5 hidden sm:block" />

          {/* Nhóm 2: Xuất bản & In ấn */}
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Xem trước bản in chuẩn khổ giấy A4 ngang và xuất file PDF"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            <span>Xem trước & In PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Xuất file Excel chuẩn Bộ GD&ĐT tự động chia 2 trang (Trang 1: Ngày 1-15, Trang 2: Ngày 16-hết) khi in không bị co chữ"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel (2 Trang)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              isFullscreen
                ? 'bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
            title={isFullscreen ? 'Thu nhỏ màn hình' : 'Phóng to toàn màn hình chấm ăn rõ nét'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
          </button>

          {/* Trạng thái tự động lưu */}
          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 animate-pulse shadow-2xs">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Đang lưu...</span>
            </div>
          )}
          {autoSaveStatus === 'saved' && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã lưu</span>
            </div>
          )}

          {/* Nhóm 3: Lưu trữ */}
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
      <div className="bg-gradient-to-r from-amber-50/80 via-amber-50/50 to-orange-50/40 rounded-2xl p-4 border border-amber-200/90 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print -mt-2">
        <div className="flex flex-col gap-1.5 max-w-2xl">
          <div className="text-xs font-black text-amber-950 flex flex-wrap items-center gap-2 uppercase tracking-wide">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Định mức ngày báo ăn chuẩn trong tháng {monthNum}/{yearNum}</span>
            {isAutoSyncReported ? (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-900 border border-emerald-400 flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                🔄 Tự động nhảy đồng bộ theo báo ăn thực tế ({standardBreakfastDays}S - {standardLunchDays}T - {standardDinnerDays}T)
              </span>
            ) : overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null ? (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black bg-amber-200 text-amber-950 border border-amber-400 flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                ✏️ Đang điều chỉnh đè thủ công ({standardBreakfastDays}S - {standardLunchDays}T - {standardDinnerDays}T)
              </span>
            ) : (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-300">
                📅 Mặc định theo lịch học cả tháng ({defaultStandardBreakfast}S - {defaultStandardLunch}T - {defaultStandardDinner}T)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
            Quy tắc chuẩn kế toán: <strong>Số ngày báo ăn + Số ngày không báo ăn = Định mức báo ăn</strong>. Thầy/Cô có thể bật <strong>Tự động nhảy theo báo ăn</strong> để hệ thống tự động lấy đúng số ngày lớp có ăn cơm thực tế (khi có nghỉ lễ, hoạt động ngoại khóa...), hoặc nhập số ngày đè thủ công.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto bg-white/95 p-2 rounded-xl border border-amber-200 shadow-2xs">
          {/* Nút bật/tắt chế độ tự động đồng bộ theo báo ăn thực tế */}
          <button
            type="button"
            onClick={handleToggleAutoSyncReported}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
              isAutoSyncReported
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-300'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}
            title={`Chế độ Tự động: Định mức sẽ tự động nhảy đúng bằng số ngày GVCN đã báo ăn thực tế trong tháng (${autoReportedMealDays.autoBreakfast} Sáng - ${autoReportedMealDays.autoLunch} Trưa - ${autoReportedMealDays.autoDinner} Tối)`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{isAutoSyncReported ? '✓ Đang tự động theo báo ăn' : '⚡ Tự động theo báo ăn'}</span>
          </button>

          {/* Sáng */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Sáng:</span>
            <input
              type="number"
              min={0}
              max={31}
              value={standardBreakfastDays}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideBreakfast(val);
              }}
              className={`w-13 border rounded-lg px-1.5 py-1.5 text-xs font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
              }`}
              placeholder={String(defaultStandardBreakfast)}
              title="Định mức số ngày ăn sáng chuẩn trong tháng"
            />
          </div>

          {/* Trưa */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Trưa:</span>
            <input
              type="number"
              min={0}
              max={31}
              value={standardLunchDays}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideLunch(val);
              }}
              className={`w-13 border rounded-lg px-1.5 py-1.5 text-xs font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
              }`}
              placeholder={String(defaultStandardLunch)}
              title="Định mức số ngày ăn trưa chuẩn trong tháng"
            />
          </div>

          {/* Tối */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Tối:</span>
            <input
              type="number"
              min={0}
              max={31}
              value={standardDinnerDays}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateOverrideDinner(val);
              }}
              className={`w-13 border rounded-lg px-1.5 py-1.5 text-xs font-extrabold text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs ${
                isAutoSyncReported ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300'
              }`}
              placeholder={String(defaultStandardDinner)}
              title="Định mức số ngày ăn tối chuẩn trong tháng"
            />
          </div>

          {/* Nút Reset định mức ngày báo ăn của tháng */}
          <button
            type="button"
            onClick={handleResetStandardConfig}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 ${
              overrideBreakfast !== null || overrideLunch !== null || overrideDinner !== null || isAutoSyncReported
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30 ring-2 ring-amber-300'
                : 'bg-white hover:bg-amber-50 text-slate-700 border border-slate-300 hover:border-amber-400'
            }`}
            title={`Khôi phục lại định mức ngày ăn chuẩn theo lịch tháng ${monthNum}/${yearNum} (S: ${defaultStandardBreakfast}, Trưa: ${defaultStandardLunch}, Tối: ${defaultStandardDinner} ngày)`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset lịch</span>
          </button>
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

          {/* Button open Digital Signature Modal */}
          <button
            type="button"
            onClick={() => setShowDigitalSigModal(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            title="Cấu hình chữ ký số điện tử, con dấu đỏ và đồng bộ Supabase Cloud"
          >
            <ShieldCheck className="w-4 h-4 text-blue-200" />
            <span>Chữ ký số & Supabase</span>
            {monthSig?.is_signed && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
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
              className="relative max-h-[calc(100vh-220px)] min-h-[480px] overflow-auto border border-slate-400 rounded-xl shadow-xs bg-white select-none"
              onMouseLeave={clearCrosshair}
            >
              <table className="w-full text-center border-collapse text-[11px] border-separate border-spacing-0">
                <thead>
                  {/* Row 1: STT (spans 3 rows), [Thứ - Ngày], Day numbers 1..N */}
                  <tr className="bg-slate-100 font-bold text-slate-900 sticky top-0 z-30 h-[28px]">
                    <th
                      rowSpan={3}
                      className="py-1 px-1 w-9 min-w-[36px] border-r border-b border-slate-400 sticky top-0 left-0 z-50 bg-slate-100 text-center font-bold text-slate-900"
                    >
                      STT
                    </th>
                    <th
                      className="py-1 px-2 min-w-[150px] border-r border-b border-slate-400 sticky top-0 left-9 z-50 bg-slate-100 font-bold"
                    >
                      <div className="flex items-center justify-between px-2 text-[11px] font-bold text-slate-900">
                        <span>Thứ</span>
                        <span>Ngày</span>
                      </div>
                    </th>
                    {displayedMonthDays.map((d) => {
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <th
                          key={d.dayNum}
                          colSpan={3}
                          onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, hoverRef.current.meal)}
                          className={`py-0.5 px-0.5 border-r border-b border-slate-400 text-center cursor-pointer sticky top-0 z-30 transition-colors ${
                            isDateHovered
                              ? 'bg-amber-100 text-slate-950 font-black'
                              : 'bg-slate-100 text-slate-900 font-bold'
                          }`}
                        >
                          <span className="text-[11px] font-bold">{d.dayNum}</span>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <th colSpan={6} className="py-1 px-2 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-0 z-30">
                          Số ngày ăn trong tháng
                        </th>
                        <th rowSpan={3} className="py-2 px-1.5 w-14 bg-slate-100 text-slate-900 font-bold border-b border-slate-400 sticky top-0 z-30">
                          Ngày thực
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 2: Họ và tên (spans 2 rows), Day of week: 5, 6, 7, CN, 2, 3... */}
                  <tr className="bg-slate-100 font-bold text-slate-800 sticky top-[28px] z-30 h-[24px]">
                    <th
                      rowSpan={2}
                      className="py-1 px-2 min-w-[150px] text-center border-r border-b border-slate-400 sticky top-[28px] left-9 z-50 bg-slate-100 font-bold text-slate-900"
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
                          <span className="text-[11px] font-bold">
                            {d.dayOfWeekShort}
                          </span>
                        </th>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-[28px] z-30">
                          Số ngày báo ăn
                        </th>
                        <th colSpan={3} className="py-0.5 px-1 border-r border-b border-slate-400 bg-slate-100 text-slate-900 font-bold sticky top-[28px] z-30">
                          Số ngày không báo ăn
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
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'breakfast')}
                            className={`py-0.5 w-[22px] min-w-[20px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold ${
                              isDateHovered && hoveredMealType === 'breakfast'
                                ? 'bg-amber-200 text-black font-black'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                            title={`Ngày ${d.dayNum} - Bữa Sáng (S)`}
                          >
                            S
                          </th>
                          <th
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'lunch')}
                            className={`py-0.5 w-[22px] min-w-[20px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold ${
                              isDateHovered && hoveredMealType === 'lunch'
                                ? 'bg-amber-200 text-black font-black'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                            title={`Ngày ${d.dayNum} - Bữa Trưa (T)`}
                          >
                            T
                          </th>
                          <th
                            onMouseEnter={() => updateCrosshair(hoverRef.current.studentId, d.dateStr, 'dinner')}
                            className={`py-0.5 w-[22px] min-w-[20px] border-r border-b border-slate-400 cursor-pointer sticky top-[52px] z-30 font-bold ${
                              isDateHovered && hoveredMealType === 'dinner'
                                ? 'bg-amber-200 text-black font-black'
                                : isDateHovered
                                ? 'bg-amber-100 text-black'
                                : 'bg-slate-100 text-slate-800'
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
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">S</th>
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">T</th>
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">T</th>
                        {/* Summary S,T,T for missed */}
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">S</th>
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">T</th>
                        <th className="py-0.5 w-6 border-r border-b border-slate-400 bg-slate-100 text-slate-800 font-bold sticky top-[52px] z-30">T</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-300" onMouseOver={handleTbodyMouseOver}>
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
                            ? 'bg-amber-50/80'
                            : 'bg-white'
                        }`}
                      >
                        <td
                          className={`py-1 px-1 w-9 min-w-[36px] font-medium border-r border-b border-slate-300 text-center sticky left-0 z-20 ${
                            isStudentHovered
                              ? 'bg-amber-100 text-slate-950 font-bold'
                              : 'bg-white text-slate-800'
                          }`}
                        >
                          {idx + 1}
                        </td>
                        <td
                          className={`py-1 px-2 min-w-[150px] text-left font-medium border-r border-b border-slate-300 whitespace-nowrap sticky left-9 z-20 ${
                            isStudentHovered
                              ? 'bg-amber-50 text-slate-950 font-bold'
                              : 'bg-white text-slate-900'
                          }`}
                        >
                          <span className="truncate">{st.full_name}</span>
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
                                className={`py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 select-none text-center font-bold text-xs sm:text-sm cursor-pointer transition-colors ${
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
                                className={`py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 select-none text-center font-bold text-xs sm:text-sm cursor-pointer transition-colors ${
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
                                className={`py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 select-none text-center font-bold text-xs sm:text-sm cursor-pointer transition-colors ${
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
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenBreakfast}
                            </td>
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenLunch}
                            </td>
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.eatenDinner}
                            </td>

                            {/* Summary Missed: S, T, T */}
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedBreakfast}
                            </td>
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedLunch}
                            </td>
                            <td className={`py-1 px-1 font-bold border-r border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-50' : 'bg-white'}`}>
                              {sum.missedDinner}
                            </td>

                            {/* Actual Days */}
                            <td className={`py-1 px-1 font-bold border-b border-slate-300 text-slate-900 ${isStudentHovered ? 'bg-amber-100 font-black' : 'bg-white'}`}>
                              {sum.actualDays}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* Row: + Thêm học sinh mới... as in Image 1 */}
                  <tr className="bg-white hover:bg-slate-50/80">
                    <td className="py-1.5 px-1 w-9 min-w-[36px] font-black text-emerald-700 border-r border-b border-slate-300 text-center sticky left-0 z-20 bg-white">
                      +
                    </td>
                    <td className="py-1.5 px-2 min-w-[150px] text-left border-r border-b border-slate-300 sticky left-9 z-20 bg-white">
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
                        <td className="py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 bg-white" />
                        <td className="py-1 w-[22px] min-w-[20px] border-r border-b border-slate-300 bg-white" />
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
                        <td className="py-1 border-b border-slate-300 bg-white" />
                      </>
                    )}
                  </tr>
                </tbody>

                {/* Table Footer: CỘNG */}
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                    <td colSpan={2} className="py-1.5 px-2 text-center border-r border-b border-slate-400 sticky left-0 bg-slate-100 z-10 font-bold">
                      CỘNG
                    </td>
                    {displayedMonthDays.map((d) => {
                      const totals = columnTotals.dailyTotals[d.dateStr] || { breakfast: 0, lunch: 0, dinner: 0 };
                      const isDateHovered = hoveredDateStr === d.dateStr;
                      return (
                        <React.Fragment key={d.dayNum}>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.breakfast > 0 ? totals.breakfast : ''}
                          </td>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.lunch > 0 ? totals.lunch : ''}
                          </td>
                          <td className={`py-1 px-0.5 border-r border-b border-slate-400 font-bold ${isDateHovered ? 'bg-amber-100 text-slate-950 font-black' : 'text-slate-900'}`}>
                            {totals.dinner > 0 ? totals.dinner : ''}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {showSummaryColumns && (
                      <>
                        <td className="py-1 px-1 border-r border-b border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalEatenB}
                        </td>
                        <td className="py-1 px-1 border-r border-b border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalEatenL}
                        </td>
                        <td className="py-1 px-1 border-r border-b border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalEatenD}
                        </td>
                        <td className="py-1 px-1 border-r border-b border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalMissedB}
                        </td>
                        <td className="py-1 px-1 border-r border-b border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalMissedL}
                        </td>
                        <td className="py-1 px-1 border-r border-slate-400 text-slate-900 font-bold">
                          {columnTotals.totalMissedD}
                        </td>
                        <td className="py-1 px-1 border-b border-slate-400 text-slate-900 font-bold">
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
        students={classBoardingStudents}
        mealMatrix={mealMatrix}
        studentSummaries={studentSummaries}
        columnTotals={columnTotals}
        effectiveTeacherName={effectiveTeacherName}
        effectiveSigningDateText={effectiveSigningDateText}
        sigConfig={sigConfig}
        monthSig={monthSig}
        onExportExcel={handleExportExcel}
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
    </div>
  );
};
