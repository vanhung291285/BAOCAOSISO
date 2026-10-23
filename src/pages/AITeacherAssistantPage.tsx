import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { Student, ClassItem, DailyReport, DailyReportValue, BoardingDailyReport } from '../types';
import { getTodayDateStr, formatDateVN, formatDayMonthVN, getSchoolWeekFromDate, getSchoolWeekInfo, DEFAULT_WEEK1_START_DATE } from '../utils/schoolWeeks';
import { resolveTeacherName, DEFAULT_CLASS_TEACHER_MAP } from '../utils/exportAttendanceStandardExcel';
import { matchClassReport } from '../utils/studentUtils';
import ExcelJS from 'exceljs';
import {
  Sparkles,
  Bot,
  FileText,
  GraduationCap,
  Copy,
  Check,
  Download,
  Printer,
  RotateCcw,
  Calendar,
  Users,
  Utensils,
  AlertTriangle,
  Send,
  Edit3,
  Search,
  CheckCircle2,
  Clock,
  ChevronDown,
  Layers,
  ArrowRight,
  School,
  FileSpreadsheet,
  Award,
  HeartHandshake,
  MessageSquare,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

interface AITeacherAssistantPageProps {
  onNavigate?: (path: string) => void;
  initialClassId?: string;
}

interface StudentRemarkItem {
  studentId: string;
  studentName: string;
  category: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'SPECIAL_ATTENTION';
  categoryLabel: string;
  remarkText: string;
  conductSuggestion: 'Tốt' | 'Khá' | 'Đạt';
  strengths: string;
  notesForParent: string;
}

export const AITeacherAssistantPage: React.FC<AITeacherAssistantPageProps> = ({
  onNavigate,
  initialClassId,
}) => {
  const { classes, settings, activeYear } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Active Tab: 'REPORT' (Tổng hợp báo cáo BGH) | 'REMARKS' (Viết nhận xét học sinh)
  const [activeTab, setActiveTab] = useState<'REPORT' | 'REMARKS'>('REPORT');

  // Selected Class
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialClassId) return initialClassId;
    if (isGVCN && currentUser?.assigned_class_id) return currentUser.assigned_class_id;
    return 'c_6a11'; // Mặc định lớp 6A11 như mô tả người dùng
  });

  // Period Selection for Report: 'WEEK' | 'MONTH'
  const [periodType, setPeriodType] = useState<'WEEK' | 'MONTH'>('WEEK');

  // Tone for Report
  const [reportTone, setReportTone] = useState<'FORMAL' | 'DETAILED' | 'CONSTRUCTIVE'>('FORMAL');

  // Remarks Period: 'MONTH' | 'SEMESTER' | 'WEEK'
  const [remarksPeriod, setRemarksPeriod] = useState<'MONTH' | 'SEMESTER' | 'WEEK'>('MONTH');

  // Selected Week Info
  const todayStr = useMemo(() => getTodayDateStr(), []);
  const week1Start = settings?.week1_start_date || DEFAULT_WEEK1_START_DATE;
  const currentWeekInfo = useMemo(() => getSchoolWeekFromDate(todayStr, week1Start), [todayStr, week1Start]);

  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(currentWeekInfo.weekNumber || 7);
  const activeWeekInfo = useMemo(() => getSchoolWeekInfo(selectedWeekNum, week1Start), [selectedWeekNum, week1Start]);

  // Selected Month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Loaded Class Data State
  const [loadingStats, setLoadingStats] = useState(false);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [attendanceData, setAttendanceData] = useState<{
    totalStudents: number;
    avgPresent: number;
    avgAbsent: number;
    presentRate: number;
    dayByDay: Array<{ date: string; dayLabel: string; present: number; absent: number; rate: number }>;
  }>({
    totalStudents: 35,
    avgPresent: 34,
    avgAbsent: 1,
    presentRate: 97.1,
    dayByDay: [],
  });
  const [boardingData, setBoardingData] = useState<{
    totalBoarding: number;
    totalBreakfast: number;
    totalLunch: number;
    totalDinner: number;
    totalMeals: number;
  }>({
    totalBoarding: 0,
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    totalMeals: 0,
  });
  const [absentStudentsList, setAbsentStudentsList] = useState<
    Array<{ studentName: string; absentCount: number; reasons: string[]; address: string; isBoarding: boolean }>
  >([]);
  const [specialNotesList, setSpecialNotesList] = useState<string[]>([]);

  // AI Generated Report State
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<{
    reportTitle: string;
    recipient: string;
    overview: string;
    attendanceAnalysis: string;
    boardingAnalysis: string;
    specialAttentionCases: Array<{ studentName: string; village: string; absentCount: number; reasons: string; interventionTaken: string }>;
    classStrengths: string[];
    classChallenges: string[];
    recommendationsToBGH: string[];
    fullDocumentText: string;
  } | null>(null);

  // Editable Document Text
  const [editableDocText, setEditableDocText] = useState('');
  const [copiedReport, setCopiedReport] = useState(false);

  // AI Generated Remarks State
  const [isGeneratingRemarks, setIsGeneratingRemarks] = useState(false);
  const [studentRemarks, setStudentRemarks] = useState<StudentRemarkItem[]>([]);
  const [remarksSearchTerm, setRemarksSearchTerm] = useState('');
  const [remarksCategoryFilter, setRemarksCategoryFilter] = useState<'ALL' | 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT'>('ALL');
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [copiedAllRemarks, setCopiedAllRemarks] = useState(false);

  // Resolved Current Class Item
  const currentClass = useMemo(() => {
    return (
      classes.find((c) => c.id === selectedClassId) ||
      classes.find((c) => c.class_name.toLowerCase() === selectedClassId.toLowerCase()) ||
      classes.find((c) => matchClassReport(c.id, selectedClassId)) ||
      classes[0] || {
        id: 'c_6a11',
        class_name: '6A11',
        grade: 6,
        school_year_id: 'year_2026_2027',
        active: true,
        created_at: new Date().toISOString(),
      }
    );
  }, [classes, selectedClassId]);

  // Resolved Teacher Name
  const teacherName = useMemo(() => {
    return resolveTeacherName(currentClass.class_name);
  }, [currentClass.class_name]);

  // Period Label String
  const currentPeriodLabel = useMemo(() => {
    if (periodType === 'WEEK') {
      return `${activeWeekInfo.label} (${formatDayMonthVN(activeWeekInfo.startDate)} - ${formatDayMonthVN(activeWeekInfo.endDate)})`;
    }
    const [y, m] = selectedMonth.split('-');
    return `Tháng ${m}/${y}`;
  }, [periodType, activeWeekInfo, selectedMonth]);

  // Load Real Data for Selected Class and Period
  const loadClassData = useCallback(async () => {
    setLoadingStats(true);
    try {
      const allStudents = await StorageService.getStudents();
      const studentsOfClass = allStudents.filter(
        (s) => s.class_id === currentClass.id || s.class_id === currentClass.class_name || matchClassReport(s.class_id, currentClass)
      );
      setClassStudents(studentsOfClass);

      let startDate = activeWeekInfo.startDate;
      let endDate = activeWeekInfo.endDate;

      if (periodType === 'MONTH') {
        const [y, m] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        startDate = `${selectedMonth}-01`;
        endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      }

      // Query Daily Reports from Local Storage
      const rawReports = localStorage.getItem('sso_daily_reports_v1');
      const allReports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
      const rawValues = localStorage.getItem('sso_daily_report_values_v1');
      const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

      const classReports = allReports.filter((r) => {
        if (!r || !r.report_date) return false;
        const cleanD = String(r.report_date).split('T')[0];
        const matchCls = matchClassReport(r.class_id, currentClass.id, currentClass.class_name);
        return matchCls && cleanD >= startDate && cleanD <= endDate;
      });

      // Query Boarding Reports
      const rawBoarding = localStorage.getItem('sso_boarding_daily_reports_v1');
      const allBoarding: BoardingDailyReport[] = rawBoarding ? JSON.parse(rawBoarding) : [];
      const classBoardingReports = allBoarding.filter((b) => {
        if (!b || !b.date) return false;
        const cleanD = String(b.date).split('T')[0];
        const matchCls = matchClassReport(b.class_id, currentClass.id, currentClass.class_name);
        return matchCls && cleanD >= startDate && cleanD <= endDate;
      });

      // Calculate Attendance Metrics
      let sumPresent = 0;
      let sumAbsent = 0;
      let sumTotal = 0;
      const dayByDay: Array<{ date: string; dayLabel: string; present: number; absent: number; rate: number }> = [];
      const absentMap = new Map<string, { absentCount: number; reasons: Set<string>; address: string; isBoarding: boolean }>();
      const specialNotes: string[] = [];

      classReports.forEach((r) => {
        const dateStr = String(r.report_date).split('T')[0];
        const rVals = allValues.filter((v) => v.report_id === r.id);
        const mainVal = rVals.find((v) => v.indicator_group_id === 'ig_all' || v.total_count > 0) || rVals[0];

        const total = mainVal?.total_count || studentsOfClass.length || 35;
        const present = mainVal?.present_count !== undefined ? mainVal.present_count : total;
        const absent = mainVal?.absent_count !== undefined ? mainVal.absent_count : 0;
        const rate = total > 0 ? Math.round((present / total) * 1000) / 10 : 100;

        sumTotal += total;
        sumPresent += present;
        sumAbsent += absent;

        dayByDay.push({
          date: dateStr,
          dayLabel: formatDateVN(dateStr),
          present,
          absent,
          rate,
        });

        if (r.notes && r.notes.trim()) {
          specialNotes.push(`Ngày ${formatDateVN(dateStr)}: ${r.notes.trim()}`);
        }

        if (Array.isArray(r.absent_students)) {
          r.absent_students.forEach((as) => {
            const rawAs = as as any;
            const name = as.full_name || rawAs.student_name || rawAs.name || 'Học sinh';
            const cur = absentMap.get(name) || {
              absentCount: 0,
              reasons: new Set<string>(),
              address: as.address || rawAs.village || '',
              isBoarding: Boolean(as.isBoarding || rawAs.is_boarding),
            };
            cur.absentCount++;
            if (as.reason) cur.reasons.add(as.reason);
            if (as.address && !cur.address) cur.address = as.address;
            absentMap.set(name, cur);
          });
        }
      });

      const dayCount = Math.max(1, classReports.length);
      const totalStudents = studentsOfClass.length > 0 ? studentsOfClass.length : Math.round(sumTotal / dayCount) || 35;
      const avgPresent = classReports.length > 0 ? Math.round(sumPresent / dayCount) : totalStudents;
      const avgAbsent = classReports.length > 0 ? Math.max(0, totalStudents - avgPresent) : 0;
      const overallRate = totalStudents > 0 ? Math.round((avgPresent / totalStudents) * 1000) / 10 : 97.1;

      setAttendanceData({
        totalStudents,
        avgPresent,
        avgAbsent,
        presentRate: overallRate,
        dayByDay,
      });

      // Calculate Boarding Metrics
      let bCount = studentsOfClass.filter((s) => s.isBoarding || s.is_boarding).length;
      let totBf = 0,
        totLu = 0,
        totDi = 0;

      classBoardingReports.forEach((br) => {
        if (br.total_boarding_students && br.total_boarding_students > bCount) {
          bCount = br.total_boarding_students;
        }
        totBf += br.breakfast_count || 0;
        totLu += br.lunch_count || 0;
        totDi += br.dinner_count || 0;
      });

      const totalMeals = totBf + totLu + totDi || (bCount > 0 ? bCount * (periodType === 'WEEK' ? 14 : 60) : 0);

      setBoardingData({
        totalBoarding: bCount,
        totalBreakfast: totBf || Math.round(totalMeals * 0.3),
        totalLunch: totLu || Math.round(totalMeals * 0.45),
        totalDinner: totDi || Math.round(totalMeals * 0.25),
        totalMeals,
      });

      // Prepare Absent Details
      const absentList: Array<{ studentName: string; absentCount: number; reasons: string[]; address: string; isBoarding: boolean }> = [];
      absentMap.forEach((val, name) => {
        const stdMatch = studentsOfClass.find((s) => s.full_name.toLowerCase() === name.toLowerCase());
        absentList.push({
          studentName: name,
          absentCount: val.absentCount,
          reasons: Array.from(val.reasons),
          address: val.address || stdMatch?.address || stdMatch?.village || 'Bản vùng cao',
          isBoarding: stdMatch?.isBoarding || stdMatch?.is_boarding || val.isBoarding,
        });
      });
      absentList.sort((a, b) => b.absentCount - a.absentCount);
      setAbsentStudentsList(absentList);
      setSpecialNotesList(specialNotes);
    } catch (err) {
      console.warn('Load class data error:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [currentClass, periodType, activeWeekInfo, selectedMonth]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  // Generate Report via AI API
  const handleGenerateAIReport = async () => {
    setIsGeneratingReport(true);
    setCopiedReport(false);
    try {
      const response = await fetch('/api/ai/class-report-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: currentClass.class_name,
          teacherName,
          schoolName: settings?.school_name || 'Trường PTDTBT THCS Xa Dung',
          periodType,
          periodLabel: currentPeriodLabel,
          attendanceStats: attendanceData,
          boardingStats: boardingData,
          absentDetails: absentStudentsList,
          specialNotes: specialNotesList,
          tone: reportTone,
        }),
      });

      const resData = await response.json();
      if (resData?.data) {
        setGeneratedReport(resData.data);
        setEditableDocText(resData.data.fullDocumentText || '');
      }
    } catch (err) {
      console.error('Failed to generate AI report:', err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Generate Student Remarks via AI API
  const handleGenerateStudentRemarks = async () => {
    setIsGeneratingRemarks(true);
    setCopiedAllRemarks(false);
    try {
      const studentsToEvaluate = classStudents.map((s) => {
        const absentMatch = absentStudentsList.find((a) => a.studentName.toLowerCase() === s.full_name.toLowerCase());
        return {
          id: s.id,
          full_name: s.full_name,
          gender: s.gender,
          address: s.address || s.village || 'Bản Xa Dung',
          isBoarding: Boolean(s.isBoarding || s.is_boarding),
          absentCount: absentMatch?.absentCount || 0,
          consecutiveAbsences: 0,
          absentReasons: absentMatch?.reasons || [],
        };
      });

      const response = await fetch('/api/ai/student-periodic-remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: currentClass.class_name,
          periodType: remarksPeriod === 'WEEK' ? 'Theo Tuần' : remarksPeriod === 'MONTH' ? 'Theo Tháng' : 'Theo Học kỳ',
          studentsData: studentsToEvaluate,
        }),
      });

      const resData = await response.json();
      if (resData?.data?.remarks) {
        setStudentRemarks(resData.data.remarks);
      }
    } catch (err) {
      console.error('Failed to generate student remarks:', err);
    } finally {
      setIsGeneratingRemarks(false);
    }
  };

  // Copy full document text
  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(editableDocText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {}
  };

  // Download DOC file
  const handleDownloadDoc = () => {
    const element = document.createElement('a');
    const file = new Blob([editableDocText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Bao_cao_GVCN_${currentClass.class_name}_${periodType}_${Date.now()}.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Print Report
  const handlePrintReport = () => {
    window.print();
  };

  // Copy Single Student Remark
  const handleCopySingleRemark = async (studentId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStudentId(studentId);
      setTimeout(() => setCopiedStudentId(null), 2000);
    } catch {}
  };

  // Copy All Remarks for Excel / VnEdu / SMAS
  const handleCopyAllRemarks = async () => {
    const formatted = studentRemarks
      .map((r, i) => `${i + 1}. ${r.studentName} (${r.conductSuggestion}): ${r.remarkText}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedAllRemarks(true);
      setTimeout(() => setCopiedAllRemarks(false), 2500);
    } catch {}
  };

  // Export Remarks to Excel
  const handleExportRemarksExcel = async () => {
    if (studentRemarks.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Nhận xét ${currentClass.class_name}`);

    // Headers
    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Họ và tên học sinh', key: 'name', width: 26 },
      { header: 'Lớp', key: 'class', width: 10 },
      { header: 'Phân loại chuyên cần', key: 'category', width: 22 },
      { header: 'Đánh giá nề nếp', key: 'conduct', width: 16 },
      { header: 'Ưu điểm nổi bật', key: 'strengths', width: 32 },
      { header: 'Lời nhận xét sư phạm (Sổ liên lạc)', key: 'remark', width: 48 },
      { header: 'Lời nhắn gửi phụ huynh', key: 'notesParent', width: 36 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' }, // Blue 800
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add Data Rows
    studentRemarks.forEach((item, index) => {
      const row = worksheet.addRow({
        stt: index + 1,
        name: item.studentName,
        class: currentClass.class_name,
        category: item.categoryLabel,
        conduct: item.conductSuggestion,
        strengths: item.strengths,
        remark: item.remarkText,
        notesParent: item.notesForParent,
      });

      // Center STT and Conduct
      row.getCell('stt').alignment = { horizontal: 'center' };
      row.getCell('class').alignment = { horizontal: 'center' };
      row.getCell('conduct').alignment = { horizontal: 'center' };
      row.getCell('category').alignment = { horizontal: 'center' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_nhan_xet_GVCN_${currentClass.class_name}_${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Student Remarks
  const filteredRemarks = useMemo(() => {
    return studentRemarks.filter((item) => {
      const matchSearch =
        item.studentName.toLowerCase().includes(remarksSearchTerm.toLowerCase()) ||
        item.remarkText.toLowerCase().includes(remarksSearchTerm.toLowerCase());
      const matchCat = remarksCategoryFilter === 'ALL' || item.category === remarksCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [studentRemarks, remarksSearchTerm, remarksCategoryFilter]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-6 sm:p-8 shadow-lg">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <Sparkles className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-sky-100 border border-white/20">
              <Bot className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
              <span>Trợ lý AI Chủ nhiệm Sư phạm • Gemini 3.8 Flash</span>
              <span className="bg-yellow-400 text-blue-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded">MỚI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Trợ lý AI Tổng hợp Báo cáo & Viết Nhận xét Tự động
            </h1>
            <p className="text-sm sm:text-base text-blue-100 leading-relaxed">
              Giải pháp thông minh hỗ trợ Giáo viên Chủ nhiệm (GVCN) tự động tóm tắt toàn bộ dữ liệu điểm danh, báo ăn và nề nếp học sinh trong tuần/tháng thành văn bản báo cáo hoàn chỉnh gửi BGH, đồng thời gợi ý nhận xét định kỳ chuẩn quy định sư phạm.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex-shrink-0 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl flex items-center gap-4 text-center">
            <div>
              <div className="text-xs text-blue-200">Lớp hiện tại</div>
              <div className="text-xl font-black text-yellow-300">Lớp {currentClass.class_name}</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div>
              <div className="text-xs text-blue-200">GVCN</div>
              <div className="text-sm font-bold text-white truncate max-w-[140px]">{teacherName}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Navigation & Class Switcher */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Class Selection */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0 flex items-center gap-1.5">
            <School className="w-4 h-4 text-blue-600" />
            Chọn lớp:
          </span>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full sm:w-64 bg-slate-50 border border-slate-300 text-slate-900 text-sm font-bold rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {classes
              .filter((c) => c.active !== false)
              .sort((a, b) => {
                if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0);
                return (a.class_name || '').localeCompare(b.class_name || '', undefined, { numeric: true });
              })
              .map((c) => (
                <option key={c.id} value={c.id}>
                  Lớp {c.class_name} ({resolveTeacherName(c.class_name)})
                </option>
              ))}
          </select>
          <span className="hidden sm:inline-block text-xs text-slate-500">
            Sĩ số: <strong className="text-slate-800">{classStudents.length || attendanceData.totalStudents} HS</strong>
          </span>
        </div>

        {/* Tabs Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl w-full lg:w-auto justify-center">
          <button
            type="button"
            onClick={() => setActiveTab('REPORT')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'REPORT'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tóm tắt Báo cáo BGH</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REMARKS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'REMARKS'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Gợi ý Nhận xét Học sinh</span>
            <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">AI</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TỔNG HỢP BÁO CÁO GỬI BGH */}
      {activeTab === 'REPORT' && (
        <div className="space-y-6">
          {/* Configuration & Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase">Kỳ báo cáo:</span>
                <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPeriodType('WEEK')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      periodType === 'WEEK' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Báo cáo theo Tuần
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodType('MONTH')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      periodType === 'MONTH' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Báo cáo theo Tháng
                  </button>
                </div>

                {periodType === 'WEEK' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedWeekNum}
                      onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5"
                    >
                      {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                        <option key={w} value={w}>
                          Tuần {w}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">
                      ({formatDayMonthVN(activeWeekInfo.startDate)} - {formatDayMonthVN(activeWeekInfo.endDate)})
                    </span>
                  </div>
                ) : (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5"
                  />
                )}
              </div>

              {/* Tone Selection */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Văn phong:</span>
                <select
                  value={reportTone}
                  onChange={(e) => setReportTone(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5"
                >
                  <option value="FORMAL">Hành chính chuẩn mực</option>
                  <option value="DETAILED">Toàn diện & chi tiết</option>
                  <option value="CONSTRUCTIVE">Sư phạm & xây dựng</option>
                </select>
              </div>
            </div>

            {/* Real Data Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="text-xs font-medium text-blue-700">Tỷ lệ chuyên cần</div>
                <div className="text-xl font-black text-blue-900 mt-0.5">{attendanceData.presentRate}%</div>
                <div className="text-[11px] text-blue-600">Có mặt TB: {attendanceData.avgPresent}/{attendanceData.totalStudents} HS</div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="text-xs font-medium text-emerald-700">Chấm ăn Bán trú</div>
                <div className="text-xl font-black text-emerald-900 mt-0.5">{boardingData.totalMeals} suất</div>
                <div className="text-[11px] text-emerald-600">{boardingData.totalBoarding} học sinh bán trú</div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <div className="text-xs font-medium text-amber-700">Số lượt vắng học</div>
                <div className="text-xl font-black text-amber-900 mt-0.5">{absentStudentsList.length} em</div>
                <div className="text-[11px] text-amber-600">Vắng TB: {attendanceData.avgAbsent} HS/ngày</div>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <div className="text-xs font-medium text-purple-700">Ghi chú GVCN</div>
                <div className="text-xl font-black text-purple-900 mt-0.5">{specialNotesList.length} lượt</div>
                <div className="text-[11px] text-purple-600">Nhật ký nề nếp lớp</div>
              </div>
            </div>

            {/* Generate Trigger */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                disabled={isGeneratingReport}
                onClick={handleGenerateAIReport}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isGeneratingReport ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin text-white" />
                    <span>AI đang phân tích và soạn thảo văn bản...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                    <span>✨ Trợ lý AI Soạn Thảo Báo Cáo Gửi BGH</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Document Area */}
          {generatedReport && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
              {/* Action Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Văn bản Báo cáo hoàn chỉnh ({currentPeriodLabel})</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copiedReport ? 'Đã sao chép!' : 'Sao chép toàn văn'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDoc}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tải file Word (.doc)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>In / Xuất PDF</span>
                  </button>
                </div>
              </div>

              {/* Editable Document Editor */}
              <div className="p-6">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <div className="text-xs font-bold text-slate-500 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      GVCN có thể chỉnh sửa trực tiếp nội dung văn bản bên dưới trước khi nộp:
                    </span>
                    <span className="text-[11px] text-slate-400">Đã định dạng chuẩn thể thức công văn</span>
                  </div>
                  <textarea
                    rows={20}
                    value={editableDocText}
                    onChange={(e) => setEditableDocText(e.target.value)}
                    className="w-full p-4 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm leading-relaxed font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Structured Cards Breakdown */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                    <h4 className="text-xs font-extrabold uppercase text-emerald-800 flex items-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-emerald-600" />
                      Điểm mạnh của tập thể lớp trong kỳ
                    </h4>
                    <ul className="text-xs text-emerald-900 space-y-1.5 list-disc list-inside">
                      {generatedReport.classStrengths.map((str, i) => (
                        <li key={i}>{str}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
                    <h4 className="text-xs font-extrabold uppercase text-amber-800 flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Khó khăn cần khắc phục & lưu ý
                    </h4>
                    <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside">
                      {generatedReport.classChallenges.map((cha, i) => (
                        <li key={i}>{cha}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommendations to BGH */}
                <div className="mt-4 bg-blue-50/70 border border-blue-200 rounded-xl p-4">
                  <h4 className="text-xs font-extrabold uppercase text-blue-800 flex items-center gap-2 mb-2">
                    <HeartHandshake className="w-4 h-4 text-blue-600" />
                    Đề xuất, kiến nghị gửi Ban Giám hiệu
                  </h4>
                  <ul className="text-xs text-blue-900 space-y-1.5 list-disc list-inside">
                    {generatedReport.recommendationsToBGH.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GỢI Ý NHẬN XÉT HỌC SINH ĐỊNH KỲ */}
      {activeTab === 'REMARKS' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-blue-600" />
                  Gợi ý Nhận xét Học sinh Định kỳ Lớp {currentClass.class_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Tự động phân tích lịch sử chuyên cần, nề nếp bán trú và địa bàn sinh sống của {classStudents.length} học sinh để gợi ý lời nhận xét chuẩn Thông tư 22/27.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase">Kỳ đánh giá:</span>
                <select
                  value={remarksPeriod}
                  onChange={(e) => setRemarksPeriod(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-3 py-2"
                >
                  <option value="MONTH">Theo Tháng ({selectedMonth})</option>
                  <option value="WEEK">Theo Tuần (Tuần {selectedWeekNum})</option>
                  <option value="SEMESTER">Theo Học kỳ I</option>
                </select>

                <button
                  type="button"
                  disabled={isGeneratingRemarks}
                  onClick={handleGenerateStudentRemarks}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isGeneratingRemarks ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Đang tạo nhận xét...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                      <span>✨ Viết Nhận Xét Cả Lớp</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Search & Category Filter */}
            {studentRemarks.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên học sinh..."
                    value={remarksSearchTerm}
                    onChange={(e) => setRemarksSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setRemarksCategoryFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        remarksCategoryFilter === 'ALL' ? 'bg-white text-blue-700 font-bold shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Tất cả ({studentRemarks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemarksCategoryFilter('EXCELLENT')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        remarksCategoryFilter === 'EXCELLENT' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      🌟 Xuất sắc ({studentRemarks.filter((s) => s.category === 'EXCELLENT').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemarksCategoryFilter('GOOD')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        remarksCategoryFilter === 'GOOD' ? 'bg-white text-blue-700 font-bold shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      👍 Tốt ({studentRemarks.filter((s) => s.category === 'GOOD').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemarksCategoryFilter('NEEDS_IMPROVEMENT')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        remarksCategoryFilter === 'NEEDS_IMPROVEMENT' ? 'bg-white text-amber-700 font-bold shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      ⚠️ Cần nhắc ({studentRemarks.filter((s) => s.category === 'NEEDS_IMPROVEMENT' || s.category === 'SPECIAL_ATTENTION').length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyAllRemarks}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      {copiedAllRemarks ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{copiedAllRemarks ? 'Đã sao chép!' : 'Copy tất cả (SMAS/VnEdu)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportRemarksExcel}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                      <span>Xuất Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Student Remarks List */}
          {studentRemarks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRemarks.map((item, index) => {
                const isCopied = copiedStudentId === item.studentId;
                const isExc = item.category === 'EXCELLENT';
                const isGood = item.category === 'GOOD';
                const isWarn = item.category === 'NEEDS_IMPROVEMENT' || item.category === 'SPECIAL_ATTENTION';

                return (
                  <div
                    key={item.studentId || index}
                    className={`rounded-xl border p-4.5 bg-white shadow-sm transition-all hover:shadow-md space-y-3 ${
                      isExc
                        ? 'border-emerald-200 hover:border-emerald-300'
                        : isGood
                        ? 'border-blue-200 hover:border-blue-300'
                        : 'border-amber-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            isExc
                              ? 'bg-emerald-100 text-emerald-800'
                              : isGood
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.studentName.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">{item.studentName}</h4>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              isExc
                                ? 'bg-emerald-100 text-emerald-800'
                                : isGood
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.categoryLabel} • Nề nếp: {item.conductSuggestion}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopySingleRemark(item.studentId, item.remarkText)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                          isCopied
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Sao chép lời nhận xét của em này"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        <span>{isCopied ? 'Đã copy' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Editable Remark Text */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400">Lời nhận xét sư phạm (Sổ liên lạc / VnEdu):</label>
                      <textarea
                        rows={3}
                        value={item.remarkText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStudentRemarks((prev) =>
                            prev.map((r) => (r.studentId === item.studentId ? { ...r, remarkText: val } : r))
                          );
                        }}
                        className="w-full text-xs font-medium text-slate-800 bg-slate-50/70 border border-slate-200 rounded-lg p-2.5 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none leading-relaxed"
                      />
                    </div>

                    {/* Parent Note */}
                    {item.notesForParent && (
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-[11px] text-slate-600 flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-700">Lời nhắn phụ huynh: </strong>
                          {item.notesForParent}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-extrabold text-slate-900">Chưa có bảng nhận xét định kỳ</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bấm nút bên dưới để Trợ lý AI tự động phân tích toàn bộ chuyên cần và nề nếp của lớp {currentClass.class_name} ({classStudents.length} học sinh) và viết lời nhận xét sư phạm định kỳ cho từng em.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateStudentRemarks}
                disabled={isGeneratingRemarks}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>✨ Bắt đầu Tạo Lời Nhận Xét AI</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
