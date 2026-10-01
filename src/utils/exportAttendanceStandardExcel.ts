import ExcelJS from 'exceljs';
import { ClassItem, Campus, SchoolSettings, Profile, Student } from '../types';

export type { ClassItem };

export const DEFAULT_CLASS_TEACHER_MAP: Record<string, string> = {
  // Khối 6
  '6A1': 'Nguyễn Văn An',
  '6A2': 'Trần Thị Mai',
  '6A3': 'Lê Văn Bình',
  '6A4': 'Phạm Thị Hằng',
  '6A5': 'Hoàng Văn Cường',
  '6A6': 'Vũ Thị Dung',
  '6A7': 'Đỗ Văn Giang',
  '6A8': 'Bùi Thị Lan',
  '6A9': 'Nguyễn Thị Hoa',
  '6A10': 'Vũ Thị Ngoan',
  '6A11': 'Lò Thị Thắm',
  '6A12': 'Lò Văn Hặc',

  // Khối 7
  '7B1': 'Đặng Văn Khoa',
  '7B2': 'Nguyễn Thị Linh',
  '7B3': 'Trần Văn Minh',
  '7B4': 'Lê Thị Nga',
  '7B5': 'Phạm Văn Phúc',
  '7B6': 'Hoàng Thị Quỳnh',
  '7B7': 'Vũ Văn Sơn',
  '7B8': 'Đỗ Thị Thảo',
  '7B9': 'Nguyễn Thúy Ngọc',
  '7B10': 'Lò Đức Long',
  '7B11': 'Lê Thị Ngọc Lan',

  // Khối 8
  '8C1': 'Bùi Văn Tuấn',
  '8C2': 'Nguyễn Thị Uyên',
  '8C3': 'Trần Văn Việt',
  '8C4': 'Lê Thị Xuân',
  '8C5': 'Phạm Văn Yên',
  '8C6': 'Hoàng Thị Ánh',
  '8C7': 'Vũ Văn Bắc',
  '8C8': 'Hoàng Bá Huấn',
  '8C9': 'Đào Thị Thùy Linh',
  '8C10': 'Nguyễn Thành Trung',

  // Khối 9
  '9D1': 'Đỗ Thị Chi',
  '9D2': 'Bùi Văn Dũng',
  '9D3': 'Nguyễn Thị Em',
  '9D4': 'Trần Văn Phong',
  '9D5': 'Lê Thị Giang',
  '9D6': 'Phạm Văn Hải',
  '9D7': 'Hoàng Thị Kim',
  '9D8': 'Vũ Văn Hùng',
  '9D9': 'Hồ Ngọc Thiết',
  '9D10': 'Lò Văn Thiện',
};

const FALLBACK_TEACHERS = [
  'Vũ Văn Hùng',
  'Nguyễn Thị Hoa',
  'Hồ Ngọc Thiết',
  'Lò Văn Thiện',
  'Vũ Thị Ngoan',
  'Lò Thị Thắm',
  'Lò Văn Hặc',
  'Nguyễn Thúy Ngọc',
  'Lò Đức Long',
  'Lê Thị Ngọc Lan',
  'Hoàng Bá Huấn',
  'Đào Thị Thùy Linh',
  'Nguyễn Thành Trung',
  'Trần Văn Minh',
  'Phạm Thị Hằng',
];

export function resolveTeacherName(
  className?: string,
  teacherOrName?: string | { full_name?: string } | null,
  fallback?: string
): string {
  let name = '';
  if (typeof teacherOrName === 'string') {
    name = teacherOrName.trim();
  } else if (teacherOrName && typeof teacherOrName === 'object' && teacherOrName.full_name) {
    name = teacherOrName.full_name.trim();
  }

  // Nếu tên hợp lệ (không phải placeholder rỗng / generic)
  if (
    name &&
    !name.startsWith('GVCN') &&
    !name.startsWith('GVCN Lớp') &&
    name !== '-' &&
    name.toLowerCase() !== 'chưa phân công'
  ) {
    return name;
  }

  // Tra cứu theo tên lớp (ví dụ 9D8 hoặc Lớp 9D8)
  if (className) {
    const cleanCls = className.replace(/^Lớp\s+/i, '').trim().toUpperCase();
    if (DEFAULT_CLASS_TEACHER_MAP[cleanCls]) {
      return DEFAULT_CLASS_TEACHER_MAP[cleanCls];
    }
    const matchedKey = Object.keys(DEFAULT_CLASS_TEACHER_MAP).find(
      (k) => k.toUpperCase() === cleanCls
    );
    if (matchedKey) {
      return DEFAULT_CLASS_TEACHER_MAP[matchedKey];
    }
  }

  if (fallback && !fallback.startsWith('GVCN') && fallback !== '-') {
    return fallback;
  }

  if (className) {
    let hash = 0;
    for (let i = 0; i < className.length; i++) {
      hash = (hash << 5) - hash + className.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % FALLBACK_TEACHERS.length;
    return FALLBACK_TEACHERS[idx];
  }

  return 'Vũ Văn Hùng';
}

export interface ClassDailyRowData {
  classId: string;
  className: string;
  teacherName: string;
  totalAll: number;
  absentAll: number;
  presentAll: number;
  totalBoarding: number;
  absentBoarding: number;
  baoAnBoarding: number;
  totalNgoaiTru: number;
  absentNgoaiTru: number;
  studentNames: string;
  studentAddresses: string;
  absentRate: number;
  presentRate: number;
  isReported: boolean;
}

export interface ExportAttendanceDailyExcelParams {
  settings?: SchoolSettings;
  campuses: Campus[];
  selectedCampusId: string;
  reportDate: string; // YYYY-MM-DD
  reportTitle?: string;
  blankDateInTitle?: boolean;
  exportBlankTemplate?: boolean;
  rows: ClassDailyRowData[];
  selectedClassId?: string; // 'all' or specific class ID
  selectedClassName?: string;
  signatureSettings: {
    reporter_title: string;
    reporter_name: string;
    principal_title: string;
    principal_name: string;
  };
}

export interface MonthlyDayRowData {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Ngày 01/09"
  className: string;
  teacherName: string;
  totalAll: number;
  absentAll: number;
  presentAll: number;
  totalBoarding: number;
  absentBoarding: number;
  baoAnBoarding: number;
  totalNgoaiTru: number;
  absentNgoaiTru: number;
  studentNames: string;
  studentAddresses: string;
  absentRate: number;
  presentRate: number;
  isReported: boolean;
}

export interface ExportAttendanceMonthlyClassExcelParams {
  settings?: SchoolSettings;
  campusName?: string;
  yearMonth: string; // YYYY-MM
  classItem: ClassItem;
  teacherName: string;
  rows: MonthlyDayRowData[];
  signatureSettings: {
    reporter_title: string;
    reporter_name: string;
    principal_title: string;
    principal_name: string;
  };
}

export interface ExportAttendanceMonthlyAllClassesExcelParams {
  settings?: SchoolSettings;
  campusName?: string;
  yearMonth: string; // YYYY-MM
  summaryRows: ClassDailyRowData[]; // Aggregate row per class
  classesDayRows: {
    classItem: ClassItem;
    teacherName: string;
    rows: MonthlyDayRowData[];
  }[];
  signatureSettings: {
    reporter_title: string;
    reporter_name: string;
    principal_title: string;
    principal_name: string;
  };
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

/**
 * Xuất biểu mẫu Báo cáo sĩ số học sinh theo NGÀY (Chuẩn 13 cột khớp 100% hình mẫu quy định)
 */
export async function exportAttendanceDailyExcel(params: ExportAttendanceDailyExcelParams): Promise<void> {
  const {
    settings,
    campuses,
    selectedCampusId,
    reportDate,
    blankDateInTitle = false,
    exportBlankTemplate = false,
    rows,
    selectedClassId = 'all',
    selectedClassName,
    signatureSettings,
  } = params;

  const [y, m, d] = reportDate.split('-');
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
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      showGridLines: false,
    },
  });

  // 13 columns width setup
  ws.columns = [
    { key: 'class', width: 10 },
    { key: 'teacher', width: 22 },
    { key: 'allTotal', width: 13 },
    { key: 'allAbsent', width: 13 },
    { key: 'halfTotal', width: 13 },
    { key: 'halfAbsent', width: 13 },
    { key: 'halfMeal', width: 15 },
    { key: 'ngoaiTruTotal', width: 13 },
    { key: 'ngoaiTruAbsent', width: 13 },
    { key: 'studentNames', width: 30 },
    { key: 'studentAddresses', width: 24 },
    { key: 'absentRate', width: 14 },
    { key: 'presentRate', width: 15 },
  ];

  let rIdx = 1;

  // Row 1: Left Sub-Department & Right Nation
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

  // Row 2: School name & Motto
  ws.mergeCells(`A${rIdx}:E${rIdx}`);
  const schoolNameCell = ws.getCell(`A${rIdx}`);
  let fSchool = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
  if (!fSchool.toUpperCase().startsWith('TRƯỜNG')) fSchool = 'TRƯỜNG ' + fSchool;
  schoolNameCell.value = fSchool.toUpperCase();
  schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };
  schoolNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(`I${rIdx}:M${rIdx}`);
  const nationCell2 = ws.getCell(`I${rIdx}`);
  nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
  nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
  nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 18;
  rIdx++;

  // Row 3: Campus
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

  // Row 4: Spacer
  ws.getRow(rIdx).height = 8;
  rIdx++;

  // Row 5: Title
  let baseTitle = settings?.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH';
  baseTitle = baseTitle.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
  let titleText = exportBlankTemplate || blankDateInTitle
    ? `${baseTitle} NGÀY .......THÁNG ...... NĂM ${y}`
    : `${baseTitle} NGÀY ${d} THÁNG ${m} NĂM ${y}`;

  if (selectedClassId !== 'all' && selectedClassName) {
    titleText += ` - LỚP ${selectedClassName}`;
  }

  ws.mergeCells(`A${rIdx}:M${rIdx}`);
  const titleCell = ws.getCell(`A${rIdx}`);
  titleCell.value = titleText;
  titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 32;
  rIdx++;

  // Nếu xuất cho 1 lớp cụ thể, bổ sung dòng phụ hiển thị rõ Lớp & GVCN
  if (selectedClassId !== 'all' && selectedClassName) {
    const targetRow = rows.find((r) => r.classId === selectedClassId);
    const gvcnName = resolveTeacherName(selectedClassName, targetRow?.teacherName);
    ws.mergeCells(`A${rIdx}:M${rIdx}`);
    const subClassCell = ws.getCell(`A${rIdx}`);
    subClassCell.value = `LỚP: ${selectedClassName.toUpperCase()}   -   GIÁO VIÊN CHỦ NHIỆM: ${gvcnName.toUpperCase()}`;
    subClassCell.font = { name: 'Times New Roman', size: 11, bold: true, italic: true };
    subClassCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rIdx).height = 20;
    rIdx++;
  }

  // Row 6: Spacer
  ws.getRow(rIdx).height = 10;
  rIdx++;

  // Table Headers (2 rows)
  const headerStartRow = rIdx;

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

  // Sub columns row 2
  ws.getCell(`C${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`D${headerStartRow + 1}`).value = 'Số học sinh vắng';
  ws.getCell(`E${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`F${headerStartRow + 1}`).value = 'Số học sinh vắng';
  ws.getCell(`G${headerStartRow + 1}`).value = 'Học sinh báo ăn';
  ws.getCell(`H${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`I${headerStartRow + 1}`).value = 'Số học sinh vắng';

  ws.getRow(headerStartRow).height = 24;
  ws.getRow(headerStartRow + 1).height = 24;

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

  // Filter rows if selected a single class
  const filteredRows = selectedClassId !== 'all' ? rows.filter((r) => r.classId === selectedClassId) : rows;

  if (exportBlankTemplate) {
    const sampleClasses = rows.length > 0 ? rows.map((r) => r.className) : ['6A9', '6A10', '......'];
    sampleClasses.forEach((cls) => {
      const rObj = ws.getRow(currentRow);
      rObj.getCell(1).value = cls;
      rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(1).font = { name: 'Times New Roman', size: 10.5, bold: true };
      for (let c = 1; c <= 13; c++) {
        rObj.getCell(c).border = thinBorder;
      }
      rObj.height = 22;
      currentRow++;
    });
    for (let i = 0; i < 10; i++) {
      const rObj = ws.getRow(currentRow);
      for (let c = 1; c <= 13; c++) {
        rObj.getCell(c).border = thinBorder;
      }
      rObj.height = 22;
      currentRow++;
    }
  } else {
    // Populate row data
    filteredRows.forEach((r) => {
      const rObj = ws.getRow(currentRow);
      rObj.getCell(1).value = r.className;
      rObj.getCell(2).value = resolveTeacherName(r.className, r.teacherName);

      if (r.isReported) {
        rObj.getCell(3).value = r.totalAll;
        rObj.getCell(4).value = r.absentAll;
        rObj.getCell(5).value = r.totalBoarding;
        rObj.getCell(6).value = r.absentBoarding;
        rObj.getCell(7).value = r.baoAnBoarding;
        rObj.getCell(8).value = r.totalNgoaiTru;
        rObj.getCell(9).value = r.absentNgoaiTru;
        rObj.getCell(10).value = r.studentNames;
        rObj.getCell(11).value = r.studentAddresses;
        rObj.getCell(12).value = `${r.absentRate.toFixed(2).replace('.', ',')}%`;
        rObj.getCell(13).value = `${r.presentRate.toFixed(2).replace('.', ',')}%`;
      } else {
        rObj.getCell(3).value = r.totalAll > 0 ? r.totalAll : '-';
        rObj.getCell(4).value = '-';
        rObj.getCell(5).value = r.totalBoarding > 0 ? r.totalBoarding : '-';
        rObj.getCell(6).value = '-';
        rObj.getCell(7).value = '-';
        rObj.getCell(8).value = r.totalNgoaiTru > 0 ? r.totalNgoaiTru : '-';
        rObj.getCell(9).value = '-';
        rObj.getCell(10).value = 'Chưa báo cáo';
        rObj.getCell(11).value = '-';
        rObj.getCell(12).value = '-';
        rObj.getCell(13).value = '-';
      }

      // Column styling
      rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(1).font = { name: 'Times New Roman', size: 10.5, bold: true };

      rObj.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      rObj.getCell(2).font = { name: 'Times New Roman', size: 10.5 };

      rObj.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(3).font = { name: 'Times New Roman', size: 10.5 };

      rObj.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(4).font = {
        name: 'Times New Roman',
        size: 10.5,
        bold: r.absentAll > 0,
        color: r.absentAll > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
      };

      rObj.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(5).font = { name: 'Times New Roman', size: 10.5 };

      rObj.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(6).font = {
        name: 'Times New Roman',
        size: 10.5,
        bold: r.absentBoarding > 0,
        color: r.absentBoarding > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
      };

      rObj.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(7).font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };

      rObj.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(8).font = { name: 'Times New Roman', size: 10.5 };

      rObj.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(9).font = {
        name: 'Times New Roman',
        size: 10.5,
        bold: r.absentNgoaiTru > 0,
        color: r.absentNgoaiTru > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
      };

      rObj.getCell(10).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
      rObj.getCell(10).font = { name: 'Times New Roman', size: 10 };

      rObj.getCell(11).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
      rObj.getCell(11).font = { name: 'Times New Roman', size: 10 };

      rObj.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(12).font = { name: 'Times New Roman', size: 10.5, bold: true };

      rObj.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
      rObj.getCell(13).font = { name: 'Times New Roman', size: 10.5, bold: true };

      for (let c = 1; c <= 13; c++) {
        rObj.getCell(c).border = thinBorder;
      }
      rObj.height = 22;
      currentRow++;
    });

    // Summary Row TỔNG CỘNG
    const sumTotalAll = filteredRows.reduce((acc, r) => acc + (r.isReported ? r.totalAll : 0), 0);
    const sumAbsentAll = filteredRows.reduce((acc, r) => acc + (r.isReported ? r.absentAll : 0), 0);
    const sumPresentAll = sumTotalAll - sumAbsentAll;

    const sumTotalBoarding = filteredRows.reduce((acc, r) => acc + (r.isReported ? r.totalBoarding : 0), 0);
    const sumAbsentBoarding = filteredRows.reduce((acc, r) => acc + (r.isReported ? r.absentBoarding : 0), 0);
    const sumBaoAnBoarding = Math.max(0, sumTotalBoarding - sumAbsentBoarding);

    const sumTotalNgoaiTru = Math.max(0, sumTotalAll - sumTotalBoarding);
    const sumAbsentNgoaiTru = Math.max(0, sumAbsentAll - sumAbsentBoarding);

    const overallAbsentRate = sumTotalAll > 0 ? (sumAbsentAll / sumTotalAll) * 100 : 0;
    const overallPresentRate = sumTotalAll > 0 ? (sumPresentAll / sumTotalAll) * 100 : 100;
    const reportedCount = filteredRows.filter((r) => r.isReported).length;

    ws.mergeCells(`A${currentRow}:B${currentRow}`);
    const sumLabel = ws.getCell(`A${currentRow}`);
    sumLabel.value = 'TỔNG CỘNG';
    sumLabel.font = { name: 'Times New Roman', size: 10.5, bold: true };
    sumLabel.alignment = { horizontal: 'center', vertical: 'middle' };

    const sumRow = ws.getRow(currentRow);
    sumRow.getCell(3).value = sumTotalAll;
    sumRow.getCell(4).value = sumAbsentAll;
    sumRow.getCell(5).value = sumTotalBoarding;
    sumRow.getCell(6).value = sumAbsentBoarding;
    sumRow.getCell(7).value = sumBaoAnBoarding;
    sumRow.getCell(8).value = sumTotalNgoaiTru;
    sumRow.getCell(9).value = sumAbsentNgoaiTru;
    sumRow.getCell(10).value = `Đã báo cáo: ${reportedCount}/${filteredRows.length} lớp`;
    sumRow.getCell(11).value = '-';
    sumRow.getCell(12).value = `${overallAbsentRate.toFixed(2).replace('.', ',')}%`;
    sumRow.getCell(13).value = `${overallPresentRate.toFixed(2).replace('.', ',')}%`;

    for (let c = 1; c <= 13; c++) {
      const cell = sumRow.getCell(c);
      cell.border = thinBorder;
      const isRed = (c === 4 && sumAbsentAll > 0) || (c === 6 && sumAbsentBoarding > 0) || (c === 9 && sumAbsentNgoaiTru > 0);
      cell.font = {
        name: 'Times New Roman',
        size: 10.5,
        bold: true,
        color: isRed ? { argb: 'FFFF0000' } : c === 7 ? { argb: 'FF1E40AF' } : { argb: 'FF000000' },
      };
      cell.alignment = c === 10 ? { horizontal: 'left', vertical: 'middle', indent: 1 } : { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' },
      };
    }
    sumRow.height = 24;
    currentRow++;
  }

  // Adjust column widths based on contents
  for (let colIdx = 1; colIdx <= 13; colIdx++) {
    let maxLen = 0;
    for (let r = headerStartRow; r < currentRow; r++) {
      if (r === headerStartRow && colIdx >= 3 && colIdx <= 9) continue;
      const cell = ws.getRow(r).getCell(colIdx);
      if (cell && cell.value) {
        const lines = cell.value.toString().split('\n');
        lines.forEach((l) => {
          if (l.length > maxLen) maxLen = l.length;
        });
      }
    }
    if (maxLen > 0) {
      const calculatedWidth = Math.ceil(maxLen * 1.12) + 4;
      let minWidth = 10;
      if (colIdx === 1) minWidth = 9;
      if (colIdx === 2) minWidth = 22;
      if ([3, 4, 5, 6, 8, 9].includes(colIdx)) minWidth = 13;
      if (colIdx === 7) minWidth = 15;
      if (colIdx === 10) minWidth = 28;
      if (colIdx === 11) minWidth = 22;
      if (colIdx === 12) minWidth = 14;
      if (colIdx === 13) minWidth = 15;
      ws.getColumn(colIdx).width = Math.max(minWidth, calculatedWidth);
    }
  }

  // Signatures
  currentRow += 2;
  ws.mergeCells(`A${currentRow}:E${currentRow}`);
  ws.mergeCells(`I${currentRow}:M${currentRow}`);

  const isSingleClassDaily = selectedClassId !== 'all' && Boolean(selectedClassName);
  const singleClassDailyRow = isSingleClassDaily ? rows.find((r) => r.classId === selectedClassId) : null;
  const singleClassDailyTeacher = isSingleClassDaily
    ? resolveTeacherName(selectedClassName, singleClassDailyRow?.teacherName)
    : '';

  const reporterTitleCell = ws.getCell(`A${currentRow}`);
  reporterTitleCell.value = isSingleClassDaily ? 'GIÁO VIÊN CHỦ NHIỆM' : signatureSettings.reporter_title;
  reporterTitleCell.font = { name: 'Times New Roman', size: 12, bold: true };
  reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const principalDateCell = ws.getCell(`I${currentRow}`);
  principalDateCell.value = `Ngày ${d} tháng ${m} năm ${y}`;
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

  currentRow += 4;
  ws.mergeCells(`A${currentRow}:E${currentRow}`);
  ws.mergeCells(`I${currentRow}:M${currentRow}`);

  const reporterNameCell = ws.getCell(`A${currentRow}`);
  reporterNameCell.value = isSingleClassDaily ? singleClassDailyTeacher : signatureSettings.reporter_name;
  reporterNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
  reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const principalNameCell = ws.getCell(`I${currentRow}`);
  principalNameCell.value = signatureSettings.principal_name;
  principalNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
  principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (exportBlankTemplate) {
    a.download = 'Mau_trang_bao_cao_si_so.xlsx';
  } else if (selectedClassId !== 'all' && selectedClassName) {
    a.download = `Bao_cao_si_so_lop_${selectedClassName}_ngay_${d}-${m}-${y}.xlsx`;
  } else {
    a.download = `Bao_cao_si_so_ngay_${d}-${m}-${y}.xlsx`;
  }
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Xuất biểu mẫu Báo cáo sĩ số học sinh THEO THÁNG CỦA TỪNG LỚP (Chuẩn 13 cột khớp 100% hình ảnh)
 * Mỗi dòng là 1 ngày trong tháng của lớp đó (hoặc ngày có báo cáo).
 */
export async function exportAttendanceMonthlyClassExcel(params: ExportAttendanceMonthlyClassExcelParams): Promise<void> {
  const { settings, campusName, yearMonth, classItem, teacherName, rows, signatureSettings } = params;

  const [y, m] = yearMonth.split('-');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  const sheetName = `Lop_${classItem.class_name}`;
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      showGridLines: false,
    },
  });

  // 13 columns width setup
  ws.columns = [
    { key: 'day', width: 14 },
    { key: 'teacher', width: 22 },
    { key: 'allTotal', width: 13 },
    { key: 'allAbsent', width: 13 },
    { key: 'halfTotal', width: 13 },
    { key: 'halfAbsent', width: 13 },
    { key: 'halfMeal', width: 15 },
    { key: 'ngoaiTruTotal', width: 13 },
    { key: 'ngoaiTruAbsent', width: 13 },
    { key: 'studentNames', width: 30 },
    { key: 'studentAddresses', width: 24 },
    { key: 'absentRate', width: 14 },
    { key: 'presentRate', width: 15 },
  ];

  let rIdx = 1;

  // Row 1: Left Sub-Department & Right Nation
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

  // Row 2: School name & Motto
  ws.mergeCells(`A${rIdx}:E${rIdx}`);
  const schoolNameCell = ws.getCell(`A${rIdx}`);
  let fSchool = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
  if (!fSchool.toUpperCase().startsWith('TRƯỜNG')) fSchool = 'TRƯỜNG ' + fSchool;
  schoolNameCell.value = fSchool.toUpperCase();
  schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };
  schoolNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(`I${rIdx}:M${rIdx}`);
  const nationCell2 = ws.getCell(`I${rIdx}`);
  nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
  nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
  nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 18;
  rIdx++;

  // Row 3: Campus
  if (campusName) {
    ws.mergeCells(`A${rIdx}:E${rIdx}`);
    const campusCell = ws.getCell(`A${rIdx}`);
    campusCell.value = `PHÂN HIỆU: ${campusName.toUpperCase()}`;
    campusCell.font = { name: 'Times New Roman', size: 10, bold: true };
    campusCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(rIdx).height = 18;
    rIdx++;
  }

  // Row 4: Spacer
  ws.getRow(rIdx).height = 8;
  rIdx++;

  // Row 5: Title
  let baseTitle = settings?.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH';
  baseTitle = baseTitle.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
  const titleText = `${baseTitle} THÁNG ${m} NĂM ${y} - LỚP ${classItem.class_name}`;
  const effectiveTeacher = resolveTeacherName(classItem.class_name, teacherName);

  ws.mergeCells(`A${rIdx}:M${rIdx}`);
  const titleCell = ws.getCell(`A${rIdx}`);
  titleCell.value = titleText;
  titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 32;
  rIdx++;

  // Subtitle: LỚP ... | GIÁO VIÊN CHỦ NHIỆM: ...
  ws.mergeCells(`A${rIdx}:M${rIdx}`);
  const subTitleCell = ws.getCell(`A${rIdx}`);
  subTitleCell.value = `LỚP: ${classItem.class_name.toUpperCase()}   -   GIÁO VIÊN CHỦ NHIỆM: ${effectiveTeacher.toUpperCase()}`;
  subTitleCell.font = { name: 'Times New Roman', size: 11, bold: true, italic: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 20;
  rIdx++;

  // Row 6: Spacer
  ws.getRow(rIdx).height = 10;
  rIdx++;

  // Headers (2 rows)
  const headerStartRow = rIdx;

  ws.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
  ws.getCell(`A${headerStartRow}`).value = 'Ngày';

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

  ws.getCell(`C${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`D${headerStartRow + 1}`).value = 'Số học sinh vắng';
  ws.getCell(`E${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`F${headerStartRow + 1}`).value = 'Số học sinh vắng';
  ws.getCell(`G${headerStartRow + 1}`).value = 'Học sinh báo ăn';
  ws.getCell(`H${headerStartRow + 1}`).value = 'Tổng số học sinh';
  ws.getCell(`I${headerStartRow + 1}`).value = 'Số học sinh vắng';

  ws.getRow(headerStartRow).height = 24;
  ws.getRow(headerStartRow + 1).height = 24;

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

  // Render day rows
  rows.forEach((r) => {
    const rObj = ws.getRow(currentRow);
    rObj.getCell(1).value = r.dayLabel;
    rObj.getCell(2).value = effectiveTeacher;

    if (r.isReported) {
      rObj.getCell(3).value = r.totalAll;
      rObj.getCell(4).value = r.absentAll;
      rObj.getCell(5).value = r.totalBoarding;
      rObj.getCell(6).value = r.absentBoarding;
      rObj.getCell(7).value = r.baoAnBoarding;
      rObj.getCell(8).value = r.totalNgoaiTru;
      rObj.getCell(9).value = r.absentNgoaiTru;
      rObj.getCell(10).value = r.studentNames;
      rObj.getCell(11).value = r.studentAddresses;
      rObj.getCell(12).value = `${r.absentRate.toFixed(2).replace('.', ',')}%`;
      rObj.getCell(13).value = `${r.presentRate.toFixed(2).replace('.', ',')}%`;
    } else {
      rObj.getCell(3).value = '';
      rObj.getCell(4).value = '';
      rObj.getCell(5).value = '';
      rObj.getCell(6).value = '';
      rObj.getCell(7).value = '';
      rObj.getCell(8).value = '';
      rObj.getCell(9).value = '';
      rObj.getCell(10).value = r.studentNames || '';
      rObj.getCell(11).value = '';
      rObj.getCell(12).value = '';
      rObj.getCell(13).value = '';
    }

    // Styles
    rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(1).font = { name: 'Times New Roman', size: 10.5, bold: true };

    rObj.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    rObj.getCell(2).font = { name: 'Times New Roman', size: 10.5 };

    rObj.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(3).font = { name: 'Times New Roman', size: 10.5 };

    rObj.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(4).font = {
      name: 'Times New Roman',
      size: 10.5,
      bold: r.absentAll > 0,
      color: r.absentAll > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
    };

    rObj.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(5).font = { name: 'Times New Roman', size: 10.5 };

    rObj.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(6).font = {
      name: 'Times New Roman',
      size: 10.5,
      bold: r.absentBoarding > 0,
      color: r.absentBoarding > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
    };

    rObj.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(7).font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };

    rObj.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(8).font = { name: 'Times New Roman', size: 10.5 };

    rObj.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(9).font = {
      name: 'Times New Roman',
      size: 10.5,
      bold: r.absentNgoaiTru > 0,
      color: r.absentNgoaiTru > 0 ? { argb: 'FFFF0000' } : { argb: 'FF000000' },
    };

    rObj.getCell(10).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    rObj.getCell(10).font = { name: 'Times New Roman', size: 10 };

    rObj.getCell(11).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    rObj.getCell(11).font = { name: 'Times New Roman', size: 10 };

    rObj.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(12).font = { name: 'Times New Roman', size: 10.5, bold: true };

    rObj.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
    rObj.getCell(13).font = { name: 'Times New Roman', size: 10.5, bold: true };

    for (let c = 1; c <= 13; c++) {
      rObj.getCell(c).border = thinBorder;
    }
    rObj.height = 22;
    currentRow++;
  });

  // TỔNG CỘNG / TRUNG BÌNH THÁNG
  const reportedDays = rows.filter((r) => r.isReported);
  const sumTotalAll = reportedDays.reduce((acc, r) => acc + r.totalAll, 0);
  const sumAbsentAll = reportedDays.reduce((acc, r) => acc + r.absentAll, 0);
  const sumPresentAll = sumTotalAll - sumAbsentAll;

  const sumTotalBoarding = reportedDays.reduce((acc, r) => acc + r.totalBoarding, 0);
  const sumAbsentBoarding = reportedDays.reduce((acc, r) => acc + r.absentBoarding, 0);
  const sumBaoAnBoarding = reportedDays.reduce((acc, r) => acc + r.baoAnBoarding, 0);

  const sumTotalNgoaiTru = reportedDays.reduce((acc, r) => acc + r.totalNgoaiTru, 0);
  const sumAbsentNgoaiTru = reportedDays.reduce((acc, r) => acc + r.absentNgoaiTru, 0);

  const avgAbsentRate = sumTotalAll > 0 ? (sumAbsentAll / sumTotalAll) * 100 : 0;
  const avgPresentRate = sumTotalAll > 0 ? (sumPresentAll / sumTotalAll) * 100 : 100;

  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  const sumLabel = ws.getCell(`A${currentRow}`);
  sumLabel.value = 'TỔNG CỘNG / TRUNG BÌNH THÁNG';
  sumLabel.font = { name: 'Times New Roman', size: 10.5, bold: true };
  sumLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  const sumRow = ws.getRow(currentRow);
  const avgTotal = reportedDays.length > 0 ? Math.round(sumTotalAll / reportedDays.length) : rows[0]?.totalAll || 35;
  const avgBoarding = reportedDays.length > 0 ? Math.round(sumTotalBoarding / reportedDays.length) : rows[0]?.totalBoarding || 25;
  const avgNgoaiTru = Math.max(0, avgTotal - avgBoarding);

  sumRow.getCell(3).value = avgTotal;
  sumRow.getCell(4).value = sumAbsentAll;
  sumRow.getCell(5).value = avgBoarding;
  sumRow.getCell(6).value = sumAbsentBoarding;
  sumRow.getCell(7).value = sumBaoAnBoarding;
  sumRow.getCell(8).value = avgNgoaiTru;
  sumRow.getCell(9).value = sumAbsentNgoaiTru;
  sumRow.getCell(10).value = `Tổng: ${reportedDays.length} ngày báo cáo`;
  sumRow.getCell(11).value = '-';
  sumRow.getCell(12).value = `${avgAbsentRate.toFixed(2).replace('.', ',')}%`;
  sumRow.getCell(13).value = `${avgPresentRate.toFixed(2).replace('.', ',')}%`;

  for (let c = 1; c <= 13; c++) {
    const cell = sumRow.getCell(c);
    cell.border = thinBorder;
    const isRed = (c === 4 && sumAbsentAll > 0) || (c === 6 && sumAbsentBoarding > 0) || (c === 9 && sumAbsentNgoaiTru > 0);
    cell.font = {
      name: 'Times New Roman',
      size: 10.5,
      bold: true,
      color: isRed ? { argb: 'FFFF0000' } : c === 7 ? { argb: 'FF1E40AF' } : { argb: 'FF000000' },
    };
    cell.alignment = c === 10 ? { horizontal: 'left', vertical: 'middle', indent: 1 } : { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' },
    };
  }
  sumRow.height = 24;
  currentRow++;

  // Column widths
  for (let colIdx = 1; colIdx <= 13; colIdx++) {
    let maxLen = 0;
    for (let r = headerStartRow; r < currentRow; r++) {
      if (r === headerStartRow && colIdx >= 3 && colIdx <= 9) continue;
      const cell = ws.getRow(r).getCell(colIdx);
      if (cell && cell.value) {
        const lines = cell.value.toString().split('\n');
        lines.forEach((l) => {
          if (l.length > maxLen) maxLen = l.length;
        });
      }
    }
    if (maxLen > 0) {
      const calculatedWidth = Math.ceil(maxLen * 1.12) + 4;
      let minWidth = 10;
      if (colIdx === 1) minWidth = 14;
      if (colIdx === 2) minWidth = 22;
      if ([3, 4, 5, 6, 8, 9].includes(colIdx)) minWidth = 13;
      if (colIdx === 7) minWidth = 15;
      if (colIdx === 10) minWidth = 28;
      if (colIdx === 11) minWidth = 22;
      if (colIdx === 12) minWidth = 14;
      if (colIdx === 13) minWidth = 15;
      ws.getColumn(colIdx).width = Math.max(minWidth, calculatedWidth);
    }
  }

  // Signatures
  currentRow += 2;
  ws.mergeCells(`A${currentRow}:E${currentRow}`);
  ws.mergeCells(`I${currentRow}:M${currentRow}`);

  const reporterTitleCell = ws.getCell(`A${currentRow}`);
  reporterTitleCell.value = 'GIÁO VIÊN CHỦ NHIỆM';
  reporterTitleCell.font = { name: 'Times New Roman', size: 12, bold: true };
  reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const principalDateCell = ws.getCell(`I${currentRow}`);
  principalDateCell.value = `Tháng ${m} năm ${y}`;
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
  principalTitleCell.value = signatureSettings.principal_title || 'PHÓ HIỆU TRƯỞNG';
  principalTitleCell.font = { name: 'Times New Roman', size: 12, bold: true };
  principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  currentRow++;
  ws.mergeCells(`I${currentRow}:M${currentRow}`);
  const principalSubCell = ws.getCell(`I${currentRow}`);
  principalSubCell.value = '(Ký, đóng dấu và ghi rõ họ tên)';
  principalSubCell.font = { name: 'Times New Roman', size: 11, italic: true };
  principalSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

  currentRow += 4;
  ws.mergeCells(`A${currentRow}:E${currentRow}`);
  ws.mergeCells(`I${currentRow}:M${currentRow}`);

  const reporterNameCell = ws.getCell(`A${currentRow}`);
  reporterNameCell.value = effectiveTeacher;
  reporterNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
  reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const principalNameCell = ws.getCell(`I${currentRow}`);
  principalNameCell.value = signatureSettings.principal_name;
  principalNameCell.font = { name: 'Times New Roman', size: 12, bold: true };
  principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_cao_si_so_lop_${classItem.class_name}_thang_${m}-${y}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Xuất biểu mẫu Báo cáo sĩ số học sinh THEO THÁNG CHO TẤT CẢ CÁC LỚP
 * File Excel gồm:
 * - 1 Sheet Tổng hợp tháng cho các lớp (chuẩn bảng 13 cột)
 * - Các Sheet riêng cho từng lớp (mỗi lớp 1 sheet chi tiết từng ngày theo đúng bảng 13 cột)
 */
export async function exportAttendanceMonthlyAllClassesExcel(params: ExportAttendanceMonthlyAllClassesExcelParams): Promise<void> {
  const { settings, campusName, yearMonth, summaryRows, classesDayRows, signatureSettings } = params;

  const [y, m] = yearMonth.split('-');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  // 1. Sheet Tổng Hợp Tháng
  const wsSummary = wb.addWorksheet('Tong_Hop_Thang', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  wsSummary.columns = [
    { key: 'class', width: 10 },
    { key: 'teacher', width: 22 },
    { key: 'allTotal', width: 13 },
    { key: 'allAbsent', width: 13 },
    { key: 'halfTotal', width: 13 },
    { key: 'halfAbsent', width: 13 },
    { key: 'halfMeal', width: 15 },
    { key: 'ngoaiTruTotal', width: 13 },
    { key: 'ngoaiTruAbsent', width: 13 },
    { key: 'studentNames', width: 30 },
    { key: 'studentAddresses', width: 24 },
    { key: 'absentRate', width: 14 },
    { key: 'presentRate', width: 15 },
  ];

  let rIdx = 1;
  wsSummary.mergeCells(`A${rIdx}:E${rIdx}`);
  wsSummary.getCell(`A${rIdx}`).value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
  wsSummary.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
  wsSummary.getCell(`A${rIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

  wsSummary.mergeCells(`I${rIdx}:M${rIdx}`);
  wsSummary.getCell(`I${rIdx}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  wsSummary.getCell(`I${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
  wsSummary.getCell(`I${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx++;

  let fSchool = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
  if (!fSchool.toUpperCase().startsWith('TRƯỜNG')) fSchool = 'TRƯỜNG ' + fSchool;
  wsSummary.mergeCells(`A${rIdx}:E${rIdx}`);
  wsSummary.getCell(`A${rIdx}`).value = fSchool.toUpperCase();
  wsSummary.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
  wsSummary.getCell(`A${rIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

  wsSummary.mergeCells(`I${rIdx}:M${rIdx}`);
  wsSummary.getCell(`I${rIdx}`).value = 'Độc lập - Tự do - Hạnh phúc';
  wsSummary.getCell(`I${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
  wsSummary.getCell(`I${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx++;

  if (campusName) {
    wsSummary.mergeCells(`A${rIdx}:E${rIdx}`);
    wsSummary.getCell(`A${rIdx}`).value = `PHÂN HIỆU: ${campusName.toUpperCase()}`;
    wsSummary.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
    rIdx++;
  }

  rIdx++;
  wsSummary.mergeCells(`A${rIdx}:M${rIdx}`);
  const titleCell = wsSummary.getCell(`A${rIdx}`);
  titleCell.value = `BÁO CÁO TỔNG HỢP SĨ SỐ HỌC SINH THÁNG ${m} NĂM ${y}`;
  titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(rIdx).height = 30;
  rIdx += 2;

  // Header
  const hRow = rIdx;
  wsSummary.mergeCells(`A${hRow}:A${hRow + 1}`);
  wsSummary.getCell(`A${hRow}`).value = 'Lớp';
  wsSummary.mergeCells(`B${hRow}:B${hRow + 1}`);
  wsSummary.getCell(`B${hRow}`).value = 'Giáo viên chủ\nnhiệm';
  wsSummary.mergeCells(`C${hRow}:D${hRow}`);
  wsSummary.getCell(`C${hRow}`).value = 'Học sinh toàn trường';
  wsSummary.mergeCells(`E${hRow}:G${hRow}`);
  wsSummary.getCell(`E${hRow}`).value = 'Học sinh bán trú';
  wsSummary.mergeCells(`H${hRow}:I${hRow}`);
  wsSummary.getCell(`H${hRow}`).value = 'Học sinh ngoại trú';
  wsSummary.mergeCells(`J${hRow}:J${hRow + 1}`);
  wsSummary.getCell(`J${hRow}`).value = 'Tên học sinh nghỉ (Tổng hợp)';
  wsSummary.mergeCells(`K${hRow}:K${hRow + 1}`);
  wsSummary.getCell(`K${hRow}`).value = 'Địa chỉ';
  wsSummary.mergeCells(`L${hRow}:L${hRow + 1}`);
  wsSummary.getCell(`L${hRow}`).value = 'Tỉ lệ phần trăm\nvắng (%)';
  wsSummary.mergeCells(`M${hRow}:M${hRow + 1}`);
  wsSummary.getCell(`M${hRow}`).value = 'Tỉ lệ phần trăm\nchuyên cần (%)';

  wsSummary.getCell(`C${hRow + 1}`).value = 'Tổng số học sinh';
  wsSummary.getCell(`D${hRow + 1}`).value = 'Số học sinh vắng';
  wsSummary.getCell(`E${hRow + 1}`).value = 'Tổng số học sinh';
  wsSummary.getCell(`F${hRow + 1}`).value = 'Số học sinh vắng';
  wsSummary.getCell(`G${hRow + 1}`).value = 'Học sinh báo ăn';
  wsSummary.getCell(`H${hRow + 1}`).value = 'Tổng số học sinh';
  wsSummary.getCell(`I${hRow + 1}`).value = 'Số học sinh vắng';

  for (let r = hRow; r <= hRow + 1; r++) {
    for (let c = 1; c <= 13; c++) {
      const cell = wsSummary.getRow(r).getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' } };
    }
  }

  rIdx += 2;
  summaryRows.forEach((r) => {
    const row = wsSummary.getRow(rIdx);
    row.getCell(1).value = r.className;
    row.getCell(2).value = r.teacherName;
    row.getCell(3).value = r.totalAll;
    row.getCell(4).value = r.absentAll;
    row.getCell(5).value = r.totalBoarding;
    row.getCell(6).value = r.absentBoarding;
    row.getCell(7).value = r.baoAnBoarding;
    row.getCell(8).value = r.totalNgoaiTru;
    row.getCell(9).value = r.absentNgoaiTru;
    row.getCell(10).value = r.studentNames;
    row.getCell(11).value = r.studentAddresses;
    row.getCell(12).value = `${r.absentRate.toFixed(2).replace('.', ',')}%`;
    row.getCell(13).value = `${r.presentRate.toFixed(2).replace('.', ',')}%`;

    for (let c = 1; c <= 13; c++) {
      row.getCell(c).border = thinBorder;
      row.getCell(c).font = { name: 'Times New Roman', size: 10.5 };
      if (c === 1 || [3, 4, 5, 6, 7, 8, 9, 12, 13].includes(c)) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }
    }
    rIdx++;
  });

  // 2. Sheets chi tiết từng lớp
  classesDayRows.forEach(({ classItem, teacherName: rawTName, rows }) => {
    const effectiveTeacher = resolveTeacherName(classItem.class_name, rawTName);
    const sheetName = `Lop_${classItem.class_name}`;
    const wsClass = wb.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      },
    });

    wsClass.columns = [
      { key: 'day', width: 14 },
      { key: 'teacher', width: 22 },
      { key: 'allTotal', width: 13 },
      { key: 'allAbsent', width: 13 },
      { key: 'halfTotal', width: 13 },
      { key: 'halfAbsent', width: 13 },
      { key: 'halfMeal', width: 15 },
      { key: 'ngoaiTruTotal', width: 13 },
      { key: 'ngoaiTruAbsent', width: 13 },
      { key: 'studentNames', width: 30 },
      { key: 'studentAddresses', width: 24 },
      { key: 'absentRate', width: 14 },
      { key: 'presentRate', width: 15 },
    ];

    let cRIdx = 1;
    wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
    wsClass.getCell(`A${cRIdx}`).value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
    wsClass.getCell(`A${cRIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };

    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);
    wsClass.getCell(`I${cRIdx}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
    wsClass.getCell(`I${cRIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
    wsClass.getCell(`I${cRIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
    cRIdx++;

    wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
    wsClass.getCell(`A${cRIdx}`).value = fSchool.toUpperCase();
    wsClass.getCell(`A${cRIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };

    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);
    wsClass.getCell(`I${cRIdx}`).value = 'Độc lập - Tự do - Hạnh phúc';
    wsClass.getCell(`I${cRIdx}`).font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
    wsClass.getCell(`I${cRIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
    cRIdx++;

    if (campusName) {
      wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
      wsClass.getCell(`A${cRIdx}`).value = `PHÂN HIỆU: ${campusName.toUpperCase()}`;
      wsClass.getCell(`A${cRIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
      cRIdx++;
    }

    cRIdx++;
    wsClass.mergeCells(`A${cRIdx}:M${cRIdx}`);
    wsClass.getCell(`A${cRIdx}`).value = `BÁO CÁO SĨ SỐ HỌC SINH THÁNG ${m} NĂM ${y} - LỚP ${classItem.class_name}`;
    wsClass.getCell(`A${cRIdx}`).font = { name: 'Times New Roman', size: 13, bold: true };
    wsClass.getCell(`A${cRIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
    cRIdx++;

    wsClass.mergeCells(`A${cRIdx}:M${cRIdx}`);
    wsClass.getCell(`A${cRIdx}`).value = `LỚP: ${classItem.class_name.toUpperCase()}   -   GIÁO VIÊN CHỦ NHIỆM: ${effectiveTeacher.toUpperCase()}`;
    wsClass.getCell(`A${cRIdx}`).font = { name: 'Times New Roman', size: 11, bold: true, italic: true };
    wsClass.getCell(`A${cRIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
    cRIdx += 2;

    const classHRow = cRIdx;
    wsClass.mergeCells(`A${classHRow}:A${classHRow + 1}`);
    wsClass.getCell(`A${classHRow}`).value = 'Ngày';
    wsClass.mergeCells(`B${classHRow}:B${classHRow + 1}`);
    wsClass.getCell(`B${classHRow}`).value = 'Giáo viên chủ\nnhiệm';
    wsClass.mergeCells(`C${classHRow}:D${classHRow}`);
    wsClass.getCell(`C${classHRow}`).value = 'Học sinh toàn trường';
    wsClass.mergeCells(`E${classHRow}:G${classHRow}`);
    wsClass.getCell(`E${classHRow}`).value = 'Học sinh bán trú';
    wsClass.mergeCells(`H${classHRow}:I${classHRow}`);
    wsClass.getCell(`H${classHRow}`).value = 'Học sinh ngoại trú';
    wsClass.mergeCells(`J${classHRow}:J${classHRow + 1}`);
    wsClass.getCell(`J${classHRow}`).value = 'Tên học sinh nghỉ';
    wsClass.mergeCells(`K${classHRow}:K${classHRow + 1}`);
    wsClass.getCell(`K${classHRow}`).value = 'Địa chỉ';
    wsClass.mergeCells(`L${classHRow}:L${classHRow + 1}`);
    wsClass.getCell(`L${classHRow}`).value = 'Tỉ lệ phần trăm\nvắng (%)';
    wsClass.mergeCells(`M${classHRow}:M${classHRow + 1}`);
    wsClass.getCell(`M${classHRow}`).value = 'Tỉ lệ phần trăm\nchuyên cần (%)';

    wsClass.getCell(`C${classHRow + 1}`).value = 'Tổng số học sinh';
    wsClass.getCell(`D${classHRow + 1}`).value = 'Số học sinh vắng';
    wsClass.getCell(`E${classHRow + 1}`).value = 'Tổng số học sinh';
    wsClass.getCell(`F${classHRow + 1}`).value = 'Số học sinh vắng';
    wsClass.getCell(`G${classHRow + 1}`).value = 'Học sinh báo ăn';
    wsClass.getCell(`H${classHRow + 1}`).value = 'Tổng số học sinh';
    wsClass.getCell(`I${classHRow + 1}`).value = 'Số học sinh vắng';

    for (let r = classHRow; r <= classHRow + 1; r++) {
      for (let c = 1; c <= 13; c++) {
        const cell = wsClass.getRow(r).getCell(c);
        cell.border = thinBorder;
        cell.font = { name: 'Times New Roman', size: 10, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 7 ? 'FFE8F0FE' : 'FFF2F4F7' } };
      }
    }

    cRIdx += 2;
    rows.forEach((r) => {
      const row = wsClass.getRow(cRIdx);
      row.getCell(1).value = r.dayLabel;
      row.getCell(2).value = effectiveTeacher;
      if (r.isReported) {
        row.getCell(3).value = r.totalAll;
        row.getCell(4).value = r.absentAll;
        row.getCell(5).value = r.totalBoarding;
        row.getCell(6).value = r.absentBoarding;
        row.getCell(7).value = r.baoAnBoarding;
        row.getCell(8).value = r.totalNgoaiTru;
        row.getCell(9).value = r.absentNgoaiTru;
        row.getCell(10).value = r.studentNames;
        row.getCell(11).value = r.studentAddresses;
        row.getCell(12).value = `${r.absentRate.toFixed(2).replace('.', ',')}%`;
        row.getCell(13).value = `${r.presentRate.toFixed(2).replace('.', ',')}%`;
      } else {
        row.getCell(3).value = '';
        row.getCell(4).value = '';
        row.getCell(5).value = '';
        row.getCell(6).value = '';
        row.getCell(7).value = '';
        row.getCell(8).value = '';
        row.getCell(9).value = '';
        row.getCell(10).value = r.studentNames || '';
        row.getCell(11).value = '';
        row.getCell(12).value = '';
        row.getCell(13).value = '';
      }

      for (let c = 1; c <= 13; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).font = { name: 'Times New Roman', size: 10.5 };
        if (c === 1 || [3, 4, 5, 6, 7, 8, 9, 12, 13].includes(c)) {
          row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          row.getCell(c).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        }
      }
      cRIdx++;
    });

    // Chữ ký cho sheet từng lớp
    cRIdx += 2;
    wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);

    const repTitle = wsClass.getCell(`A${cRIdx}`);
    repTitle.value = 'GIÁO VIÊN CHỦ NHIỆM';
    repTitle.font = { name: 'Times New Roman', size: 12, bold: true };
    repTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    const pDate = wsClass.getCell(`I${cRIdx}`);
    pDate.value = `Tháng ${m} năm ${y}`;
    pDate.font = { name: 'Times New Roman', size: 12, italic: true };
    pDate.alignment = { horizontal: 'center', vertical: 'middle' };

    cRIdx++;
    wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);

    const repSub = wsClass.getCell(`A${cRIdx}`);
    repSub.value = '(Ký và ghi rõ họ tên)';
    repSub.font = { name: 'Times New Roman', size: 11, italic: true };
    repSub.alignment = { horizontal: 'center', vertical: 'middle' };

    const pTitle = wsClass.getCell(`I${cRIdx}`);
    pTitle.value = signatureSettings.principal_title || 'PHÓ HIỆU TRƯỞNG';
    pTitle.font = { name: 'Times New Roman', size: 12, bold: true };
    pTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    cRIdx++;
    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);
    const pSub = wsClass.getCell(`I${cRIdx}`);
    pSub.value = '(Ký, đóng dấu và ghi rõ họ tên)';
    pSub.font = { name: 'Times New Roman', size: 11, italic: true };
    pSub.alignment = { horizontal: 'center', vertical: 'middle' };

    cRIdx += 4;
    wsClass.mergeCells(`A${cRIdx}:E${cRIdx}`);
    wsClass.mergeCells(`I${cRIdx}:M${cRIdx}`);

    const repName = wsClass.getCell(`A${cRIdx}`);
    repName.value = effectiveTeacher;
    repName.font = { name: 'Times New Roman', size: 12, bold: true };
    repName.alignment = { horizontal: 'center', vertical: 'middle' };

    const pName = wsClass.getCell(`I${cRIdx}`);
    pName.value = signatureSettings.principal_name;
    pName.font = { name: 'Times New Roman', size: 12, bold: true };
    pName.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_cao_si_so_tat_ca_cac_lop_thang_${m}-${y}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
