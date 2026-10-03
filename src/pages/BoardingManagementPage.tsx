import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import {
  Student,
  BoardingDailyReport,
  BoardingMealRecord,
  BoardingMealSummaryRow,
} from '../types';
import { MonthlyBoardingSheet } from '../components/MonthlyBoardingSheet';
import { DateNavigator } from '../components/DateNavigator';
import { getTodayDateStr, formatDateVN } from '../utils/schoolWeeks';
import {
  getMealScheduleForDate,
  buildDefaultMealRecords,
  generateDefaultBoardingStudentsForClass,
} from '../utils/boardingRules';
import { resolveStudentGender, inferGenderFromName } from '../utils/studentUtils';
import {
  Utensils,
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit2,
  Save,
  RotateCcw,
  Printer,
  Sparkles,
  Info,
  Check,
  X,
  Search,
  Filter,
  Layers,
  ChevronDown,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  Coffee,
  Sun,
  Moon,
  Home,
  UserX,
  School,
  FileUp,
} from 'lucide-react';

interface BoardingManagementPageProps {
  onNavigate?: (path: string) => void;
  initialTab?: TabType;
}

type TabType = 'daily-attendance' | 'monthly-sheet' | 'students-list' | 'kitchen-report' | 'rules-info';

export const BoardingManagementPage: React.FC<BoardingManagementPageProps> = ({ onNavigate, initialTab }) => {
  const { classes, campuses, students, addStudent, updateStudent, deleteStudent, deleteStudentsByClass, importStudents } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'daily-attendance');

  // Keep active tab in sync if initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Selected Date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());

  // Selected Class ID
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    const firstActive = classes.find((c) => c.active && !c.is_locked);
    return firstActive?.id || classes[0]?.id || '';
  });

  // Keep in sync with user's class if GVCN
  useEffect(() => {
    if (isGVCN && currentUser?.assigned_class_id && selectedClassId !== currentUser.assigned_class_id) {
      setSelectedClassId(currentUser.assigned_class_id);
    }
  }, [isGVCN, currentUser, selectedClassId]);

  // Selected Class info
  const selectedClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const validClassIds = useMemo(() => {
    return new Set([
      selectedClassId,
      selectedClass?.id,
      selectedClass?.class_name,
    ].filter(Boolean) as string[]);
  }, [selectedClassId, selectedClass]);

  // Students belonging to selected class (with strict de-duplication by id and full_name)
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const raw = students.filter((s) => validClassIds.has(s.class_id));
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const unique: Student[] = [];
    for (const s of raw) {
      if (!s || !s.full_name) continue;
      const sId = String(s.id || '').trim();
      const normName = String(s.full_name || '').trim().toLowerCase();

      if (sId && seenIds.has(sId)) continue;
      if (normName && seenNames.has(normName)) continue;

      if (sId) seenIds.add(sId);
      if (normName) seenNames.add(normName);
      unique.push(s);
    }
    return unique;
  }, [students, validClassIds, selectedClassId]);

  // Boarding students belonging to selected class (or all if not filtered)
  const classBoardingStudents = useMemo(() => {
    return classStudents;
  }, [classStudents]);

  // Day Meal Schedule
  const mealSchedule = useMemo(() => {
    return getMealScheduleForDate(selectedDate);
  }, [selectedDate]);

  // Meal Attendance State for selected date and class
  const [mealReport, setMealReport] = useState<BoardingDailyReport | null>(null);
  const [mealRecords, setMealRecords] = useState<BoardingMealRecord[]>([]);
  const [mealNotes, setMealNotes] = useState<string>('');
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hoveredDailyStudentId, setHoveredDailyStudentId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Kitchen Summary State
  const [kitchenSummary, setKitchenSummary] = useState<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    unreportedClasses: number;
    totalBoarding: number;
    totalBreakfast: number;
    totalLunch: number;
    totalDinner: number;
    totalAbsent: number;
    totalMeals: number;
    rows: BoardingMealSummaryRow[];
  } | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);

  // Modal State for Import Excel
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importPreviewData, setImportPreviewData] = useState<Array<Omit<Student, 'id' | 'created_at'>>>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State for Quick Paste Text
  const [showQuickPasteModal, setShowQuickPasteModal] = useState<boolean>(false);
  const [quickPasteText, setQuickPasteText] = useState<string>('');

  // Modal State for Add / Edit Single Student
  const [showStudentModal, setShowStudentModal] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState<{
    full_name: string;
    student_code: string;
    gender: 'Nam' | 'Nữ' | string;
    village: string;
    birth_date: string;
    ethnicity: string;
    isBoarding: boolean;
    notes: string;
  }>({
    full_name: '',
    student_code: '',
    gender: 'Nam',
    village: '',
    birth_date: '',
    ethnicity: 'Mông',
    isBoarding: true,
    notes: '',
  });

  // Filter & Search in Students List
  const [studentSearchText, setStudentSearchText] = useState<string>('');
  const [studentGenderFilter, setStudentGenderFilter] = useState<string>('ALL');

  // Load Boarding Report for Selected Class & Date
  const loadMealAttendance = async () => {
    if (!selectedClassId || !selectedDate) return;
    setIsLoadingReport(true);
    try {
      const rep = await StorageService.getBoardingReport(selectedClassId, selectedDate);
      const existingAttendanceReport = await StorageService.getDailyReport(selectedClassId, selectedDate);

      // Build absent map from standard daily report
      const absentMap = new Map<string, { reason?: string }>();
      if (existingAttendanceReport.report?.absent_students) {
        existingAttendanceReport.report.absent_students.forEach((ab) => {
          if (ab.id) {
            absentMap.set(ab.id, { reason: ab.reason });
          } else if (ab.full_name) {
            const norm = ab.full_name.trim().toLowerCase();
            const sameCount = classBoardingStudents.filter(
              (s) => s.full_name.trim().toLowerCase() === norm
            ).length;
            if (sameCount === 1) {
              absentMap.set(norm, { reason: ab.reason });
            }
          }
        });
      }

      // Lookup maps for previously saved meal records
      const recordById = new Map<string, BoardingMealRecord>();
      const recordByName = new Map<string, BoardingMealRecord>();

      if (rep && rep.records && rep.records.length > 0) {
        setMealReport(rep);
        setMealNotes(rep.notes || '');
        let recs = rep.records;
        if (typeof recs === 'string') {
          try { recs = JSON.parse(recs); } catch { recs = []; }
        }
        if (Array.isArray(recs)) {
          recs.forEach((r) => {
            if (r.student_id) recordById.set(r.student_id, r);
            if (r.student_name) recordByName.set(r.student_name.trim().toLowerCase(), r);
          });
        }
      } else {
        setMealReport(null);
        setMealNotes('');
      }

      // Strictly map 1-to-1 over classBoardingStudents: mealRecords.length will always equal classBoardingStudents.length
      const syncedRecords: BoardingMealRecord[] = classBoardingStudents.map((st) => {
        const normName = st.full_name.trim().toLowerCase();
        // Ưu tiên khớp chuẩn tuyệt đối theo ID học sinh để học sinh trùng tên không bị ghi đè dữ liệu của nhau
        const sameNameCount = classBoardingStudents.filter((s) => s.full_name.trim().toLowerCase() === normName).length;
        const existing = recordById.get(st.id) || (sameNameCount === 1 ? recordByName.get(normName) : undefined);

        if (existing) {
          return {
            ...existing,
            id: existing.id || `meal_${selectedClassId}_${selectedDate}_${st.id}`,
            class_id: selectedClassId,
            date: selectedDate,
            student_id: st.id,
            student_name: st.full_name,
            gender: st.gender || existing.gender,
            village: st.village || existing.village,
          };
        }

        const isAbsentInDaily = absentMap.has(st.id) || (sameNameCount === 1 && absentMap.has(normName));
        const absentInfo = absentMap.get(st.id) || (sameNameCount === 1 ? absentMap.get(normName) : undefined);
        const isAbsent = Boolean(isAbsentInDaily);

        return {
          id: `meal_${selectedClassId}_${selectedDate}_${st.id}`,
          class_id: selectedClassId,
          date: selectedDate,
          student_id: st.id,
          student_name: st.full_name,
          gender: st.gender,
          village: st.village,
          breakfast: !isAbsent && mealSchedule.breakfastAllowed,
          lunch: !isAbsent && mealSchedule.lunchAllowed,
          dinner: !isAbsent && mealSchedule.dinnerAllowed,
          is_absent: isAbsent,
          absent_reason: isAbsent ? (absentInfo?.reason || 'Vắng theo báo cáo sĩ số') : undefined,
          notes: '',
        };
      });

      setMealRecords(syncedRecords);
    } catch (err) {
      console.error('Error loading boarding meal report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Load Kitchen Summary for tab 3
  const loadKitchenSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const summary = await StorageService.getBoardingSummaryByDate(selectedDate);
      setKitchenSummary(summary);
    } catch (err) {
      console.error('Error loading kitchen summary:', err);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  useEffect(() => {
    loadMealAttendance();
  }, [selectedClassId, selectedDate, classBoardingStudents.length]);

  useEffect(() => {
    if (activeTab === 'kitchen-report') {
      loadKitchenSummary();
    }
  }, [activeTab, selectedDate]);

  // Toast Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const [isGeneratingStudents, setIsGeneratingStudents] = useState(false);
  const handleGenerateDefaultStudents = async () => {
    if (!selectedClass) return;
    setIsGeneratingStudents(true);
    try {
      await StorageService.deleteStudentsByClass(selectedClassId, selectedClass.class_name);
      const defaultStds = generateDefaultBoardingStudentsForClass(selectedClassId, selectedClass.class_name);
      await StorageService.saveStudents(defaultStds);
      await StorageService.getStudents();
      showToast(`Đã khởi tạo thành công 35 học sinh bán trú lớp ${selectedClass.class_name}!`);
      await loadMealAttendance();
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi khởi tạo danh sách học sinh!', 'error');
    } finally {
      setIsGeneratingStudents(false);
    }
  };

  // Real-time Meal Statistics
  const stats = useMemo(() => {
    const total = mealRecords.length;
    let breakfast = 0;
    let lunch = 0;
    let dinner = 0;
    let absent = 0;

    mealRecords.forEach((r) => {
      if (r.breakfast) breakfast++;
      if (r.lunch) lunch++;
      if (r.dinner) dinner++;
      if (r.is_absent) absent++;
    });

    return {
      total,
      breakfast,
      lunch,
      dinner,
      absent,
      totalMeals: breakfast + lunch + dinner,
    };
  }, [mealRecords]);

  // Toggle meal state for a single student
  const handleToggleMeal = (studentId: string, meal: 'breakfast' | 'lunch' | 'dinner') => {
    setMealRecords((prev) =>
      prev.map((r) => {
        if (r.student_id === studentId) {
          const newVal = !r[meal];
          // If turning a meal ON, student cannot be absent
          const isAbsent = newVal ? false : r.is_absent;
          return {
            ...r,
            [meal]: newVal,
            is_absent: isAbsent,
          };
        }
        return r;
      })
    );
  };

  // Toggle Absent state for a single student
  const handleToggleAbsent = (studentId: string) => {
    setMealRecords((prev) =>
      prev.map((r) => {
        if (r.student_id === studentId) {
          const isNowAbsent = !r.is_absent;
          if (isNowAbsent) {
            // When marking absent, turn off all meals
            return {
              ...r,
              is_absent: true,
              breakfast: false,
              lunch: false,
              dinner: false,
              absent_reason: r.absent_reason || 'Báo vắng trong ngày',
            };
          } else {
            // When un-marking absent, reset to default weekday allowed meals
            return {
              ...r,
              is_absent: false,
              breakfast: mealSchedule.breakfastAllowed,
              lunch: mealSchedule.lunchAllowed,
              dinner: mealSchedule.dinnerAllowed,
              absent_reason: '',
            };
          }
        }
        return r;
      })
    );
  };

  // Update absent reason or note for student
  const handleUpdateStudentNote = (studentId: string, field: 'absent_reason' | 'notes', value: string) => {
    setMealRecords((prev) =>
      prev.map((r) => {
        if (r.student_id === studentId) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // Bulk actions
  const handleToggleAllMeal = (meal: 'breakfast' | 'lunch' | 'dinner', forceState?: boolean) => {
    setMealRecords((prev) => {
      const allCurrent = prev.every((r) => r[meal]);
      const targetState = forceState !== undefined ? forceState : !allCurrent;
      return prev.map((r) => {
        if (r.is_absent && targetState) {
          return { ...r, [meal]: true, is_absent: false };
        }
        return { ...r, [meal]: targetState };
      });
    });
  };

  // Auto-sync from Daily Attendance Report (Lấy danh sách vắng từ báo cáo sĩ số ngày)
  const handleSyncFromDailyAttendance = async () => {
    try {
      const dailyRep = await StorageService.getDailyReport(selectedClassId, selectedDate);
      if (!dailyRep.report || (dailyRep.report.status as string) === 'NOT_REPORTED') {
        showToast('Chưa có báo cáo sĩ số đã nộp cho lớp này vào ngày đã chọn! Vui lòng nộp báo cáo sĩ số ngày trước khi đồng bộ.', 'info');
        return;
      }

      const absentMap = new Map<string, { reason?: string }>();
      if (dailyRep.report.absent_students) {
        dailyRep.report.absent_students.forEach((ab) => {
          if (ab.id) {
            absentMap.set(ab.id, { reason: ab.reason });
          } else if (ab.full_name) {
            const norm = ab.full_name.trim().toLowerCase();
            const sameCount = classBoardingStudents.filter(
              (s) => s.full_name.trim().toLowerCase() === norm
            ).length;
            if (sameCount === 1) {
              absentMap.set(norm, { reason: ab.reason });
            }
          }
        });
      }

      const synced = buildDefaultMealRecords(classBoardingStudents, selectedDate, selectedClassId, absentMap);
      setMealRecords(synced);
      showToast(`Đã đồng bộ tự động: ${absentMap.size} học sinh vắng, ${classBoardingStudents.length - absentMap.size} học sinh được chấm ăn.`);
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi đồng bộ dữ liệu từ báo cáo sĩ số!', 'error');
    }
  };

  // Reset to default rule
  const handleResetToDefault = () => {
    if (window.confirm('Bạn có chắc muốn đặt lại chấm ăn theo mặc định (tất cả học sinh không vắng đều được chấm ăn theo lịch ngày)?')) {
      const defaults = buildDefaultMealRecords(classBoardingStudents, selectedDate, selectedClassId);
      setMealRecords(defaults);
      showToast('Đã khôi phục chấm ăn mặc định theo quy định!');
    }
  };

  // Save Meal Attendance Report
  const handleSaveMealReport = async () => {
    if (!selectedClassId || !selectedDate) return;
    setIsSaving(true);
    try {
      const reportId = mealReport?.id || `boarding_rep_${selectedClassId}_${selectedDate}_${Date.now()}`;
      const newReport: BoardingDailyReport = {
        id: reportId,
        class_id: selectedClassId,
        date: selectedDate,
        status: 'SUBMITTED',
        total_boarding_students: stats.total,
        breakfast_count: stats.breakfast,
        lunch_count: stats.lunch,
        dinner_count: stats.dinner,
        absent_count: stats.absent,
        total_meals: stats.totalMeals,
        notes: mealNotes,
        records: mealRecords,
        submitted_by: currentUser?.id,
        submitted_by_name: currentUser?.full_name || 'GVCN',
        submitted_at: new Date().toISOString(),
        created_at: mealReport?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await StorageService.saveBoardingReport(newReport, currentUser || undefined);
      setMealReport(newReport);
      showToast(`Đã lưu và đồng bộ báo ăn lớp ${selectedClass?.class_name} ngày ${formatDateVN(selectedDate)} vào Sổ Chấm Cơm thành công! (${stats.totalMeals} suất ăn)`);
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi lưu báo cáo ăn bán trú!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Print Day Meal Sheet
  const handlePrintMealReport = () => {
    window.print();
  };

  // ----------------------------------------------------
  // STUDENT MANAGEMENT TAB ACTIONS
  // ----------------------------------------------------
  const filteredStudents = useMemo(() => {
    const list = classStudents.filter((st) => {
      const matchSearch =
        !studentSearchText ||
        st.full_name.toLowerCase().includes(studentSearchText.toLowerCase()) ||
        (st.village && st.village.toLowerCase().includes(studentSearchText.toLowerCase())) ||
        (st.student_code && st.student_code.toLowerCase().includes(studentSearchText.toLowerCase()));

      const matchGender =
        studentGenderFilter === 'ALL' ||
        st.gender === studentGenderFilter;

      return matchSearch && matchGender;
    });

    // Giữ nguyên 100% thứ tự danh sách học sinh theo file Excel gốc của lớp (không xáo trộn)
    return list;
  }, [classStudents, studentSearchText, studentGenderFilter]);

  // Open Add Student Modal
  const handleOpenAddStudent = () => {
    setEditingStudent(null);
    setStudentForm({
      full_name: '',
      student_code: '',
      gender: 'Nam',
      village: '',
      birth_date: '',
      ethnicity: 'Mông',
      isBoarding: true,
      notes: '',
    });
    setShowStudentModal(true);
  };

  // Open Edit Student Modal
  const handleOpenEditStudent = (st: Student) => {
    setEditingStudent(st);
    const resolvedGender = resolveStudentGender(st.gender, st.full_name);
    setStudentForm({
      full_name: st.full_name,
      student_code: st.student_code || '',
      gender: resolvedGender,
      village: st.village || st.address || '',
      birth_date: st.birth_date || '',
      ethnicity: st.ethnicity || 'Mông',
      isBoarding: st.isBoarding !== false,
      notes: st.notes || '',
    });
    setShowStudentModal(true);
  };

  // Save Single Student Form
  const handleSaveStudentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.full_name.trim()) {
      showToast('Vui lòng nhập họ và tên học sinh!', 'error');
      return;
    }

    const resolvedGender = resolveStudentGender(studentForm.gender, studentForm.full_name);

    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, {
          full_name: studentForm.full_name.trim(),
          student_code: studentForm.student_code.trim() || undefined,
          gender: resolvedGender,
          village: studentForm.village.trim() || undefined,
          address: studentForm.village.trim() || undefined,
          birth_date: studentForm.birth_date || undefined,
          ethnicity: studentForm.ethnicity || undefined,
          isBoarding: studentForm.isBoarding,
          notes: studentForm.notes.trim() || undefined,
        });
        showToast('Cập nhật thông tin học sinh thành công!');
      } else {
        await addStudent({
          class_id: selectedClassId,
          full_name: studentForm.full_name.trim(),
          student_code: studentForm.student_code.trim() || undefined,
          gender: resolvedGender,
          village: studentForm.village.trim() || undefined,
          address: studentForm.village.trim() || undefined,
          birth_date: studentForm.birth_date || undefined,
          ethnicity: studentForm.ethnicity || undefined,
          isBoarding: studentForm.isBoarding,
          notes: studentForm.notes.trim() || undefined,
        });
        showToast('Thêm học sinh mới vào danh sách thành công!');
      }
      setShowStudentModal(false);
    } catch (e) {
      console.error(e);
      showToast('Có lỗi xảy ra khi lưu thông tin học sinh!', 'error');
    }
  };

  // Delete Student
  const handleDeleteStudent = async (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa học sinh "${name}" khỏi lớp?`)) {
      try {
        await deleteStudent(id);
        showToast(`Đã xóa học sinh ${name}`);
      } catch (e) {
        console.error(e);
        showToast('Lỗi khi xóa học sinh!', 'error');
      }
    }
  };

  // Delete All Students of Selected Class
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);
  const handleDeleteAllClassStudents = async () => {
    if (!selectedClassId || classStudents.length === 0) return;
    const count = classStudents.length;
    const className = selectedClass?.class_name || '';
    const confirmMsg = `Bạn có chắc chắn muốn XÓA TOÀN BỘ ${count} học sinh của lớp ${className}?\n\nLưu ý: Thao tác này sẽ xóa sạch danh sách học sinh của lớp trên hệ thống và đám mây để Thầy/Cô có thể tải lên lại từ file Excel!`;
    if (window.confirm(confirmMsg)) {
      setIsDeletingAll(true);
      try {
        await deleteStudentsByClass(selectedClassId);
        showToast(`Đã xóa toàn bộ ${count} học sinh của lớp ${className}!`);
      } catch (e) {
        console.error(e);
        showToast('Lỗi khi xóa toàn bộ danh sách học sinh!', 'error');
      } finally {
        setIsDeletingAll(false);
      }
    }
  };

  // Toggle Boarding Status for single student
  const handleToggleStudentBoarding = async (st: Student) => {
    try {
      const nextVal = st.isBoarding === false ? true : false;
      await updateStudent(st.id, { isBoarding: nextVal });
      showToast(`Đã ${nextVal ? 'chuyển sang' : 'bỏ'} diện bán trú: ${st.full_name}`);
    } catch (e) {
      console.error(e);
    }
  };

  // Excel File Upload & Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rawData.length === 0) {
          showToast('File Excel không có dữ liệu!', 'error');
          return;
        }

        // Parse header and find columns
        let detectedHeaderRowIndex = -1;
        let colIndexName = -1;
        let colIndexHoDem = -1;
        let colIndexTen = -1;
        let colIndexGender = -1;
        let colIndexVillage = -1;
        let colIndexCode = -1;
        let colIndexBirth = -1;
        let colIndexEthnicity = -1;
        let colIndexBoarding = -1;
        let colIndexSTT = -1;

        for (let r = 0; r < Math.min(15, rawData.length); r++) {
          const row = rawData[r];
          if (!row || !Array.isArray(row)) continue;

          let headerScore = 0;
          let tempName = -1;
          let tempHoDem = -1;
          let tempTen = -1;
          let tempGender = -1;
          let tempVillage = -1;
          let tempCode = -1;
          let tempBirth = -1;
          let tempEthnicity = -1;
          let tempBoarding = -1;
          let tempSTT = -1;

          row.forEach((cell, idx) => {
            const rawVal = String(cell || '').trim();
            const val = rawVal.toLowerCase();
            if (!val) return;

            if (val === 'stt' || val === 'số tt' || val === 'tt' || val === 'no.') {
              tempSTT = idx;
              headerScore += 2;
            }

            if (
              val === 'họ và tên' ||
              val === 'họ tên' ||
              val === 'họ và tên học sinh' ||
              val === 'họ tên học sinh' ||
              val === 'họ và tên hs' ||
              val === 'tên học sinh' ||
              val.includes('họ và tên') ||
              val.includes('họ tên')
            ) {
              tempName = idx;
              headerScore += 5;
            } else if (val === 'họ đệm' || val === 'họ lót' || val === 'họ và tên đệm' || val === 'họ') {
              tempHoDem = idx;
              headerScore += 3;
            } else if (val === 'tên' || val === 'tên hs') {
              tempTen = idx;
              headerScore += 3;
            }

            if (val.includes('giới tính') || val === 'nam/nữ' || val === 'nữ' || val === 'nam' || val === 'phái') {
              tempGender = idx;
              headerScore += 2;
            }
            if (
              val.includes('thôn') ||
              val.includes('bản') ||
              val.includes('địa chỉ') ||
              val.includes('nơi ở') ||
              val.includes('quê quán') ||
              val.includes('hộ khẩu') ||
              val.includes('nơi cư trú')
            ) {
              tempVillage = idx;
              headerScore += 2;
            }
            if (
              val.includes('mã hs') ||
              val.includes('mã học sinh') ||
              val.includes('mã định danh') ||
              val.includes('mã số') ||
              val === 'mã'
            ) {
              tempCode = idx;
              headerScore += 2;
            }
            if (val.includes('ngày sinh') || val.includes('năm sinh') || val === 'ns' || val === 'd.o.b') {
              tempBirth = idx;
              headerScore += 2;
            }
            if (val.includes('dân tộc') || val === 'dt') {
              tempEthnicity = idx;
              headerScore += 2;
            }
            if (val.includes('bán trú') || val.includes('diện ở') || val.includes('ở nội trú') || val.includes('bt')) {
              tempBoarding = idx;
              headerScore += 2;
            }
          });

          // Check if this row is a genuine header row
          if (headerScore >= 3 || tempName !== -1 || (tempHoDem !== -1 && tempTen !== -1)) {
            detectedHeaderRowIndex = r;
            colIndexName = tempName;
            colIndexHoDem = tempHoDem;
            colIndexTen = tempTen;
            colIndexGender = tempGender;
            colIndexVillage = tempVillage;
            colIndexCode = tempCode;
            colIndexBirth = tempBirth;
            colIndexEthnicity = tempEthnicity;
            colIndexBoarding = tempBoarding;
            colIndexSTT = tempSTT;
            break;
          }
        }

        let startRow = 0;
        if (detectedHeaderRowIndex !== -1) {
          startRow = detectedHeaderRowIndex + 1;
        } else {
          // If no header found, check if row 0 has STT + Name pattern
          startRow = 0;
          const firstRow = rawData[0] || [];
          if (firstRow.length > 1 && !isNaN(Number(firstRow[0])) && isNaN(Number(firstRow[1]))) {
            colIndexSTT = 0;
            colIndexName = 1;
            if (firstRow.length > 2) colIndexGender = 2;
            if (firstRow.length > 3) colIndexVillage = 3;
            if (firstRow.length > 4) colIndexEthnicity = 4;
            if (firstRow.length > 5) colIndexBirth = 5;
          } else {
            colIndexName = firstRow.length > 1 ? 1 : 0;
          }
        }

        const parsedList: Array<Omit<Student, 'id' | 'created_at'>> = [];
        for (let i = startRow; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          let fullName = '';
          if (colIndexName !== -1 && row[colIndexName] !== undefined && row[colIndexName] !== null) {
            fullName = String(row[colIndexName]).trim();
          } else if (colIndexHoDem !== -1 && colIndexTen !== -1) {
            const ho = String(row[colIndexHoDem] || '').trim();
            const ten = String(row[colIndexTen] || '').trim();
            fullName = `${ho} ${ten}`.trim();
          } else {
            for (let c = 0; c < row.length; c++) {
              const cellStr = String(row[c] || '').trim();
              if (cellStr.length > 2 && isNaN(Number(cellStr))) {
                fullName = cellStr;
                break;
              }
            }
          }

          if (!fullName) continue;

          // Strip leading number in case name cell contains "1. Nguyễn Văn A"
          fullName = fullName.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').trim();
          if (!fullName) continue;

          const lowerName = fullName.toLowerCase();
          if (
            lowerName === 'stt' ||
            lowerName.includes('họ và tên') ||
            lowerName.includes('họ tên') ||
            lowerName.includes('tổng số') ||
            lowerName.includes('tổng cộng') ||
            lowerName.includes('người lập') ||
            lowerName.includes('hiệu trưởng') ||
            lowerName.includes('danh sách học sinh') ||
            lowerName.includes('ban giám hiệu') ||
            lowerName.includes('giáo viên chủ nhiệm')
          ) {
            continue;
          }

          let gender = resolveStudentGender('', fullName);
          if (colIndexGender !== -1 && row[colIndexGender] !== undefined) {
            const gVal = String(row[colIndexGender]).trim().toLowerCase();
            if (gVal === 'nữ' || gVal === 'nu' || gVal === 'f' || gVal === 'female' || gVal === 'x' || gVal === '1') {
              gender = 'Nữ';
            } else if (gVal === 'nam' || gVal === 'm' || gVal === 'male' || gVal === '0') {
              gender = 'Nam';
            }
          }

          let village = '';
          if (colIndexVillage !== -1 && row[colIndexVillage] !== undefined) {
            village = String(row[colIndexVillage]).trim();
          }

          let studentCode = '';
          if (colIndexCode !== -1 && row[colIndexCode] !== undefined) {
            studentCode = String(row[colIndexCode]).trim();
          }

          let birthDate = '';
          if (colIndexBirth !== -1 && row[colIndexBirth] !== undefined) {
            const rawBirth = row[colIndexBirth];
            if (typeof rawBirth === 'number') {
              try {
                const d = new Date(Math.round((rawBirth - 25569) * 86400 * 1000));
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                birthDate = `${day}/${month}/${year}`;
              } catch {
                birthDate = String(rawBirth);
              }
            } else {
              birthDate = String(rawBirth).trim();
            }
          }

          let ethnicity = 'Mông';
          if (colIndexEthnicity !== -1 && row[colIndexEthnicity] !== undefined) {
            ethnicity = String(row[colIndexEthnicity]).trim();
          }

          let isBoarding = true;

          parsedList.push({
            class_id: selectedClassId,
            full_name: fullName,
            student_code: studentCode || undefined,
            gender,
            village: village || undefined,
            address: village || undefined,
            birth_date: birthDate || undefined,
            ethnicity: ethnicity || undefined,
            isBoarding,
            notes: '',
          });
        }

        if (parsedList.length === 0) {
          showToast('Không tìm thấy học sinh hợp lệ nào trong file!', 'error');
          return;
        }

        setImportPreviewData(parsedList);
        setShowImportModal(true);
      } catch (err) {
        console.error(err);
        showToast('Lỗi khi đọc file Excel! Vui lòng kiểm tra định dạng file.', 'error');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (importPreviewData.length === 0) return;
    try {
      if (selectedClassId) {
        await deleteStudentsByClass(selectedClassId, selectedClass?.class_name);
      }
      await importStudents(importPreviewData, selectedClassId, selectedClass?.class_name);
      showToast(`Đã nhập thành công ${importPreviewData.length} học sinh vào lớp ${selectedClass?.class_name}! Giữ nguyên 100% thứ tự file Excel.`);
      setShowImportModal(false);
      setImportPreviewData([]);
      await loadMealAttendance();
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi lưu danh sách học sinh!', 'error');
    }
  };

  // Confirm Quick Paste Text
  const handleConfirmQuickPaste = async () => {
    if (!quickPasteText.trim()) {
      showToast('Vui lòng dán danh sách học sinh!', 'error');
      return;
    }

    const lines = quickPasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: Array<Omit<Student, 'id' | 'created_at'>> = [];

    lines.forEach((line) => {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      let name = '';
      let village = '';
      let ethnicity = 'Mông';

      if (parts.length > 1 && !isNaN(Number(parts[0])) && isNaN(Number(parts[1]))) {
        // parts[0] is STT, parts[1] is Name
        name = parts[1].replace(/^[\d\.\-\)\s]+/, '').trim();
        village = parts[2] || '';
        if (parts[4]) ethnicity = parts[4];
      } else if (parts.length >= 1) {
        name = parts[0].replace(/^[\d\.\-\)\s]+/, '').trim();
        village = parts[1] || '';
        if (parts[3]) ethnicity = parts[3];
      } else {
        const cleaned = line.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').trim();
        const subparts = cleaned.split(/[\-\:,]/).map((p) => p.trim());
        name = subparts[0];
        village = subparts.slice(1).join(' - ');
      }

      let gender = resolveStudentGender('', name);
      if (parts[3] === 'Nữ' || parts[3] === 'F' || parts[3] === 'nữ' || parts[2] === 'Nữ' || parts[2] === 'F' || parts[2] === 'nữ') {
        gender = 'Nữ';
      } else if (parts[3] === 'Nam' || parts[3] === 'M' || parts[3] === 'nam' || parts[2] === 'Nam' || parts[2] === 'M' || parts[2] === 'nam') {
        gender = 'Nam';
      }

      if (name) {
        const lowerName = name.toLowerCase();
        if (
          lowerName !== 'stt' &&
          !lowerName.includes('họ và tên') &&
          !lowerName.includes('họ tên') &&
          !lowerName.includes('tổng số')
        ) {
          parsed.push({
            class_id: selectedClassId,
            full_name: name,
            village: village || undefined,
            address: village || undefined,
            gender,
            ethnicity: ethnicity || undefined,
            isBoarding: true,
          });
        }
      }
    });

    if (parsed.length === 0) {
      showToast('Không tìm thấy tên học sinh nào!', 'error');
      return;
    }

    try {
      if (selectedClassId) {
        await deleteStudentsByClass(selectedClassId, selectedClass?.class_name);
      }
      await importStudents(parsed, selectedClassId, selectedClass?.class_name);
      showToast(`Đã thêm nhanh ${parsed.length} học sinh bán trú!`);
      setShowQuickPasteModal(false);
      setQuickPasteText('');
      await loadMealAttendance();
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi lưu học sinh!', 'error');
    }
  };

  // Download Sample Excel Template
  const handleDownloadSampleExcel = () => {
    const sampleData = [
      {
        'STT': 1,
        'Mã học sinh': 'HS0601',
        'Họ và tên': 'Vừ A Lềnh',
        'Giới tính': 'Nam',
        'Thôn Bản': 'Bản Háng Đồng',
        'Dân tộc': 'Mông',
        'Ngày sinh': '15/04/2014',
        'Bán trú': 'Có',
      },
      {
        'STT': 2,
        'Mã học sinh': 'HS0602',
        'Họ và tên': 'Sùng Thị Mỷ',
        'Giới tính': 'Nữ',
        'Thôn Bản': 'Bản Phi Lĩnh',
        'Dân tộc': 'Mông',
        'Ngày sinh': '20/08/2014',
        'Bán trú': 'Có',
      },
      {
        'STT': 3,
        'Mã học sinh': 'HS0603',
        'Họ và tên': 'Mùa A Tủa',
        'Giới tính': 'Nam',
        'Thôn Bản': 'Bản Xa Dung A',
        'Dân tộc': 'Mông',
        'Ngày sinh': '05/11/2014',
        'Bán trú': 'Có',
      },
      {
        'STT': 4,
        'Mã học sinh': 'HS0604',
        'Họ và tên': 'Lò Thị Hoa',
        'Giới tính': 'Nữ',
        'Thôn Bản': 'Bản Nà Sản',
        'Dân tộc': 'Thái',
        'Ngày sinh': '02/02/2014',
        'Bán trú': 'Có',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã HS
      { wch: 22 }, // Họ và tên
      { wch: 10 }, // Giới tính
      { wch: 18 }, // Thôn/Bản
      { wch: 12 }, // Dân tộc
      { wch: 14 }, // Ngày sinh
      { wch: 10 }, // Bán trú
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachBanTru');
    XLSX.writeFile(wb, `Mau_Danh_Sach_Hoc_Sinh_Ban_Tru_XaDung.xlsx`);
  };

  // Export Students Roster to Excel
  const handleExportStudentsExcel = async () => {
    let exportStudents = classStudents;

    if (exportStudents.length === 0) {
      showToast('Không có dữ liệu học sinh để xuất file!', 'info');
      return;
    }

    const exportData = exportStudents.map((st, idx) => ({
      'STT': idx + 1,
      'Mã HS': st.student_code || '',
      'Họ và tên': st.full_name,
      'Giới tính': st.gender || '',
      'Thôn/Bản': st.village || st.address || '',
      'Dân tộc': st.ethnicity || '',
      'Ngày sinh': st.birth_date || '',
      'Bán trú': st.isBoarding !== false ? 'Có' : 'Không',
      'Ghi chú': st.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    // Tự động co giãn kích thước cột theo nội dung thực tế
    const colKeys = Object.keys(exportData[0] || {});
    ws['!cols'] = colKeys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...exportData.map((row) => String((row as any)[key] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 7), 32) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HocSinhBanTru');
    XLSX.writeFile(wb, `Danh_Sach_HS_Ban_Tru_Lop_${selectedClass?.class_name || 'All'}.xlsx`);
  };

  // Export Kitchen Daily Meal Summary to Excel
  const handleExportKitchenExcel = () => {
    if (!kitchenSummary || kitchenSummary.rows.length === 0) {
      showToast('Không có dữ liệu báo cáo để xuất file!', 'info');
      return;
    }

    const exportData = kitchenSummary.rows.map((r, idx) => ({
      'STT': idx + 1,
      'Lớp': r.classItem.class_name,
      'GVCN': r.teacher?.full_name || '',
      'Sĩ số Bán trú': r.totalBoarding,
      'Suất Sáng': r.breakfastCount,
      'Suất Trưa': r.lunchCount,
      'Suất Tối': r.dinnerCount,
      'Vắng': r.absentCount,
      'Tổng suất ăn': r.totalMeals,
      'Trạng thái': r.status === 'REPORTED' ? 'Đã nộp' : r.status === 'LOCKED' ? 'Đã khóa' : 'Chưa nộp',
    }));

    // Add total row
    exportData.push({
      'STT': 'TỔNG',
      'Lớp': `${kitchenSummary.totalClasses} lớp`,
      'GVCN': '',
      'Sĩ số Bán trú': kitchenSummary.totalBoarding,
      'Suất Sáng': kitchenSummary.totalBreakfast,
      'Suất Trưa': kitchenSummary.totalLunch,
      'Suất Tối': kitchenSummary.totalDinner,
      'Vắng': kitchenSummary.totalAbsent,
      'Tổng suất ăn': kitchenSummary.totalMeals,
      'Trạng thái': `${kitchenSummary.reportedClasses}/${kitchenSummary.totalClasses} lớp đã nộp`,
    } as any);

    const ws = XLSX.utils.json_to_sheet(exportData);
    // Tự động co giãn kích thước cột báo cáo nhà bếp
    const colKeys = Object.keys(exportData[0] || {});
    ws['!cols'] = colKeys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...exportData.map((row) => String((row as any)[key] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 8), 35) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoNhaBep');
    XLSX.writeFile(wb, `Bao_Cao_Suat_An_Nha_Bep_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all transform animate-bounce ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : toastMessage.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-600/30'
              : 'bg-blue-600 text-white shadow-blue-600/30'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {toastMessage.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Hero Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-6 shadow-xl border border-blue-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 -mb-10 w-48 h-48 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 flex-shrink-0">
              <Utensils className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  QUẢN LÝ & CHẤM BÁO ĂN BÁN TRÚ
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Định mức Sáng - Trưa - Tối
                </span>
              </div>
              <p className="text-xs sm:text-sm text-blue-200 mt-1">
                Trường PTDTBT THCS Xa Dung • Chấm ăn hằng ngày, tự động hóa theo sĩ số & thống kê phục vụ nhà bếp
              </p>
            </div>
          </div>

          {/* Quick Date Navigator on Banner */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 self-start md:self-auto">
            <Calendar className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white text-xs sm:text-sm font-bold focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="flex items-center gap-1 sm:gap-2 mt-6 pt-4 border-t border-white/15 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('daily-attendance')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'daily-attendance'
                ? 'bg-white text-blue-900 shadow-md shadow-black/10'
                : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Chấm báo ăn ngày</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('monthly-sheet')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'monthly-sheet'
                ? 'bg-white text-blue-900 shadow-md shadow-black/10'
                : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-300" />
            <span>Sổ chấm cơm tháng (Biểu mẫu)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('students-list')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'students-list'
                ? 'bg-white text-blue-900 shadow-md shadow-black/10'
                : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Danh sách HS bán trú ({classBoardingStudents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kitchen-report')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'kitchen-report'
                ? 'bg-white text-blue-900 shadow-md shadow-black/10'
                : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Báo cáo suất ăn nhà bếp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules-info')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'rules-info'
                ? 'bg-white text-blue-900 shadow-md shadow-black/10'
                : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Quy định bán trú</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CHẤM BÁO ĂN NGÀY (DAILY MEAL ATTENDANCE) */}
      {/* ========================================================================= */}
      {activeTab === 'daily-attendance' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Top Control Bar: Class Selector + Date info + Rule notification */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Class Dropdown */}
              <div className="flex items-center gap-2 min-w-[200px]">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Lớp học:
                </label>
                {isGVCN && currentUser?.assigned_class_id ? (
                  <div className="px-3.5 py-2 bg-blue-50 text-blue-800 font-extrabold text-sm rounded-xl border border-blue-200 flex items-center gap-2">
                    <School className="w-4 h-4 text-blue-600" />
                    <span>Lớp {selectedClass?.class_name || 'Chủ nhiệm'}</span>
                  </div>
                ) : (
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {classes
                      .filter((c) => c.active && !c.is_locked)
                      .map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          Lớp {cls.class_name} ({cls.grade ? `Khối ${cls.grade}` : ''})
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {mealReport?.status === 'SUBMITTED' ? (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Đã nộp báo ăn
                  </span>
                ) : mealReport?.status === 'LOCKED' ? (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Đã khóa số liệu
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5 animate-pulse">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    Chưa nộp báo ăn ngày
                  </span>
                )}
              </div>
            </div>

            {/* Rule info for this day */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2.5 text-xs text-slate-700">
              <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div>
                <span className="font-extrabold text-slate-900">{mealSchedule.dayName} ({formatDateVN(selectedDate)}):</span>{' '}
                <span className="text-slate-600 font-medium">{mealSchedule.note}</span>
              </div>
            </div>
          </div>

          {/* Real-time Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Sĩ số bán trú
              </span>
              <span className="text-2xl font-black text-slate-900 mt-1">
                {stats.total} <span className="text-xs text-slate-400 font-normal">học sinh</span>
              </span>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-3.5 border border-blue-200 shadow-sm flex flex-col">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                <Coffee className="w-3.5 h-3.5 text-blue-600" />
                Ăn Sáng
              </span>
              <span className="text-2xl font-black text-blue-900 mt-1">
                {stats.breakfast} <span className="text-xs text-blue-600 font-bold">suất</span>
              </span>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl p-3.5 border border-amber-200 shadow-sm flex flex-col">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                <Sun className="w-3.5 h-3.5 text-amber-600" />
                Ăn Trưa
              </span>
              <span className="text-2xl font-black text-amber-900 mt-1">
                {stats.lunch} <span className="text-xs text-amber-600 font-bold">suất</span>
              </span>
            </div>

            <div className={`rounded-2xl p-3.5 border shadow-sm flex flex-col ${
              mealSchedule.dinnerAllowed
                ? 'bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200 text-purple-900'
                : 'bg-slate-50 border-slate-200 text-slate-400 opacity-80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                mealSchedule.dinnerAllowed ? 'text-purple-700' : 'text-slate-500'
              }`}>
                <Moon className="w-3.5 h-3.5 text-purple-600" />
                Ăn Tối
              </span>
              <span className="text-2xl font-black mt-1">
                {stats.dinner} <span className="text-xs font-bold">suất</span>
              </span>
            </div>

            <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 rounded-2xl p-3.5 border border-rose-200 shadow-sm flex flex-col">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                <UserX className="w-3.5 h-3.5 text-rose-600" />
                Vắng ăn / Nghỉ
              </span>
              <span className="text-2xl font-black text-rose-900 mt-1">
                {stats.absent} <span className="text-xs text-rose-600 font-bold">em</span>
              </span>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-3.5 shadow-md shadow-emerald-500/20 flex flex-col justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5" />
                Tổng suất ăn
              </span>
              <span className="text-2xl font-black mt-1">
                {stats.totalMeals} <span className="text-xs text-emerald-100 font-bold">suất</span>
              </span>
            </div>
          </div>

          {/* Quick Action Buttons Toolbar */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Auto Sync from Attendance button */}
              <button
                type="button"
                onClick={handleSyncFromDailyAttendance}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Tự động lấy học sinh vắng từ báo cáo sĩ số ngày"
              >
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Đồng bộ từ Báo cáo sĩ số</span>
              </button>

              {/* Sync with class boarding roster */}
              <button
                type="button"
                onClick={async () => {
                  await loadMealAttendance();
                  showToast(`Đã đồng bộ chuẩn xác ${classBoardingStudents.length} học sinh bán trú của lớp!`);
                }}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Đồng bộ danh sách chấm ăn đúng với số lượng học sinh bán trú hiện tại của lớp"
              >
                <RotateCcw className="w-4 h-4 text-emerald-600" />
                <span>Đồng bộ DS bán trú ({classBoardingStudents.length} HS)</span>
              </button>

              {/* Toggle all breakfast */}
              <button
                type="button"
                onClick={() => handleToggleAllMeal('breakfast')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-all flex items-center gap-1"
              >
                <Coffee className="w-3.5 h-3.5 text-blue-600" />
                <span>Tất cả Sáng</span>
              </button>

              {/* Toggle all lunch */}
              <button
                type="button"
                onClick={() => handleToggleAllMeal('lunch')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-700 border border-slate-200 transition-all flex items-center gap-1"
              >
                <Sun className="w-3.5 h-3.5 text-amber-600" />
                <span>Tất cả Trưa</span>
              </button>

              {/* Toggle all dinner */}
              <button
                type="button"
                onClick={() => handleToggleAllMeal('dinner')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-700 border border-slate-200 transition-all flex items-center gap-1"
              >
                <Moon className="w-3.5 h-3.5 text-purple-600" />
                <span>Tất cả Tối</span>
              </button>

              {/* Reset to default */}
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-all flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Mặc định</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('monthly-sheet')}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Mở Sổ chấm cơm tháng & Xuất file Excel chuẩn mẫu"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                <span>Sổ chấm cơm tháng & Xuất Excel</span>
              </button>

              <button
                type="button"
                onClick={handlePrintMealReport}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">In phiếu báo ăn</span>
              </button>

              <button
                type="button"
                onClick={handleSaveMealReport}
                disabled={isSaving || mealRecords.length === 0}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu & Gửi Báo Ăn'}</span>
              </button>
            </div>
          </div>

          {/* Student Meal Rating Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-blue-700" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  DANH SÁCH CHẤM ĂN HẰNG NGÀY — LỚP {selectedClass?.class_name || '...'}
                </h3>
                <span className="text-xs text-slate-500 font-medium">({mealRecords.length} học sinh)</span>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Sáng
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Trưa
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Tối
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Vắng
                </span>
              </div>
            </div>

            {isLoadingReport ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Đang tải danh sách học sinh và dữ liệu chấm ăn...</span>
              </div>
            ) : mealRecords.length === 0 ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-base">Chưa có danh sách học sinh bán trú cho lớp này</h4>
                <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                  Thầy/Cô vui lòng chuyển sang tab "Danh sách HS bán trú" để Import file Excel hoặc thêm danh sách học sinh cho lớp.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleGenerateDefaultStudents}
                    disabled={isGeneratingStudents}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{isGeneratingStudents ? 'Đang tạo danh sách...' : `Tạo nhanh DS 35 học sinh lớp ${selectedClass?.class_name}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('students-list')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nhập danh sách riêng từ Excel</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* 1. Mobile Phone Card View (Hiển thị tối ưu tuyệt đối cho màn hình điện thoại) */}
                <div className="md:hidden divide-y divide-slate-100 p-2 sm:p-3 space-y-3">
                  {mealRecords.map((st, idx) => {
                    const isHovered = hoveredDailyStudentId === st.student_id;
                    return (
                      <div
                        key={st.student_id}
                        onMouseEnter={() => setHoveredDailyStudentId(st.student_id)}
                        onMouseLeave={() => setHoveredDailyStudentId(null)}
                        className={`p-3 rounded-2xl border transition-all ${
                          isHovered
                            ? 'bg-amber-50/90 border-blue-400 ring-2 ring-blue-500/60 shadow-md'
                            : st.is_absent
                            ? 'bg-rose-50/60 border-rose-200'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                      {/* Row 1: STT & Name & Info */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-black text-slate-900 text-sm">
                              {st.student_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {[st.gender, st.village].filter(Boolean).join(' • ') || 'HS Bán trú'}
                            </div>
                          </div>
                        </div>

                        {st.is_absent ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            Vắng cả ngày
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Có ăn cơm
                          </span>
                        )}
                      </div>

                      {/* Row 2: 4 Quick Toggle Buttons for Meals */}
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {/* Sáng */}
                        <button
                          type="button"
                          onClick={() => handleToggleMeal(st.student_id, 'breakfast')}
                          className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                            st.breakfast
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-400 hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <Coffee className="w-3.5 h-3.5" />
                            <span>Sáng</span>
                          </div>
                          <span className="text-[9px] font-medium opacity-90">
                            {st.breakfast ? 'Có ăn' : 'Nghỉ'}
                          </span>
                        </button>

                        {/* Trưa */}
                        <button
                          type="button"
                          onClick={() => handleToggleMeal(st.student_id, 'lunch')}
                          className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                            st.lunch
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-400 hover:bg-amber-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <Sun className="w-3.5 h-3.5" />
                            <span>Trưa</span>
                          </div>
                          <span className="text-[9px] font-medium opacity-90">
                            {st.lunch ? 'Có ăn' : 'Nghỉ'}
                          </span>
                        </button>

                        {/* Tối */}
                        <button
                          type="button"
                          onClick={() => handleToggleMeal(st.student_id, 'dinner')}
                          disabled={!mealSchedule.dinnerAllowed}
                          className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                            !mealSchedule.dinnerAllowed
                              ? 'bg-slate-100 text-slate-300 opacity-60 cursor-not-allowed'
                              : st.dinner
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-400 hover:bg-purple-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <Moon className="w-3.5 h-3.5" />
                            <span>Tối</span>
                          </div>
                          <span className="text-[9px] font-medium opacity-90">
                            {!mealSchedule.dinnerAllowed ? 'T6 HS về' : st.dinner ? 'Có ăn' : 'Nghỉ'}
                          </span>
                        </button>

                        {/* Vắng / Nghỉ cả ngày */}
                        <button
                          type="button"
                          onClick={() => handleToggleAbsent(st.student_id)}
                          className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                            st.is_absent
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-500 hover:bg-rose-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <UserX className="w-3.5 h-3.5" />
                            <span>Vắng</span>
                          </div>
                          <span className="text-[9px] font-medium opacity-90">
                            {st.is_absent ? 'Nghỉ' : 'Có mặt'}
                          </span>
                        </button>
                      </div>

                      {/* Row 3: Reason / Note input */}
                      <input
                        type="text"
                        value={st.is_absent ? (st.absent_reason || '') : (st.notes || '')}
                        onChange={(e) =>
                          handleUpdateStudentNote(
                            st.student_id,
                            st.is_absent ? 'absent_reason' : 'notes',
                            e.target.value
                          )
                        }
                        placeholder={st.is_absent ? 'Nhập lý do vắng...' : 'Ghi chú học sinh này (nếu có)...'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  );
                })}
                </div>

                {/* 2. Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100/75 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                        <th className="py-3 px-3 w-12 text-center">STT</th>
                        <th className="py-3 px-3 min-w-[160px]">Họ và tên học sinh</th>
                        <th className="py-3 px-3 min-w-[120px] hidden md:table-cell">Thôn / Bản</th>
                        <th className="py-3 px-2 w-16 text-center hidden sm:table-cell">Phái</th>
                        <th className="py-3 px-2 w-24 text-center bg-blue-50/70 border-x border-slate-200">
                          <div className="flex flex-col items-center">
                            <span className="text-blue-800">Sáng</span>
                            <span className="text-[9px] text-blue-600 font-normal">Ăn sáng</span>
                          </div>
                        </th>
                        <th className="py-3 px-2 w-24 text-center bg-amber-50/70 border-r border-slate-200">
                          <div className="flex flex-col items-center">
                            <span className="text-amber-800">Trưa</span>
                            <span className="text-[9px] text-amber-600 font-normal">Ăn trưa</span>
                          </div>
                        </th>
                        <th className={`py-3 px-2 w-24 text-center border-r border-slate-200 ${
                          mealSchedule.dinnerAllowed ? 'bg-purple-50/70 text-purple-800' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <div className="flex flex-col items-center">
                            <span>Tối</span>
                            <span className="text-[9px] font-normal">
                              {mealSchedule.dinnerAllowed ? 'Ăn tối' : 'T6 HS về'}
                            </span>
                          </div>
                        </th>
                        <th className="py-3 px-2 w-24 text-center bg-rose-50/70 border-r border-slate-200">
                          <div className="flex flex-col items-center">
                            <span className="text-rose-800">Vắng</span>
                            <span className="text-[9px] text-rose-600 font-normal">Nghỉ cả ngày</span>
                          </div>
                        </th>
                        <th className="py-3 px-3 min-w-[150px]">Lý do / Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mealRecords.map((st, idx) => {
                        const isHovered = hoveredDailyStudentId === st.student_id;
                        return (
                          <tr
                            key={st.student_id}
                            onMouseEnter={() => setHoveredDailyStudentId(st.student_id)}
                            onMouseLeave={() => setHoveredDailyStudentId(null)}
                            className={`transition-all duration-150 ${
                              isHovered
                                ? 'bg-amber-100/90 ring-2 ring-blue-500/70 border-l-4 border-l-blue-600 shadow-sm font-bold'
                                : st.is_absent
                                ? 'bg-rose-50/30 text-slate-400'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className={`py-2.5 px-3 text-center font-black ${isHovered ? 'bg-amber-200 text-blue-950' : 'text-slate-400'}`}>{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-black ${isHovered ? 'text-blue-950 font-black' : 'text-slate-900'}`}>{st.student_name}</span>
                                {isHovered && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-600 text-white tracking-wider">
                                    Đang chấm
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 md:hidden">
                                {[st.gender, st.village].filter(Boolean).join(' • ')}
                              </div>
                            </td>
                          <td className="py-2.5 px-3 text-slate-600 hidden md:table-cell">{st.village || '—'}</td>
                          <td className="py-2.5 px-2 text-center text-slate-500 hidden sm:table-cell">{st.gender || '—'}</td>

                          {/* Breakfast Toggle */}
                          <td className="py-2.5 px-2 text-center bg-blue-50/30 border-x border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleToggleMeal(st.student_id, 'breakfast')}
                              className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center mx-auto transition-all ${
                                st.breakfast
                                  ? 'bg-blue-600 text-white shadow-xs scale-105'
                                  : 'bg-slate-100 text-slate-300 hover:bg-blue-100 hover:text-blue-600'
                              }`}
                              title={st.breakfast ? 'Có ăn sáng' : 'Không ăn sáng'}
                            >
                              <Check className={`w-4 h-4 ${st.breakfast ? 'stroke-[3]' : 'opacity-0'}`} />
                            </button>
                          </td>

                          {/* Lunch Toggle */}
                          <td className="py-2.5 px-2 text-center bg-amber-50/30 border-r border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleToggleMeal(st.student_id, 'lunch')}
                              className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center mx-auto transition-all ${
                                st.lunch
                                  ? 'bg-amber-500 text-white shadow-xs scale-105'
                                  : 'bg-slate-100 text-slate-300 hover:bg-amber-100 hover:text-amber-600'
                              }`}
                              title={st.lunch ? 'Có ăn trưa' : 'Không ăn trưa'}
                            >
                              <Check className={`w-4 h-4 ${st.lunch ? 'stroke-[3]' : 'opacity-0'}`} />
                            </button>
                          </td>

                          {/* Dinner Toggle */}
                          <td className={`py-2.5 px-2 text-center border-r border-slate-100 ${
                            mealSchedule.dinnerAllowed ? 'bg-purple-50/30' : 'bg-slate-50/50'
                          }`}>
                            <button
                              type="button"
                              onClick={() => handleToggleMeal(st.student_id, 'dinner')}
                              className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center mx-auto transition-all ${
                                st.dinner
                                  ? 'bg-purple-600 text-white shadow-xs scale-105'
                                  : 'bg-slate-100 text-slate-300 hover:bg-purple-100 hover:text-purple-600'
                              }`}
                              title={
                                !mealSchedule.dinnerAllowed
                                  ? 'Chiều thứ 6 học sinh về nhà (mặc định không ăn tối)'
                                  : st.dinner
                                  ? 'Có ăn tối'
                                  : 'Không ăn tối'
                              }
                            >
                              <Check className={`w-4 h-4 ${st.dinner ? 'stroke-[3]' : 'opacity-0'}`} />
                            </button>
                          </td>

                          {/* Absent Toggle */}
                          <td className="py-2.5 px-2 text-center bg-rose-50/30 border-r border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleToggleAbsent(st.student_id)}
                              className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center mx-auto transition-all ${
                                st.is_absent
                                  ? 'bg-rose-600 text-white shadow-xs scale-105'
                                  : 'bg-slate-100 text-slate-300 hover:bg-rose-100 hover:text-rose-600'
                              }`}
                              title={st.is_absent ? 'Học sinh báo vắng / nghỉ ăn' : 'Học sinh có mặt'}
                            >
                              <X className={`w-4 h-4 ${st.is_absent ? 'stroke-[3]' : 'opacity-0'}`} />
                            </button>
                          </td>

                          {/* Note & Reason */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={st.is_absent ? (st.absent_reason || '') : (st.notes || '')}
                              onChange={(e) =>
                                handleUpdateStudentNote(
                                  st.student_id,
                                  st.is_absent ? 'absent_reason' : 'notes',
                                  e.target.value
                                )
                              }
                              placeholder={st.is_absent ? 'Nhập lý do vắng...' : 'Ghi chú thêm...'}
                              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-blue-400 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none transition-all"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bottom Form Notes & Final Save Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-600 mb-1 block">
                  Ghi chú chung của lớp (nếu có báo thêm cho nhà bếp):
                </label>
                <input
                  type="text"
                  value={mealNotes}
                  onChange={(e) => setMealNotes(e.target.value)}
                  placeholder="Ví dụ: Có 2 học sinh đi thi học sinh giỏi về trễ; nhà bếp lưu ý..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleSaveMealReport}
                  disabled={isSaving || mealRecords.length === 0}
                  className="w-full md:w-auto px-6 py-2.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Đang lưu dữ liệu...' : 'Lưu Chấm Báo Ăn Lớp'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: SỔ CHẤM CƠM THÁNG (MONTHLY MEAL SHEET) */}
      {/* ========================================================================= */}
      {activeTab === 'monthly-sheet' && (
        <MonthlyBoardingSheet
          selectedClassId={selectedClassId}
          onClassChange={(cid) => setSelectedClassId(cid)}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: QUẢN LÝ DANH SÁCH HỌC SINH BÁN TRÚ (STUDENTS ROSTER) */}
      {/* ========================================================================= */}
      {activeTab === 'students-list' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Top Actions: Search, Filter, Add, Import Excel, Quick Paste */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Class Selector for Teacher */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lớp:</label>
                {isGVCN && currentUser?.assigned_class_id ? (
                  <span className="font-extrabold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-sm">
                    Lớp {selectedClass?.class_name}
                  </span>
                ) : (
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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

              {/* Search box */}
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearchText}
                  onChange={(e) => setStudentSearchText(e.target.value)}
                  placeholder="Tìm theo tên, thôn bản..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Gender Filter */}
              <select
                value={studentGenderFilter}
                onChange={(e) => setStudentGenderFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-3 py-1.5 focus:outline-none"
              >
                <option value="ALL">Tất cả giới tính</option>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>

            {/* Buttons: Import Excel, Quick Paste, Add Single, Export */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Hidden file input for Excel */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Import Excel</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQuickPasteModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1.5 transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>Dán danh sách</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddStudent}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm học sinh</span>
              </button>

              {classStudents.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllClassStudents}
                  disabled={isDeletingAll}
                  className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Xóa toàn bộ danh sách học sinh của lớp này"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>{isDeletingAll ? 'Đang xóa...' : 'Xóa toàn bộ DS'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportStudentsExcel}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-all"
                title="Xuất file Excel danh sách học sinh"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Xuất Excel</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 flex items-center gap-1.5 transition-all"
                title="Tải mẫu Excel chuẩn để nhập dữ liệu"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="hidden md:inline">Tải file mẫu</span>
              </button>
            </div>
          </div>

          {/* Students Roster Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wider">
                Danh sách học sinh lớp {selectedClass?.class_name} ({filteredStudents.length} học sinh)
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Bán trú: <strong className="text-blue-700 font-bold">{classBoardingStudents.length}</strong> / {classStudents.length} em
                </span>
                {classStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteAllClassStudents}
                    disabled={isDeletingAll}
                    className="px-2.5 py-1 text-xs font-bold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-300 rounded-lg flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                    title="Xóa toàn bộ danh sách học sinh của lớp này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeletingAll ? 'Đang xóa...' : `Xóa tất cả (${classStudents.length})`}</span>
                  </button>
                )}
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center p-4">
                <Users className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-600">Chưa có học sinh nào trong danh sách lớp {selectedClass?.class_name}</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">Thầy/Cô có thể tạo nhanh danh sách 35 học sinh bán trú mẫu đặc trưng trường Xa Dung hoặc Import từ file Excel.</p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleGenerateDefaultStudents}
                    disabled={isGeneratingStudents}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{isGeneratingStudents ? 'Đang tạo...' : `Tạo nhanh DS 35 học sinh lớp ${selectedClass?.class_name}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Import từ file Excel</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                      <th className="py-3 px-3 w-12 text-center">STT</th>
                      <th className="py-3 px-3 w-28">Mã HS</th>
                      <th className="py-3 px-3 min-w-[180px]">Họ và tên</th>
                      <th className="py-3 px-2 w-16 text-center">Giới tính</th>
                      <th className="py-3 px-3 min-w-[140px]">Thôn / Bản</th>
                      <th className="py-3 px-3 w-28 hidden md:table-cell">Dân tộc</th>
                      <th className="py-3 px-3 w-32 text-center">Diện Bán trú</th>
                      <th className="py-3 px-3 w-24 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{st.student_code || '—'}</td>
                        <td className="py-2.5 px-3 font-extrabold text-slate-900">{st.full_name}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              resolveStudentGender(st.gender, st.full_name) === 'Nữ'
                                ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {resolveStudentGender(st.gender, st.full_name)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{st.village || st.address || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-500 hidden md:table-cell">{st.ethnicity || 'Mông'}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStudentBoarding(st)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all ${
                              st.isBoarding !== false
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title="Bấm để bật/tắt diện bán trú"
                          >
                            {st.isBoarding !== false ? '✓ Bán trú' : 'Ngoại trú'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditStudent(st)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
                              title="Sửa thông tin"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(st.id, st.full_name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                              title="Xóa học sinh"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BÁO CÁO SUẤT ĂN TOÀN TRƯỜNG & NHÀ BẾP (KITCHEN SUMMARY REPORT) */}
      {/* ========================================================================= */}
      {activeTab === 'kitchen-report' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Header Bar with Date Navigator & Export */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  TỔNG HỢP KHẨU PHẦN & SUẤT ĂN NHÀ BẾP
                </h3>
                <p className="text-xs text-slate-500">
                  Số liệu toàn trường ngày {formatDateVN(selectedDate)} ({mealSchedule.dayName})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadKitchenSummary}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm mới</span>
              </button>

              <button
                type="button"
                onClick={handleExportKitchenExcel}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Xuất Excel Báo Cáo</span>
              </button>

              <button
                type="button"
                onClick={handlePrintMealReport}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>In Phiếu Nhà Bếp</span>
              </button>
            </div>
          </div>

          {/* Big Summary Stat Cards */}
          {kitchenSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">HS Bán trú</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{kitchenSummary.totalBoarding}</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{kitchenSummary.totalClasses} lớp toàn trường</span>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                  <Coffee className="w-3.5 h-3.5" /> Ăn Sáng
                </span>
                <span className="text-2xl sm:text-3xl font-black text-blue-900 mt-1">{kitchenSummary.totalBreakfast}</span>
                <span className="text-[10px] text-blue-600 font-semibold mt-0.5">suất ăn phục vụ</span>
              </div>

              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5" /> Ăn Trưa
                </span>
                <span className="text-2xl sm:text-3xl font-black text-amber-900 mt-1">{kitchenSummary.totalLunch}</span>
                <span className="text-[10px] text-amber-600 font-semibold mt-0.5">suất ăn phục vụ</span>
              </div>

              <div className={`rounded-2xl p-4 border shadow-sm flex flex-col ${
                mealSchedule.dinnerAllowed ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                  mealSchedule.dinnerAllowed ? 'text-purple-700' : 'text-slate-500'
                }`}>
                  <Moon className="w-3.5 h-3.5" /> Ăn Tối
                </span>
                <span className="text-2xl sm:text-3xl font-black text-purple-900 mt-1">{kitchenSummary.totalDinner}</span>
                <span className="text-[10px] text-purple-600 font-semibold mt-0.5">
                  {mealSchedule.dinnerAllowed ? 'suất ăn phục vụ' : 'T6 nghỉ ăn tối'}
                </span>
              </div>

              <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                  <UserX className="w-3.5 h-3.5" /> Vắng Ăn
                </span>
                <span className="text-2xl sm:text-3xl font-black text-rose-900 mt-1">{kitchenSummary.totalAbsent}</span>
                <span className="text-[10px] text-rose-600 font-semibold mt-0.5">học sinh nghỉ</span>
              </div>

              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-lg shadow-emerald-600/25 flex flex-col justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                  <Utensils className="w-3.5 h-3.5" /> Tổng suất ăn
                </span>
                <span className="text-2xl sm:text-3xl font-black mt-1">
                  {kitchenSummary.totalMeals} <span className="text-xs font-bold text-emerald-100">suất</span>
                </span>
              </div>
            </div>
          )}

          {/* Kitchen Table Breakdown by Class */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                BẢNG TỔNG HỢP SUẤT ĂN TỪNG LỚP NGÀY {formatDateVN(selectedDate)}
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Tiến độ: <strong className="text-emerald-700">{kitchenSummary?.reportedClasses || 0}</strong> / {kitchenSummary?.totalClasses || 0} lớp đã nộp
              </span>
            </div>

            {isLoadingSummary ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Đang tổng hợp số liệu nhà bếp...</span>
              </div>
            ) : !kitchenSummary || kitchenSummary.rows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">Chưa có dữ liệu lớp học</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                      <th className="py-3 px-3 w-12 text-center">STT</th>
                      <th className="py-3 px-3 w-28">Lớp</th>
                      <th className="py-3 px-3 min-w-[160px]">Giáo viên chủ nhiệm</th>
                      <th className="py-3 px-2 w-24 text-center">Sĩ số BT</th>
                      <th className="py-3 px-2 w-24 text-center bg-blue-50/60">Sáng</th>
                      <th className="py-3 px-2 w-24 text-center bg-amber-50/60">Trưa</th>
                      <th className="py-3 px-2 w-24 text-center bg-purple-50/60">Tối</th>
                      <th className="py-3 px-2 w-20 text-center bg-rose-50/60">Vắng</th>
                      <th className="py-3 px-2 w-28 text-center bg-emerald-50 text-emerald-900 font-black">Tổng suất</th>
                      <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kitchenSummary.rows.map((r, idx) => (
                      <tr key={r.classItem.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-3 px-3 font-extrabold text-blue-900">Lớp {r.classItem.class_name}</td>
                        <td className="py-3 px-3 text-slate-700 font-medium">{r.teacher?.full_name || '—'}</td>
                        <td className="py-3 px-2 text-center font-bold text-slate-800">{r.totalBoarding}</td>
                        <td className="py-3 px-2 text-center font-bold text-blue-700 bg-blue-50/20">{r.breakfastCount}</td>
                        <td className="py-3 px-2 text-center font-bold text-amber-700 bg-amber-50/20">{r.lunchCount}</td>
                        <td className="py-3 px-2 text-center font-bold text-purple-700 bg-purple-50/20">{r.dinnerCount}</td>
                        <td className="py-3 px-2 text-center font-bold text-rose-600 bg-rose-50/20">{r.absentCount}</td>
                        <td className="py-3 px-2 text-center font-black text-emerald-800 bg-emerald-50/50">{r.totalMeals}</td>
                        <td className="py-3 px-3 text-center">
                          {r.status === 'REPORTED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                              Đã nộp
                            </span>
                          ) : r.status === 'LOCKED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                              Đã khóa
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              Chưa nộp
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Summary Row */}
                    <tr className="bg-slate-100 font-black text-slate-900 text-xs sm:text-sm border-t-2 border-slate-300">
                      <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider">
                        TỔNG CỘNG TOÀN TRƯỜNG:
                      </td>
                      <td className="py-3 px-2 text-center font-black">{kitchenSummary.totalBoarding}</td>
                      <td className="py-3 px-2 text-center font-black text-blue-800">{kitchenSummary.totalBreakfast}</td>
                      <td className="py-3 px-2 text-center font-black text-amber-800">{kitchenSummary.totalLunch}</td>
                      <td className="py-3 px-2 text-center font-black text-purple-800">{kitchenSummary.totalDinner}</td>
                      <td className="py-3 px-2 text-center font-black text-rose-700">{kitchenSummary.totalAbsent}</td>
                      <td className="py-3 px-2 text-center font-black text-emerald-700 text-base">{kitchenSummary.totalMeals}</td>
                      <td className="py-3 px-3 text-center text-xs font-bold text-slate-600">
                        {kitchenSummary.reportedClasses}/{kitchenSummary.totalClasses} lớp
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: QUY ĐỊNH BÁN TRÚ (BOARDING RULES & INFORMATION) */}
      {/* ========================================================================= */}
      {activeTab === 'rules-info' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                QUY ĐỊNH BÁO ĂN BÁN TRÚ TẠI TRƯỜNG PTDTBT THCS XA DUNG
              </h3>
              <p className="text-xs text-slate-500">
                Áp dụng cho toàn bộ học sinh bán trú và giáo viên chủ nhiệm các lớp
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 font-extrabold text-blue-900 text-sm">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Thứ 2, 3, 4, 5</span>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Học sinh ăn đủ <strong>3 bữa: Sáng, Trưa, Tối</strong> tại trường.
              </p>
              <div className="pt-2 text-[11px] text-blue-600 font-semibold space-y-1">
                <div>🥣 Sáng: 06h30 - 07h00</div>
                <div>🍛 Trưa: 11h30 - 12h15</div>
                <div>🍲 Tối: 18h00 - 18h45</div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 font-extrabold text-amber-900 text-sm">
                <Home className="w-4 h-4 text-amber-600" />
                <span>Thứ 6 (Cuối tuần)</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Học sinh ăn <strong>2 bữa: Sáng, Trưa</strong>. Chiều thứ 6 sau khi tan học, học sinh về nhà với gia đình nên <strong>KHÔNG ăn tối</strong>.
              </p>
              <div className="pt-2 text-[11px] text-amber-700 font-semibold">
                ⚠️ Hệ thống mặc định tắt bữa Tối ngày Thứ 6.
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 font-extrabold text-slate-800 text-sm">
                <Calendar className="w-4 h-4 text-slate-600" />
                <span>Thứ 7 & Chủ Nhật</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Học sinh nghỉ tại gia đình. Nhà trường <strong>không tổ chức nấu ăn bán trú</strong> vào hai ngày cuối tuần.
              </p>
              <div className="pt-2 text-[11px] text-slate-500 font-medium">
                Trừ các trường hợp có thông báo bồi dưỡng/ôn thi đột xuất của BGH.
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-3">
            <h4 className="font-black text-sm text-emerald-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              CƠ CHẾ TỰ ĐỘNG CHẤM ĂN THÔNG MINH
            </h4>
            <ul className="text-xs text-emerald-800 space-y-2 list-disc list-inside leading-relaxed">
              <li>
                <strong>Học sinh KHÔNG báo vắng</strong>: Mặc định được hệ thống chấm ăn đầy đủ các bữa quy định trong ngày (Thứ 2-5: Sáng+Trưa+Tối; Thứ 6: Sáng+Trưa).
              </li>
              <li>
                <strong>Học sinh CÓ báo vắng trong Báo cáo Sĩ số</strong>: Hệ thống tự động nhận diện và chuyển sang trạng thái Vắng ăn (Tất cả bữa = 0) kèm lý do vắng.
              </li>
              <li>
                <strong>Giáo viên chủ nhiệm</strong> có thể tùy chỉnh nhanh từng học sinh (ví dụ học sinh xin không ăn tối hoặc xin về sớm) và bấm <strong>"Lưu & Gửi Báo Ăn"</strong>.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PREVIEW & CONFIRM IMPORT EXCEL */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <FileUp className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-base text-slate-900">
                  Xác nhận Import danh sách học sinh ({importFileName})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Đã đọc được <strong className="text-blue-600 font-bold">{importPreviewData.length}</strong> học sinh.
              Vui lòng xem lại trước khi nhập vào lớp <strong>{selectedClass?.class_name}</strong>:
            </p>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64">
              {importPreviewData.map((st, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-6">{idx + 1}.</span>
                    <span className="font-extrabold text-slate-900">{st.full_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{st.gender}</span>
                  </div>
                  <div className="text-slate-500">{st.village || 'Chưa rõ thôn'}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20"
              >
                Xác nhận Import ({importPreviewData.length} HS)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: QUICK PASTE TEXT ROSTER */}
      {/* ========================================================================= */}
      {showQuickPasteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-base text-slate-900">Dán danh sách học sinh bán trú</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickPasteModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Dán danh sách học sinh (mỗi dòng một học sinh). Hỗ trợ copy trực tiếp từ Word hoặc Excel:
            </p>

            <textarea
              rows={8}
              value={quickPasteText}
              onChange={(e) => setQuickPasteText(e.target.value)}
              placeholder="1. Vừ A Lềnh&#10;2. Sùng Thị Mỷ&#10;3. Mùa A Tủa&#10;4. Giàng A Phềnh..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowQuickPasteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmQuickPaste}
                className="px-5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
              >
                Thêm vào lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT SINGLE STUDENT */}
      {/* ========================================================================= */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStudentForm}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-black text-base text-slate-900">
                {editingStudent ? 'Chỉnh sửa học sinh' : 'Thêm học sinh bán trú mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Họ và tên học sinh (*):</label>
                <input
                  type="text"
                  required
                  value={studentForm.full_name}
                  onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })}
                  placeholder="Ví dụ: Vừ A Lềnh"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mã học sinh:</label>
                  <input
                    type="text"
                    value={studentForm.student_code}
                    onChange={(e) => setStudentForm({ ...studentForm, student_code: e.target.value })}
                    placeholder="HS0601"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Giới tính:</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Thôn / Bản:</label>
                  <input
                    type="text"
                    value={studentForm.village}
                    onChange={(e) => setStudentForm({ ...studentForm, village: e.target.value })}
                    placeholder="Bản Háng Đồng"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Dân tộc:</label>
                  <input
                    type="text"
                    value={studentForm.ethnicity}
                    onChange={(e) => setStudentForm({ ...studentForm, ethnicity: e.target.value })}
                    placeholder="Mông / Thái"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isBoardingCheckbox"
                  checked={studentForm.isBoarding}
                  onChange={(e) => setStudentForm({ ...studentForm, isBoarding: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="isBoardingCheckbox" className="font-bold text-slate-800 cursor-pointer">
                  Học sinh thuộc diện Bán trú (ăn ở tại trường)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20"
              >
                {editingStudent ? 'Cập nhật' : 'Thêm mới'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
