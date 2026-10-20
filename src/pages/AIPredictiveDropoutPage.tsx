import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { DailyReport, Student } from '../types';
import {
  AIPredictiveService,
  StudentDropoutRisk,
  InterventionLog,
  AISchoolReport,
  AIIndividualPlan,
  RiskLevel,
} from '../services/aiPredictiveService';
import {
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  UserCheck,
  UserX,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Filter,
  Brain,
  Calendar,
  MapPin,
  Utensils,
  Home,
  CheckCircle2,
  Clock,
  Phone,
  Eye,
  Plus,
  Trash2,
  Share2,
  ArrowRight,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  Compass,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface AIPredictiveDropoutPageProps {
  onNavigate?: (path: string) => void;
}

export const AIPredictiveDropoutPage: React.FC<AIPredictiveDropoutPageProps> = ({ onNavigate }) => {
  const { students, classes, activeYear, settings } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'early-warning' | 'school-insights' | 'intervention-log'>('early-warning');

  // Reports data state
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(true);

  // Intervention logs
  const [interventionLogs, setInterventionLogs] = useState<InterventionLog[]>(() => {
    return AIPredictiveService.getInterventionLogs();
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    return 'ALL';
  });
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('ALL');
  const [selectedBoardingFilter, setSelectedBoardingFilter] = useState<'ALL' | 'BOARDING' | 'DAY'>('ALL');
  const [selectedVillage, setSelectedVillage] = useState<string>('ALL');

  // AI Modal States
  const [selectedStudentForAI, setSelectedStudentForAI] = useState<StudentDropoutRisk | null>(null);
  const [isGeneratingAIPlan, setIsGeneratingAIPlan] = useState<boolean>(false);
  const [aiIndividualPlan, setAiIndividualPlan] = useState<AIIndividualPlan | null>(null);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);

  // School-wide AI Report state
  const [schoolAIReport, setSchoolAIReport] = useState<AISchoolReport | null>(null);
  const [isGeneratingSchoolReport, setIsGeneratingSchoolReport] = useState<boolean>(false);
  const [schoolReportError, setSchoolReportError] = useState<string | null>(null);

  // Log Intervention Modal State
  const [loggingForStudent, setLoggingForStudent] = useState<StudentDropoutRisk | null>(null);
  const [logActionType, setLogActionType] = useState<InterventionLog['actionType']>('HOME_VISIT');
  const [logResult, setLogResult] = useState<InterventionLog['result']>('MONITORING');
  const [logNotes, setLogNotes] = useState('');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load all daily reports for this academic year
  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    try {
      const allReports = await StorageService.getDailyReports();
      setReports(allReports);
    } catch (e) {
      console.error('Failed to load reports for AI prediction:', e);
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    loadReports();

    const handleInterventionChange = () => {
      setInterventionLogs(AIPredictiveService.getInterventionLogs());
    };

    window.addEventListener('ai_intervention_logged', handleInterventionChange);
    window.addEventListener('ai_intervention_deleted', handleInterventionChange);

    return () => {
      window.removeEventListener('ai_intervention_logged', handleInterventionChange);
      window.removeEventListener('ai_intervention_deleted', handleInterventionChange);
    };
  }, [loadReports]);

  // Compute Dropout Risks for all students
  const allStudentRisks = useMemo(() => {
    return AIPredictiveService.calculateDropoutRisk(students, classes, reports, activeYear?.id);
  }, [students, classes, reports, activeYear?.id]);

  // School risk statistics
  const schoolStats = useMemo(() => {
    return AIPredictiveService.getSchoolRiskStats(allStudentRisks);
  }, [allStudentRisks]);

  // Extract unique villages
  const uniqueVillages = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const v = (s.address || s.village || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [students]);

  // Filtered risks
  const filteredRisks = useMemo(() => {
    return allStudentRisks.filter((r) => {
      // Teacher restriction: GVCN only sees their class if not BGH/Admin
      if (isGVCN && !isBGH && !isAdmin && currentUser?.assigned_class_id) {
        if (r.student.class_id !== currentUser.assigned_class_id) {
          return false;
        }
      }

      // Class Filter
      if (selectedClassId !== 'ALL' && r.student.class_id !== selectedClassId) {
        return false;
      }

      // Grade Filter
      if (selectedGrade !== 'ALL') {
        const gNum = parseInt(selectedGrade, 10);
        if (r.classItem?.grade !== gNum) return false;
      }

      // Risk Level Filter
      if (selectedRiskLevel !== 'ALL' && r.riskLevel !== selectedRiskLevel) {
        return false;
      }

      // Boarding Filter
      if (selectedBoardingFilter === 'BOARDING' && !r.student.isBoarding) return false;
      if (selectedBoardingFilter === 'DAY' && r.student.isBoarding) return false;

      // Village Filter
      if (selectedVillage !== 'ALL') {
        const v = (r.student.address || r.student.village || '').trim();
        if (v !== selectedVillage) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = r.student.full_name.toLowerCase().includes(q);
        const classMatch = (r.classItem?.class_name || '').toLowerCase().includes(q);
        const villageMatch = (r.student.address || r.student.village || '').toLowerCase().includes(q);
        if (!nameMatch && !classMatch && !villageMatch) return false;
      }

      return true;
    });
  }, [
    allStudentRisks,
    isGVCN,
    isBGH,
    isAdmin,
    currentUser,
    selectedClassId,
    selectedGrade,
    selectedRiskLevel,
    selectedBoardingFilter,
    selectedVillage,
    searchQuery,
  ]);

  // Trigger Individual AI Assessment
  const handleOpenAIAssessment = async (item: StudentDropoutRisk) => {
    setSelectedStudentForAI(item);
    setAiIndividualPlan(null);
    setAiPlanError(null);
    setIsGeneratingAIPlan(true);

    try {
      const plan = await AIPredictiveService.generateIndividualInterventionPlan({
        student: {
          ...item.student,
          class_name: item.classItem?.class_name,
        },
        absenceHistory: {
          totalDaysAbsent: item.totalDaysAbsent,
          consecutiveAbsences: item.consecutiveAbsences,
          recentAbsences: item.recentAbsences,
        },
        riskScore: item.riskScore,
        schoolName: settings?.school_name || 'Trường PTDTBT THCS Xa Dung',
      });
      setAiIndividualPlan(plan);
    } catch (err: any) {
      console.error(err);
      setAiPlanError(err.message || 'Lỗi khi kết nối mô hình Gemini AI.');
    } finally {
      setIsGeneratingAIPlan(false);
    }
  };

  // Trigger School-wide AI Report
  const handleGenerateSchoolAIReport = async () => {
    setIsGeneratingSchoolReport(true);
    setSchoolReportError(null);

    try {
      const highRisk = allStudentRisks.slice(0, 15).map((r) => ({
        name: r.student.full_name,
        class: r.classItem?.class_name,
        village: r.student.address || r.student.village,
        isBoarding: r.student.isBoarding,
        riskScore: r.riskScore,
        consecutiveAbsences: r.consecutiveAbsences,
        totalAbsences: r.totalDaysAbsent,
        recentReasons: r.recentAbsences.map((a) => a.reason).filter(Boolean).slice(0, 3),
      }));

      const report = await AIPredictiveService.generateSchoolReport({
        schoolName: settings?.school_name || 'Trường PTDTBT THCS Xa Dung',
        activeYear: activeYear?.name || '2026-2027',
        totalStudents: students.length,
        stats: schoolStats,
        highRiskStudents: highRisk,
        recentAbsentRecords: schoolStats.topRiskVillages,
      });

      setSchoolAIReport(report);
    } catch (err: any) {
      console.error(err);
      setSchoolReportError(err.message || 'Lỗi khi tạo báo cáo chiến lược AI.');
    } finally {
      setIsGeneratingSchoolReport(false);
    }
  };

  // Save intervention log
  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggingForStudent) return;

    AIPredictiveService.saveInterventionLog({
      studentId: loggingForStudent.student.id,
      studentName: loggingForStudent.student.full_name,
      classId: loggingForStudent.student.class_id,
      className: loggingForStudent.classItem?.class_name || loggingForStudent.student.class_id,
      date: logDate,
      actionType: logActionType,
      conductedBy: currentUser?.full_name || 'Giáo viên',
      conductedRole: currentUser?.role || 'GVCN',
      result: logResult,
      notes: logNotes.trim(),
    });

    setLoggingForStudent(null);
    setLogNotes('');
  };

  // Export to Excel
  const handleExportExcel = () => {
    const rows = filteredRisks.map((r, idx) => ({
      STT: idx + 1,
      'Họ và tên': r.student.full_name,
      Lớp: r.classItem?.class_name || r.student.class_id,
      Khối: r.classItem?.grade || '',
      'Bản / Địa chỉ': r.student.address || r.student.village || '',
      'Loại hình': r.student.isBoarding ? 'Bán trú' : 'Ngoại trú',
      'Điểm rủi ro (%)': `${r.riskScore}%`,
      'Mức độ nguy cơ':
        r.riskLevel === 'CRITICAL'
          ? 'Nghiêm trọng (Nguy cơ bỏ học)'
          : r.riskLevel === 'HIGH'
          ? 'Cao (Vắng ngắt quãng)'
          : r.riskLevel === 'MODERATE'
          ? 'Trung bình'
          : 'Thấp',
      'Tổng ngày vắng': r.totalDaysAbsent,
      'Vắng liên tiếp gần nhất': r.consecutiveAbsences,
      'Cảnh báo sớm': r.warningFlags.join('; '),
      'Ngày vắng gần nhất': r.lastAbsentDate || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Canh_Bao_Bo_Hoc_AI');
    XLSX.writeFile(wb, `Canh_Bao_Bo_Hoc_AI_${activeYear?.name || '2026-2027'}.xlsx`);
  };

  // Helpers for badge colors
  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-300',
          label: 'Nghiêm trọng (Khẩn cấp)',
          color: 'text-rose-600',
        };
      case 'HIGH':
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          label: 'Nguy cơ Cao (Nghỉ ngắt quãng)',
          color: 'text-amber-600',
        };
      case 'MODERATE':
        return {
          bg: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          label: 'Trung bình (Cần theo dõi)',
          color: 'text-yellow-600',
        };
      default:
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          label: 'An toàn / Ổn định',
          color: 'text-emerald-600',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-500/30 text-blue-200 border border-blue-400/40 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                HỆ THỐNG AI PREDICTIVE (MÁY HỌC DỰ BÁO)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white border border-white/20 backdrop-blur-md">
                <Brain className="w-3.5 h-3.5 text-indigo-300" />
                Mô hình: Gemini 3.8 Flash
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <Calendar className="w-3.5 h-3.5" />
                Năm học: {activeYear?.name || '2026-2027'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight uppercase leading-tight">
              DỰ BÁO SỚM NGUY CƠ NGHỈ HỌC / BỎ HỌC (EARLY WARNING)
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              Ứng dụng mô hình học máy phân tích dữ liệu chuyên cần lịch sử, tự động phát hiện học sinh có biểu hiện nghỉ học ngắt quãng hoặc dấu hiệu bất thường, gửi cảnh báo sớm để Ban Giám hiệu và Giáo viên chủ nhiệm kịp thời phối hợp với gia đình và bản làng vận động học sinh đến trường.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 shadow-sm cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Xuất danh sách Excel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('school-insights');
                if (!schoolAIReport) {
                  handleGenerateSchoolAIReport();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Brain className="w-4 h-4 text-amber-300" />
              <span>Phân tích Chiến lược AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Critical */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-rose-700 tracking-wider">Cảnh báo Đỏ</span>
            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-rose-600">{schoolStats.criticalCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Nguy cơ bỏ học nghiêm trọng</div>
          </div>
        </div>

        {/* High */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-amber-700 tracking-wider">Nguy cơ Cao</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-amber-600">{schoolStats.highCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Vắng ngắt quãng thường xuyên</div>
          </div>
        </div>

        {/* Moderate */}
        <div className="bg-white p-4 rounded-2xl border border-yellow-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-yellow-700 tracking-wider">Cần Theo Dõi</span>
            <div className="w-7 h-7 rounded-lg bg-yellow-100 text-yellow-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-yellow-600">{schoolStats.moderateCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Có dấu hiệu vắng rải rác</div>
          </div>
        </div>

        {/* Safe / Low */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-emerald-700 tracking-wider">Chuyên Cần Tốt</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">{schoolStats.lowCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Học sinh đi học ổn định</div>
          </div>
        </div>

        {/* Interventions Logged */}
        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-blue-700 tracking-wider">Đã Vận Động</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-blue-600">{interventionLogs.length}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Lượt can thiệp đã ghi nhận</div>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('early-warning')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'early-warning'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Danh Sách Cảnh Báo Sớm ({filteredRisks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('school-insights');
            if (!schoolAIReport && !isGeneratingSchoolReport) {
              handleGenerateSchoolAIReport();
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'school-insights'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Brain className="w-4 h-4 text-amber-300" />
          <span>Chiến Lược AI Toàn Trường</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('intervention-log')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'intervention-log'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Nhật Ký Vận Động ({interventionLogs.length})</span>
        </button>
      </div>

      {/* 4. Tab 1: Early Warning List */}
      {activeTab === 'early-warning' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên học sinh, lớp hoặc bản làng..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Class Filter */}
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tất cả các lớp ({classes.length})</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    Lớp {cls.class_name}
                  </option>
                ))}
              </select>

              {/* Grade Filter */}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tất cả các khối</option>
                <option value="6">Khối 6</option>
                <option value="7">Khối 7</option>
                <option value="8">Khối 8</option>
                <option value="9">Khối 9</option>
              </select>

              {/* Risk Level Filter */}
              <select
                value={selectedRiskLevel}
                onChange={(e) => setSelectedRiskLevel(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tất cả mức độ nguy cơ</option>
                <option value="CRITICAL">🔴 Cảnh báo Đỏ (Khẩn cấp)</option>
                <option value="HIGH">🟠 Nguy cơ Cao</option>
                <option value="MODERATE">🟡 Cần theo dõi</option>
                <option value="LOW">🟢 Chuyên cần tốt</option>
              </select>
            </div>

            {/* Sub-filters row */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs font-semibold text-slate-600">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Lọc nhanh:</span>

              {/* Boarding Type */}
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setSelectedBoardingFilter('ALL')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    selectedBoardingFilter === 'ALL' ? 'bg-white shadow-xs text-blue-700' : 'text-slate-600'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBoardingFilter('BOARDING')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    selectedBoardingFilter === 'BOARDING' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Bán trú
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBoardingFilter('DAY')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    selectedBoardingFilter === 'DAY' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Ngoại trú
                </button>
              </div>

              {/* Village dropdown */}
              <div className="flex items-center gap-1.5 ml-auto">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedVillage}
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white"
                >
                  <option value="ALL">Tất cả bản làng ({uniqueVillages.length})</option>
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      Bản {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* List of at-risk students */}
          {isLoadingReports ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <div className="text-sm font-bold text-slate-800">Đang nạp và phân tích dữ liệu chuyên cần học sinh...</div>
              <div className="text-xs text-slate-400 mt-1">Mô hình AI đang quét các chuỗi ngày vắng trong năm học {activeYear?.name}</div>
            </div>
          ) : filteredRisks.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <div className="text-base font-bold text-slate-900">Không tìm thấy học sinh nào trong diện này!</div>
              <div className="text-xs text-slate-500 mt-1">Chuyên cần của các em học sinh đang ở mức ổn định hoặc không khớp với bộ lọc.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRisks.map((item) => {
                const badge = getRiskBadge(item.riskLevel);
                const hasLogs = interventionLogs.some((l) => l.studentId === item.student.id);

                return (
                  <div
                    key={item.student.id}
                    className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md flex flex-col justify-between ${
                      item.riskLevel === 'CRITICAL'
                        ? 'border-rose-300 ring-2 ring-rose-400/20'
                        : item.riskLevel === 'HIGH'
                        ? 'border-amber-300'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-2xs ${
                              item.riskLevel === 'CRITICAL'
                                ? 'bg-rose-600 text-white'
                                : item.riskLevel === 'HIGH'
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-700 text-white'
                            }`}
                          >
                            {item.student.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-slate-900 text-sm truncate leading-snug">
                              {item.student.full_name}
                            </h3>
                            <div className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                              <span className="text-blue-800 font-bold">Lớp {item.classItem?.class_name || item.student.class_id}</span>
                              {item.student.gender && (
                                <span className="text-[11px] text-slate-400">• {item.student.gender}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Risk Gauge Badge */}
                        <div className="text-right shrink-0">
                          <div className={`text-xs font-black px-2.5 py-1 rounded-xl border ${badge.bg}`}>
                            {badge.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold mt-1">
                            Rủi ro: <strong className={badge.color}>{item.riskScore}%</strong>
                          </div>
                        </div>
                      </div>

                      {/* Location & Boarding Details */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {item.student.address || item.student.village || 'Chưa cập nhật bản'}
                        </span>
                        {item.student.isBoarding ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-bold">
                            <Utensils className="w-3 h-3 text-amber-600" />
                            Bán trú
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md font-medium">
                            <Home className="w-3 h-3 text-blue-600" />
                            Ngoại trú
                          </span>
                        )}
                      </div>

                      {/* Risk Score Progress Bar */}
                      <div className="mb-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                          <span>Chỉ số rủi ro (DRI)</span>
                          <span className={`font-black ${badge.color}`}>{item.riskScore}/100</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              item.riskLevel === 'CRITICAL'
                                ? 'bg-rose-500'
                                : item.riskLevel === 'HIGH'
                                ? 'bg-amber-500'
                                : item.riskLevel === 'MODERATE'
                                ? 'bg-yellow-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${item.riskScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Early Warning Flags */}
                      <div className="space-y-1 mb-3">
                        <div className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                          Dấu hiệu bất thường:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.warningFlags.map((flag, fIdx) => (
                            <span
                              key={fIdx}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold bg-rose-50 text-rose-800 border border-rose-200/80"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Recent Absence History Snippet */}
                      {item.recentAbsences.length > 0 && (
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 mb-3 space-y-1 text-xs">
                          <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                            <span>Lịch sử vắng gần nhất ({item.totalDaysAbsent} buổi):</span>
                            <span className="text-slate-400">Gần nhất: {item.lastAbsentDate}</span>
                          </div>
                          <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                            {item.recentAbsences.slice(0, 3).map((ab, aIdx) => (
                              <div key={aIdx} className="flex items-center justify-between text-[11px] text-slate-600">
                                <span className="font-medium">
                                  {ab.date} ({ab.dayOfWeek})
                                </span>
                                <span className="text-slate-500 italic truncate max-w-[150px]">{ab.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenAIAssessment(item)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        <Brain className="w-3.5 h-3.5 text-amber-300" />
                        <span>AI Phân Tích & Kế Hoạch</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLoggingForStudent(item)}
                        title="Ghi nhận hành động vận động / can thiệp"
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                          hasLogs
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{hasLogs ? 'Đã vận động' : '+ Vận động'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. Tab 2: School-wide AI Insights */}
      {activeTab === 'school-insights' && (
        <div className="space-y-5">
          {/* Header Action Card */}
          <div className="bg-white rounded-2xl p-5 border border-indigo-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                <span>BÁO CÁO CHIẾN LƯỢC AI DỰ BÁO TOÀN TRƯỜNG</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Được tổng hợp và phân tích chuyên sâu bởi mô hình Gemini 3.8 Flash dựa trên toàn bộ dữ liệu chuyên cần trường PTDTBT THCS Xa Dung
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateSchoolAIReport}
              disabled={isGeneratingSchoolReport}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isGeneratingSchoolReport ? 'animate-spin' : ''}`} />
              <span>{isGeneratingSchoolReport ? 'Đang phân tích...' : 'Cập nhật phân tích AI mới'}</span>
            </button>
          </div>

          {isGeneratingSchoolReport ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
              <Brain className="w-10 h-10 text-indigo-600 animate-bounce mx-auto mb-3" />
              <div className="text-sm font-bold text-slate-900">Gemini 3.8 Flash đang phân tích dữ liệu chuyên cần toàn trường...</div>
              <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Hệ thống đang xâu chuỗi dữ liệu vắng của {students.length} học sinh qua các ngày học, đối chiếu đặc thù bản làng và mùa vụ vùng cao Điện Biên.
              </div>
            </div>
          ) : schoolReportError ? (
            <div className="bg-rose-50 rounded-2xl p-6 border border-rose-200 text-rose-800 text-xs">
              <div className="font-bold flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Lỗi phân tích AI:</span>
              </div>
              <div>{schoolReportError}</div>
              <button
                type="button"
                onClick={handleGenerateSchoolAIReport}
                className="mt-3 px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg"
              >
                Thử lại
              </button>
            </div>
          ) : schoolAIReport ? (
            <div className="space-y-4">
              {/* Executive Summary Card */}
              <div className="bg-gradient-to-br from-indigo-50/80 to-blue-50/80 rounded-2xl p-5 border border-indigo-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    ĐÁNH GIÁ TỔNG QUAN TỪ AI
                  </span>
                  <span
                    className={`text-xs font-black px-3 py-1 rounded-full border ${
                      schoolAIReport.overallRiskLevel === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : schoolAIReport.overallRiskLevel === 'HIGH'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    Mức rủi ro toàn trường: {schoolAIReport.overallRiskLevel}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                  {schoolAIReport.summary}
                </p>
              </div>

              {/* Grid 2 Columns: Patterns & Hotspots */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Patterns */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                    <Compass className="w-4 h-4 text-blue-600" />
                    <span>CÁC QUY LUẬT NGHỈ HỌC BẤT THƯỜNG PHÁT HIỆN ĐƯỢC</span>
                  </h3>
                  <div className="space-y-2.5">
                    {schoolAIReport.keyPatterns?.map((pt, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <div className="text-xs font-bold text-blue-900 flex items-center justify-between">
                          <span>{pt.patternName}</span>
                          <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border">
                            {pt.affectedGroups}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{pt.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Village Hotspots */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-600" />
                    <span>ĐIỂM NÓNG BẢN LÀNG CẦN CHÚ Ý</span>
                  </h3>
                  <div className="space-y-2.5">
                    {schoolAIReport.villageHotspots?.map((vg, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                          <span>Bản {vg.villageName}</span>
                        </div>
                        <p className="text-xs text-slate-600">{vg.riskAssessment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recommendations for BGH and GVCN */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black uppercase text-purple-900 tracking-wider flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-purple-600" />
                    <span>KHUYẾN NGHỊ DÀNH CHO BAN GIÁM HIỆU</span>
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {schoolAIReport.recommendationsForBGH?.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black uppercase text-emerald-900 tracking-wider flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>KHUYẾN NGHỊ TÁC CHIẾN DÀNH CHO GVCN</span>
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {schoolAIReport.recommendationsForGVCN?.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 4-week forecast */}
              {schoolAIReport.fourWeekForecast && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
                  <h3 className="text-xs font-black uppercase text-blue-900 tracking-wider flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                    <span>DỰ BÁO BIẾN ĐỘNG SĨ SỐ TRONG 4 TUẦN TỚI</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    {schoolAIReport.fourWeekForecast}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
              <Brain className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-800">Chưa có báo cáo chiến lược AI cho toàn trường</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Nhấp vào nút bên dưới để mô hình Gemini 3.8 Flash tổng hợp dữ liệu chuyên cần và đưa ra khuyến nghị chiến lược.
              </p>
              <button
                type="button"
                onClick={handleGenerateSchoolAIReport}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Bắt đầu phân tích AI ngay</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 6. Tab 3: Intervention Logbook */}
      {activeTab === 'intervention-log' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>NHẬT KÝ VẬN ĐỘNG & CAN THIỆP HỌC SINH</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Theo dõi các buổi đến bản, gọi điện phụ huynh và phối hợp trưởng bản vận động học sinh đi học trở lại
              </p>
            </div>

            <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              Tổng số ca can thiệp: <strong className="text-emerald-700">{interventionLogs.length}</strong>
            </div>
          </div>

          {interventionLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Chưa có nhật ký vận động nào được ghi nhận. Để thêm nhật ký, chọn học sinh tại tab "Danh sách Cảnh báo sớm" và nhấn "+ Vận động".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">Ngày can thiệp</th>
                    <th className="py-2.5 px-3">Học sinh</th>
                    <th className="py-2.5 px-3">Lớp</th>
                    <th className="py-2.5 px-3">Hình thức</th>
                    <th className="py-2.5 px-3">Người thực hiện</th>
                    <th className="py-2.5 px-3">Kết quả</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    <th className="py-2.5 px-3 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {interventionLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">{log.date}</td>
                      <td className="py-2.5 px-3 font-bold text-blue-900 whitespace-nowrap">{log.studentName}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-700">{log.className}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                          {log.actionType === 'HOME_VISIT'
                            ? 'Đến nhà tại bản'
                            : log.actionType === 'PHONE_CALL'
                            ? 'Gọi điện phụ huynh'
                            : log.actionType === 'VILLAGE_HEAD_MEETING'
                            ? 'Gặp Trưởng bản'
                            : log.actionType === 'SCHOOL_COUNSELING'
                            ? 'Tư vấn tâm lý'
                            : log.actionType === 'FINANCIAL_AID'
                            ? 'Hỗ trợ bán trú'
                            : 'Khác'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {log.conductedBy} ({log.conductedRole})
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            log.result === 'RETURNED_TO_CLASS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.result === 'AGREED_TO_RETURN'
                              ? 'bg-blue-100 text-blue-800'
                              : log.result === 'FAMILY_DIFFICULTY'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {log.result === 'RETURNED_TO_CLASS'
                            ? 'Đã đi học lại'
                            : log.result === 'AGREED_TO_RETURN'
                            ? 'Gia đình cam kết'
                            : log.result === 'FAMILY_DIFFICULTY'
                            ? 'Gia đình khó khăn'
                            : log.result === 'CANNOT_CONTACT'
                            ? 'Chưa liên lạc được'
                            : 'Đang theo dõi'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{log.notes || '—'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Bạn có chắc chắn muốn xóa nhật ký này?')) {
                              AIPredictiveService.deleteInterventionLog(log.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 7. Modal: Individual AI Assessment & Intervention Plan */}
      {selectedStudentForAI && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                  <Brain className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase">
                    AI ĐÁNH GIÁ & KẾ HOẠCH VẬN ĐỘNG
                  </h3>
                  <div className="text-xs text-blue-200 font-medium">
                    Học sinh: <strong className="text-white">{selectedStudentForAI.student.full_name}</strong> (Lớp {selectedStudentForAI.classItem?.class_name})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentForAI(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm">
              {isGeneratingAIPlan ? (
                <div className="py-12 text-center space-y-3">
                  <Brain className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                  <div className="font-bold text-slate-800">Gemini 3.8 Flash đang xây dựng kế hoạch cá nhân hóa...</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Mô hình đang phân tích các lý do vắng gần nhất, yếu tố gia đình bản {selectedStudentForAI.student.address || selectedStudentForAI.student.village} để gợi ý kịch bản vận động khéo léo nhất.
                  </p>
                </div>
              ) : aiPlanError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Lỗi phân tích AI:</span>
                  </div>
                  <div>{aiPlanError}</div>
                  <button
                    type="button"
                    onClick={() => handleOpenAIAssessment(selectedStudentForAI)}
                    className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Thử lại
                  </button>
                </div>
              ) : aiIndividualPlan ? (
                <div className="space-y-4">
                  {/* Summary Assessment Box */}
                  <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ
                      </span>
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                        Xác suất bỏ học: {aiIndividualPlan.dropoutProbability}%
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                      {aiIndividualPlan.rootCauseAnalysis}
                    </p>
                  </div>

                  {/* 4-Step Roadmap */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                      LỘ TRÌNH 4 BƯỚC VẬN ĐỘNG HỌC SINH QUAY LẠI TRƯỜNG:
                    </h4>
                    <div className="space-y-2">
                      {aiIndividualPlan.interventionRoadmap?.map((step) => (
                        <div key={step.step} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                            <span>{step.phase}</span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              Người thực hiện: {step.actor}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-normal">{step.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Family Dialogue Script */}
                  <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
                    <h4 className="text-xs font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-amber-700" />
                      GỢI Ý KỊCH BẢN ĐỐI THOẠI KHI GẶP PHỤ HUYNH TẠI BẢN:
                    </h4>
                    {aiIndividualPlan.familyDialogueScript?.sampleOpening && (
                      <div className="text-xs italic text-slate-700 bg-white p-2.5 rounded-xl border border-amber-200">
                        "{aiIndividualPlan.familyDialogueScript.sampleOpening}"
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <div className="space-y-1">
                        <span className="font-bold text-emerald-800">✓ Nên chia sẻ:</span>
                        <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                          {aiIndividualPlan.familyDialogueScript?.recommendedApproaches?.map((app, i) => (
                            <li key={i}>{app}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-1">
                        <span className="font-bold text-rose-800">✗ Nên tránh:</span>
                        <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                          {aiIndividualPlan.familyDialogueScript?.avoidTopics?.map((av, i) => (
                            <li key={i}>{av}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Proposed Action Note */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">
                    <div>
                      Hành động đề xuất: <strong className="text-slate-900">{aiIndividualPlan.officialActionForm?.proposedAction}</strong>
                    </div>
                    <div className="text-rose-700 font-bold">
                      Ưu tiên: {aiIndividualPlan.officialActionForm?.priority}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedStudentForAI(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = selectedStudentForAI;
                  setSelectedStudentForAI(null);
                  setLoggingForStudent(target);
                }}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Ghi nhận ca vận động này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Log Intervention */}
      {loggingForStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveLog}
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
          >
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base uppercase">GHI NHẬN HÀNH ĐỘNG VẬN ĐỘNG</h3>
                <div className="text-xs text-emerald-200">
                  Học sinh: <strong className="text-white">{loggingForStudent.student.full_name}</strong> - Lớp {loggingForStudent.classItem?.class_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoggingForStudent(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Ngày thực hiện:
                </label>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Hình thức can thiệp / vận động:
                </label>
                <select
                  value={logActionType}
                  onChange={(e) => setLogActionType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="HOME_VISIT">Đến tận nhà tại bản gặp phụ huynh</option>
                  <option value="PHONE_CALL">Gọi điện trao đổi với phụ huynh</option>
                  <option value="VILLAGE_HEAD_MEETING">Phối hợp với Trưởng bản / Bí thư chi bộ bản</option>
                  <option value="SCHOOL_COUNSELING">Tư vấn, động viên tâm lý tại trường</option>
                  <option value="FINANCIAL_AID">Hỗ trợ chế độ chính sách bán trú, đồ dùng</option>
                  <option value="OTHER">Hình thức khác</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Kết quả bước đầu:
                </label>
                <select
                  value={logResult}
                  onChange={(e) => setLogResult(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="RETURNED_TO_CLASS">✓ Học sinh đã đi học trở lại ổn định</option>
                  <option value="AGREED_TO_RETURN">✓ Gia đình cam kết sẽ cho con em đến lớp</option>
                  <option value="MONITORING">⧗ Đang tiếp tục theo dõi sát</option>
                  <option value="FAMILY_DIFFICULTY">⚠ Gia đình khó khăn (việc nương rẫy, cần hỗ trợ thêm)</option>
                  <option value="CANNOT_CONTACT">✗ Chưa gặp được phụ huynh / chưa liên lạc được</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                  Ghi chú chi tiết về buổi làm việc:
                </label>
                <textarea
                  rows={3}
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Ghi lại hoàn cảnh gia đình, lý do em nghỉ, ý kiến của phụ huynh hoặc trưởng bản..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setLoggingForStudent(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
              >
                Lưu vào Nhật ký
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
