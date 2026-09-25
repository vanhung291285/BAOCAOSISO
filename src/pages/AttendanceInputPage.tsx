import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import { AbsentStudent, DailyReport, DailyReportValue, Student } from '../types';
import { DateNavigator } from '../components/DateNavigator';
import { getTodayDateStr, formatDateVN } from '../utils/schoolWeeks';
import {
  CheckCircle2,
  RotateCcw,
  Lock,
  AlertCircle,
  Calendar,
  Users,
  UserCheck,
  UserX,
  Plus,
  Trash2,
  ArrowLeft,
  Clock,
  Utensils,
  Home,
  Sparkles,
  ChevronDown,
  Check,
  FileText,
  AlertTriangle,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { getIndicatorMeta } from '../utils/indicatorIcons';

interface AttendanceInputPageProps {
  initialClassId?: string;
  initialDate?: string;
  onSavedSuccess?: () => void;
  onNavigate?: (path: string) => void;
}

export const AttendanceInputPage: React.FC<AttendanceInputPageProps> = ({
  initialClassId,
  initialDate,
  onSavedSuccess,
  onNavigate,
}) => {
  const { settings, classes, campuses, indicators, students } = useSchool();
  const { currentUser, isGVCN, isAdmin, isBGH } = useAuth();

  // Active indicators sorted by sort_order
  const enabledIndicators = useMemo(() => {
    return [...indicators]
      .filter((i) => i.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  // Selected date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return initialDate || getTodayDateStr();
  });

  // Selected class ID
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      return currentUser.assigned_class_id;
    }
    if (initialClassId) {
      return initialClassId;
    }
    const firstActive = classes.find((c) => c.active && !c.is_locked);
    return firstActive?.id || classes[0]?.id || '';
  });

  // Keep in sync if initial props change
  useEffect(() => {
    if (initialDate && initialDate !== selectedDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    if (initialClassId && initialClassId !== selectedClassId && (!isGVCN || !currentUser?.assigned_class_id)) {
      setSelectedClassId(initialClassId);
    }
  }, [initialClassId, isGVCN, currentUser]);

  // Get active selected class
  const selectedClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Campus info for selected class
  const selectedCampus = useMemo(() => {
    if (!selectedClass?.campus_id) return null;
    return campuses.find((cp) => cp.id === selectedClass.campus_id) || null;
  }, [campuses, selectedClass]);

  // Students belonging to selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter((s) => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  // Existing report & values
  const [existingReport, setExistingReport] = useState<DailyReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Form values: groupId -> { total, present, absent }
  const [formValues, setFormValues] = useState<Record<string, { total: number | ''; present: number | ''; absent: number | '' }>>({});
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState<boolean>(false);

  // Quick absent student temporary input
  const [newAbsentName, setNewAbsentName] = useState<string>('');
  const [newAbsentAddress, setNewAbsentAddress] = useState<string>('');
  const [newAbsentReason, setNewAbsentReason] = useState<string>('Ốm');
  const [newAbsentIsBoarding, setNewAbsentIsBoarding] = useState<boolean>(false);

  // Auto-hide toast after 4s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Check if report is locked
  const isLocked = existingReport?.status === 'LOCKED' || selectedClass?.is_locked;

  // Load report data whenever selectedClassId or selectedDate changes
  const loadClassReport = useCallback(async () => {
    if (!selectedClassId || !selectedDate) {
      setIsLoadingReport(false);
      return;
    }

    setIsLoadingReport(true);
    try {
      const { report, values } = await StorageService.getDailyReport(selectedClassId, selectedDate);
      setExistingReport(report || null);

      if (report) {
        setNotes(report.notes || '');
        setAbsentStudents(report.absent_students || []);

        const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
        values.forEach((v) => {
          newVals[v.indicator_group_id] = {
            total: v.total_count,
            present: v.present_count,
            absent: v.absent_count,
          };
        });

        // Ensure all active indicator groups have entry
        enabledIndicators.forEach((ig) => {
          if (!newVals[ig.id]) {
            newVals[ig.id] = { total: 0, present: 0, absent: 0 };
          }
        });

        setFormValues(newVals);
      } else {
        // No report for this date: Try to inherit from latest report
        const { report: latestReport, values: latestValues } = await StorageService.getLatestReport(selectedClassId);

        if (latestReport) {
          // Inherit structure from latest report
          const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
          latestValues.forEach((v) => {
            newVals[v.indicator_group_id] = {
              total: v.total_count,
              present: v.total_count, // Reset present to total
              absent: 0, // Reset absent to 0
            };
          });

          // Ensure all active indicator groups have entry
          enabledIndicators.forEach((ig) => {
            if (!newVals[ig.id]) {
              newVals[ig.id] = { total: 0, present: 0, absent: 0 };
            }
          });

          setFormValues(newVals);
          setNotes(''); // Clear notes for new day
          setAbsentStudents([]); // Clear absent students for new day
        } else {
          // Fallback to smart defaults
          setNotes('');
          setAbsentStudents([]);

          const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
          const enrolledCount = classStudents.length;

          const defaultTotal = enrolledCount > 0 ? enrolledCount : 35;
          const boardingStudentsCount = classStudents.filter((s) => s.isBoarding).length;

          enabledIndicators.forEach((ig, idx) => {
            if (idx === 0) {
              newVals[ig.id] = {
                total: defaultTotal,
                present: defaultTotal,
                absent: 0,
              };
            } else if (ig.code.includes('BOARDING') || ig.name.toLowerCase().includes('bán trú') || ig.name.toLowerCase().includes('ăn trưa')) {
              const boardingTotal = boardingStudentsCount > 0 ? boardingStudentsCount : Math.min(defaultTotal, 20);
              newVals[ig.id] = {
                total: boardingTotal,
                present: boardingTotal,
                absent: 0,
              };
            } else {
              newVals[ig.id] = {
                total: 0,
                present: 0,
                absent: 0,
              };
            }
          });

          setFormValues(newVals);
        }
      }
    } catch (err) {
      console.error('Error loading report for input:', err);
      setToastMessage({ text: 'Lỗi tải dữ liệu báo cáo!', type: 'error' });
    } finally {
      setIsLoadingReport(false);
    }
  }, [selectedClassId, selectedDate, enabledIndicators, classStudents]);

  useEffect(() => {
    loadClassReport();
  }, [loadClassReport]);

  // Calculation mode logic
  const inputMode = settings?.input_mode || 'MODE_2_TOTAL_ABSENT';

  const handleValueChange = (
    groupId: string,
    field: 'total' | 'present' | 'absent',
    val: number | ''
  ) => {
    if (isLocked) return;

    setFormValues((prev) => {
      const cur = prev[groupId] || { total: 0, present: 0, absent: 0 };
      const curTotal = cur.total === '' ? 0 : Number(cur.total);
      const curPresent = cur.present === '' ? 0 : Number(cur.present);
      const curAbsent = cur.absent === '' ? 0 : Number(cur.absent);

      if (val === '') {
        let updated: { total: number | ''; present: number | ''; absent: number | '' } = { ...cur, [field]: '' };
        if (inputMode === 'MODE_2_TOTAL_ABSENT') {
          if (field === 'total') {
            updated = { total: '', absent: cur.absent, present: '' };
          } else if (field === 'absent') {
            // User cleared absent: present becomes equal to total (if total is entered)
            updated = {
              total: cur.total,
              absent: '',
              present: cur.total === '' ? '' : curTotal,
            };
          } else if (field === 'present') {
            updated = {
              total: cur.total,
              present: '',
              absent: cur.total === '' ? '' : curTotal,
            };
          }
        } else if (inputMode === 'MODE_1_TOTAL_PRESENT') {
          if (field === 'total') {
            updated = { total: '', present: cur.present, absent: '' };
          } else if (field === 'present') {
            updated = {
              total: cur.total,
              present: '',
              absent: cur.total === '' ? '' : curTotal,
            };
          } else if (field === 'absent') {
            updated = {
              total: cur.total,
              absent: '',
              present: cur.total === '' ? '' : curTotal,
            };
          }
        }
        return {
          ...prev,
          [groupId]: updated,
        };
      }

      const safeVal = Math.max(0, isNaN(Number(val)) ? 0 : Number(val));
      let updated: { total: number | ''; present: number | ''; absent: number | '' } = { ...cur, [field]: safeVal };

      if (inputMode === 'MODE_2_TOTAL_ABSENT') {
        // User inputs Total & Absent -> Present is auto-calculated
        if (field === 'total') {
          const newAbsent = Math.min(curAbsent, safeVal);
          updated = {
            total: safeVal,
            absent: cur.absent === '' ? '' : newAbsent,
            present: Math.max(0, safeVal - newAbsent),
          };
        } else if (field === 'absent') {
          const safeAbsent = Math.min(safeVal, curTotal);
          updated = {
            total: cur.total,
            absent: safeAbsent,
            present: Math.max(0, curTotal - safeAbsent),
          };
        } else if (field === 'present') {
          const safePresent = Math.min(safeVal, curTotal);
          updated = {
            total: cur.total,
            present: safePresent,
            absent: Math.max(0, curTotal - safePresent),
          };
        }
      } else if (inputMode === 'MODE_1_TOTAL_PRESENT') {
        // User inputs Total & Present -> Absent is auto-calculated
        if (field === 'total') {
          const newPresent = Math.min(curPresent, safeVal);
          updated = {
            total: safeVal,
            present: cur.present === '' ? '' : newPresent,
            absent: Math.max(0, safeVal - newPresent),
          };
        } else if (field === 'present') {
          const safePresent = Math.min(safeVal, curTotal);
          updated = {
            total: cur.total,
            present: safePresent,
            absent: Math.max(0, curTotal - safePresent),
          };
        } else if (field === 'absent') {
          const safeAbsent = Math.min(safeVal, curTotal);
          updated = {
            total: cur.total,
            absent: safeAbsent,
            present: Math.max(0, curTotal - safeAbsent),
          };
        }
      } else {
        // MODE_3_ALL_THREE: Manual input
        updated = { ...cur, [field]: safeVal };
      }

      return {
        ...prev,
        [groupId]: updated,
      };
    });
  };

  // Add absent student
  const handleAddAbsentStudent = (
    name: string,
    address: string = '',
    reason: string = 'Ốm',
    isBoarding: boolean = false
  ) => {
    if (isLocked) return;
    const trimmedName = name.trim();

    setAbsentStudents((prev) => {
      const newLength = prev.length + 1;

      // Automatically sync absent count to primary indicator if enabled
      if (enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prevVals) => {
          const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
          const total = typeof cur.total === 'number' ? cur.total : 0;
          const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
          const newAbsent = Math.max(curAbsent, newLength);
          const newPresent = Math.max(0, total - newAbsent);

          return {
            ...prevVals,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        });
      }

      return [
        ...prev,
        {
          full_name: trimmedName,
          address: address.trim(),
          reason: reason || 'Ốm',
          isBoarding: !!isBoarding,
        },
      ];
    });

    // Reset quick input fields
    setNewAbsentName('');
    setNewAbsentAddress('');
    setNewAbsentReason('Ốm');
    setNewAbsentIsBoarding(false);
    setShowQuickAddModal(false);
  };

  // Remove absent student
  const handleRemoveAbsentStudent = (index: number) => {
    if (isLocked) return;

    setAbsentStudents((prev) => {
      const nextList = prev.filter((_, i) => i !== index);

      // Synchronize with main indicator
      if (enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prevVals) => {
          const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
          const total = typeof cur.total === 'number' ? cur.total : 0;
          const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
          // Set absent to match new list length if absent was previously derived from list
          const newAbsent = Math.min(curAbsent, Math.max(0, nextList.length));
          const newPresent = Math.max(0, total - newAbsent);

          return {
            ...prevVals,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        });
      }

      return nextList;
    });
  };

  // Update absent student row
  const handleUpdateAbsentStudent = (index: number, partial: Partial<AbsentStudent>) => {
    if (isLocked) return;
    setAbsentStudents((prev) => {
      const nextList = [...prev];
      nextList[index] = { ...nextList[index], ...partial };
      return nextList;
    });
  };

  // Check validity
  const isValid = useMemo(() => {
    if (!selectedClassId) return false;
    if (enabledIndicators.length === 0) return false;
    const mainId = enabledIndicators[0].id;
    const mainVal = formValues[mainId];
    if (!mainVal) return false;
    const total = Number(mainVal.total) || 0;
    const present = Number(mainVal.present) || 0;
    const absent = Number(mainVal.absent) || 0;
    if (total <= 0) return false;
    if (present + absent !== total && inputMode !== 'MODE_3_ALL_THREE') {
      return false;
    }
    return true;
  }, [selectedClassId, enabledIndicators, formValues, inputMode]);

  // Save report
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked || !isValid || !currentUser || !selectedClassId) return;

    setIsSaving(true);
    try {
      const cleanedValues: Record<string, { total: number; present: number; absent: number }> = {};
      Object.entries(formValues).forEach(([k, v]) => {
        cleanedValues[k] = {
          total: Number(v.total) || 0,
          present: Number(v.present) || 0,
          absent: Number(v.absent) || 0,
        };
      });

      await StorageService.saveDailyReport(
        selectedClassId,
        selectedDate,
        currentUser,
        cleanedValues,
        notes,
        absentStudents
      );

      setToastMessage({
        text: existingReport ? 'Đã cập nhật báo cáo thành công!' : 'Đã gửi báo cáo thành công!',
        type: 'success',
      });

      // Reload fresh state
      await loadClassReport();

      if (onSavedSuccess) {
        onSavedSuccess();
      }
    } catch (err: any) {
      console.error('Error saving report:', err);
      setToastMessage({
        text: err?.message || 'Có lỗi xảy ra khi lưu báo cáo!',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset report
  const handleResetReport = async () => {
    if (isLocked || !currentUser || !selectedClassId || !existingReport) return;

    setIsSaving(true);
    try {
      const ok = await StorageService.deleteDailyReport(selectedClassId, selectedDate, currentUser);
      if (ok) {
        setToastMessage({ text: 'Đã xóa và reset báo cáo về trạng thái chưa nộp!', type: 'success' });
        setShowResetConfirm(false);
        await loadClassReport();
      } else {
        setToastMessage({ text: 'Không tìm thấy báo cáo để reset!', type: 'error' });
      }
    } catch (err: any) {
      console.error('Error deleting report:', err);
      setToastMessage({ text: err?.message || 'Lỗi khi reset báo cáo!', type: 'error' });
    } finally {
      setIsSaving(false);
      setShowResetConfirm(false);
    }
  };

  // Main stats for mobile bar & header summary
  const mainVal = enabledIndicators[0] ? formValues[enabledIndicators[0].id] || { total: 0, present: 0, absent: 0 } : { total: 0, present: 0, absent: 0 };
  const mainTotal = mainVal.total || 0;
  const mainPresent = mainVal.present || 0;
  const mainAbsent = mainVal.absent || 0;

  // Boarding stats
  const boardingVal = useMemo(() => {
    const bInd = enabledIndicators.find(
      (i) => i.code.includes('BOARDING') || i.name.toLowerCase().includes('bán trú') || i.name.toLowerCase().includes('ăn trưa')
    );
    if (!bInd) return null;
    return formValues[bInd.id] || null;
  }, [enabledIndicators, formValues]);

  // Students not currently marked absent for quick-click tagging
  const availableStudentsForAbsent = useMemo(() => {
    const markedNames = new Set(absentStudents.map((s) => s.full_name.trim().toLowerCase()));
    return classStudents.filter((s) => !markedNames.has(s.full_name.trim().toLowerCase()));
  }, [classStudents, absentStudents]);

  return (
    <div className="max-w-5xl mx-auto pb-36 sm:pb-12 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-900/10'
              : toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-900/10'
              : 'bg-blue-50 text-blue-800 border-blue-200 shadow-blue-900/10'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <FileText className="w-3.5 h-3.5" />
                Phiếu Báo Cáo Sĩ Số Hằng Ngày
              </span>
              {selectedCampus && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                  {selectedCampus.name}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Điểm danh lớp</span>
              <span className="text-blue-700">{selectedClass?.class_name || '...'}</span>
            </h1>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            {isLoadingReport ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500">
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Đang tải...
              </span>
            ) : isLocked ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                Báo cáo đã khóa
              </span>
            ) : existingReport ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Đã nộp {existingReport.reported_time ? `(${existingReport.reported_time})` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Chưa nộp báo cáo
              </span>
            )}

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Bảng tổng quan
              </button>
            )}
          </div>
        </div>

        {/* Date & Class Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4">
          {/* Date Navigator */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Ngày điểm danh
            </label>
            <DateNavigator
              selectedDate={selectedDate}
              onChangeDate={(d) => setSelectedDate(d)}
            />
          </div>

          {/* Class Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Lớp học
            </label>
            {isGVCN && currentUser?.assigned_class_id ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {selectedClass?.class_name}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{selectedClass?.class_name}</div>
                    <div className="text-[11px] text-slate-500">GVCN: {currentUser.full_name}</div>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Lớp chủ nhiệm
                </span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 pr-9 text-sm font-semibold text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name} {cls.campus_id ? `(${campuses.find((c) => c.id === cls.campus_id)?.name || ''})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Lock Alert Banner */}
        {isLocked && (
          <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-sm text-slate-700">
            <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold text-slate-900">Báo cáo lớp này đã khóa.</span> Không thể chỉnh sửa hoặc xóa dữ liệu. Liên hệ Quản trị viên/BGH nếu cần cập nhật.
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
              >
                Về bảng điều khiển
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Indicators Form Cards */}
      <div className="space-y-4 mb-5">
        {enabledIndicators.map((indicator, idx) => {
          const isPrimary = idx === 0;
          const meta = getIndicatorMeta(indicator, isPrimary);
          const IndicatorIcon = meta.Icon;
          const vals = formValues[indicator.id] || { total: 0, present: 0, absent: 0 };
          const totalNum = Number(vals.total) || 0;
          const presentNum = Number(vals.present) || 0;
          const absentNum = Number(vals.absent) || 0;
          const presentRate = totalNum > 0 ? Math.round((presentNum / totalNum) * 100) : 0;

          return (
            <div
              key={indicator.id}
              className={`bg-white rounded-2xl border transition-all ${
                isPrimary
                  ? 'border-blue-200/80 shadow-xs ring-1 ring-blue-500/10'
                  : meta.isNgoaiTru
                  ? 'border-amber-200/80 shadow-xs'
                  : 'border-slate-200/80 shadow-xs'
              } p-4 sm:p-6`}
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${meta.badgeClass}`}
                  >
                    <IndicatorIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                      {indicator.name}
                      {isPrimary && (
                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          Chỉ tiêu chính
                        </span>
                      )}
                      {meta.isNgoaiTru && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                          Ngoại trú
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {meta.description}
                    </p>
                  </div>
                </div>

                {/* Quick Percentage Progress */}
                {totalNum > 0 && (
                  <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
                    <span className="text-xs font-medium text-slate-500">Tỷ lệ duy trì:</span>
                    <span
                      className={`text-sm font-black ${
                        presentRate >= 95
                          ? 'text-emerald-600'
                          : presentRate >= 90
                          ? 'text-blue-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {presentRate}%
                    </span>
                  </div>
                )}
              </div>

              {/* Number Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* 1. Tổng số */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/70">
                  <label className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      Tổng số (Sĩ số)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'total', Math.max(0, totalNum - 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-base hover:bg-slate-100 active:scale-95 transition-all shadow-2xs"
                      >
                        -
                      </button>
                    )}
                    <input
                      type="number"
                      min="0"
                      disabled={isLocked}
                      placeholder="0"
                      value={vals.total === '' ? '' : vals.total}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        if (vals.total === '') {
                          handleValueChange(indicator.id, 'total', 0);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleValueChange(indicator.id, 'total', '');
                        } else {
                          const parsed = parseInt(val, 10);
                          handleValueChange(indicator.id, 'total', isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-center text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                    />
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'total', totalNum + 1)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-base hover:bg-slate-100 active:scale-95 transition-all shadow-2xs"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Có mặt */}
                <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200/60">
                  <label className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Có mặt
                    </span>
                    {inputMode === 'MODE_2_TOTAL_ABSENT' && (
                      <span className="text-[10px] text-emerald-600 font-normal lowercase">(tự tính)</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    {!isLocked && inputMode !== 'MODE_2_TOTAL_ABSENT' && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'present', Math.max(0, presentNum - 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-emerald-200 text-emerald-800 font-bold text-base hover:bg-emerald-50 active:scale-95 transition-all shadow-2xs"
                      >
                        -
                      </button>
                    )}
                    <input
                      type="number"
                      min="0"
                      max={totalNum > 0 ? totalNum : undefined}
                      disabled={isLocked || inputMode === 'MODE_2_TOTAL_ABSENT'}
                      placeholder="0"
                      value={vals.present === '' ? '' : vals.present}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        if (vals.present === '') {
                          handleValueChange(indicator.id, 'present', 0);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleValueChange(indicator.id, 'present', '');
                        } else {
                          const parsed = parseInt(val, 10);
                          handleValueChange(indicator.id, 'present', isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      className={`flex-1 bg-white border border-emerald-200 rounded-lg py-1.5 px-3 text-center text-lg font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner ${
                        inputMode === 'MODE_2_TOTAL_ABSENT' ? 'bg-emerald-50/30' : ''
                      }`}
                    />
                    {!isLocked && inputMode !== 'MODE_2_TOTAL_ABSENT' && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'present', totalNum > 0 ? Math.min(totalNum, presentNum + 1) : presentNum + 1)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-emerald-200 text-emerald-800 font-bold text-base hover:bg-emerald-50 active:scale-95 transition-all shadow-2xs"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Vắng mặt */}
                <div className="bg-rose-50/50 p-3.5 rounded-xl border border-rose-200/60">
                  <label className="flex items-center justify-between text-xs font-bold text-rose-800 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5">
                      <UserX className="w-3.5 h-3.5 text-rose-600" />
                      Vắng mặt
                    </span>
                    {inputMode === 'MODE_1_TOTAL_PRESENT' && (
                      <span className="text-[10px] text-rose-600 font-normal lowercase">(tự tính)</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    {!isLocked && inputMode !== 'MODE_1_TOTAL_PRESENT' && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'absent', Math.max(0, absentNum - 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-rose-200 text-rose-800 font-bold text-base hover:bg-rose-50 active:scale-95 transition-all shadow-2xs"
                      >
                        -
                      </button>
                    )}
                    <input
                      type="number"
                      min="0"
                      max={totalNum > 0 ? totalNum : undefined}
                      disabled={isLocked || inputMode === 'MODE_1_TOTAL_PRESENT'}
                      placeholder="0"
                      value={vals.absent === '' ? '' : vals.absent}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        if (vals.absent === '') {
                          handleValueChange(indicator.id, 'absent', 0);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleValueChange(indicator.id, 'absent', '');
                        } else {
                          const parsed = parseInt(val, 10);
                          handleValueChange(indicator.id, 'absent', isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      className={`flex-1 bg-white border border-rose-200 rounded-lg py-1.5 px-3 text-center text-lg font-black text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-inner ${
                        inputMode === 'MODE_1_TOTAL_PRESENT' ? 'bg-rose-50/30' : ''
                      }`}
                    />
                    {!isLocked && inputMode !== 'MODE_1_TOTAL_PRESENT' && (
                      <button
                        type="button"
                        onClick={() => handleValueChange(indicator.id, 'absent', totalNum > 0 ? Math.min(totalNum, absentNum + 1) : absentNum + 1)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-rose-200 text-rose-800 font-bold text-base hover:bg-rose-50 active:scale-95 transition-all shadow-2xs"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Đối chiếu phân loại Sĩ số: Báo ăn (Bán trú) & Không ăn (Ngoại trú) chuẩn theo mẫu báo cáo */}
      {(() => {
        const primaryInd = enabledIndicators[0];
        const boardingInd = enabledIndicators.find(
          (i) => i.code === 'BOARDING_HALF' || i.id === 'ig_boarding_half' || i.name.toLowerCase().includes('bán trú')
        );
        const hasExplicitNgoaiTru = enabledIndicators.some(
          (i) => i.name.toLowerCase().includes('ngoại trú') || i.name.toLowerCase().includes('không ăn')
        );

        if (!primaryInd || !boardingInd || hasExplicitNgoaiTru) return null;

        const pTotal = Number(formValues[primaryInd.id]?.total) || 0;
        const pAbsent = Number(formValues[primaryInd.id]?.absent) || 0;
        const bTotal = Number(formValues[boardingInd.id]?.total) || 0;
        const bAbsent = Number(formValues[boardingInd.id]?.absent) || 0;

        const baoAn = Math.max(0, bTotal - bAbsent);
        const ngoaiTruTotal = Math.max(0, pTotal - bTotal);
        const ngoaiTruAbsent = Math.max(0, pAbsent - bAbsent);
        const ngoaiTruPresent = Math.max(0, ngoaiTruTotal - ngoaiTruAbsent);

        if (pTotal === 0 && bTotal === 0) return null;

        return (
          <div className="bg-gradient-to-r from-emerald-50/70 via-white to-amber-50/70 rounded-2xl border border-slate-200/80 p-4 mb-5 shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/60">
              <span className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Đối chiếu phân loại theo mẫu báo cáo BGH
              </span>
              <span className="text-[11px] text-slate-500 font-medium">Tự động tổng hợp</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Học sinh bán trú (Báo ăn) */}
              <div className="bg-white/95 p-3 rounded-xl border border-emerald-200 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">HS bán trú (Báo ăn trưa)</div>
                    <div className="text-[11px] text-slate-500">
                      Tổng {bTotal} • Vắng {bAbsent}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-emerald-700">{baoAn} suất</div>
                  <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Báo ăn nhà bếp
                  </div>
                </div>
              </div>

              {/* Học sinh ngoại trú (Không ăn) - Biểu tượng Ngôi nhà phù hợp */}
              <div className="bg-white/95 p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold">
                    <Home className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">HS ngoại trú (Không ăn tại trường)</div>
                    <div className="text-[11px] text-slate-500">
                      Có mặt {ngoaiTruPresent} • Vắng {ngoaiTruAbsent}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-amber-800">{ngoaiTruTotal} em</div>
                  <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    Trưa về nhà
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Absent Students Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-sm">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Danh sách học sinh vắng mặt
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                  {absentStudents.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Ghi danh học sinh nghỉ học, địa chỉ cư trú và lý do cụ thể gửi BGH
              </p>
            </div>
          </div>

          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowQuickAddModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              Thêm học sinh vắng
            </button>
          )}
        </div>

        {/* Quick Tagging Chips of Enrolled Students */}
        {!isLocked && availableStudentsForAbsent.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <span>Bấm nhanh để đánh dấu vắng:</span>
              <span className="text-[11px] text-slate-400 font-normal">({availableStudentsForAbsent.length} học sinh trong lớp)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {availableStudentsForAbsent.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleAddAbsentStudent(st.full_name, st.address || '', 'Ốm', !!st.isBoarding)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition-colors shadow-2xs group"
                >
                  <Plus className="w-3 h-3 text-slate-400 group-hover:text-rose-600" />
                  <span>{st.full_name}</span>
                  {st.isBoarding && (
                    <span className="text-[10px] text-amber-600 font-semibold">(BT)</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Absent Students List / Table */}
        {absentStudents.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <UserCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <h3 className="text-sm font-bold text-slate-700">Hôm nay lớp đi học đầy đủ</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Không có học sinh nào vắng mặt. Bấm "Thêm học sinh vắng" hoặc bấm tên học sinh ở trên nếu có em nghỉ học.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {absentStudents.map((st, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200 transition-colors"
              >
                {/* Index & Name */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={st.full_name}
                    placeholder="Họ và tên học sinh"
                    onChange={(e) => handleUpdateAbsentStudent(index, { full_name: e.target.value })}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                  />
                </div>

                {/* Address */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    disabled={isLocked}
                    value={st.address || ''}
                    placeholder="Bản/Thôn/Địa chỉ"
                    onChange={(e) => handleUpdateAbsentStudent(index, { address: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Reason Quick Buttons & Custom Input */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <select
                    disabled={isLocked}
                    value={st.reason || 'Ốm'}
                    onChange={(e) => handleUpdateAbsentStudent(index, { reason: e.target.value })}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Ốm">Ốm</option>
                    <option value="Có phép">Có phép</option>
                    <option value="Không phép">Không phép</option>
                    <option value="Gia đình">Gia đình có việc</option>
                    <option value="Thời tiết/Mưa rét">Mưa rét/Đường xa</option>
                    <option value="Khác">Lý do khác</option>
                  </select>

                  {/* Boarding Toggle */}
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white px-2 py-1.5 rounded-lg border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={!!st.isBoarding}
                      onChange={(e) => handleUpdateAbsentStudent(index, { isBoarding: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span>Bán trú</span>
                  </label>

                  {/* Remove Button */}
                  {!isLocked && (
                    <button
                      type="button"
                      title="Xóa"
                      onClick={() => handleRemoveAbsentStudent(index)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-auto flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes / Ghi chú của GVCN */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-5">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Ghi chú báo cáo tới Ban Giám Hiệu
        </label>
        <textarea
          rows={3}
          disabled={isLocked}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ghi chú thêm về tình hình lớp, học sinh đi viện, hoàn cảnh đặc biệt..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Desktop Bottom Action Bar */}
      <div className="hidden sm:flex items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          {existingReport && !isLocked && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>Reset nhầm</span>
            </button>
          )}

          <div className="text-xs text-slate-500">
            {isLocked ? (
              <span className="text-slate-600 font-medium">Báo cáo đã khóa sổ.</span>
            ) : existingReport ? (
              <span>Lần gửi gần nhất: {existingReport.reported_time || formatDateVN(existingReport.updated_at.split('T')[0])}</span>
            ) : (
              <span>Vui lòng kiểm tra kỹ số liệu trước khi gửi.</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isLocked ? (
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm border border-slate-200">
              <Lock className="w-4 h-4" />
              Báo cáo đã khóa
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
              className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-[0.98] ${
                isValid && !isSaving
                  ? existingReport
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang lưu báo cáo...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{existingReport ? 'CẬP NHẬT BÁO CÁO' : 'GỬI BÁO CÁO'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Sticky Bottom Action Bar (Fixed, Two-Row Layout, No Squashing) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 shadow-xl">
        {/* Row 1: Summary stats */}
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2 px-1">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-slate-900">{selectedClass?.class_name}:</span>
            <span className="text-blue-700">{mainPresent}/{mainTotal}</span>
            <span className="text-slate-400">•</span>
            <span className={mainAbsent > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-medium'}>
              Vắng: {mainAbsent}
            </span>
            {boardingVal && Number(boardingVal.present) > 0 && (
              <>
                <span className="text-slate-400">•</span>
                <span className="text-amber-700 font-medium">{Number(boardingVal.present)} suất ăn</span>
              </>
            )}
          </div>
          <div className="text-[11px] font-bold text-slate-500 whitespace-nowrap ml-2">
            {mainTotal > 0 ? `${Math.round((mainPresent / mainTotal) * 100)}%` : '0%'}
          </div>
        </div>

        {/* Row 2: Action buttons */}
        <div className="flex items-center gap-2">
          {existingReport && !isLocked && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isSaving}
              className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-xs active:bg-rose-100 transition-colors flex-shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset nhầm</span>
            </button>
          )}

          {isLocked ? (
            <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>Báo cáo đã khóa</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md transition-all active:scale-[0.98] ${
                isValid && !isSaving
                  ? existingReport
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{existingReport ? 'CẬP NHẬT BÁO CÁO' : 'GỬI BÁO CÁO'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Reset Nhầm */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Xác nhận xóa báo cáo nhầm?
            </h3>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Bạn có chắc chắn muốn xóa báo cáo sĩ số của lớp{' '}
              <strong className="text-slate-900">{selectedClass?.class_name}</strong> ngày{' '}
              <strong className="text-slate-900">{formatDateVN(selectedDate)}</strong> về trạng thái{' '}
              <span className="text-rose-600 font-bold">Chưa nộp báo cáo</span>? Dữ liệu đã nhập sẽ được đặt lại.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleResetReport}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5"
              >
                {isSaving ? 'Đang xóa...' : 'Đồng ý xóa / Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserX className="w-5 h-5 text-rose-600" />
                Thêm học sinh vắng mặt
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newAbsentName.trim()) {
                  handleAddAbsentStudent(newAbsentName, newAbsentAddress, newAbsentReason, newAbsentIsBoarding);
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên học sinh <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: Vàng A Sinh"
                  value={newAbsentName}
                  onChange={(e) => setNewAbsentName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bản / Thôn / Địa chỉ cư trú
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bản Nà Sản A"
                  value={newAbsentAddress}
                  onChange={(e) => setNewAbsentAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lý do vắng
                  </label>
                  <select
                    value={newAbsentReason}
                    onChange={(e) => setNewAbsentReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Ốm">Ốm</option>
                    <option value="Có phép">Có phép</option>
                    <option value="Không phép">Không phép</option>
                    <option value="Gia đình">Gia đình có việc</option>
                    <option value="Thời tiết/Mưa rét">Mưa rét/Đường xa</option>
                    <option value="Khác">Lý do khác</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newAbsentIsBoarding}
                      onChange={(e) => setNewAbsentIsBoarding(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">Ăn bán trú</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={!newAbsentName.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-600/20"
                >
                  Thêm vào danh sách
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
