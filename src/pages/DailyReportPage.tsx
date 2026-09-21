import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { ClassReportRow } from '../types';
import { DateNavigator } from '../components/DateNavigator';
import { CampusSelector } from '../components/CampusSelector';
import ExcelJS from 'exceljs';
import {
  Printer,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  RotateCcw,
  AlertCircle,
  X,
  CheckCircle,
  RefreshCw,
  CloudUpload,
} from 'lucide-react';

interface DailyReportPageProps {
  onNavigate?: (path: string) => void;
}

export const DailyReportPage: React.FC<DailyReportPageProps> = ({ onNavigate }) => {
  const { settings, indicators, campuses, classes, students } = useSchool();
  const { isGVCN, currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isBGH = currentUser?.role === 'BGH';

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });

  const [reportData, setReportData] = useState<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Reset Manager State
  const [showResetManager, setShowResetManager] = useState(false);
  const [managerDate, setManagerDate] = useState(selectedDate);
  const [managerData, setManagerData] = useState<{
    rows: ClassReportRow[];
    reportedClasses: number;
    totalClasses: number;
  } | null>(null);
  const [managerLoading, setManagerLoading] = useState(false);

  const [confirmResetModal, setConfirmResetModal] = useState<{
    classId: string;
    className: string;
    date: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [syncingSupabase, setSyncingSupabase] = useState(false);

  const handleSyncSupabase = async () => {
    setSyncingSupabase(true);
    try {
      const res = await StorageService.syncAllToSupabase();
      if (res.success) {
        setToastMessage('Đã đồng bộ thành công toàn bộ dữ liệu báo cáo lên Supabase!');
        await loadReportData(false);
      } else {
        setToastMessage(res.message || 'Lỗi khi đồng bộ. Vui lòng kiểm tra cấu hình Supabase.');
      }
    } catch (err: any) {
      console.error('Lỗi khi đồng bộ lên Supabase:', err);
      setToastMessage('Lỗi đồng bộ Supabase: ' + (err?.message || err));
    } finally {
      setSyncingSupabase(false);
      setTimeout(() => setToastMessage(''), 4500);
    }
  };

  const loadReportData = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(selectedDate, selectedCampusId);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      if (showIndicator) setLoading(false);
    }
  }, [selectedDate, selectedCampusId]);

  useEffect(() => {
    loadReportData(true);

    // Lắng nghe realtime từ GVCN nộp báo cáo hoặc reset báo cáo
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'daily_reports' || event.table === 'daily_report_values') {
        loadReportData(false);
      }
    });

    return () => {
      unsub();
    };
  }, [loadReportData]);

  const loadManagerData = async (dateStr: string) => {
    setManagerLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(dateStr, selectedCampusId);
      setManagerData(data);
    } catch (err) {
      console.error('Failed to load manager data:', err);
    } finally {
      setManagerLoading(false);
    }
  };

  useEffect(() => {
    if (showResetManager) {
      loadManagerData(managerDate);
    }
  }, [showResetManager, managerDate, selectedCampusId]);

  const handlePromptReset = (classId: string, className: string, dateStr: string = selectedDate) => {
    setConfirmResetModal({ classId, className, date: dateStr });
  };

  const handleConfirmReset = async () => {
    if (!confirmResetModal || !currentUser) return;
    setIsResetting(true);
    try {
      const ok = await StorageService.deleteDailyReport(confirmResetModal.classId, confirmResetModal.date, currentUser);
      if (ok) {
        setToastMessage(`Đã reset báo cáo lớp ${confirmResetModal.className} ngày ${confirmResetModal.date.split('-').reverse().join('/')} về trạng thái Chưa báo cáo thành công!`);
        setTimeout(() => setToastMessage(''), 5000);
        setConfirmResetModal(null);
        if (confirmResetModal.date === selectedDate) {
          await loadReportData();
        }
        if (showResetManager) {
          await loadManagerData(managerDate);
        }
      }
    } catch (err) {
      console.error('Reset report error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Parse date into day, month, year for official Vietnamese report header
  const dateParts = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-');
      return { day: d, month: m, year: y };
    } catch {
      const d = new Date();
      return { day: String(d.getDate()).padStart(2, '0'), month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()) };
    }
  }, [selectedDate]);

  const formattedSchoolName = useMemo(() => {
    let name = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
    if (!name.toUpperCase().startsWith('TRƯỜNG')) {
      name = 'TRƯỜNG ' + name;
    }
    return name.toUpperCase();
  }, [settings?.school_name]);

  // Tiêu đề mẫu: mặc định hiển thị "BÁO CÁO SĨ SỐ HỌC SINH NGÀY .......THÁNG ...... NĂM 2026"
  const [blankDateInTitle, setBlankDateInTitle] = useState(true);

  const baseTitle = useMemo(() => {
    let raw = settings?.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH';
    raw = raw.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
    return raw;
  }, [settings?.report_title]);

  const displayTitle = useMemo(() => {
    if (blankDateInTitle) {
      return `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`;
    }
    return `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;
  }, [baseTitle, blankDateInTitle, dateParts]);

  const signatureSettings = useMemo(() => {
    if (selectedCampusId !== 'all') {
      const c = campuses.find(c => c.id === selectedCampusId);
      if (c) {
        return {
          reporter_title: c.reporter_title || settings?.reporter_title || 'GIÁO VIÊN',
          reporter_name: c.reporter_name || settings?.reporter_name || 'Trần Thanh Tú',
          principal_title: c.principal_title || settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
          principal_name: c.principal_name || settings?.principal_name || 'Kiều Việt Hưng',
        };
      }
    }
    return {
      reporter_title: settings?.reporter_title || 'GIÁO VIÊN',
      reporter_name: settings?.reporter_name || 'Trần Thanh Tú',
      principal_title: settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
      principal_name: settings?.principal_name || 'Kiều Việt Hưng',
    };
  }, [selectedCampusId, campuses, settings]);

  const enabledIndicators = useMemo(() => {
    return indicators.filter((i) => i.enabled).sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  // 1. Group 1: Học sinh toàn trường (id: ig_all hoặc code: ALL hoặc chỉ tiêu đầu tiên)
  const allIndicator = useMemo(() => {
    return enabledIndicators.find((i) => i.code === 'ALL' || i.id === 'ig_all') || enabledIndicators[0];
  }, [enabledIndicators]);

  // 2. Group 2: Học sinh bán trú (id: ig_boarding_half hoặc code: BOARDING_HALF hoặc có chứa chữ bán trú)
  const boardingIndicator = useMemo(() => {
    return enabledIndicators.find(
      (i) => i.code === 'BOARDING_HALF' || i.id === 'ig_boarding_half' || i.name.toLowerCase().includes('bán trú')
    ) || enabledIndicators[1];
  }, [enabledIndicators]);

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Helper to resolve student address based on ID, Name fallback, and database lookup
  const getResolvedAddress = (s: any, classId: string): string => {
    // 1. Try matching with ID
    if (s.id) {
      const match = students.find((std) => std.id === s.id);
      if (match && match.address) return match.address;
    }
    // 2. Try matching with name (case-insensitive) within same class
    if (s.full_name) {
      const match = students.find(
        (std) => std.class_id === classId && std.full_name.trim().toLowerCase() === s.full_name.trim().toLowerCase()
      );
      if (match && match.address) return match.address;
    }
    // 3. Fallback to existing student address recorded on report
    return s.address || '';
  };

  // Helper to extract absent names/notes for a class
  const getAbsentStudentText = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      const listStr = row.report.absent_students
        .map((s) => `${s.full_name}${s.isBoarding ? ' (Bán Trú)' : ' (Ngoại Trú)'}${s.reason ? ` (${s.reason})` : ''}`)
        .join('\n');
      if (row.report.notes && !listStr.includes(row.report.notes)) {
        return `${listStr}\n- Ghi chú: ${row.report.notes}`;
      }
      return listStr;
    }
    return row.report?.notes || '';
  };

  // Helper to extract absent student addresses matched to names
  const getAbsentStudentAddresses = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      return row.report.absent_students
        .map((s) => {
          const addr = getResolvedAddress(s, row.classItem.id);
          return addr && addr.trim() !== '' ? addr : '-';
        })
        .join('\n'); // Using newline for better visual alignment in multi-line cells
    }
    return '-';
  };

  // Export Excel with complete cell borders, merged headers, and alignment matching the exact image
  const handleExportExcel = async (exportBlankTemplate: boolean = false) => {
    if (!reportData && !exportBlankTemplate) return;
    setExporting(true);

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Phần mềm Quản lý Sĩ số';
      wb.created = new Date();

      const ws = wb.addWorksheet('BaoCaoSiSo', {
        pageSetup: {
          orientation: 'landscape',
          paperSize: 9, // A4
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          horizontalCentered: true,
          verticalCentered: false,
          margins: {
            left: 0.5,   // ~1.27 cm
            right: 0.5,  // ~1.27 cm
            top: 0.6,    // ~1.5 cm
            bottom: 0.6, // ~1.5 cm
            header: 0.3,
            footer: 0.3,
          },
          showGridLines: true,
        },
      });

      // Standard thin black border for every cell
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };

      // Set column widths matching the document (13 columns)
      ws.columns = [
        { key: 'class', width: 9 },            // Cột 1: Lớp
        { key: 'teacher', width: 22 },          // Cột 2: Giáo viên chủ nhiệm
        { key: 'allTotal', width: 13 },         // Cột 3: Học sinh toàn trường - Tổng số học sinh
        { key: 'allAbsent', width: 13 },        // Cột 4: Học sinh toàn trường - Số học sinh vắng
        { key: 'halfTotal', width: 13 },        // Cột 5: Học sinh bán trú - Tổng số học sinh
        { key: 'halfAbsent', width: 13 },       // Cột 6: Học sinh bán trú - Số học sinh vắng
        { key: 'halfMeal', width: 15 },         // Cột 7: Học sinh bán trú - Học sinh báo ăn
        { key: 'ngoaiTruTotal', width: 13 },    // Cột 8: Học sinh ngoại trú - Tổng số học sinh
        { key: 'ngoaiTruAbsent', width: 13 },   // Cột 9: Học sinh ngoại trú - Số học sinh vắng
        { key: 'studentNames', width: 28 },     // Cột 10: Tên học sinh nghỉ
        { key: 'studentAddresses', width: 24 }, // Cột 11: Địa chỉ
        { key: 'absentRate', width: 14 },       // Cột 12: Tỉ lệ phần trăm vắng (%)
        { key: 'presentRate', width: 15 },      // Cột 13: Tỉ lệ phần trăm chuyên cần (%)
      ];

      let rIdx = 1;

      // Row 1: Left: UBND XÃ XA DUNG. Right: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
      ws.mergeCells(`A${rIdx}:E${rIdx}`);
      const subDeptCell = ws.getCell(`A${rIdx}`);
      subDeptCell.value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
      subDeptCell.font = { name: 'Times New Roman', size: 10, bold: true };
      subDeptCell.alignment = { horizontal: 'left', vertical: 'middle' };

      ws.mergeCells(`I${rIdx}:M${rIdx}`);
      const nationCell1 = ws.getCell(`I${rIdx}`);
      nationCell1.value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
      nationCell1.font = { name: 'Times New Roman', size: 10, bold: true };
      nationCell1.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(rIdx).height = 18;
      rIdx++;

      // Row 2: Left: TRƯỜNG PTDTBT THCS XA DUNG. Right: Độc lập - Tự do - Hạnh phúc
      ws.mergeCells(`A${rIdx}:E${rIdx}`);
      const schoolNameCell = ws.getCell(`A${rIdx}`);
      schoolNameCell.value = formattedSchoolName;
      schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };
      schoolNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

      ws.mergeCells(`I${rIdx}:M${rIdx}`);
      const nationCell2 = ws.getCell(`I${rIdx}`);
      nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
      nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
      nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(rIdx).height = 18;
      rIdx++;

      // Row 3: PHÂN HIỆU (only if a specific campus is selected)
      if (selectedCampusId !== 'all') {
        ws.mergeCells(`A${rIdx}:E${rIdx}`);
        const campusCell = ws.getCell(`A${rIdx}`);
        const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
        campusCell.value = `PHÂN HIỆU: ${(selectedCampus ? selectedCampus.name : '...........').toUpperCase()}`;
        campusCell.font = { name: 'Times New Roman', size: 10, bold: true };
        campusCell.alignment = { horizontal: 'left', vertical: 'middle' };
        ws.getRow(rIdx).height = 18;
        rIdx++;
      }

      // Small spacer before title
      ws.getRow(rIdx).height = 10;
      rIdx++;

      // Row 4: Title
      const titleText = exportBlankTemplate || blankDateInTitle
        ? `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`
        : `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;

      ws.mergeCells(`A${rIdx}:M${rIdx}`);
      const titleCell = ws.getCell(`A${rIdx}`);
      titleCell.value = titleText;
      titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(rIdx).height = 32;
      rIdx++;

      // Row 5: Empty spacer
      ws.getRow(rIdx).height = 12;
      rIdx++;

      // Header rows starting index
      const headerStartRow = rIdx;

      // Table Header Row 1 (Merge vertical or horizontal)
      ws.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
      ws.getCell(`A${headerStartRow}`).value = 'Lớp';

      ws.mergeCells(`B${headerStartRow}:B${headerStartRow + 1}`);
      ws.getCell(`B${headerStartRow}`).value = 'Giáo viên chủ\nnhiệm';

      ws.mergeCells(`C${headerStartRow}:D${headerStartRow}`);
      ws.getCell(`C${headerStartRow}`).value = 'Học sinh toàn trường';

      ws.mergeCells(`E${headerStartRow}:G${headerStartRow}`);
      ws.getCell(`E${headerStartRow}`).value = 'Học sinh bán trú';

      ws.mergeCells(`H${headerStartRow}:I${headerStartRow}`);
      ws.getCell(`H${headerStartRow}`).value = 'Học sinh ngoại trú';

      ws.mergeCells(`J${headerStartRow}:J${headerStartRow + 1}`);
      ws.getCell(`J${headerStartRow}`).value = 'Tên học sinh nghỉ';

      ws.mergeCells(`K${headerStartRow}:K${headerStartRow + 1}`);
      ws.getCell(`K${headerStartRow}`).value = 'Địa chỉ';

      ws.mergeCells(`L${headerStartRow}:L${headerStartRow + 1}`);
      ws.getCell(`L${headerStartRow}`).value = 'Tỉ lệ phần trăm\nvắng (%)';

      ws.mergeCells(`M${headerStartRow}:M${headerStartRow + 1}`);
      ws.getCell(`M${headerStartRow}`).value = 'Tỉ lệ phần trăm\nchuyên cần (%)';

      // Row 2 sub-columns
      ws.getCell(`C${headerStartRow + 1}`).value = 'Tổng số học sinh';
      ws.getCell(`D${headerStartRow + 1}`).value = 'Số học sinh vắng';
      ws.getCell(`E${headerStartRow + 1}`).value = 'Tổng số học sinh';
      ws.getCell(`F${headerStartRow + 1}`).value = 'Số học sinh vắng';
      ws.getCell(`G${headerStartRow + 1}`).value = 'Học sinh báo ăn';
      ws.getCell(`H${headerStartRow + 1}`).value = 'Tổng số học sinh';
      ws.getCell(`I${headerStartRow + 1}`).value = 'Số học sinh vắng';

      ws.getRow(headerStartRow).height = 24;
      ws.getRow(headerStartRow + 1).height = 24;

      // Apply borders, fonts and alignments to both header rows
      for (let r = headerStartRow; r <= headerStartRow + 1; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= 13; c++) {
          const cell = row.getCell(c);
          cell.border = thinBorder;
          cell.font = { name: 'Times New Roman', size: 10, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' },
          };
        }
      }

      let currentRow = headerStartRow + 2;

      if (exportBlankTemplate) {
        // Output template rows with class names and empty lines
        const sampleClasses = reportData?.rows?.map((r) => r.classItem.class_name) || [
          '6A9', '6A10', '......', '......'
        ];

        sampleClasses.forEach((clsName) => {
          const rObj = ws.getRow(currentRow);
          rObj.getCell(1).value = clsName;
          rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(1).font = { name: 'Times New Roman', size: 10.5, bold: true };

          for (let c = 1; c <= 13; c++) {
            rObj.getCell(c).border = thinBorder;
            rObj.getCell(c).font = { name: 'Times New Roman', size: 10.5 };
          }
          rObj.height = 22;
          currentRow++;
        });

        // Add 12 additional empty rows with grid borders just like the image template
        for (let i = 0; i < 12; i++) {
          const rObj = ws.getRow(currentRow);
          for (let c = 1; c <= 13; c++) {
            rObj.getCell(c).border = thinBorder;
          }
          rObj.height = 22;
          currentRow++;
        }
      } else if (reportData) {
        // Data rows with accurate calculations
        reportData.rows.forEach((row) => {
          const isReported = row.status !== 'NOT_REPORTED';

          const allVal = allIndicator ? row.values[allIndicator.id] : null;
          const boardingVal = boardingIndicator ? row.values[boardingIndicator.id] : null;

          const totalAll = allVal?.total ?? 0;
          const absentAll = allVal?.absent ?? 0;
          const presentAll = allVal?.present ?? (totalAll - absentAll);

          const totalBoarding = boardingVal?.total ?? 0;
          const absentBoarding = boardingVal?.absent ?? 0;
          const baoAnBoarding = Math.max(0, totalBoarding - absentBoarding); // Học sinh báo ăn = Tổng số HS bán trú - Số HS vắng bán trú

          const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
          const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

          // Accurate Percentage Calculations:
          // % vắng = (Số HS vắng / Tổng số HS) * 100
          const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
          // % chuyên cần = (Số HS có mặt / Tổng số HS) * 100 = ((Tổng số - Số vắng) / Tổng số) * 100
          const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

          const studentNames = getAbsentStudentText(row);
          const studentAddresses = getAbsentStudentAddresses(row);

          const rObj = ws.getRow(currentRow);
          rObj.getCell(1).value = row.classItem.class_name;
          rObj.getCell(2).value = row.teacher?.full_name || '';

          if (isReported) {
            rObj.getCell(3).value = totalAll;
            rObj.getCell(4).value = absentAll;
            rObj.getCell(5).value = totalBoarding;
            rObj.getCell(6).value = absentBoarding;
            rObj.getCell(7).value = baoAnBoarding;
            rObj.getCell(8).value = totalNgoaiTru;
            rObj.getCell(9).value = absentNgoaiTru;
            rObj.getCell(10).value = studentNames;
            rObj.getCell(11).value = studentAddresses;
            rObj.getCell(12).value = `${absentRate.toFixed(2).replace('.', ',')}%`;
            rObj.getCell(13).value = `${presentRate.toFixed(2).replace('.', ',')}%`;
          } else {
            rObj.getCell(3).value = totalAll > 0 ? totalAll : '-';
            rObj.getCell(4).value = '-';
            rObj.getCell(5).value = totalBoarding > 0 ? totalBoarding : '-';
            rObj.getCell(6).value = '-';
            rObj.getCell(7).value = '-';
            rObj.getCell(8).value = totalNgoaiTru > 0 ? totalNgoaiTru : '-';
            rObj.getCell(9).value = '-';
            rObj.getCell(10).value = 'Chưa báo cáo';
            rObj.getCell(11).value = '-';
            rObj.getCell(12).value = '-';
            rObj.getCell(13).value = '-';
          }

          // Alignments & fonts for every column
          // Cột 1: Lớp (Căn giữa)
          rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(1).font = { name: 'Times New Roman', size: 10.5, bold: true };

          // Cột 2: Giáo viên chủ nhiệm (Căn trái, thụt lề nhẹ)
          rObj.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
          rObj.getCell(2).font = { name: 'Times New Roman', size: 10.5 };

          // Cột 3: Học sinh toàn trường - Tổng số (Căn giữa)
          rObj.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(3).font = { name: 'Times New Roman', size: 10.5 };

          // Cột 4: Học sinh toàn trường - Số vắng (Căn giữa, màu đỏ nếu > 0)
          rObj.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(4).font = {
            name: 'Times New Roman',
            size: 10.5,
            bold: absentAll > 0,
            color: absentAll > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
          };

          // Cột 5: Học sinh bán trú - Tổng số (Căn giữa)
          rObj.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(5).font = { name: 'Times New Roman', size: 10.5 };

          // Cột 6: Học sinh bán trú - Số vắng (Căn giữa, màu đỏ nếu > 0)
          rObj.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(6).font = {
            name: 'Times New Roman',
            size: 10.5,
            bold: absentBoarding > 0,
            color: absentBoarding > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
          };

          // Cột 7: Học sinh bán trú - Học sinh báo ăn (Căn giữa, in đậm)
          rObj.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(7).font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };

          // Cột 8: Học sinh ngoại trú - Tổng số (Căn giữa)
          rObj.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(8).font = { name: 'Times New Roman', size: 10.5 };

          // Cột 9: Học sinh ngoại trú - Số vắng (Căn giữa, màu đỏ nếu > 0)
          rObj.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(9).font = {
            name: 'Times New Roman',
            size: 10.5,
            bold: absentNgoaiTru > 0,
            color: absentNgoaiTru > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
          };

          // Cột 10: Tên học sinh nghỉ (Căn trái, tự động xuống dòng)
          rObj.getCell(10).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
          rObj.getCell(10).font = { name: 'Times New Roman', size: 10 };

          // Cột 11: Địa chỉ (Căn trái, tự động xuống dòng)
          rObj.getCell(11).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
          rObj.getCell(11).font = { name: 'Times New Roman', size: 10 };

          // Cột 12: % Vắng (Căn giữa, in đậm)
          rObj.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(12).font = { name: 'Times New Roman', size: 10.5, bold: true };

          // Cột 13: % Chuyên cần (Căn giữa, in đậm)
          rObj.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(13).font = { name: 'Times New Roman', size: 10.5, bold: true };

          for (let c = 1; c <= 13; c++) {
            rObj.getCell(c).border = thinBorder;
          }

          rObj.height = 22;
          currentRow++;
        });

        // Summary Row: TỔNG CỘNG
        const totalSchoolAll = reportData.totals[allIndicator?.id || '']?.total || 0;
        const absentSchoolAll = reportData.totals[allIndicator?.id || '']?.absent || 0;
        const presentSchoolAll = reportData.totals[allIndicator?.id || '']?.present || (totalSchoolAll - absentSchoolAll);

        const totalSchoolBoarding = boardingIndicator ? (reportData.totals[boardingIndicator.id]?.total || 0) : 0;
        const absentSchoolBoarding = boardingIndicator ? (reportData.totals[boardingIndicator.id]?.absent || 0) : 0;
        const baoAnSchoolBoarding = Math.max(0, totalSchoolBoarding - absentSchoolBoarding); // Tổng học sinh báo ăn

        const totalSchoolNgoaiTru = Math.max(0, totalSchoolAll - totalSchoolBoarding);
        const absentSchoolNgoaiTru = Math.max(0, absentSchoolAll - absentSchoolBoarding);

        const overallAbsentRate = totalSchoolAll > 0 ? (absentSchoolAll / totalSchoolAll) * 100 : 0;
        const overallPresentRate = totalSchoolAll > 0 ? (presentSchoolAll / totalSchoolAll) * 100 : 0;

        ws.mergeCells(`A${currentRow}:B${currentRow}`);
        const sumLabel = ws.getCell(`A${currentRow}`);
        sumLabel.value = 'TỔNG CỘNG';
        sumLabel.font = { name: 'Times New Roman', size: 10.5, bold: true };
        sumLabel.alignment = { horizontal: 'center', vertical: 'middle' };

        const sumRow = ws.getRow(currentRow);
        sumRow.getCell(3).value = totalSchoolAll;
        sumRow.getCell(4).value = absentSchoolAll;
        sumRow.getCell(5).value = totalSchoolBoarding;
        sumRow.getCell(6).value = absentSchoolBoarding;
        sumRow.getCell(7).value = baoAnSchoolBoarding;
        sumRow.getCell(8).value = totalSchoolNgoaiTru;
        sumRow.getCell(9).value = absentSchoolNgoaiTru;
        sumRow.getCell(10).value = `Đã báo cáo: ${reportData.reportedClasses}/${reportData.totalClasses} lớp`;
        sumRow.getCell(11).value = '-';
        sumRow.getCell(12).value = `${overallAbsentRate.toFixed(2).replace('.', ',')}%`;
        sumRow.getCell(13).value = `${overallPresentRate.toFixed(2).replace('.', ',')}%`;

        for (let c = 1; c <= 13; c++) {
          const cell = sumRow.getCell(c);
          cell.border = thinBorder;
          const isRed = (c === 4 && absentSchoolAll > 0) || (c === 6 && absentSchoolBoarding > 0) || (c === 9 && absentSchoolNgoaiTru > 0);
          cell.font = {
            name: 'Times New Roman',
            size: 10.5,
            bold: true,
            color: isRed ? { argb: 'FFFF0000' } : (c === 7 ? { argb: 'FF1E40AF' } : { argb: 'FF000000' })
          };
          if (c === 10) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' }
          };
        }
        sumRow.height = 24;
        currentRow++;
      }

      // Auto-fit column widths based on the maximum character length of the longest line in any cell
      // Only measure from headerStartRow down to currentRow (before signatures) to avoid merged signature row interference
      for (let colIdx = 1; colIdx <= 13; colIdx++) {
        let maxLen = 0;
        for (let r = headerStartRow; r < currentRow; r++) {
          const row = ws.getRow(r);
          const cell = row.getCell(colIdx);
          
          // Skip horizontally merged header cells on the first header row (columns 3-9)
          if (r === headerStartRow && colIdx >= 3 && colIdx <= 9) {
            continue;
          }

          if (cell && cell.value) {
            const valStr = cell.value.toString();
            const lines = valStr.split('\n');
            lines.forEach((line) => {
              if (line.length > maxLen) {
                maxLen = line.length;
              }
            });
          }
        }

        if (maxLen > 0) {
          const col = ws.getColumn(colIdx);
          // Add 12% extra for wide characters and 4 chars padding
          const calculatedWidth = Math.ceil(maxLen * 1.12) + 4;
          
          let minWidth = 10;
          if (colIdx === 1) minWidth = 9;   // class
          if (colIdx === 2) minWidth = 22;  // teacher
          if (colIdx === 3 || colIdx === 4 || colIdx === 5 || colIdx === 6 || colIdx === 8 || colIdx === 9) minWidth = 13; // totals
          if (colIdx === 7) minWidth = 15;  // bao an
          if (colIdx === 10) minWidth = 28; // studentNames
          if (colIdx === 11) minWidth = 24; // studentAddresses
          if (colIdx === 12) minWidth = 14; // absentRate
          if (colIdx === 13) minWidth = 15; // presentRate
          
          col.width = Math.max(minWidth, calculatedWidth);
        }
      }

      // Add 2 empty spacer rows before signatures
      currentRow += 1;

      // Signatures row
      ws.mergeCells(`A${currentRow}:E${currentRow}`);
      ws.mergeCells(`I${currentRow}:M${currentRow}`);
      
      const reporterTitleCell = ws.getCell(`A${currentRow}`);
      reporterTitleCell.value = signatureSettings.reporter_title;
      reporterTitleCell.font = { name: 'Times New Roman', size: 12, bold: true };
      reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const principalDateCell = ws.getCell(`I${currentRow}`);
      principalDateCell.value = `Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`;
      principalDateCell.font = { name: 'Times New Roman', size: 12, italic: true };
      principalDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      
      currentRow++;

      ws.mergeCells(`A${currentRow}:E${currentRow}`);
      ws.mergeCells(`I${currentRow}:M${currentRow}`);
      
      const reporterSubCell = ws.getCell(`A${currentRow}`);
      reporterSubCell.value = '(Ký và ghi rõ họ tên)';
      reporterSubCell.font = { name: 'Times New Roman', size: 11, italic: true };
      reporterSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const principalTitleCell = ws.getCell(`I${currentRow}`);
      principalTitleCell.value = signatureSettings.principal_title;
      principalTitleCell.font = { name: 'Times New Roman', size: 12, bold: true };
      principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      currentRow++;

      ws.mergeCells(`I${currentRow}:M${currentRow}`);
      const principalSubCell = ws.getCell(`I${currentRow}`);
      principalSubCell.value = '(Ký, đóng dấu và ghi rõ họ tên)';
      principalSubCell.font = { name: 'Times New Roman', size: 11, italic: true };
      principalSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Space for signatures
      currentRow += 4;

      ws.mergeCells(`A${currentRow}:E${currentRow}`);
      ws.mergeCells(`I${currentRow}:M${currentRow}`);

      const reporterNameCell = ws.getCell(`A${currentRow}`);
      reporterNameCell.value = signatureSettings.reporter_name;
      reporterNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
      reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const principalNameCell = ws.getCell(`I${currentRow}`);
      principalNameCell.value = signatureSettings.principal_name;
      principalNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
      principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

      currentRow++;

      // Generate binary and trigger download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportBlankTemplate
        ? 'Mau_bao_cao_si_so_chuan.xlsx'
        : `Bao_cao_si_so_${dateParts.day}-${dateParts.month}-${dateParts.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar (Hidden on print) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('/dashboard')}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Quay lại Tổng quan"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              BIỂU MẪU BÁO CÁO SĨ SỐ HỌC SINH
            </h1>
            <p className="text-xs text-slate-500">
              Đúng chuẩn biểu mẫu gốc: đường kẻ rõ ràng, tự động tính % vắng và % chuyên cần
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CampusSelector
            selectedCampusId={selectedCampusId}
            onChange={setSelectedCampusId}
          />
          <DateNavigator selectedDate={selectedDate} onChangeDate={setSelectedDate} />

          <button
            type="button"
            onClick={() => loadReportData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Tải lại số liệu mới nhất từ giáo viên chủ nhiệm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">LÀM MỚI</span>
          </button>

          <button
            type="button"
            onClick={() => setBlankDateInTitle(!blankDateInTitle)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-colors ${
              blankDateInTitle
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
            title="Nhấp để chuyển đổi giữa định dạng Ngày... Tháng... Năm (điền tay) hoặc Ngày cụ thể tự động"
          >
            <span className="font-mono text-[11px]">{blankDateInTitle ? 'MẪU ĐIỀN TAY: NGÀY .......THÁNG ......' : `NGÀY ${dateParts.day} THÁNG ${dateParts.month}`}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportExcel(false)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 shadow-2xs transition-colors disabled:opacity-50"
            title="Xuất file Excel có đầy đủ đường kẻ và số liệu ngày đã chọn"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>{exporting ? 'ĐANG XUẤT...' : 'XUẤT EXCEL'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncSupabase}
            disabled={syncingSupabase}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 border border-teal-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Đồng bộ toàn bộ dữ liệu báo cáo, chỉ số và danh sách vắng lên Supabase"
          >
            <CloudUpload className={`w-4 h-4 text-teal-700 ${syncingSupabase ? 'animate-bounce' : ''}`} />
            <span>{syncingSupabase ? 'ĐANG ĐỒNG BỘ...' : 'ĐỒNG BỘ SUPABASE'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportExcel(true)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 shadow-2xs transition-colors disabled:opacity-50"
            title="Xuất file Excel mẫu trắng y hệt hình gốc"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>MẪU TRẮNG</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>IN BÁO CÁO</span>
          </button>

          {(isAdmin || isBGH) && (
            <button
              type="button"
              onClick={() => {
                setManagerDate(selectedDate);
                setShowResetManager(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition-colors cursor-pointer"
              title="Quản trị viên / BGH: Quản lý và reset báo cáo nhầm của các lớp về Chưa báo cáo"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>RESET BÁO CÁO NHẦM</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Document Layout - Matched precisely to the template image with solid borderlines */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 print-container text-black">
        {/* Official Document Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start font-serif text-black mb-6">
          <div className="flex flex-col items-start text-left">
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
              {settings?.sub_department_name || 'UBND XÃ XA DUNG'}
            </div>
            <div className="text-[11px] sm:text-xs font-extrabold uppercase mt-0.5 tracking-tight border-b border-black pb-0.5">
              {formattedSchoolName}
            </div>
            {selectedCampusId !== 'all' ? (
              <div className="text-[11px] sm:text-xs font-bold mt-1 uppercase">
                PHÂN HIỆU: {campuses.find((c) => c.id === selectedCampusId)?.name || '...........'}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center text-center mt-3 md:mt-0">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wide">
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </div>
            <div className="text-[10px] sm:text-xs font-bold border-b border-black pb-0.5 mt-0.5 px-4">
              Độc lập - Tự do - Hạnh phúc
            </div>
          </div>
        </div>

        {/* Dynamic Big Report Title */}
        <div className="text-center my-6 pb-2">
          <h2 className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wider text-black font-serif">
            {displayTitle}
          </h2>
        </div>

        {/* Data Table with Full Borders (Đường kẻ chuẩn theo hình gốc) */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-xs font-serif">
            <thead>
              {/* Header Row 1 */}
              <tr className="bg-slate-50 text-black font-bold text-center">
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-14">
                  Lớp
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[160px] text-center">
                  Giáo viên chủ nhiệm
                </th>
                <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                  Học sinh toàn trường
                </th>
                <th colSpan={3} className="border border-black px-2 py-1.5 text-center bg-blue-50/50">
                  Học sinh bán trú
                </th>
                <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                  Học sinh ngoại trú
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[200px] text-center">
                  Tên học sinh nghỉ
                </th>
                <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[150px] text-center">
                  Địa chỉ
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-24 text-center">
                  Tỉ lệ phần trăm vắng (%)
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-28 text-center">
                  Tỉ lệ phần trăm chuyên cần (%)
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2.5 w-16 text-center print:hidden">
                  Xử lý
                </th>
              </tr>

              {/* Header Row 2: Sub-columns */}
              <tr className="bg-slate-50 text-black font-bold text-center text-[11px]">
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
                <th className="border border-black px-1.5 py-1.5 w-20 bg-blue-50/80 text-blue-900 font-bold">Học sinh báo ăn</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Tổng số học sinh</th>
                <th className="border border-black px-1.5 py-1.5 w-18">Số học sinh vắng</th>
              </tr>
            </thead>

            <tbody>
              {reportData?.rows.map((row) => {
                const isReported = row.status !== 'NOT_REPORTED';

                const allVal = allIndicator ? row.values[allIndicator.id] : null;
                const boardingVal = boardingIndicator ? row.values[boardingIndicator.id] : null;

                const totalAll = allVal?.total ?? 0;
                const absentAll = allVal?.absent ?? 0;
                const presentAll = allVal?.present ?? (totalAll - absentAll);

                const totalBoarding = boardingVal?.total ?? 0;
                const absentBoarding = boardingVal?.absent ?? 0;
                const baoAnBoarding = Math.max(0, totalBoarding - absentBoarding); // Học sinh báo ăn = Tổng số HS bán trú - Số HS vắng bán trú
                
                const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
                const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

                // Accurate Percentage Calculations:
                // % vắng = (Số HS vắng / Tổng số HS) * 100
                const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
                // % chuyên cần = (Số HS có mặt / Tổng số HS) * 100 = ((Tổng số - Số vắng) / Tổng số) * 100
                const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

                const studentNames = getAbsentStudentText(row);
                const studentAddresses = getAbsentStudentAddresses(row);

                return (
                  <tr key={row.classItem.id} className="text-center hover:bg-slate-50/70">
                    {/* 1. Lớp */}
                    <td className="border border-black py-1.5 px-2 font-bold text-black text-center">
                      {row.classItem.class_name}
                    </td>

                    {/* 2. Giáo viên chủ nhiệm */}
                    <td className="border border-black py-1.5 px-2.5 text-left text-black font-medium">
                      {row.teacher?.full_name || '-'}
                    </td>

                    {/* 3. Học sinh toàn trường - Tổng số */}
                    <td className="border border-black py-1.5 px-1 font-medium text-center">
                      {isReported ? totalAll : totalAll > 0 ? totalAll : '-'}
                    </td>

                    {/* 4. Học sinh toàn trường - Số vắng */}
                    <td
                      className={`border border-black py-1.5 px-1 font-bold text-center ${
                        absentAll > 0 ? 'text-red-700' : 'text-black'
                      }`}
                    >
                      {isReported ? absentAll : '-'}
                    </td>

                    {/* 5. Học sinh bán trú - Tổng số */}
                    <td className="border border-black py-1.5 px-1 font-medium text-center">
                      {isReported ? totalBoarding : totalBoarding > 0 ? totalBoarding : '-'}
                    </td>

                    {/* 6. Học sinh bán trú - Số vắng */}
                    <td
                      className={`border border-black py-1.5 px-1 font-bold text-center ${
                        absentBoarding > 0 ? 'text-red-700' : 'text-black'
                      }`}
                    >
                      {isReported ? absentBoarding : '-'}
                    </td>

                    {/* 7. Học sinh bán trú - Học sinh báo ăn (Tổng HS bán trú - Số HS vắng bán trú) */}
                    <td className="border border-black py-1.5 px-1 font-bold text-center text-blue-900 bg-blue-50/40">
                      {isReported ? baoAnBoarding : '-'}
                    </td>

                    {/* 8. Học sinh ngoại trú - Tổng số */}
                    <td className="border border-black py-1.5 px-1 font-medium text-center">
                      {isReported ? totalNgoaiTru : totalNgoaiTru > 0 ? totalNgoaiTru : '-'}
                    </td>

                    {/* 9. Học sinh ngoại trú - Số vắng */}
                    <td
                      className={`border border-black py-1.5 px-1 font-bold text-center ${
                        absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                      }`}
                    >
                      {isReported ? absentNgoaiTru : '-'}
                    </td>

                    {/* 10. Tên học sinh (Danh sách vắng & lý do) */}
                    <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                      {isReported ? (
                        studentNames || ''
                      ) : (
                        <span className="text-slate-400 italic">Chưa báo cáo</span>
                      )}
                    </td>

                    {/* 11. Địa chỉ học sinh vắng */}
                    <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                      {isReported ? studentAddresses || '-' : '-'}
                    </td>

                    {/* 12. Tỉ lệ phần trăm vắng (%) */}
                    <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                      {isReported ? `${absentRate.toFixed(2).replace('.', ',')}%` : '-'}
                    </td>

                    {/* 13. Tỉ lệ phần trăm chuyên cần (%) */}
                    <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                      {isReported ? `${presentRate.toFixed(2).replace('.', ',')}%` : '-'}
                    </td>

                    {/* 14. Xử lý reset nhầm (ẩn khi in) */}
                    <td className="border border-black py-1 px-1.5 text-center print:hidden">
                      {isReported && (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === row.classItem.id)) ? (
                        <button
                          type="button"
                          onClick={() => handlePromptReset(row.classItem.id, row.classItem.class_name, selectedDate)}
                          disabled={row.status === 'LOCKED' && !isAdmin}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                          title="Reset báo cáo nhầm về Chưa báo cáo"
                        >
                          <RotateCcw className="w-3 h-3 text-rose-600" />
                          <span>Reset</span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* TỔNG CỘNG HÀNG CUỐI (Summary Row) */}
              {reportData && (
                (() => {
                  const totalSchoolAll = reportData.totals[allIndicator?.id || '']?.total || 0;
                  const absentSchoolAll = reportData.totals[allIndicator?.id || '']?.absent || 0;
                  const presentSchoolAll = reportData.totals[allIndicator?.id || '']?.present || (totalSchoolAll - absentSchoolAll);

                  const totalSchoolBoarding = boardingIndicator ? (reportData.totals[boardingIndicator.id]?.total || 0) : 0;
                  const absentSchoolBoarding = boardingIndicator ? (reportData.totals[boardingIndicator.id]?.absent || 0) : 0;
                  const baoAnSchoolBoarding = Math.max(0, totalSchoolBoarding - absentSchoolBoarding); // Tổng học sinh báo ăn

                  const totalSchoolNgoaiTru = Math.max(0, totalSchoolAll - totalSchoolBoarding);
                  const absentSchoolNgoaiTru = Math.max(0, absentSchoolAll - absentSchoolBoarding);

                  const overallAbsentRate = totalSchoolAll > 0 ? (absentSchoolAll / totalSchoolAll) * 100 : 0;
                  const overallPresentRate = totalSchoolAll > 0 ? (presentSchoolAll / totalSchoolAll) * 100 : 0;

                  return (
                    <tr className="bg-slate-100 font-bold text-center border-t-2 border-black text-black">
                      <td colSpan={2} className="border border-black py-2 px-3 text-center uppercase tracking-wide">
                        TỔNG CỘNG
                      </td>

                      {/* Toàn trường */}
                      <td className="border border-black py-2 px-1 text-sm font-bold text-center">
                        {totalSchoolAll}
                      </td>
                      <td className="border border-black py-2 px-1 text-sm font-bold text-red-700 text-center">
                        {absentSchoolAll}
                      </td>

                      {/* Bán trú */}
                      <td className="border border-black py-2 px-1 text-sm font-bold text-center">
                        {totalSchoolBoarding}
                      </td>
                      <td className="border border-black py-2 px-1 text-sm font-bold text-red-700 text-center">
                        {absentSchoolBoarding}
                      </td>
                      {/* Báo ăn */}
                      <td className="border border-black py-2 px-1 text-sm font-bold text-blue-900 bg-blue-100/60 text-center">
                        {baoAnSchoolBoarding}
                      </td>

                      {/* Ngoại trú */}
                      <td className="border border-black py-2 px-1 text-sm font-bold text-center">
                        {totalSchoolNgoaiTru}
                      </td>
                      <td className="border border-black py-2 px-1 text-sm font-bold text-red-700 text-center">
                        {absentSchoolNgoaiTru}
                      </td>

                      {/* Tên học sinh vắng */}
                      <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                        Đã báo cáo: {reportData.reportedClasses}/{reportData.totalClasses} lớp
                      </td>
                      {/* Địa chỉ */}
                      <td className="border border-black py-2 px-2 text-center text-[11px] font-semibold text-slate-700">
                        -
                      </td>

                      <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                        {overallAbsentRate.toFixed(2).replace('.', ',')}%
                      </td>
                      <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                        {overallPresentRate.toFixed(2).replace('.', ',')}%
                      </td>
                      <td className="border border-black py-2 px-1 text-center font-bold text-slate-400 print:hidden">
                        -
                      </td>
                    </tr>
                  );
                })()
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & Signatures */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center font-serif text-black print-break-inside-avoid">
          <div>
            <div className="text-xs uppercase font-bold">
              {signatureSettings.reporter_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.reporter_name}</div>
          </div>

          <div>
            <div className="text-xs italic text-slate-700 mb-1">
              Ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}
            </div>
            <div className="text-xs uppercase font-bold">
              {signatureSettings.principal_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký, đóng dấu và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.principal_name}</div>
          </div>
        </div>

        {/* Developer attribution footnote */}
        {settings?.developer_name && (
          <div className="mt-8 pt-2 border-t border-dotted border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] text-slate-400 font-sans print:text-black">
            <span>Hệ thống Quản lý Báo cáo Sĩ số Học sinh Trực tuyến</span>
            <span>Phần mềm phát triển bởi: <strong>{settings.developer_name}</strong>{settings.developer_contact ? ` - ${settings.developer_contact}` : ''}</span>
          </div>
        )}
      </div>

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200 print:hidden">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Modal Bảng Điều Khiển Quản Lý & Reset Báo Cáo Nhầm */}
      {showResetManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border-b border-rose-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Quản Lý & Reset Báo Cáo Nhầm
                  </h3>
                  <p className="text-xs text-rose-700 font-semibold mt-0.5">
                    Khôi phục trạng thái Chưa báo cáo cho từng lớp theo ngày
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetManager(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date Selection Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Chọn ngày cần reset:</span>
                <input
                  type="date"
                  value={managerDate}
                  onChange={(e) => setManagerDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white shadow-2xs focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="text-xs text-slate-600 font-medium">
                Đã báo cáo:{' '}
                <strong className="text-rose-700 font-black">
                  {managerData?.rows.filter((r) => r.status !== 'NOT_REPORTED').length || 0}
                </strong>
                /{managerData?.rows.length || 0} lớp
              </div>
            </div>

            {/* Classes List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {managerLoading ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang tải danh sách lớp...</span>
                </div>
              ) : (
                (() => {
                  const reportedRows = (managerData?.rows || []).filter((r) => {
                    if (isGVCN && !isAdmin && !isBGH) {
                      return r.classItem.id === currentUser?.assigned_class_id;
                    }
                    return true;
                  });

                  if (reportedRows.length === 0) {
                    return (
                      <div className="py-10 text-center text-slate-400 text-xs italic">
                        Không có lớp nào trong danh sách.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {reportedRows.map((row) => {
                        const isRep = row.status !== 'NOT_REPORTED';
                        const canOperate = isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === row.classItem.id);

                        return (
                          <div
                            key={row.classItem.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                              isRep
                                ? 'bg-white border-slate-200 hover:border-rose-300 shadow-2xs'
                                : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                                  isRep ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {row.classItem.class_name}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                  <span>Lớp {row.classItem.class_name}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                      isRep
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {isRep ? 'ĐÃ BÁO CÁO' : 'CHƯA BÁO CÁO'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  GVCN: {row.teacher?.full_name || 'Chưa phân công'}
                                  {row.report?.reported_time && (
                                    <span className="ml-2 font-mono text-slate-400">
                                      ({row.report.reported_time})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isRep && canOperate ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePromptReset(row.classItem.id, row.classItem.class_name, managerDate)
                                  }
                                  disabled={row.status === 'LOCKED' && !isAdmin}
                                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reset về Chưa báo cáo</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 italic">
                                  {isRep ? 'Đã khóa' : 'Chưa có báo cáo'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              <div className="text-[11px] text-slate-500 italic">
                Lưu ý: Reset sẽ xóa dữ liệu sĩ số ngày được chọn của lớp để giáo viên nộp lại.
              </div>
              <button
                type="button"
                onClick={() => setShowResetManager(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Xác Nhận Reset Từng Lớp */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
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
                  <span className="font-extrabold text-slate-900 text-sm">Lớp {confirmResetModal.className}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Ngày báo cáo:</span>
                  <span className="font-bold text-slate-800">
                    {confirmResetModal.date.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Lưu ý khi reset:
                </div>
                Dữ liệu sĩ số đã nhập của lớp sẽ bị xóa bỏ hoàn toàn. Bảng tổng hợp toàn trường và biểu mẫu báo cáo sẽ chuyển lớp về trạng thái <strong className="text-amber-950">Chưa báo cáo</strong> cho đến khi GVCN nhập lại.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmResetModal(null)}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
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
