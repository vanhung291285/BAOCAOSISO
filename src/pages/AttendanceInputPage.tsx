import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { StorageService } from '../services/storage';
import { DailyReport, AbsentStudent } from '../types';
import {
  Calendar,
  GraduationCap,
  CheckCircle2,
  Lock,
  Save,
  Send,
  Clock,
  Sparkles,
  RotateCcw,
  ShieldAlert,
  UserX,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  User,
  AlertCircle,
} from 'lucide-react';

interface AttendanceInputPageProps {
  initialClassId?: string;
  initialDate?: string;
  onSavedSuccess?: () => void;
  onNavigate?: (path: string) => void;
}

interface GroupInputState {
  total: number | '';
  present: number | '';
  absent: number | '';
}

const QUICK_REASONS = [
  'Ốm',
  'Có phép',
  'Không phép',
  'Việc gia đình',
  'Mưa lũ / đường sạt lở',
];

export const AttendanceInputPage: React.FC<AttendanceInputPageProps> = ({
  initialClassId,
  initialDate,
  onSavedSuccess,
  onNavigate,
}) => {
  const { currentUser, isAdmin, isGVCN } = useAuth();
  const { settings, classes, indicators } = useSchool();

  // Selected date defaults to today (or initialDate)
  const today = '2026-09-15';
  const [reportDate, setReportDate] = useState<string>(initialDate || today);

  // Selected class
  const defaultClassId = useMemo(() => {
    if (initialClassId) return initialClassId;
    if (currentUser?.assigned_class_id) return currentUser.assigned_class_id;
    return classes[0]?.id || '';
  }, [initialClassId, currentUser, classes]);

  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId);

  // Existing report info
  const [existingReport, setExistingReport] = useState<DailyReport | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [quickFillNotice, setQuickFillNotice] = useState<string>('');

  // Values map: indicator_group_id -> { total, present, absent }
  const [formValues, setFormValues] = useState<Record<string, GroupInputState>>({});

  const enabledIndicators = useMemo(() => {
    return indicators.filter((ig) => ig.enabled).sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const isAssignedTeacher = currentUser?.assigned_class_id === selectedClassId;
  const isLocked = Boolean(selectedClass?.is_locked || existingReport?.status === 'LOCKED');

  // Input calculation mode from school settings (or default to MODE_1_TOTAL_PRESENT)
  const inputMode = settings?.input_mode || 'MODE_1_TOTAL_PRESENT';

  // Load existing report for this class and date
  useEffect(() => {
    if (!selectedClassId || !reportDate) return;

    setLoading(true);
    setSaveSuccess(false);
    setErrorMessage('');
    setQuickFillNotice('');

    StorageService.getDailyReport(selectedClassId, reportDate)
      .then(({ report, values }) => {
        setExistingReport(report || null);
        setNotes(report?.notes || '');
        setAbsentStudents(report?.absent_students || []);

        const initialMap: Record<string, GroupInputState> = {};

        enabledIndicators.forEach((ig) => {
          const val = values.find((v) => v.indicator_group_id === ig.id);
          if (val) {
            initialMap[ig.id] = {
              total: val.total_count,
              present: val.present_count,
              absent: val.absent_count,
            };
          } else {
            // Sensible defaults based on indicator type if newly creating
            let defTotal = 35;
            if (ig.code === 'ALL') defTotal = 35;
            else if (ig.code === 'BOARDING_HALF') defTotal = 28;

            initialMap[ig.id] = {
              total: defTotal,
              present: defTotal,
              absent: 0,
            };
          }
        });

        setFormValues(initialMap);
        // If report exists and already submitted, start in view mode unless user clicks edit
        setIsEditMode(!report || isAdmin);
      })
      .finally(() => setLoading(false));
  }, [selectedClassId, reportDate, enabledIndicators, isAdmin]);

  // Handle field change with automatic calculation according to configured mode
  const handleFieldChange = (
    groupId: string,
    field: 'total' | 'present' | 'absent',
    rawVal: string
  ) => {
    let numVal: number | '' = '';
    if (rawVal !== '') {
      const parsed = parseInt(rawVal, 10);
      if (isNaN(parsed) || parsed < 0) return;
      numVal = parsed;
    }

    setFormValues((prev) => {
      const current = prev[groupId] || { total: 0, present: 0, absent: 0 };
      const next: GroupInputState = { ...current, [field]: numVal };

      const total = typeof next.total === 'number' ? next.total : 0;
      const present = typeof next.present === 'number' ? next.present : 0;
      const absent = typeof next.absent === 'number' ? next.absent : 0;

      if (inputMode === 'MODE_1_TOTAL_PRESENT') {
        // Mode 1: Nhập Tổng số + Có mặt -> Tự động tính Vắng = Tổng số - Có mặt
        if (field === 'total') {
          if (typeof next.present === 'number') {
            next.absent = Math.max(0, total - present);
          }
        } else if (field === 'present') {
          next.absent = Math.max(0, total - (typeof numVal === 'number' ? numVal : 0));
        }
      } else if (inputMode === 'MODE_2_TOTAL_ABSENT') {
        // Mode 2: Nhập Tổng số + Vắng -> Tự động tính Có mặt = Tổng số - Vắng
        if (field === 'total') {
          if (typeof next.absent === 'number') {
            next.present = Math.max(0, total - absent);
          }
        } else if (field === 'absent') {
          next.present = Math.max(0, total - (typeof numVal === 'number' ? numVal : 0));
        }
      }

      return {
        ...prev,
        [groupId]: next,
      };
    });
  };

  // Quick increment/decrement helper for mobile with >= 44px touch targets
  const adjustValue = (groupId: string, field: 'present' | 'absent', delta: number) => {
    const current = formValues[groupId] || { total: 0, present: 0, absent: 0 };
    const curVal = typeof current[field] === 'number' ? (current[field] as number) : 0;
    const nextVal = Math.max(0, curVal + delta);
    handleFieldChange(groupId, field, String(nextVal));
  };

  // Quick preset for absentee count (0, 1, 2, 3 vắng)
  const setAbsentPreset = (groupId: string, absentCount: number) => {
    const current = formValues[groupId] || { total: 0, present: 0, absent: 0 };
    const total = typeof current.total === 'number' ? current.total : 0;
    const actualAbsent = Math.min(absentCount, total);
    const actualPresent = Math.max(0, total - actualAbsent);

    setFormValues((prev) => ({
      ...prev,
      [groupId]: {
        ...current,
        total,
        present: actualPresent,
        absent: actualAbsent,
      },
    }));
  };

  // 1-Tap Quick Action: "CẢ LỚP ĐỦ 100%"
  const handleSetFullAttendance = () => {
    setFormValues((prev) => {
      const nextMap: Record<string, GroupInputState> = {};
      enabledIndicators.forEach((ig) => {
        const cur = prev[ig.id] || { total: 35, present: 35, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 35;
        nextMap[ig.id] = {
          total,
          present: total,
          absent: 0,
        };
      });
      return nextMap;
    });
    setAbsentStudents([]);
    setQuickFillNotice('Đã áp dụng: Cả lớp đi học đầy đủ 100% (Vắng: 0)!');
    setTimeout(() => setQuickFillNotice(''), 3500);
  };

  // Absent student handlers
  const handleAddAbsentStudent = () => {
    setAbsentStudents([...absentStudents, { full_name: '', address: '', reason: '' }]);
  };

  const handleUpdateAbsentStudent = (index: number, field: keyof AbsentStudent, value: string) => {
    const updated = [...absentStudents];
    updated[index] = { ...updated[index], [field]: value };
    setAbsentStudents(updated);
  };

  const handleRemoveAbsentStudent = (index: number) => {
    const updated = [...absentStudents];
    updated.splice(index, 1);
    setAbsentStudents(updated);
  };

  // Validation rules check
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    enabledIndicators.forEach((ig) => {
      const gVals = formValues[ig.id];
      if (!gVals) return;

      const total = typeof gVals.total === 'number' ? gVals.total : 0;
      const present = typeof gVals.present === 'number' ? gVals.present : 0;
      const absent = typeof gVals.absent === 'number' ? gVals.absent : 0;

      if (total < 0 || present < 0 || absent < 0) {
        errors.push(`Nhóm "${ig.name}": Số lượng không được nhỏ hơn 0.`);
      }

      if (present > total) {
        errors.push(`Nhóm "${ig.name}": Số có mặt (${present}) vượt quá tổng số (${total}).`);
      }

      if (absent > total) {
        errors.push(`Nhóm "${ig.name}": Số vắng (${absent}) vượt quá tổng số (${total}).`);
      }

      if (present + absent !== total) {
        errors.push(
          `Nhóm "${ig.name}": Có mặt (${present}) + Vắng (${absent}) = ${present + absent}, phải bằng Tổng số (${total}).`
        );
      }
    });

    return errors;
  }, [formValues, enabledIndicators]);

  const isValid = validationErrors.length === 0;

  // Compute summary for sticky mobile bar
  const mobileSummary = useMemo(() => {
    const mainGroup = enabledIndicators[0];
    if (!mainGroup) return null;
    const v = formValues[mainGroup.id];
    return {
      total: typeof v?.total === 'number' ? v.total : 0,
      present: typeof v?.present === 'number' ? v.present : 0,
      absent: typeof v?.absent === 'number' ? v.absent : 0,
    };
  }, [enabledIndicators, formValues]);

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!isValid) {
      setErrorMessage('Vui lòng kiểm tra lại cảnh báo trước khi lưu.');
      return;
    }

    if (isLocked && !isAdmin) {
      setErrorMessage('Báo cáo đã bị khóa, bạn không có quyền sửa đổi.');
      return;
    }

    if (!currentUser) return;

    try {
      const payload: Record<string, { total: number; present: number; absent: number }> = {};
      enabledIndicators.forEach((ig) => {
        const val = formValues[ig.id] || { total: 0, present: 0, absent: 0 };
        payload[ig.id] = {
          total: Number(val.total) || 0,
          present: Number(val.present) || 0,
          absent: Number(val.absent) || 0,
        };
      });

      const res = await StorageService.saveDailyReport(
        selectedClassId,
        reportDate,
        currentUser,
        payload,
        notes,
        absentStudents
      );

      setExistingReport(res.report);
      setSaveSuccess(true);
      setIsEditMode(false);

      if (onSavedSuccess) {
        onSavedSuccess();
      }

      // Scroll smoothly to top on mobile to see confirmation
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving report:', err);
      setErrorMessage('Không thể lưu báo cáo. Vui lòng kiểm tra kết nối mạng.');
    }
  };

  if (classes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-8">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Chưa có lớp học trong hệ thống</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Hệ thống đang ở trạng thái mặc định rỗng. Quản trị viên vui lòng thêm lớp học để bắt đầu điểm danh và báo cáo sĩ số.
          </p>
          {onNavigate && (isAdmin || !isGVCN) && (
            <button
              type="button"
              onClick={() => onNavigate('/classes')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-xs transition-colors"
            >
              Cấu hình lớp học ngay
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28 sm:pb-12">
      {/* 1. Mobile-Optimized Class & Teacher Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs flex-shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                  GVCN Điểm Danh
                </span>
                {selectedClass && (
                  <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                    Khối {selectedClass.grade}
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight mt-0.5">
                {selectedClass ? `LỚP ${selectedClass.class_name}` : 'BÁO CÁO SĨ SỐ'}
              </h1>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold text-slate-800 line-clamp-1">{currentUser?.full_name}</div>
            <div className="text-[11px] text-slate-500 font-medium">
              {isAssignedTeacher ? `GVCN Phụ trách` : currentUser?.role}
            </div>
          </div>
        </div>

        {/* Date & Class pickers tailored for phone touch ergonomics */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Ngày báo cáo
              </label>
              {reportDate !== today && (
                <button
                  type="button"
                  onClick={() => setReportDate(today)}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                >
                  Về hôm nay
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-blue-600 absolute left-3 pointer-events-none" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full pl-9 pr-3 h-11 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Class Selector (Select or display) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Lớp phụ trách
            </label>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={isGVCN && Boolean(currentUser?.assigned_class_id)}
                className="w-full px-3 h-11 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-700 cursor-pointer appearance-none"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Lớp {c.class_name} (Khối {c.grade})
                  </option>
                ))}
              </select>
              {!(isGVCN && Boolean(currentUser?.assigned_class_id)) && (
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        {/* 2. Fast 1-Tap Action: "CẢ LỚP ĐI ĐỦ" for fast mobile attendance */}
        {isEditMode && !isLocked && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSetFullAttendance}
              className="w-full h-11 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-98 transition-all shadow-2xs whitespace-nowrap"
            >
              <Check className="w-4 h-4 text-emerald-700 stroke-[3] flex-shrink-0" />
              <span className="truncate">⚡ Điểm danh nhanh: Cả lớp đi đủ (0 vắng)</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Fill Notice Toast */}
      {quickFillNotice && (
        <div className="bg-emerald-600 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="leading-tight">{quickFillNotice}</span>
        </div>
      )}

      {/* Existing Report / Lock Notification Banner */}
      {existingReport && !isEditMode && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-emerald-900">
                Đã báo cáo ngày {reportDate.split('-').reverse().join('/')}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Lớp <span className="font-bold">{selectedClass?.class_name}</span> ghi nhận lúc{' '}
                {new Date(existingReport.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            {!isLocked ? (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="w-full sm:w-auto h-9 px-3.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-200 hover:bg-emerald-300 transition-colors flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap"
              >
                Chỉnh sửa số liệu
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 whitespace-nowrap">
                <Lock className="w-3.5 h-3.5" /> Đã khóa
              </span>
            )}
          </div>
        </div>
      )}

      {isLocked && (
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-3.5 flex items-center gap-2.5">
          <Lock className="w-5 h-5 text-slate-600 flex-shrink-0" />
          <div className="text-xs text-slate-700">
            <span className="font-bold">Báo cáo lớp này đã bị khóa.</span> Liên hệ BGH nếu cần mở khóa.
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="text-xs text-blue-800 font-semibold">
            Đã gửi báo cáo sĩ số thành công! Dữ liệu đã đồng bộ toàn trường.
          </div>
        </div>
      )}

      {/* 3. Main Input Form */}
      <form onSubmit={(e) => handleSave(e)} className="space-y-4">
        {/* Indicator Group Cards (Học sinh toàn trường & Bán trú) */}
        {enabledIndicators.map((group, idx) => {
          const vals = formValues[group.id] || { total: '', present: '', absent: '' };
          const totalNum = typeof vals.total === 'number' ? vals.total : 0;
          const presentNum = typeof vals.present === 'number' ? vals.present : 0;
          const absentNum = typeof vals.absent === 'number' ? vals.absent : 0;
          const presentRate = totalNum > 0 ? (presentNum / totalNum) * 100 : 0;

          const isGroupValid = totalNum >= 0 && presentNum >= 0 && absentNum >= 0 && presentNum + absentNum === totalNum;

          return (
            <div
              key={group.id}
              className={`bg-white rounded-2xl p-3.5 sm:p-5 border shadow-xs transition-all ${
                isGroupValid ? 'border-slate-200' : 'border-red-300 ring-2 ring-red-100'
              }`}
            >
              {/* Group Title & Attendance Badges */}
              <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-black text-[11px] flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight truncate">
                    {group.id === 'ig_all' && selectedClass 
                      ? `LỚP ${selectedClass.class_name}`
                      : group.name.toUpperCase()}
                  </h3>
                </div>

                {group.show_percentage && totalNum > 0 && (
                  <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded whitespace-nowrap">
                      {presentRate.toFixed(1)}% có mặt
                    </span>
                    {absentNum > 0 && (
                      <span className="font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Vắng {absentNum}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Presets for Absent Count: Thiết kế dạng Segmented Tabs co giãn đều, không tràn chữ */}
              {isEditMode && !isLocked && (
                <div className="mb-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Chọn nhanh số em vắng:
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      (Tự tính có mặt)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { count: 0, label: '0 vắng', sub: 'Đủ 100%' },
                      { count: 1, label: '1 em', sub: 'Vắng 1' },
                      { count: 2, label: '2 em', sub: 'Vắng 2' },
                      { count: 3, label: '3 em', sub: 'Vắng 3' },
                    ].map((preset) => {
                      const isSelected = absentNum === preset.count;
                      return (
                        <button
                          key={preset.count}
                          type="button"
                          onClick={() => setAbsentPreset(group.id, preset.count)}
                          className={`py-1.5 px-1 rounded-lg text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
                            isSelected
                              ? preset.count === 0
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-red-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-xs font-black leading-tight whitespace-nowrap">
                            {preset.label}
                          </span>
                          <span className={`text-[9px] leading-tight whitespace-nowrap ${
                            isSelected ? 'text-white/80 font-medium' : 'text-slate-400'
                          }`}>
                            {preset.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Number Inputs Grid - Cân đối, chuẩn tỉ lệ trên mọi điện thoại */}
              <div className="grid grid-cols-3 gap-2">
                {/* 1. Tổng số */}
                <div className="bg-slate-50 p-2 sm:p-3 rounded-xl border border-slate-200 flex flex-col items-center justify-between text-center">
                  <label className="block text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 whitespace-nowrap">
                    Tổng số
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    step="1"
                    disabled={!isEditMode || (isLocked && !isAdmin)}
                    value={vals.total}
                    onChange={(e) => handleFieldChange(group.id, 'total', e.target.value)}
                    className="w-full text-center text-lg sm:text-2xl font-black text-slate-900 bg-white border border-slate-300 rounded-lg h-10 sm:h-11 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                  />
                  <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">Sĩ số lớp</div>
                </div>

                {/* 2. Có mặt */}
                <div className="bg-emerald-50/50 p-2 sm:p-3 rounded-xl border border-emerald-200 flex flex-col items-center justify-between text-center">
                  <label className="block text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1 whitespace-nowrap">
                    Có mặt
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    step="1"
                    disabled={!isEditMode || (isLocked && !isAdmin)}
                    value={vals.present}
                    onChange={(e) => handleFieldChange(group.id, 'present', e.target.value)}
                    className="w-full text-center text-lg sm:text-2xl font-black text-emerald-800 bg-white border border-emerald-300 rounded-lg h-10 sm:h-11 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden disabled:bg-slate-100"
                  />
                  {isEditMode && !isLocked ? (
                    <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'present', -1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-black text-xs flex items-center justify-center active:scale-90"
                        title="Giảm 1"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'present', 1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-black text-xs flex items-center justify-center active:scale-90"
                        title="Tăng 1"
                      >
                        +1
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-emerald-600 mt-1 whitespace-nowrap">Học sinh</div>
                  )}
                </div>

                {/* 3. Vắng */}
                <div className={`p-2 sm:p-3 rounded-xl border flex flex-col items-center justify-between text-center ${
                  absentNum > 0 ? 'bg-red-50 border-red-300' : 'bg-red-50/30 border-red-200'
                }`}>
                  <label className="block text-[10px] sm:text-[11px] font-bold text-red-700 uppercase tracking-wider mb-1 whitespace-nowrap">
                    Vắng
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    step="1"
                    disabled={
                      !isEditMode ||
                      (isLocked && !isAdmin) ||
                      inputMode === 'MODE_1_TOTAL_PRESENT'
                    }
                    value={vals.absent}
                    onChange={(e) => handleFieldChange(group.id, 'absent', e.target.value)}
                    className={`w-full text-center text-lg sm:text-2xl font-black rounded-lg h-10 sm:h-11 focus:ring-2 focus:ring-red-500 focus:outline-hidden ${
                      absentNum > 0 ? 'text-red-700 bg-red-100' : 'text-slate-700 bg-white'
                    } border border-red-300 disabled:bg-slate-100`}
                  />
                  {inputMode === 'MODE_1_TOTAL_PRESENT' ? (
                    <div className="text-[10px] text-blue-600 font-semibold mt-1 whitespace-nowrap">
                      Tự động
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'absent', -1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-900 font-black text-xs flex items-center justify-center active:scale-90"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'absent', 1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-900 font-black text-xs flex items-center justify-center active:scale-90"
                      >
                        +1
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 4. Absent Students Detail Cards (Tối ưu hóa bố cục, không tràn chữ trên mobile) */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          {/* Header tách biệt rõ ràng 2 tầng: Tầng 1 tiêu đề + nút thêm, Tầng 2 chú thích */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider truncate">
                HỌC SINH VẮNG & LÝ DO
              </h4>
              {isEditMode && (!isLocked || isAdmin) && (
                <button
                  type="button"
                  onClick={handleAddAbsentStudent}
                  className="h-8 px-2.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm em vắng</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-tight">
              Ghi tên học sinh vắng để tự động điền vào cột "Tên học sinh" trên biểu mẫu
            </p>
          </div>

          {absentStudents.length === 0 ? (
            <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <UserX className="w-5 h-5 text-slate-300 mx-auto mb-1" />
              <p className="text-xs text-slate-500 font-medium">Chưa có học sinh nào báo vắng</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {absentStudents.map((student, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 relative"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      Học sinh vắng #{idx + 1}
                    </span>
                    {isEditMode && (!isLocked || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAbsentStudent(idx)}
                        className="h-6 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded flex items-center gap-1 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Họ và tên học sinh *
                      </label>
                      <input
                        type="text"
                        disabled={!isEditMode || (isLocked && !isAdmin)}
                        value={student.full_name}
                        onChange={(e) => handleUpdateAbsentStudent(idx, 'full_name', e.target.value)}
                        placeholder="VD: Quàng Văn Minh..."
                        className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Bản / Thôn (Địa chỉ)
                      </label>
                      <input
                        type="text"
                        disabled={!isEditMode || (isLocked && !isAdmin)}
                        value={student.address || ''}
                        onChange={(e) => handleUpdateAbsentStudent(idx, 'address', e.target.value)}
                        placeholder="VD: Bản Huổi Hốc..."
                        className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* Lý do vắng with quick-select tags */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Lý do vắng mặt
                    </label>
                    <input
                      type="text"
                      disabled={!isEditMode || (isLocked && !isAdmin)}
                      value={student.reason || ''}
                      onChange={(e) => handleUpdateAbsentStudent(idx, 'reason', e.target.value)}
                      placeholder="Gõ lý do hoặc bấm chọn bên dưới..."
                      className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                    />

                    {/* Quick reason tag chips */}
                    {isEditMode && (!isLocked || isAdmin) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {QUICK_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => handleUpdateAbsentStudent(idx, 'reason', reason)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all active:scale-95 whitespace-nowrap ${
                              student.reason === reason
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200/80 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            + {reason}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* General Notes */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Ghi chú thêm của GVCN (nếu có)
            </label>
            <input
              type="text"
              disabled={!isEditMode || (isLocked && !isAdmin)}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú tổng thể tình hình học sinh của lớp..."
              className="w-full px-3 h-9 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-1.5 animate-in shake duration-150">
            <div className="flex items-center gap-2 text-red-800 font-bold text-xs sm:text-sm">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>Số liệu chưa hợp lệ:</span>
            </div>
            <ul className="list-disc list-inside text-xs text-red-700 font-medium space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-bold text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Desktop inline action buttons */}
        <div className="hidden sm:block pt-2">
          {isEditMode && !isLocked ? (
            <button
              type="submit"
              disabled={!isValid}
              className="w-full h-12 rounded-2xl text-base font-black text-white bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl focus:ring-4 focus:ring-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              <span>GỬI BÁO CÁO SĨ SỐ</span>
            </button>
          ) : (
            <div className="flex gap-3">
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="flex-1 h-11 rounded-xl text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                >
                  Chỉnh sửa số liệu
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('/dashboard')}
                className="flex-1 h-11 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Về bảng điều khiển
              </button>
            </div>
          )}
        </div>
      </form>

      {/* 5. STICKY BOTTOM ACTION BAR FOR MOBILE (Chuyên dụng cho điện thoại) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2.5 shadow-xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2.5">
          {mobileSummary && (
            <div className="leading-tight">
              <div className="text-[11px] font-extrabold text-slate-800">
                {selectedClass?.class_name || 'Lớp'}: {mobileSummary.present}/{mobileSummary.total}
              </div>
              <div className="text-[10px] font-semibold text-red-600">
                Vắng: {mobileSummary.absent} em
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-1 justify-end">
            {isEditMode && !isLocked ? (
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={!isValid}
                className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed flex-1 max-w-[240px] whitespace-nowrap"
              >
                <Send className="w-4 h-4 flex-shrink-0" />
                <span>GỬI BÁO CÁO SĨ SỐ</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full justify-end">
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    className="h-10 px-4 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 flex-1 active:scale-95"
                  >
                    Sửa số liệu
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('/dashboard')}
                  className="h-10 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 active:scale-95"
                >
                  Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
