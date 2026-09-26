import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
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
  User,
  MapPin,
  Volume2,
  Code2,
  Phone,
  ExternalLink,
  Globe,
  FileCheck2,
  School,
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
  const { testSound, isSoundEnabled, isAudioBlocked } = useNotifications();
  const [isPlayingSoundTest, setIsPlayingSoundTest] = useState(false);

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
  const [inheritedReport, setInheritedReport] = useState<{ report: DailyReport; values: DailyReportValue[] } | null>(null);
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
        setInheritedReport(null);
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
        // No report for this date: Kế thừa dữ liệu từ báo cáo ngày hôm trước gần nhất
        const { report: latestReport, values: latestValues } = await StorageService.getLatestReport(selectedClassId, selectedDate);

        if (latestReport && latestValues.length > 0) {
          setInheritedReport({ report: latestReport, values: latestValues });

          // Inherit previous day's report data: totals, present counts, absent counts
          const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
          latestValues.forEach((v) => {
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
          setNotes(latestReport.notes || '');
          setAbsentStudents(latestReport.absent_students ? [...latestReport.absent_students] : []);
        } else {
          setInheritedReport(null);
          // Fallback to smart defaults
          setNotes('');
          setAbsentStudents([]);

          const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
          const enrolledCount = classStudents.length;

          const defaultTotal = enrolledCount > 0 ? enrolledCount : 35;
          const boardingStudentsCount = classStudents.filter((s) => s.isBoarding).length;

          const boardingTotal = boardingStudentsCount > 0 ? boardingStudentsCount : Math.min(defaultTotal, 20);
          const nonBoardingTotal = Math.max(0, defaultTotal - boardingTotal);

          enabledIndicators.forEach((ig, idx) => {
            if (idx === 0) {
              newVals[ig.id] = {
                total: defaultTotal,
                present: defaultTotal,
                absent: 0,
              };
            } else if (
              ig.id === 'ig_boarding' ||
              ig.id === 'ig_boarding_half' ||
              ig.code.includes('BOARDING') ||
              ig.name.toLowerCase().includes('bán trú') ||
              ig.name.toLowerCase().includes('ăn trưa')
            ) {
              newVals[ig.id] = {
                total: boardingTotal,
                present: boardingTotal,
                absent: 0,
              };
            } else if (
              ig.id === 'ig_day' ||
              ig.id === 'ig_ngoaitru' ||
              ig.code.includes('NON_BOARDING') ||
              ig.code.includes('DAY') ||
              ig.name.toLowerCase().includes('ngoại trú') ||
              ig.name.toLowerCase().includes('không ăn') ||
              ig.name.toLowerCase().includes('về nhà')
            ) {
              newVals[ig.id] = {
                total: nonBoardingTotal,
                present: nonBoardingTotal,
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

  // Set all present (0 absent) for today
  const handleResetAllPresent = () => {
    if (isLocked) return;
    setFormValues((prev) => {
      const next: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const tot = typeof v.total === 'number' ? v.total : Number(v.total) || 0;
        next[k] = {
          total: v.total,
          present: tot,
          absent: 0,
        };
      });
      return next;
    });
    setAbsentStudents([]);
    setToastMessage({
      text: 'Đã đặt lại về trạng thái cả lớp có mặt đầy đủ (0 vắng)!',
      type: 'info',
    });
  };

  // Re-inherit previous day data
  const handleReinheritPreviousDay = () => {
    if (isLocked || !inheritedReport) return;
    const newVals: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {};
    inheritedReport.values.forEach((v) => {
      newVals[v.indicator_group_id] = {
        total: v.total_count,
        present: v.present_count,
        absent: v.absent_count,
      };
    });
    enabledIndicators.forEach((ig) => {
      if (!newVals[ig.id]) {
        newVals[ig.id] = { total: 0, present: 0, absent: 0 };
      }
    });
    setFormValues(newVals);
    setNotes(inheritedReport.report.notes || '');
    setAbsentStudents(inheritedReport.report.absent_students ? [...inheritedReport.report.absent_students] : []);
    setToastMessage({
      text: `Đã khôi phục dữ liệu từ báo cáo ngày ${formatDateVN(inheritedReport.report.report_date)}!`,
      type: 'success',
    });
  };

  useEffect(() => {
    loadClassReport();
  }, [loadClassReport]);

  // Calculation mode logic
  // Calculation mode logic
  const inputMode = settings?.input_mode || 'MODE_2_TOTAL_ABSENT';

  // Helper to sync indicators from absent students list
  const syncIndicatorsWithAbsentStudents = useCallback(
    (studentsList: AbsentStudent[]) => {
      const totalAbsent = studentsList.length;
      const bAbsent = studentsList.filter((s) => s.isBoarding).length;
      const ntAbsent = studentsList.filter((s) => !s.isBoarding).length;

      setFormValues((prev) => {
        const next = { ...prev };

        // 1. Sync primary indicator
        if (enabledIndicators[0]) {
          const pId = enabledIndicators[0].id;
          const pCur = prev[pId] || { total: 0, present: 0, absent: 0 };
          const pTotal = typeof pCur.total === 'number' ? pCur.total : Number(pCur.total) || 0;
          next[pId] = {
            total: pCur.total,
            absent: totalAbsent,
            present: Math.max(0, pTotal - totalAbsent),
          };
        }

        // 2. Sync boarding indicator
        const bInd = enabledIndicators.find(
          (i) =>
            i.id === 'ig_boarding' ||
            i.id === 'ig_boarding_half' ||
            i.code.includes('BOARDING') ||
            i.name.toLowerCase().includes('bán trú') ||
            i.name.toLowerCase().includes('ăn trưa')
        );
        if (bInd && prev[bInd.id]) {
          const bCur = prev[bInd.id];
          const bTotal = typeof bCur.total === 'number' ? bCur.total : Number(bCur.total) || 0;
          next[bInd.id] = {
            total: bCur.total,
            absent: bAbsent,
            present: Math.max(0, bTotal - bAbsent),
          };
        }

        // 3. Sync day student / ngoai tru indicator
        const ntInd = enabledIndicators.find(
          (i) =>
            i.id === 'ig_day' ||
            i.id === 'ig_ngoaitru' ||
            i.code.includes('NON_BOARDING') ||
            i.code.includes('DAY') ||
            i.name.toLowerCase().includes('ngoại trú') ||
            i.name.toLowerCase().includes('không ăn') ||
            i.name.toLowerCase().includes('về nhà')
        );
        if (ntInd && prev[ntInd.id]) {
          const ntCur = prev[ntInd.id];
          const ntTotal = typeof ntCur.total === 'number' ? ntCur.total : Number(ntCur.total) || 0;
          next[ntInd.id] = {
            total: ntCur.total,
            absent: ntAbsent,
            present: Math.max(0, ntTotal - ntAbsent),
          };
        }

        return next;
      });
    },
    [enabledIndicators]
  );

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

      const isPrimaryGroup = groupId === enabledIndicators[0]?.id;
      const bInd = enabledIndicators.find(
        (i) =>
          i.id === 'ig_boarding' ||
          i.id === 'ig_boarding_half' ||
          i.code.includes('BOARDING') ||
          i.name.toLowerCase().includes('bán trú') ||
          i.name.toLowerCase().includes('ăn trưa')
      );
      const isBoardingGroup = bInd && groupId === bInd.id;

      const ntInd = enabledIndicators.find(
        (i) =>
          i.id === 'ig_day' ||
          i.id === 'ig_ngoaitru' ||
          i.code.includes('NON_BOARDING') ||
          i.code.includes('DAY') ||
          i.name.toLowerCase().includes('ngoại trú') ||
          i.name.toLowerCase().includes('không ăn') ||
          i.name.toLowerCase().includes('về nhà')
      );
      const isNgoaiTruGroup = ntInd && groupId === ntInd.id;

      let updated: { total: number | ''; present: number | ''; absent: number | '' };

      if (val === '') {
        updated = { ...cur, [field]: '' };
        if (inputMode === 'MODE_2_TOTAL_ABSENT') {
          if (field === 'total') {
            updated = { total: '', absent: cur.absent, present: '' };
          } else if (field === 'absent') {
            updated = { total: cur.total, absent: '', present: cur.total === '' ? '' : curTotal };
          } else if (field === 'present') {
            updated = { total: cur.total, present: '', absent: cur.total === '' ? '' : curTotal };
          }
        } else if (inputMode === 'MODE_1_TOTAL_PRESENT') {
          if (field === 'total') {
            updated = { total: '', present: cur.present, absent: '' };
          } else if (field === 'present') {
            updated = { total: cur.total, present: '', absent: cur.total === '' ? '' : curTotal };
          } else if (field === 'absent') {
            updated = { total: cur.total, absent: '', present: cur.total === '' ? '' : curTotal };
          }
        }
      } else {
        const safeVal = Math.max(0, isNaN(Number(val)) ? 0 : Number(val));
        updated = { ...cur, [field]: safeVal };

        if (inputMode === 'MODE_2_TOTAL_ABSENT') {
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
        }
      }

      const nextValues: Record<string, { total: number | ''; present: number | ''; absent: number | '' }> = {
        ...prev,
        [groupId]: updated,
      };

      // 1. Khi thao tác trên CHỈ TIÊU CHÍNH (Sĩ số cả lớp)
      if (isPrimaryGroup) {
        const pAbsent = updated.absent !== '' ? Number(updated.absent) || 0 : 0;

        // Nếu cả lớp báo có mặt đầy đủ (0 vắng) -> Bán trú & Ngoại trú vắng bắt buộc = 0
        if (pAbsent === 0) {
          if (bInd && nextValues[bInd.id]) {
            const bTot = Number(nextValues[bInd.id].total) || 0;
            nextValues[bInd.id] = { total: nextValues[bInd.id].total, present: bTot, absent: 0 };
          }
          if (ntInd && nextValues[ntInd.id]) {
            const ntTot = Number(nextValues[ntInd.id].total) || 0;
            nextValues[ntInd.id] = { total: nextValues[ntInd.id].total, present: ntTot, absent: 0 };
          }
          setAbsentStudents([]);
        } else {
          // Nếu cả lớp vắng N em (ví dụ vắng 2 hoặc 3)
          const bTot = bInd && nextValues[bInd.id] ? (Number(nextValues[bInd.id].total) || 0) : 0;
          const ntTot = ntInd && nextValues[ntInd.id] ? (Number(nextValues[ntInd.id].total) || 0) : 0;

          let currentBAbsent = bInd && nextValues[bInd.id] ? (Number(nextValues[bInd.id].absent) || 0) : 0;
          let currentNtAbsent = ntInd && nextValues[ntInd.id] ? (Number(nextValues[ntInd.id].absent) || 0) : 0;

          // Nếu trước đó cả 2 đều bằng 0 hoặc chưa khớp tổng -> Tự động phân bổ mặc định hợp lý
          if (currentBAbsent + currentNtAbsent === 0 || currentBAbsent + currentNtAbsent !== pAbsent) {
            currentBAbsent = Math.min(pAbsent, bTot);
            currentNtAbsent = Math.min(Math.max(0, pAbsent - currentBAbsent), ntTot);
          } else {
            currentBAbsent = Math.min(currentBAbsent, pAbsent, bTot);
            currentNtAbsent = Math.max(0, pAbsent - currentBAbsent);
          }

          if (bInd && nextValues[bInd.id]) {
            nextValues[bInd.id] = {
              total: nextValues[bInd.id].total,
              absent: currentBAbsent,
              present: Math.max(0, bTot - currentBAbsent),
            };
          }

          if (ntInd && nextValues[ntInd.id]) {
            nextValues[ntInd.id] = {
              total: nextValues[ntInd.id].total,
              absent: currentNtAbsent,
              present: Math.max(0, ntTot - currentNtAbsent),
            };
          }

          // Cập nhật danh sách học sinh vắng
          setAbsentStudents((prevAbsent) => {
            const newSlots: AbsentStudent[] = [];
            for (let i = 0; i < pAbsent; i++) {
              const existing = prevAbsent[i];
              newSlots.push({
                full_name: existing?.full_name || '',
                address: existing?.address || '',
                reason: existing?.reason || 'Ốm',
                isBoarding: i < currentBAbsent,
              });
            }
            return newSlots;
          });
        }
      }

      // 2 & 3. Khi thao tác trên CHỈ TIÊU BÁN TRÚ hoặc NGOẠI TRÚ
      if (isBoardingGroup || isNgoaiTruGroup) {
        const pId = enabledIndicators[0]?.id;
        if (pId && nextValues[pId]) {
          const bVal = bInd && nextValues[bInd.id] ? nextValues[bInd.id] : { total: 0, present: 0, absent: 0 };
          const ntVal = ntInd && nextValues[ntInd.id] ? nextValues[ntInd.id] : { total: 0, present: 0, absent: 0 };

          const bPres = bVal.present !== '' ? Number(bVal.present) || 0 : 0;
          const ntPres = ntVal.present !== '' ? Number(ntVal.present) || 0 : 0;
          const bAbs = bVal.absent !== '' ? Number(bVal.absent) || 0 : 0;
          const ntAbs = ntVal.absent !== '' ? Number(ntVal.absent) || 0 : 0;
          const bTot = bVal.total !== '' ? Number(bVal.total) || 0 : 0;
          const ntTot = ntVal.total !== '' ? Number(ntVal.total) || 0 : 0;

          if (bInd && ntInd) {
            // Khi có đủ cả 2 nhóm Bán trú và Ngoại trú:
            // Tự động nhảy trùng khớp số HS Có mặt, Vắng, và Tổng số ở chỉ tiêu chính phía trên
            const sumPresent = bPres + ntPres;
            const sumAbsent = bAbs + ntAbs;
            const sumTotal = (bTot + ntTot > 0) ? (bTot + ntTot) : (sumPresent + sumAbsent);

            nextValues[pId] = {
              total: sumTotal > 0 ? sumTotal : (Number(nextValues[pId].total) || 0),
              present: sumPresent,
              absent: sumAbsent,
            };

            // Đồng bộ danh sách học sinh vắng tương ứng
            setAbsentStudents((prevAbsent) => {
              const newSlots: AbsentStudent[] = [];
              for (let i = 0; i < sumAbsent; i++) {
                const existing = prevAbsent[i];
                newSlots.push({
                  full_name: existing?.full_name || '',
                  address: existing?.address || '',
                  reason: existing?.reason || 'Ốm',
                  isBoarding: i < bAbs,
                });
              }
              return newSlots;
            });
          } else if (bInd) {
            // Khi chỉ có nhóm Bán trú:
            const pCur = nextValues[pId];
            const pTot = Number(pCur.total) || 0;
            if (bTot > pTot) {
              nextValues[pId].total = bTot;
            }
            if (bAbs > (Number(pCur.absent) || 0) || (Number(pCur.absent) === 0 && bAbs > 0)) {
              const newPAbsent = bAbs;
              nextValues[pId].absent = newPAbsent;
              nextValues[pId].present = Math.max(0, (Number(nextValues[pId].total) || pTot) - newPAbsent);
            } else if (bPres > (Number(pCur.present) || 0)) {
              nextValues[pId].present = bPres;
            }

            setAbsentStudents((prevAbsent) => {
              const targetTotal = Number(nextValues[pId].absent) || 0;
              const newSlots: AbsentStudent[] = [];
              for (let i = 0; i < targetTotal; i++) {
                const existing = prevAbsent[i];
                newSlots.push({
                  full_name: existing?.full_name || '',
                  address: existing?.address || '',
                  reason: existing?.reason || 'Ốm',
                  isBoarding: i < bAbs,
                });
              }
              return newSlots;
            });
          }
        }
      }

      return nextValues;
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

    const studentMatch = classStudents.find(
      (s) => s.full_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    const finalAddress = address.trim() || studentMatch?.address || '';
    const finalBoarding = isBoarding !== undefined ? isBoarding : !!studentMatch?.isBoarding;

    setAbsentStudents((prev) => {
      // Find first empty slot if any to fill it
      const emptyIdx = prev.findIndex((s) => !s.full_name.trim());
      let nextList: AbsentStudent[];
      if (emptyIdx !== -1) {
        nextList = [...prev];
        nextList[emptyIdx] = {
          full_name: trimmedName,
          address: finalAddress,
          reason: reason || 'Ốm',
          isBoarding: finalBoarding,
        };
      } else {
        nextList = [
          ...prev,
          {
            full_name: trimmedName,
            address: finalAddress,
            reason: reason || 'Ốm',
            isBoarding: finalBoarding,
          },
        ];
      }

      syncIndicatorsWithAbsentStudents(nextList);
      return nextList;
    });

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
      syncIndicatorsWithAbsentStudents(nextList);
      return nextList;
    });
  };

  // Update absent student row
  const handleUpdateAbsentStudent = (index: number, partial: Partial<AbsentStudent>) => {
    if (isLocked) return;

    setAbsentStudents((prev) => {
      if (!prev[index]) return prev;
      const nextList = [...prev];

      let extra: Partial<AbsentStudent> = {};
      if (partial.full_name !== undefined) {
        const trimmed = partial.full_name.trim();
        const match = classStudents.find(
          (s) => s.full_name.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (match) {
          if (!nextList[index].address && match.address) {
            extra.address = match.address;
          }
          if (partial.isBoarding === undefined) {
            extra.isBoarding = !!match.isBoarding;
          }
        }
      }

      nextList[index] = {
        ...nextList[index],
        ...partial,
        ...extra,
      };

      syncIndicatorsWithAbsentStudents(nextList);
      return nextList;
    });
  };

  // Comprehensive validation across all indicators, boarding/day student breakdown and absent list
  const validationResult = useMemo(() => {
    if (!selectedClassId) {
      return { isValid: false, error: 'Chưa chọn lớp học.' };
    }
    if (enabledIndicators.length === 0) {
      return { isValid: false, error: 'Chưa cấu hình nhóm chỉ tiêu.' };
    }

    // 1. Kiểm tra chỉ tiêu chính (Sĩ số cả lớp)
    const mainId = enabledIndicators[0]?.id;
    const mainVal = formValues[mainId];
    if (!mainVal) {
      return { isValid: false, error: 'Chưa có số liệu sĩ số cả lớp.' };
    }

    const mainTotal = Number(mainVal.total) || 0;
    const mainPresent = Number(mainVal.present) || 0;
    const mainAbsent = Number(mainVal.absent) || 0;

    if (mainTotal <= 0) {
      return { isValid: false, error: 'Tổng sĩ số cả lớp phải lớn hơn 0.' };
    }

    if (inputMode !== 'MODE_3_ALL_THREE' && mainPresent + mainAbsent !== mainTotal) {
      return {
        isValid: false,
        error: `Số liệu sĩ số cả lớp chưa khớp: Có mặt (${mainPresent}) + Vắng (${mainAbsent}) phải bằng Tổng (${mainTotal}).`,
      };
    }

    // 2. Tìm chỉ tiêu Bán trú và Ngoại trú (nếu có)
    const bInd = enabledIndicators.find(
      (i) =>
        i.id === 'ig_boarding' ||
        i.id === 'ig_boarding_half' ||
        i.code.includes('BOARDING') ||
        i.name.toLowerCase().includes('bán trú') ||
        i.name.toLowerCase().includes('ăn trưa')
    );
    const ntInd = enabledIndicators.find(
      (i) =>
        i.id === 'ig_day' ||
        i.id === 'ig_ngoaitru' ||
        i.code.includes('NON_BOARDING') ||
        i.code.includes('DAY') ||
        i.name.toLowerCase().includes('ngoại trú') ||
        i.name.toLowerCase().includes('không ăn') ||
        i.name.toLowerCase().includes('về nhà')
    );

    const bVal = bInd ? formValues[bInd.id] : null;
    const bTotal = bVal ? Number(bVal.total) || 0 : 0;
    const bPresent = bVal ? Number(bVal.present) || 0 : 0;
    const bAbsent = bVal ? Number(bVal.absent) || 0 : 0;

    const ntVal = ntInd ? formValues[ntInd.id] : null;
    const ntTotal = ntVal ? Number(ntVal.total) || 0 : 0;
    const ntPresent = ntVal ? Number(ntVal.present) || 0 : 0;
    const ntAbsent = ntVal ? Number(ntVal.absent) || 0 : 0;

    const listBoardingCount = absentStudents.filter((s) => s.isBoarding).length;
    const listNgoaiTruCount = absentStudents.filter((s) => !s.isBoarding).length;

    // RÀNG BUỘC 1: Khi tổng sĩ số báo CÓ MẶT ĐỦ (mainAbsent === 0)
    if (mainAbsent === 0) {
      if (bAbsent > 0) {
        return {
          isValid: false,
          error: `Tổng sĩ số cả lớp báo có mặt đủ (0 vắng), nên số vắng Bán trú không thể là ${bAbsent} (phải bằng 0).`,
        };
      }
      if (ntAbsent > 0) {
        return {
          isValid: false,
          error: `Tổng sĩ số cả lớp báo có mặt đủ (0 vắng), nên số vắng Ngoại trú không thể là ${ntAbsent} (phải bằng 0).`,
        };
      }
      if (absentStudents.length > 0) {
        return {
          isValid: false,
          error: 'Tổng sĩ số cả lớp báo có mặt đủ (0 vắng), danh sách học sinh vắng phải để trống.',
        };
      }
    }

    // RÀNG BUỘC 2: Khi tổng sĩ số CÓ HỌC SINH VẮNG (mainAbsent > 0, ví dụ vắng 1, 2, 3...)
    if (mainAbsent > 0) {
      // 2.1 Số lượng trong danh sách vắng phải khớp chính xác với số vắng báo cáo
      if (absentStudents.length !== mainAbsent) {
        return {
          isValid: false,
          error: `Số lượng học sinh vắng báo cáo (${mainAbsent}) chưa khớp với danh sách học sinh vắng (${absentStudents.length} em).`,
        };
      }

      // 2.2 Tất cả học sinh trong danh sách vắng phải có họ tên
      const emptyIdx = absentStudents.findIndex((s) => !s.full_name.trim());
      if (emptyIdx !== -1) {
        return {
          isValid: false,
          error: `Vui lòng nhập hoặc chọn họ tên cho học sinh vắng thứ ${emptyIdx + 1}.`,
        };
      }

      // 2.3 Ràng buộc số vắng bán trú không vượt quá tổng vắng cả lớp
      if (bInd && bAbsent > mainAbsent) {
        return {
          isValid: false,
          error: `Số học sinh vắng Bán trú (${bAbsent}) không được lớn hơn tổng số học sinh vắng cả lớp (${mainAbsent}).`,
        };
      }

      // 2.4 Ràng buộc số liệu bán trú phải cân
      if (bInd) {
        if (bTotal > mainTotal) {
          return {
            isValid: false,
            error: `Sĩ số bán trú (${bTotal}) không được vượt quá tổng sĩ số cả lớp (${mainTotal}).`,
          };
        }
        if (inputMode !== 'MODE_3_ALL_THREE' && bPresent + bAbsent !== bTotal) {
          return {
            isValid: false,
            error: `Số liệu bán trú chưa khớp: Có mặt (${bPresent}) + Vắng (${bAbsent}) phải bằng Tổng bán trú (${bTotal}).`,
          };
        }
        if (bAbsent !== listBoardingCount) {
          return {
            isValid: false,
            error: `Số vắng bán trú ở chỉ tiêu (${bAbsent}) chưa khớp với số học sinh bán trú trong danh sách vắng (${listBoardingCount} em).`,
          };
        }
      }

      // 2.5 Ràng buộc nếu có nhóm Ngoại trú
      if (ntInd && bInd) {
        if (bAbsent === 0 && ntAbsent === 0) {
          return {
            isValid: false,
            error: `Lớp đang có ${mainAbsent} học sinh vắng, bắt buộc phải phân bổ cụ thể số học sinh vắng Bán trú hoặc Ngoại trú tương ứng (không được để cả 2 bằng 0).`,
          };
        }
      }

      if (ntInd) {
        if (ntTotal > mainTotal) {
          return {
            isValid: false,
            error: `Sĩ số ngoại trú (${ntTotal}) không được vượt quá tổng sĩ số cả lớp (${mainTotal}).`,
          };
        }
        if (inputMode !== 'MODE_3_ALL_THREE' && ntPresent + ntAbsent !== ntTotal) {
          return {
            isValid: false,
            error: `Số liệu ngoại trú chưa khớp: Có mặt (${ntPresent}) + Vắng (${ntAbsent}) phải bằng Tổng ngoại trú (${ntTotal}).`,
          };
        }
        if (bAbsent + ntAbsent !== mainAbsent) {
          return {
            isValid: false,
            error: `Tổng vắng cả lớp (${mainAbsent}) phải bằng Số vắng Bán trú (${bAbsent}) + Số vắng Ngoại trú (${ntAbsent}).`,
          };
        }
        if (ntAbsent !== listNgoaiTruCount) {
          return {
            isValid: false,
            error: `Số vắng ngoại trú ở chỉ tiêu (${ntAbsent}) chưa khớp với số học sinh ngoại trú trong danh sách vắng (${listNgoaiTruCount} em).`,
          };
        }
      }
    }

    return { isValid: true, error: null };
  }, [selectedClassId, enabledIndicators, formValues, inputMode, absentStudents]);

  const isValid = validationResult.isValid;

  // Save report
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validationResult.isValid && validationResult.error) {
      setToastMessage({
        text: validationResult.error,
        type: 'error',
      });
      return;
    }

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
    const markedNames = new Set(
      absentStudents
        .filter((s) => s.full_name && s.full_name.trim().length > 0)
        .map((s) => s.full_name.trim().toLowerCase())
    );
    return classStudents.filter((s) => !markedNames.has(s.full_name.trim().toLowerCase()));
  }, [classStudents, absentStudents]);

  const boardingAbsentCount = useMemo(() => {
    return absentStudents.filter((s) => s.isBoarding).length;
  }, [absentStudents]);

  const nonBoardingAbsentCount = useMemo(() => {
    return absentStudents.filter((s) => !s.isBoarding).length;
  }, [absentStudents]);

  const allAbsentNamed = useMemo(() => {
    return absentStudents.length > 0 && absentStudents.every((s) => s.full_name.trim().length > 0);
  }, [absentStudents]);

  return (
    <div className="max-w-5xl mx-auto pb-4 sm:pb-6 animate-in fade-in duration-200">
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

            {/* Chuông nhắc nhở & Thử âm thanh */}
            <button
              type="button"
              onClick={async () => {
                setIsPlayingSoundTest(true);
                await testSound();
                setTimeout(() => setIsPlayingSoundTest(false), 1200);
              }}
              title="Bấm để thử âm thanh chuông báo và rung điện thoại"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-2xs active:scale-95 ${
                isPlayingSoundTest
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400'
                  : isAudioBlocked
                  ? 'bg-amber-100 text-amber-900 border-amber-300 animate-bounce'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 text-blue-600" />
              <span>
                {isPlayingSoundTest
                  ? 'Đang reo...'
                  : isAudioBlocked
                  ? 'Bật chuông'
                  : 'Thử chuông'}
              </span>
            </button>

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
              } p-3.5 sm:p-6`}
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 sm:mb-4 pb-2.5 sm:pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-bold text-sm ${meta.badgeClass} shrink-0`}
                  >
                    <IndicatorIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      {indicator.name}
                      {isPrimary && (
                        <span className="text-[10px] sm:text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          Chỉ tiêu chính
                        </span>
                      )}
                      {meta.isNgoaiTru && (
                        <span className="text-[10px] sm:text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                          Ngoại trú
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      {meta.description}
                    </p>
                  </div>
                </div>

                {/* Quick Percentage Progress */}
                {totalNum > 0 && (
                  <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-medium text-slate-500">Duy trì:</span>
                    <span
                      className={`text-xs sm:text-sm font-black ${
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

              {/* Number Inputs Grid - Responsive 3 Columns on all devices, compact and perfectly aligned without bottom dead space */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
                {/* 1. Tổng số (Sĩ số) */}
                <div className="bg-slate-50/90 sm:bg-slate-50/70 p-2 sm:p-3 rounded-xl border border-slate-200/80 flex flex-col">
                  {/* Fixed-height header for perfect vertical alignment */}
                  <div className="flex items-center justify-between h-5 sm:h-6 mb-1.5 sm:mb-2">
                    <span className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-tight truncate">
                      <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="sm:hidden">Sĩ số</span>
                      <span className="hidden sm:inline">Tổng số (Sĩ số)</span>
                    </span>
                  </div>

                  {/* Number Input */}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
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
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val === '') {
                        handleValueChange(indicator.id, 'total', '');
                      } else {
                        const parsed = parseInt(val, 10);
                        handleValueChange(indicator.id, 'total', isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg sm:rounded-xl h-10 sm:h-11 text-center text-lg sm:text-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                  />
                </div>

                {/* 2. Có mặt */}
                <div className="bg-emerald-50/70 sm:bg-emerald-50/50 p-2 sm:p-3 rounded-xl border border-emerald-200/80 flex flex-col">
                  {/* Fixed-height header */}
                  <div className="flex items-center justify-between h-5 sm:h-6 mb-1.5 sm:mb-2">
                    <span className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-tight truncate">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Có mặt</span>
                    </span>
                    {inputMode === 'MODE_2_TOTAL_ABSENT' && (
                      <span className="text-[10px] text-emerald-600 font-semibold lowercase shrink-0">
                        (tự tính)
                      </span>
                    )}
                  </div>

                  {/* Number Input */}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
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
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val === '') {
                        handleValueChange(indicator.id, 'present', '');
                      } else {
                        const parsed = parseInt(val, 10);
                        handleValueChange(indicator.id, 'present', isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className={`w-full bg-white border border-emerald-300 rounded-lg sm:rounded-xl h-10 sm:h-11 text-center text-lg sm:text-xl font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner ${
                      inputMode === 'MODE_2_TOTAL_ABSENT' ? 'bg-emerald-100/50 cursor-not-allowed text-emerald-800' : ''
                    }`}
                  />
                </div>

                {/* 3. Vắng mặt */}
                <div className="bg-rose-50/70 sm:bg-rose-50/50 p-2 sm:p-3 rounded-xl border border-rose-200/80 flex flex-col">
                  {/* Fixed-height header */}
                  <div className="flex items-center justify-between h-5 sm:h-6 mb-1.5 sm:mb-2">
                    <span className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-rose-800 uppercase tracking-tight truncate">
                      <UserX className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Vắng</span>
                    </span>
                    {inputMode === 'MODE_1_TOTAL_PRESENT' && (
                      <span className="text-[10px] text-rose-600 font-semibold lowercase shrink-0">
                        (tự tính)
                      </span>
                    )}
                  </div>

                  {/* Number Input */}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
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
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val === '') {
                        handleValueChange(indicator.id, 'absent', '');
                      } else {
                        const parsed = parseInt(val, 10);
                        handleValueChange(indicator.id, 'absent', isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className={`w-full bg-white border border-rose-300 rounded-lg sm:rounded-xl h-10 sm:h-11 text-center text-lg sm:text-xl font-black text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-inner ${
                      inputMode === 'MODE_1_TOTAL_PRESENT' ? 'bg-rose-100/50 cursor-not-allowed text-rose-800' : ''
                    }`}
                  />
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
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-sm shadow-2xs">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>Danh sách học sinh vắng mặt</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-200">
                  {absentStudents.length} HS vắng
                </span>
                {absentStudents.length > 0 && (
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {boardingAbsentCount} Bán trú • {nonBoardingAbsentCount} Ngoại trú
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động đồng bộ số lượng khi nhập sĩ số vắng. Ghi rõ địa chỉ và lý do cụ thể gửi BGH
              </p>
            </div>
          </div>

          {!isLocked && (
            <button
              type="button"
              onClick={() => {
                setAbsentStudents((prev) => {
                  const nextList = [
                    ...prev,
                    {
                      full_name: '',
                      address: '',
                      reason: 'Ốm',
                      isBoarding: false,
                    },
                  ];
                  syncIndicatorsWithAbsentStudents(nextList);
                  return nextList;
                });
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-xs transition-all active:scale-95 self-start sm:self-auto cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              Thêm học sinh vắng
            </button>
          )}
        </div>

        {/* Sync Status Banner */}
        {absentStudents.length > 0 && (
          <div
            className={`p-3 rounded-xl border mb-4 text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs ${
              allAbsentNamed
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
                : 'bg-amber-50/90 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {allAbsentNamed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 animate-bounce" />
              )}
              <span>
                {allAbsentNamed
                  ? `Đã điền đầy đủ thông tin ${absentStudents.length} học sinh vắng (${boardingAbsentCount} Bán trú, ${nonBoardingAbsentCount} Ngoại trú). Sẵn sàng gửi BGH!`
                  : `Đang có ${absentStudents.length} học sinh vắng. Vui lòng nhập hoặc chọn tên cho học sinh còn trống bên dưới.`}
              </span>
            </div>
            <div className="text-[11px] font-black shrink-0 bg-white/80 px-2 py-0.5 rounded border border-current/20">
              {absentStudents.filter((s) => s.full_name.trim()).length}/{absentStudents.length} đã điền
            </div>
          </div>
        )}

        {/* Quick Tagging Chips of Enrolled Students */}
        {!isLocked && classStudents.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Bấm nhanh để chọn học sinh vắng trong danh sách lớp:</span>
              </span>
              <span className="text-[11px] text-slate-500 font-normal">
                ({availableStudentsForAbsent.length}/{classStudents.length} em chưa chọn)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {classStudents.map((st) => {
                const isMarked = absentStudents.some(
                  (s) => s.full_name.trim().toLowerCase() === st.full_name.trim().toLowerCase()
                );
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={isMarked}
                    onClick={() => handleAddAbsentStudent(st.full_name, st.address || '', 'Ốm', !!st.isBoarding)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shadow-2xs ${
                      isMarked
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-80 cursor-default'
                        : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 cursor-pointer active:scale-95'
                    }`}
                    title={
                      isMarked
                        ? 'Đã có trong danh sách vắng'
                        : `Bấm để ghi nhận vắng: ${st.full_name} (${st.isBoarding ? 'Bán trú' : 'Ngoại trú'})`
                    }
                  >
                    {isMarked ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Plus className="w-3 h-3 text-slate-400 group-hover:text-rose-600" />
                    )}
                    <span>{st.full_name}</span>
                    {st.isBoarding ? (
                      <span className="text-[10px] text-emerald-600 font-semibold">(BT)</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-semibold">(NT)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Absent Students List / Table */}
        {absentStudents.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <UserCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <h3 className="text-sm font-bold text-slate-700">Hôm nay lớp đi học đầy đủ 100%</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Không có học sinh nào vắng mặt. Khi nhập số vắng ở bảng trên hoặc bấm nút "Thêm học sinh vắng", danh sách sẽ tự động mở để thầy/cô điền thông tin.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {absentStudents.map((st, index) => (
              <div
                key={index}
                className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-blue-200 transition-all space-y-3"
              >
                {/* Card Header: Index badge + Quick Class Select + Delete Button */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-black shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      Học sinh vắng #{index + 1}
                    </span>
                    {st.isBoarding ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Bán trú
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        Ngoại trú
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Quick Select from Class Dropdown */}
                    {!isLocked && classStudents.length > 0 && (
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            const selectedSt = classStudents.find((s) => s.id === e.target.value);
                            if (selectedSt) {
                              handleUpdateAbsentStudent(index, {
                                full_name: selectedSt.full_name,
                                address: selectedSt.address || '',
                                isBoarding: !!selectedSt.isBoarding,
                              });
                            }
                          }}
                          className="text-[11px] font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200 rounded-lg px-2 py-1 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none max-w-[170px] sm:max-w-none truncate shadow-2xs"
                          title="Chọn nhanh từ danh sách học sinh của lớp"
                        >
                          <option value="">+ Chọn từ DS lớp ({classStudents.length} HS)...</option>
                          {classStudents.map((cs) => (
                            <option key={cs.id} value={cs.id}>
                              {cs.full_name} {cs.isBoarding ? '• [Bán trú]' : '• [Ngoại trú]'} {cs.address ? `- ${cs.address}` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-blue-600 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}

                    {/* Delete / Remove Button */}
                    {!isLocked && (
                      <button
                        type="button"
                        title="Xóa học sinh này khỏi danh sách vắng"
                        onClick={() => handleRemoveAbsentStudent(index)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 1: Họ và tên học sinh */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-tight mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Họ và tên học sinh <span className="text-rose-500">*</span>
                    </span>
                    {!st.full_name.trim() && (
                      <span className="text-[10px] text-amber-600 font-semibold animate-pulse">
                        Cần nhập họ tên
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={st.full_name}
                      list={`students-list-${index}`}
                      placeholder="Nhập họ tên hoặc chọn từ danh sách lớp ở trên..."
                      onChange={(e) => handleUpdateAbsentStudent(index, { full_name: e.target.value })}
                      className="w-full bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:font-normal placeholder:text-slate-400 shadow-inner"
                    />
                    <datalist id={`students-list-${index}`}>
                      {classStudents.map((cs) => (
                        <option key={cs.id} value={cs.full_name}>
                          {cs.isBoarding ? 'Học sinh Bán trú' : 'Học sinh Ngoại trú'} {cs.address ? `- ${cs.address}` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Row 2: Bản / Thôn / Địa chỉ cư trú */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-tight mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Bản / Thôn / Địa chỉ cư trú
                  </label>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={st.address || ''}
                    placeholder="Ví dụ: Bản Tào La- Tia Dình, Bản Pú Nhi..."
                    onChange={(e) => handleUpdateAbsentStudent(index, { address: e.target.value })}
                    className="w-full bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-inner"
                  />
                </div>

                {/* Row 3: Lý do vắng & Toggle Bán trú / Ngoài bán trú */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                  {/* Lý do vắng */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-tight mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Lý do vắng mặt
                    </label>
                    <select
                      disabled={isLocked}
                      value={st.reason || 'Ốm'}
                      onChange={(e) => handleUpdateAbsentStudent(index, { reason: e.target.value })}
                      className="w-full bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-inner"
                    >
                      <option value="Ốm">Ốm</option>
                      <option value="Có phép">Có phép</option>
                      <option value="Không phép">Không phép</option>
                      <option value="Gia đình">Gia đình có việc</option>
                      <option value="Thời tiết/Mưa rét">Mưa rét/Đường xa</option>
                      <option value="Khác">Lý do khác</option>
                    </select>
                  </div>

                  {/* Phân loại Bán trú hay Ngoại trú dạng tích chọn */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-tight mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Utensils className="w-3.5 h-3.5 text-slate-400" />
                        Phân loại bán trú / ngoại trú
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {st.isBoarding ? 'Đang chọn: HS bán trú' : 'Đang chọn: HS ngoại trú'}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Tích chọn HS bán trú */}
                      <div
                        onClick={() => {
                          if (!isLocked) {
                            handleUpdateAbsentStudent(index, { isBoarding: true });
                          }
                        }}
                        className={`flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl border cursor-pointer select-none transition-all ${
                          st.isBoarding
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs ring-2 ring-emerald-500/20'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                            st.isBoarding
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {st.isBoarding && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs sm:text-sm font-bold whitespace-normal leading-tight">
                            HS bán trú
                          </span>
                          <span
                            className={`text-[10px] truncate ${
                              st.isBoarding ? 'text-emerald-700 font-semibold' : 'text-slate-400 font-normal'
                            }`}
                          >
                            Báo ăn
                          </span>
                        </div>
                      </div>

                      {/* Tích chọn HS ngoại trú */}
                      <div
                        onClick={() => {
                          if (!isLocked) {
                            handleUpdateAbsentStudent(index, { isBoarding: false });
                          }
                        }}
                        className={`flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl border cursor-pointer select-none transition-all ${
                          !st.isBoarding
                            ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                            !st.isBoarding
                              ? 'bg-amber-600 border-amber-600 text-white shadow-2xs'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {!st.isBoarding && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs sm:text-sm font-bold whitespace-normal leading-tight">
                            HS ngoại trú
                          </span>
                          <span
                            className={`text-[10px] truncate ${
                              !st.isBoarding ? 'text-amber-700 font-semibold' : 'text-slate-400 font-normal'
                            }`}
                          >
                            Trưa về nhà
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes / Ghi chú của GVCN */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-6 mb-5">
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

      {/* Footer attribution card - Thông tin nhà phát triển */}
      <div className="my-5 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-black text-slate-900 text-sm">
              Ứng dụng được phát triển bởi: <span className="text-blue-700">Vũ Văn Hùng</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
              <span>Hỗ trợ kỹ thuật:</span>
              <a href="tel:0984246993" className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1">
                <Phone className="w-3 h-3 text-blue-600" />
                SĐT: 0984246993
              </a>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="tel:0984246993"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Gọi hỗ trợ: 0984246993</span>
          </a>
        </div>
      </div>

      {/* Bottom Sticky Action Bar - Cố định thanh CẬP NHẬT BÁO CÁO sát đáy như hình gốc */}
      <div className="sticky bottom-0 z-30 -mx-3 sm:mx-0 bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-200/90 shadow-[0_-8px_20px_-6px_rgba(0,0,0,0.12)] sm:shadow-xl p-3 sm:p-4 flex flex-col gap-2.5 transition-all">
        {/* Row 1: Reset nhầm & Lần gửi gần nhất */}
        <div className="flex items-center justify-between gap-3 min-h-[32px]">
          <div>
            {existingReport && !isLocked ? (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50/90 text-rose-700 font-bold text-xs hover:bg-rose-100 transition-colors disabled:opacity-50 active:scale-95 cursor-pointer shadow-2xs"
                title="Bấm nếu trước đó báo nhầm để đưa về trạng thái chưa báo"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600 stroke-[2.5]" />
                <span>Reset nhầm</span>
              </button>
            ) : (
              <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
                {isLocked ? 'Báo cáo đã khóa sổ' : 'Kiểm tra thông tin trước khi gửi'}
              </span>
            )}
          </div>

          <div className="text-xs sm:text-sm text-slate-600 font-normal text-right">
            {isLocked ? (
              <span className="text-slate-600 font-semibold">Đã khóa</span>
            ) : existingReport ? (
              <span>
                Lần gửi gần nhất: <span className="text-slate-700 font-semibold">{existingReport.reported_time || formatDateVN(existingReport.updated_at.split('T')[0])}</span>
              </span>
            ) : (
              <span className="text-slate-400 italic">Chưa gửi báo cáo hôm nay</span>
            )}
          </div>
        </div>

        {/* Validation Error Notice if invalid */}
        {!isLocked && !isValid && validationResult.error && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="leading-snug">{validationResult.error}</span>
          </div>
        )}

        {/* Row 2: Nút CẬP NHẬT BÁO CÁO / GỬI BÁO CÁO (Full-width như hình gốc) */}
        <div>
          {isLocked ? (
            <div className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm sm:text-base border border-slate-200 select-none">
              <Lock className="w-4 h-4" />
              Báo cáo đã khóa
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
              className={`w-full h-11 sm:h-12 flex items-center justify-center gap-2 px-6 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base text-white tracking-wide transition-all active:scale-[0.99] cursor-pointer shadow-md ${
                isValid && !isSaving
                  ? 'bg-[#00875a] hover:bg-[#00744e] active:bg-[#006041] shadow-emerald-700/25'
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
                  <CheckCircle2 className="w-5 h-5 text-white stroke-[2.2]" />
                  <span>{existingReport ? 'CẬP NHẬT BÁO CÁO' : 'GỬI BÁO CÁO'}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Caption dưới nút gửi báo cáo - Ứng dụng được phát triển bởi Vũ Văn Hùng-SĐT: 0984246993 */}
        <div className="text-center text-[11px] text-slate-500 font-medium pt-0.5">
          <span>Ứng dụng được phát triển bởi: <strong className="text-slate-800 font-bold">Vũ Văn Hùng</strong> - <a href="tel:0984246993" className="font-bold text-blue-700 hover:underline">SĐT: 0984246993</a></span>
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-base sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-base sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Ốm">Ốm</option>
                    <option value="Có phép">Có phép</option>
                    <option value="Không phép">Không phép</option>
                    <option value="Gia đình">Gia đình có việc</option>
                    <option value="Thời tiết/Mưa rét">Mưa rét/Đường xa</option>
                    <option value="Khác">Lý do khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hình thức ăn nghỉ (Tích chọn)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onClick={() => setNewAbsentIsBoarding(true)}
                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition-all ${
                        newAbsentIsBoarding
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold ring-1 ring-emerald-500/20'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          newAbsentIsBoarding
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {newAbsentIsBoarding && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold whitespace-normal leading-tight">HS bán trú</span>
                        <span className={`text-[10px] leading-tight ${newAbsentIsBoarding ? 'text-emerald-700 font-semibold' : 'text-slate-400 font-normal'}`}>
                          Báo ăn
                        </span>
                      </div>
                    </div>

                    <div
                      onClick={() => setNewAbsentIsBoarding(false)}
                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition-all ${
                        !newAbsentIsBoarding
                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold ring-1 ring-amber-500/20'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          !newAbsentIsBoarding
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {!newAbsentIsBoarding && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold whitespace-normal leading-tight">HS ngoại trú</span>
                        <span className={`text-[10px] leading-tight ${!newAbsentIsBoarding ? 'text-amber-700 font-semibold' : 'text-slate-400 font-normal'}`}>
                          Trưa về nhà
                        </span>
                      </div>
                    </div>
                  </div>
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
