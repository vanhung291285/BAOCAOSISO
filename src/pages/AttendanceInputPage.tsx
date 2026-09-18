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
  ClipboardList,
  X,
  FileText,
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
  const { settings, classes, indicators, campuses } = useSchool();

  // Selected date defaults to today (or initialDate)
  const getToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const today = getToday();
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
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [quickFillNotice, setQuickFillNotice] = useState<string>('');
  const [showQuickPaste, setShowQuickPaste] = useState<boolean>(false);
  const [quickPasteText, setQuickPasteText] = useState<string>('');

  // Reset report state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string>('');

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

  const canReset = useMemo(() => {
    if (!existingReport) return false;
    if (isAdmin || currentUser?.role === 'BGH') return true;
    if (isGVCN && isAssignedTeacher && !isLocked) return true;
    return false;
  }, [existingReport, isAdmin, currentUser, isGVCN, isAssignedTeacher, isLocked]);

  const handleResetReport = async () => {
    if (!selectedClassId || !reportDate || !currentUser) return;
    setIsResetting(true);
    setErrorMessage('');
    try {
      const ok = await StorageService.deleteDailyReport(selectedClassId, reportDate, currentUser);
      if (ok) {
        setExistingReport(null);
        setNotes('');
        setAbsentStudents([]);
        setShowResetConfirmModal(false);
        setResetSuccessMessage(
          `Đã reset báo cáo ngày ${reportDate.split('-').reverse().join('/')} của lớp ${selectedClass?.class_name || ''} về trạng thái CHƯA BÁO CÁO thành công!`
        );
        setTimeout(() => setResetSuccessMessage(''), 6000);

        // Reset form inputs
        const initialMap: Record<string, GroupInputState> = {};
        enabledIndicators.forEach((ig) => {
          initialMap[ig.id] = { total: '', present: '', absent: '' };
        });
        setFormValues(initialMap);

        if (onSavedSuccess) onSavedSuccess();
      } else {
        setErrorMessage('Không tìm thấy báo cáo để reset hoặc báo cáo đã được xóa trước đó.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi reset báo cáo');
    } finally {
      setIsResetting(false);
    }
  };

  // Reset success modal when changing date or class
  useEffect(() => {
    setSaveSuccess(false);
  }, [selectedClassId, reportDate]);

  // Load existing report for this class and date
  useEffect(() => {
    if (!selectedClassId || !reportDate) return;

    setLoading(true);
    setErrorMessage('');
    setQuickFillNotice('');

    StorageService.getDailyReport(selectedClassId, reportDate)
      .then(async ({ report, values }) => {
        setExistingReport(report || null);
        setNotes(report?.notes || '');
        setAbsentStudents(report?.absent_students || []);

        const initialMap: Record<string, GroupInputState> = {};

        // 1. Nếu ngày này đã có báo cáo và có dữ liệu sĩ số
        const hasExistingValidValues = values && values.some((v) => (v.total_count || 0) > 0);
        if (report && hasExistingValidValues) {
          enabledIndicators.forEach((ig) => {
            const val = values.find((v) => v.indicator_group_id === ig.id);
            if (val) {
              initialMap[ig.id] = {
                total: val.total_count,
                present: val.present_count,
                absent: val.absent_count,
              };
            } else {
              initialMap[ig.id] = {
                total: '',
                present: '',
                absent: '',
              };
            }
          });
          setFormValues(initialMap);
        } else {
          // 2. Chưa có báo cáo cho ngày này: Tìm báo cáo gần nhất trước đó của lớp để gợi ý sĩ số tổng
          try {
            const latestPrev = await StorageService.getLatestReportForClass(selectedClassId, reportDate);
            if (latestPrev.report && latestPrev.values.length > 0) {
              let suggestedTotal = 0;
              enabledIndicators.forEach((ig) => {
                const prevVal = latestPrev.values.find((v) => v.indicator_group_id === ig.id);
                if (prevVal && prevVal.total_count > 0) {
                  initialMap[ig.id] = {
                    total: prevVal.total_count,
                    present: prevVal.total_count, // Mặc định đủ cả lớp từ sĩ số chuẩn
                    absent: 0,
                  };
                  if (ig.id === enabledIndicators[0]?.id) {
                    suggestedTotal = prevVal.total_count;
                  }
                } else {
                  initialMap[ig.id] = {
                    total: 0,
                    present: 0,
                    absent: 0,
                  };
                }
              });
              setFormValues(initialMap);
              if (suggestedTotal > 0) {
                setQuickFillNotice(
                  `Đã tự động lấy Sĩ số (${suggestedTotal} học sinh) từ ngày gần nhất. Thầy/Cô hãy kiểm tra lại và gửi báo cáo.`
                );
                setTimeout(() => setQuickFillNotice(''), 5000);
              }
            } else {
              // Lớp chưa từng có báo cáo nào: Để trống để bắt buộc GVCN phải nhập số liệu
              enabledIndicators.forEach((ig) => {
                initialMap[ig.id] = {
                  total: '',
                  present: '',
                  absent: '',
                };
              });
              setFormValues(initialMap);
            }
          } catch (e) {
            enabledIndicators.forEach((ig) => {
              initialMap[ig.id] = {
                total: '',
                present: '',
                absent: '',
              };
            });
            setFormValues(initialMap);
          }
        }

        // Luôn cho phép GVCN và Admin nhập/chỉnh sửa khi báo cáo chưa bị khóa
        const lockedState = Boolean(selectedClass?.is_locked || report?.status === 'LOCKED');
        setIsEditMode(!lockedState || isAdmin);
      })
      .finally(() => setLoading(false));
  }, [selectedClassId, reportDate, enabledIndicators, isAdmin, selectedClass?.is_locked]);

  // Đồng bộ tự động danh sách học sinh vắng theo số lượng vắng
  const syncAbsentListToCount = (targetCount: number) => {
    setAbsentStudents((prev) => {
      if (targetCount === 0) {
        // Nếu không vắng em nào và chưa nhập tên ai thì xóa trắng
        const hasFilled = prev.some((s) => s.full_name && s.full_name.trim() !== '');
        return hasFilled ? prev : [];
      }
      if (prev.length < targetCount) {
        // Tự động bổ sung các dòng mới để GVCN nhập tên trực tiếp
        const diff = targetCount - prev.length;
        const newSlots: AbsentStudent[] = Array.from({ length: diff }, () => ({
          full_name: '',
          address: '',
          reason: 'Ốm',
        }));
        return [...prev, ...newSlots];
      } else if (prev.length > targetCount) {
        // Chỉ lược bớt những ô chưa nhập tên từ dưới lên
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated.length <= targetCount) break;
          if (!updated[i].full_name || updated[i].full_name.trim() === '') {
            updated.splice(i, 1);
          }
        }
        return updated;
      }
      return prev;
    });
  };

  // Handle field change with automatic calculation
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

      if (field === 'total') {
        if (typeof next.absent === 'number') {
          next.present = Math.max(0, total - absent);
        } else if (typeof next.present === 'number') {
          next.absent = Math.max(0, total - present);
        }
      } else if (field === 'present') {
        next.absent = Math.max(0, total - (typeof numVal === 'number' ? numVal : 0));
      } else if (field === 'absent') {
        next.present = Math.max(0, total - (typeof numVal === 'number' ? numVal : 0));
      }

      // Tự động lập danh sách học sinh vắng nếu là nhóm chỉ tiêu chính (Sĩ số trường / lớp)
      if (groupId === enabledIndicators[0]?.id && typeof next.absent === 'number') {
        syncAbsentListToCount(next.absent);
      }

      return {
        ...prev,
        [groupId]: next,
      };
    });
  };

  // Quick increment/decrement helper for mobile with >= 44px touch targets
  const adjustValue = (groupId: string, field: 'present' | 'absent', delta: number) => {
    const current = formValues[groupId] || { total: '', present: '', absent: '' };
    const curVal = typeof current[field] === 'number' ? (current[field] as number) : 0;
    const nextVal = Math.max(0, curVal + delta);
    handleFieldChange(groupId, field, String(nextVal));
  };

  // Quick preset for absentee count (0, 1, 2, 3 vắng)
  const setAbsentPreset = (groupId: string, absentCount: number) => {
    const current = formValues[groupId] || { total: '', present: '', absent: '' };
    const total = typeof current.total === 'number' ? current.total : Number(current.total) || 0;
    if (total <= 0) {
      setErrorMessage('Vui lòng nhập Tổng số học sinh của lớp trước khi chọn số em vắng.');
      return;
    }
    const actualAbsent = Math.min(absentCount, total);
    const actualPresent = Math.max(0, total - actualAbsent);

    setErrorMessage('');
    setFormValues((prev) => ({
      ...prev,
      [groupId]: {
        ...current,
        total,
        present: actualPresent,
        absent: actualAbsent,
      },
    }));

    // Tự động lập danh sách học sinh vắng cho nhóm chỉ tiêu chính
    if (groupId === enabledIndicators[0]?.id) {
      if (actualAbsent === 0) {
        setAbsentStudents([]);
      } else {
        syncAbsentListToCount(actualAbsent);
      }
    }
  };

  // 1-Tap Quick Action: "CẢ LỚP ĐỦ 100%"
  const handleSetFullAttendance = () => {
    const mainGroup = enabledIndicators[0];
    const mainTotal = mainGroup ? Number(formValues[mainGroup.id]?.total) || 0 : 0;
    if (mainTotal <= 0) {
      setErrorMessage('Vui lòng nhập Sĩ số học sinh của lớp (Tổng số > 0) trước khi bấm Cả lớp đi đủ.');
      return;
    }

    setFormValues((prev) => {
      const nextMap: Record<string, GroupInputState> = {};
      enabledIndicators.forEach((ig) => {
        const cur = prev[ig.id] || { total: '', present: '', absent: '' };
        const total = typeof cur.total === 'number' ? cur.total : Number(cur.total) || 0;
        nextMap[ig.id] = {
          total,
          present: total,
          absent: 0,
        };
      });
      return nextMap;
    });
    setAbsentStudents([]);
    setErrorMessage('');
    setQuickFillNotice('Đã áp dụng: Cả lớp đi học đầy đủ 100% (Vắng: 0)!');
    setTimeout(() => setQuickFillNotice(''), 3500);
  };

  // Absent student handlers
  const handleAddAbsentStudent = () => {
    const mainGroup = enabledIndicators[0];
    const mainTotal = mainGroup ? Number(formValues[mainGroup.id]?.total) || 0 : 0;
    if (mainTotal <= 0) {
      setErrorMessage('Vui lòng nhập Sĩ số lớp (Tổng số > 0) trước khi thêm học sinh vắng.');
      return;
    }
    setAbsentStudents((prev) => [...prev, { full_name: '', address: '', reason: 'Ốm' }]);

    // Tự động đồng bộ tăng số vắng ở chỉ tiêu chính nếu cần
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      setFormValues((prevVals) => {
        const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 0;
        const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
        const newAbsent = Math.max(curAbsent, absentStudents.length + 1);
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

    // Tự động đồng bộ giảm số vắng ở chỉ tiêu chính nếu đang bằng số em trong danh sách
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      setFormValues((prevVals) => {
        const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 0;
        const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
        if (curAbsent > updated.length) {
          const newAbsent = updated.length;
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
        }
        return prevVals;
      });
    }
  };

  // Dán nhanh danh sách học sinh vắng từ Zalo / Tin nhắn
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;

    const lines = quickPasteText
      .split(/[\n;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: AbsentStudent[] = [];

    lines.forEach((line) => {
      // Bỏ số thứ tự 1., 2/ hoặc gạch đầu dòng -, *
      const cleaned = line.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').replace(/^[\-\*\•\+]\s*/, '').trim();
      if (!cleaned) return;

      let fullName = cleaned;
      let reason = 'Ốm';
      let address = '';

      // Tách lý do trong ngoặc đơn () hoặc ngoặc vuông []
      const parenMatch = cleaned.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
      if (parenMatch) {
        fullName = parenMatch[1].trim();
        const inside = parenMatch[2].trim();
        const parts = inside.split(/[,;\-]/).map((p) => p.trim());
        reason = parts[0] || 'Ốm';
        if (parts[1]) address = parts[1];
      } else {
        // Tách theo dấu gạch ngang hoặc hai chấm
        const dashParts = cleaned.split(/[\-\:]/).map((p) => p.trim());
        if (dashParts.length > 1) {
          fullName = dashParts[0].trim();
          reason = dashParts[1].trim() || 'Ốm';
          if (dashParts[2]) address = dashParts[2].trim();
        }
      }

      if (fullName) {
        parsed.push({
          full_name: fullName,
          address: address || '',
          reason: reason || 'Ốm',
        });
      }
    });

    if (parsed.length > 0) {
      setAbsentStudents(parsed);
      setShowQuickPaste(false);
      setQuickPasteText('');
      setQuickFillNotice(`Đã tự động thêm ${parsed.length} học sinh vắng vào danh sách!`);
      setTimeout(() => setQuickFillNotice(''), 3500);

      // Tự động đồng bộ sĩ số vắng ở nhóm chỉ tiêu chính
      if (enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prev) => {
          const cur = prev[mainId] || { total: 0, present: 0, absent: 0 };
          const total = typeof cur.total === 'number' ? cur.total : 0;
          const newAbsent = parsed.length;
          const newPresent = Math.max(0, total - newAbsent);
          return {
            ...prev,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        });
      }
    }
  };

  // Validation rules check
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // 1. Kiểm tra nhóm chỉ tiêu chính (Sĩ số học sinh cả lớp)
    const mainGroup = enabledIndicators[0];
    const mainVals = mainGroup ? formValues[mainGroup.id] : null;
    const mainTotal = mainVals && typeof mainVals.total === 'number' ? mainVals.total : Number(mainVals?.total) || 0;

    if (!mainVals || mainVals.total === '' || mainTotal <= 0) {
      errors.push('Chưa nhập số liệu sĩ số: Tổng số học sinh của lớp phải lớn hơn 0.');
    }

    let hasAnyPositiveTotal = false;

    enabledIndicators.forEach((ig) => {
      const gVals = formValues[ig.id];
      if (!gVals) return;

      const rawTotal = gVals.total;
      const rawPresent = gVals.present;
      const rawAbsent = gVals.absent;

      // Không cho phép để trống ô số liệu
      if (rawTotal === '' || rawPresent === '' || rawAbsent === '') {
        errors.push(`Nhóm "${ig.name}": Vui lòng điền đầy đủ các ô số liệu (nhập số 0 nếu không có).`);
        return;
      }

      const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal) || 0;
      const present = typeof rawPresent === 'number' ? rawPresent : Number(rawPresent) || 0;
      const absent = typeof rawAbsent === 'number' ? rawAbsent : Number(rawAbsent) || 0;

      if (total > 0) {
        hasAnyPositiveTotal = true;
      }

      if (total < 0 || present < 0 || absent < 0) {
        errors.push(`Nhóm "${ig.name}": Số lượng không được nhỏ hơn 0.`);
      }

      if (present > total) {
        errors.push(`Nhóm "${ig.name}": Số có mặt (${present}) vượt quá tổng số (${total}).`);
      }

      if (absent > total) {
        errors.push(`Nhóm "${ig.name}": Số vắng (${absent}) vượt quá tổng số (${total}).`);
      }

      if (total > 0 && present + absent !== total) {
        errors.push(
          `Nhóm "${ig.name}": Có mặt (${present}) + Vắng (${absent}) = ${present + absent}, phải bằng Tổng số (${total}).`
        );
      }
    });

    if (!hasAnyPositiveTotal && errors.length === 0) {
      errors.push('Thầy/Cô chưa nhập số liệu báo cáo. Vui lòng nhập sĩ số trước khi gửi.');
    }

    return errors;
  }, [formValues, enabledIndicators]);

  const isValid = validationErrors.length === 0;

  // Compute summary for sticky mobile bar
  const mobileSummary = useMemo(() => {
    const mainGroup = enabledIndicators[0];
    if (!mainGroup) return null;
    const v = formValues[mainGroup.id];
    return {
      total: typeof v?.total === 'number' ? v.total : Number(v?.total) || 0,
      present: typeof v?.present === 'number' ? v.present : Number(v?.present) || 0,
      absent: typeof v?.absent === 'number' ? v.absent : Number(v?.absent) || 0,
    };
  }, [enabledIndicators, formValues]);

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    // Kiểm tra bắt buộc có sĩ số học sinh
    const mainGroup = enabledIndicators[0];
    const mainVals = mainGroup ? formValues[mainGroup.id] : null;
    const mainTotal = mainVals && typeof mainVals.total === 'number' ? mainVals.total : Number(mainVals?.total) || 0;

    if (!isValid || mainTotal <= 0) {
      setErrorMessage(
        validationErrors[0] ||
        'Không thể gửi báo cáo: Thầy/Cô chưa nhập số liệu sĩ số học sinh của lớp (Tổng số học sinh phải lớn hơn 0)!'
      );
      const errorEl = document.getElementById('validation-error-box');
      if (errorEl) {
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
      setIsEditMode(true);

      if (onSavedSuccess) {
        onSavedSuccess();
      }

      // Scroll smoothly to top on mobile to see confirmation
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving report:', err);
      setErrorMessage(err?.message || 'Không thể lưu báo cáo. Vui lòng kiểm tra lại số liệu.');
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
                {settings?.enable_campuses && campuses.length > 0 ? (
                  <>
                    {campuses.map(campus => {
                      const campusClasses = classes.filter(c => c.campus_id === campus.id);
                      if (campusClasses.length === 0) return null;
                      return (
                        <optgroup key={campus.id} label={campus.name}>
                          {campusClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              Lớp {c.class_name} (Khối {c.grade})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {classes.filter(c => !c.campus_id).length > 0 && (
                      <optgroup label="Chưa xếp phân hiệu">
                        {classes.filter(c => !c.campus_id).map((c) => (
                          <option key={c.id} value={c.id}>
                            Lớp {c.class_name} (Khối {c.grade})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.class_name} (Khối {c.grade})
                    </option>
                  ))
                )}
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

      {/* Reset Success Message Toast */}
      {resetSuccessMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{resetSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessMessage('')}
            className="text-white/80 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Existing Report / Lock Notification Banner */}
      {existingReport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-emerald-900">
                Đã có báo cáo ngày {reportDate.split('-').reverse().join('/')}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Lớp <span className="font-bold">{selectedClass?.class_name}</span> đã lưu lúc{' '}
                {new Date(existingReport.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Thầy/Cô có thể chỉnh sửa số liệu hoặc hủy về trạng thái Chưa báo cáo nếu gửi nhầm.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0 flex-wrap">
            {isLocked ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 whitespace-nowrap">
                <Lock className="w-3.5 h-3.5" /> Đã khóa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 whitespace-nowrap">
                <Check className="w-3.5 h-3.5" /> Sẵn sàng cập nhật
              </span>
            )}

            {canReset && (
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
                title="Hủy/Reset báo cáo ngày này về Chưa báo cáo nếu báo cáo nhầm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>Reset báo cáo nhầm</span>
              </button>
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

      {/* Success Modal Window */}
      {saveSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500 relative">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 sm:p-8 text-center relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white opacity-10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
              
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-xl mx-auto mb-4 relative z-10 animate-bounce">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600" />
              </div>
              
              <h3 className="font-black text-xl sm:text-2xl text-white tracking-wide drop-shadow-sm flex items-center justify-center gap-2 relative z-10">
                THÀNH CÔNG <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 animate-pulse" />
              </h3>
            </div>
            
            <div className="p-6 text-center space-y-5">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Báo cáo sĩ số của lớp <span className="font-bold text-slate-900">{selectedClass?.class_name}</span> đã được lưu và đồng bộ thành công lên hệ thống toàn trường.
              </p>
              
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setSaveSuccess(false)}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-98"
                >
                  Đóng cửa sổ
                </button>
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveSuccess(false);
                        onNavigate('/reports/daily');
                      }}
                      className="w-full py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-sm rounded-xl transition-all active:scale-98 flex items-center justify-center gap-1.5"
                    >
                      <span>Xem Biểu Mẫu Toàn Trường</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveSuccess(false);
                        onNavigate('/dashboard');
                      }}
                      className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all active:scale-98"
                    >
                      Về Bảng điều khiển
                    </button>
                  </>
                )}
              </div>
              
              <div className="pt-2">
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium tracking-wide">
                  Ứng dụng được phát triển bởi: <span className="font-bold text-slate-500">Vũ Hùng - SĐT: 0984246993</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Input Form */}
      <form onSubmit={(e) => handleSave(e)} className="space-y-4">
        {/* Indicator Group Cards (Học sinh toàn trường & Bán trú) */}
        {enabledIndicators.map((group, idx) => {
          const vals = formValues[group.id] || { total: '', present: '', absent: '' };
          const totalNum = typeof vals.total === 'number' ? vals.total : Number(vals.total) || 0;
          const presentNum = typeof vals.present === 'number' ? vals.present : Number(vals.present) || 0;
          const absentNum = typeof vals.absent === 'number' ? vals.absent : Number(vals.absent) || 0;
          const presentRate = totalNum > 0 ? (presentNum / totalNum) * 100 : 0;

          const isMain = idx === 0;
          const hasEmptyField = vals.total === '' || vals.present === '' || vals.absent === '';
          const isGroupValid = isMain
            ? (totalNum > 0 && presentNum >= 0 && absentNum >= 0 && presentNum + absentNum === totalNum && !hasEmptyField)
            : (totalNum >= 0 && presentNum >= 0 && absentNum >= 0 && presentNum + absentNum === totalNum && !hasEmptyField);

          return (
            <div
              key={group.id}
              className={`bg-white rounded-2xl p-3.5 sm:p-5 border shadow-xs transition-all ${
                isGroupValid ? 'border-slate-200' : 'border-amber-300 ring-2 ring-amber-100'
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
                  {isMain && (vals.total === '' || totalNum <= 0) && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Chưa nhập sĩ số
                    </span>
                  )}
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
                    <span className="text-[10px] font-semibold text-blue-600">
                      (Tự động lập danh sách vắng)
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
                <div className={`p-2 sm:p-3 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${
                  idx === 0 && (vals.total === '' || totalNum <= 0)
                    ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-100'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <label className="block text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 whitespace-nowrap">
                    Tổng số
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    step="1"
                    placeholder="0"
                    disabled={isLocked && !isAdmin}
                    value={vals.total}
                    onChange={(e) => handleFieldChange(group.id, 'total', e.target.value)}
                    className={`w-full text-center text-lg sm:text-2xl font-black bg-white border rounded-lg h-10 sm:h-11 focus:ring-2 focus:outline-hidden disabled:bg-slate-100 ${
                      idx === 0 && (vals.total === '' || totalNum <= 0)
                        ? 'border-amber-400 text-amber-900 focus:ring-amber-500'
                        : 'border-slate-300 text-slate-900 focus:ring-blue-500'
                    }`}
                  />
                  <div className={`text-[10px] mt-1 whitespace-nowrap ${
                    idx === 0 && (vals.total === '' || totalNum <= 0)
                      ? 'text-amber-700 font-extrabold'
                      : 'text-slate-400'
                  }`}>
                    {idx === 0 && (vals.total === '' || totalNum <= 0) ? 'Bắt buộc nhập' : 'Sĩ số lớp'}
                  </div>
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
                    disabled={isLocked && !isAdmin}
                    value={vals.present}
                    onChange={(e) => handleFieldChange(group.id, 'present', e.target.value)}
                    className="w-full text-center text-lg sm:text-2xl font-black text-emerald-800 bg-white border border-emerald-300 rounded-lg h-10 sm:h-11 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden disabled:bg-slate-100"
                  />
                  {!isLocked || isAdmin ? (
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
                    disabled={isLocked && !isAdmin}
                    value={vals.absent}
                    onChange={(e) => handleFieldChange(group.id, 'absent', e.target.value)}
                    className={`w-full text-center text-lg sm:text-2xl font-black rounded-lg h-10 sm:h-11 focus:ring-2 focus:ring-red-500 focus:outline-hidden ${
                      absentNum > 0 ? 'text-red-700 bg-red-100' : 'text-slate-700 bg-white'
                    } border border-red-300 disabled:bg-slate-100`}
                  />
                  {!isLocked || isAdmin ? (
                    <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'absent', -1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-900 font-black text-xs flex items-center justify-center active:scale-90"
                        title="Giảm 1"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustValue(group.id, 'absent', 1)}
                        className="flex-1 max-w-[36px] h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-900 font-black text-xs flex items-center justify-center active:scale-90"
                        title="Tăng 1"
                      >
                        +1
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-red-600 mt-1 whitespace-nowrap">Vắng</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 4. Absent Students Detail Cards */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          {/* Header tách biệt rõ ràng 2 tầng: Tiêu đề + Các nút thao tác nhanh */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider truncate">
                  HỌC SINH VẮNG & LÝ DO
                </h4>
                {absentStudents.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-black">
                    {absentStudents.length} em
                  </span>
                )}
              </div>
              {(!isLocked || isAdmin) && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowQuickPaste(true)}
                    className="h-8 px-2.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 whitespace-nowrap"
                    title="Dán nhanh danh sách học sinh vắng từ tin nhắn Zalo"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Dán từ Zalo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAbsentStudent}
                    className="h-8 px-2.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm em vắng</span>
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-tight">
              Hệ thống tự động đồng bộ số em vắng với sĩ số bên trên. Thầy/Cô nhập tên học sinh và lý do vắng để in biểu mẫu báo cáo.
            </p>
          </div>

          {absentStudents.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-200 border-dashed space-y-2">
              <UserX className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-600 font-bold">Chưa có học sinh nào báo vắng (Lớp đi đủ 100%)</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Khi lớp có em vắng, Thầy/Cô chỉ cần bấm chọn số lượng ở mục "Chọn nhanh số em vắng" bên trên hoặc bấm nút dưới đây.
              </p>
              {(!isLocked || isAdmin) && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddAbsentStudent}
                    className="h-8 px-3 rounded-lg text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm 1 em vắng
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickPaste(true)}
                    className="h-8 px-3 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors flex items-center gap-1.5"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Dán từ Zalo
                  </button>
                </div>
              )}
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
                    {(!isLocked || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAbsentStudent(idx)}
                        className="h-6 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded flex items-center gap-1 transition-colors"
                        title="Xóa học sinh này"
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
                        disabled={isLocked && !isAdmin}
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
                        disabled={isLocked && !isAdmin}
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
                      disabled={isLocked && !isAdmin}
                      value={student.reason || ''}
                      onChange={(e) => handleUpdateAbsentStudent(idx, 'reason', e.target.value)}
                      placeholder="Gõ lý do hoặc bấm chọn bên dưới..."
                      className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                    />

                    {/* Quick reason tag chips */}
                    {(!isLocked || isAdmin) && (
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
              disabled={isLocked && !isAdmin}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú tổng thể tình hình học sinh của lớp..."
              className="w-full px-3 h-9 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div id="validation-error-box" className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-1.5 animate-in shake duration-150">
            <div className="flex items-center gap-2 text-red-800 font-bold text-xs sm:text-sm">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>Chưa thể gửi báo cáo - Vui lòng kiểm tra lại:</span>
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
          {!isLocked ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!isValid}
                className={`flex-1 h-12 rounded-2xl text-base font-black transition-all flex items-center justify-center gap-2 ${
                  isValid
                    ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl focus:ring-4 focus:ring-blue-300 active:scale-99 cursor-pointer'
                    : 'text-slate-500 bg-slate-200 border border-slate-300 cursor-not-allowed opacity-80'
                }`}
              >
                <Send className="w-5 h-5" />
                <span>
                  {isValid
                    ? (existingReport ? 'CẬP NHẬT BÁO CÁO SĨ SỐ' : 'GỬI BÁO CÁO SĨ SỐ')
                    : 'VUI LÒNG NHẬP ĐỦ SỐ LIỆU ĐỂ GỬI BÁO CÁO'}
                </span>
              </button>

              {existingReport && canReset && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="h-12 px-4 rounded-2xl text-xs sm:text-sm font-bold border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
                  title="Hủy báo cáo này và đưa về trạng thái Chưa báo cáo nếu đã báo cáo nhầm"
                >
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  <span>RESET BÁO CÁO NHẦM</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 h-11 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> Báo cáo đã khóa bởi BGH
              </div>
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
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 shadow-xl">
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
            {!isLocked ? (
              <>
                {existingReport && canReset && (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmModal(true)}
                    className="h-11 px-2.5 rounded-xl font-bold text-xs border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center gap-1 transition-colors flex-shrink-0"
                    title="Reset về Chưa báo cáo nếu báo cáo nhầm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    <span>Reset nhầm</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={!isValid}
                  className={`h-11 px-4 rounded-xl font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 flex-1 max-w-[240px] whitespace-nowrap transition-all ${
                    isValid
                      ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-80'
                  }`}
                >
                  <Send className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {isValid
                      ? (existingReport ? 'CẬP NHẬT BÁO CÁO' : 'GỬI BÁO CÁO')
                      : 'CHƯA NHẬP ĐỦ SỐ LIỆU'}
                  </span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 w-full justify-end">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Đã khóa
                </span>
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

      {/* 6. Quick Paste Modal from Zalo */}
      {showQuickPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-800">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-sm sm:text-base">Dán nhanh từ Zalo / Tin nhắn phụ huynh</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickPaste(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>Thầy/Cô có thể copy và dán nguyên danh sách phụ huynh nhắn từ Zalo vào đây:</p>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 font-mono">
                Ví dụ:<br />
                1. Lò Văn Nam - Ốm (Bản Huổi Hốc)<br />
                2. Cầm Thị Mai - Có phép<br />
                3. Quàng Văn Minh (Gia đình có việc)
              </div>
            </div>

            <textarea
              rows={5}
              value={quickPasteText}
              onChange={(e) => setQuickPasteText(e.target.value)}
              placeholder="Dán nội dung tin nhắn Zalo vào đây..."
              className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-sans"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowQuickPaste(false);
                  setQuickPasteText('');
                }}
                className="h-10 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleApplyQuickPaste}
                disabled={!quickPasteText.trim()}
                className="h-10 px-4 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Áp dụng danh sách</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal xác nhận Reset Báo cáo nhầm về Chưa báo cáo */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 bg-gradient-to-br from-rose-50 to-orange-50 border-b border-rose-100 flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <RotateCcw className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Xác nhận Reset Báo Cáo Nhầm
                </h3>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  Đưa lớp về trạng thái CHƯA BÁO CÁO
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Lớp học:</span>
                  <span className="font-extrabold text-slate-900 text-sm">Lớp {selectedClass?.class_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Ngày báo cáo:</span>
                  <span className="font-bold text-slate-800">{reportDate.split('-').reverse().join('/')}</span>
                </div>
                {existingReport?.reported_time && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Giờ đã báo cáo:</span>
                    <span className="font-mono font-bold text-slate-700">{existingReport.reported_time}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Lưu ý khi reset báo cáo:
                </div>
                Dữ liệu sĩ số đã lưu của lớp vào ngày này sẽ được xóa hoàn toàn. Bảng tổng hợp toàn trường sẽ chuyển lớp về trạng thái <strong className="text-amber-950">Chưa báo cáo</strong> cho đến khi Thầy/Cô nộp lại.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleResetReport}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isResetting ? 'Đang reset...' : 'XÁC NHẬN RESET VỀ CHƯA BÁO CÁO'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
