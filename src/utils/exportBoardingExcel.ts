import ExcelJS from 'exceljs';
import { StorageService } from '../services/storage';
import { Student, BoardingDailyReport } from '../types';
import { getMealScheduleForDate } from './boardingRules';

export interface ExportBoardingExcelParams {
  classId: string;
  className: string;
  campusName?: string;
  schoolName?: string;
  monthStr: string; // 'YYYY-MM'
  students: Student[];
  teacherName?: string;
  principalName?: string;
  existingMatrix?: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>>;
  standardBreakfastDays?: number;
  standardLunchDays?: number;
  standardDinnerDays?: number;
}

// Convert 0-indexed column index to Excel column letter (0 -> A, 1 -> B, ...)
function getColLetter(colIdx: number): string {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

interface DayInfo {
  dayNum: number;
  dateStr: string;
  dayOfWeekShort: string;
  isMealDay: boolean;
  allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
}

interface SheetBuildOptions {
  sheetName: string;
  pageSubtitle: string;
  startDay: number;
  endDay: number;
  includeMonthSummary: boolean;
  signDateText: string;
}

/**
 * Helper to build one boarding worksheet (Trang 1, Trang 2, or Toàn bộ tháng).
 */
function buildBoardingWorksheet(
  wb: ExcelJS.Workbook,
  options: SheetBuildOptions,
  context: {
    schoolName: string;
    campusName: string;
    className: string;
    monthNum: number;
    yearNum: number;
    daysInMonth: number;
    monthDays: DayInfo[];
    boardingStudents: Student[];
    matrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>>;
    standardBreakfastDays: number;
    standardLunchDays: number;
    standardDinnerDays: number;
    teacherName: string;
    principalName: string;
  }
) {
  const {
    sheetName,
    pageSubtitle,
    startDay,
    endDay,
    includeMonthSummary,
    signDateText,
  } = options;

  const {
    schoolName,
    campusName,
    className,
    monthNum,
    yearNum,
    monthDays,
    boardingStudents,
    matrix,
    standardBreakfastDays,
    standardLunchDays,
    standardDinnerDays,
    teacherName,
    principalName,
  } = context;

  // Filter days for this sheet
  const sheetDays = monthDays.filter((d) => d.dayNum >= startDay && d.dayNum <= endDay);
  const numDays = sheetDays.length;

  // Total columns for this sheet
  // Col 1: STT
  // Col 2: Họ và tên
  // Col 3 .. 2 + numDays * 3: Daily columns (S, T, T for each day)
  const lastDayColIdx = 2 + numDays * 3; // 1-indexed

  // Summary columns (if included)
  // sumColIdx = lastDayColIdx + 1
  const sumColIdx = includeMonthSummary ? lastDayColIdx + 1 : -1;
  const totalColsCount = includeMonthSummary ? lastDayColIdx + 6 : lastDayColIdx;

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      showGridLines: true,
    },
  });

  // Column Widths
  ws.getColumn(1).width = 4.5; // STT
  ws.getColumn(2).width = 20; // Họ và tên

  // Daily columns
  for (let d = 0; d < numDays; d++) {
    const colStart = 3 + d * 3;
    ws.getColumn(colStart).width = 3.2; // S
    ws.getColumn(colStart + 1).width = 3.2; // T
    ws.getColumn(colStart + 2).width = 3.2; // T
  }

  // Summary columns
  if (includeMonthSummary && sumColIdx > 0) {
    ws.getColumn(sumColIdx).width = 4.8; // S báo ăn
    ws.getColumn(sumColIdx + 1).width = 4.8; // T báo ăn
    ws.getColumn(sumColIdx + 2).width = 4.8; // T báo ăn
    ws.getColumn(sumColIdx + 3).width = 4.8; // S không báo ăn
    ws.getColumn(sumColIdx + 4).width = 4.8; // T không báo ăn
    ws.getColumn(sumColIdx + 5).width = 4.8; // T không báo ăn
  }

  // Header 1: School & Campus info (Rows 1 & 2)
  ws.getCell('A1').value = schoolName.toUpperCase();
  ws.getCell('A1').font = { name: 'Times New Roman', size: 9.5, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };

  ws.getCell('A2').value = `PHÂN HIỆU: ${(campusName || 'XA DUNG').toUpperCase()}`;
  ws.getCell('A2').font = { name: 'Times New Roman', size: 9.5, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  // Header Main Title (Row 4)
  const titleRange = `A4:${getColLetter(totalColsCount - 1)}4`;
  ws.mergeCells(titleRange);
  const titleCell = ws.getCell('A4');
  titleCell.value = `SỔ CHẤM CƠM LỚP: ${className.toUpperCase()} THÁNG ${monthNum}/${yearNum}`;
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 22;

  // Header Subtitle (Row 5): e.g. "(TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN 15)"
  const subtitleRange = `A5:${getColLetter(totalColsCount - 1)}5`;
  ws.mergeCells(subtitleRange);
  const subtitleCell = ws.getCell('A5');
  subtitleCell.value = pageSubtitle.toUpperCase();
  subtitleCell.font = { name: 'Times New Roman', size: 10.5, bold: true, italic: true };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 18;

  // Table Headers (Rows 7, 8, 9)
  const headerRow1 = 7;
  const headerRow2 = 8;
  const headerRow3 = 9;

  // Merge STT
  ws.mergeCells(`A${headerRow1}:A${headerRow3}`);
  const sttHeader = ws.getCell(`A${headerRow1}`);
  sttHeader.value = 'STT';

  // Merge Họ và tên
  ws.mergeCells(`B${headerRow1}:B${headerRow3}`);
  const nameHeader = ws.getCell(`B${headerRow1}`);
  nameHeader.value = 'Họ và tên';

  // Day Headers
  sheetDays.forEach((day, dIdx) => {
    const colStart = 2 + dIdx * 3; // 0-indexed column offset
    const colLetterStart = getColLetter(colStart);
    const colLetterEnd = getColLetter(colStart + 2);

    // Row 7: Day Number
    ws.mergeCells(`${colLetterStart}${headerRow1}:${colLetterEnd}${headerRow1}`);
    const dayNumCell = ws.getCell(`${colLetterStart}${headerRow1}`);
    dayNumCell.value = day.dayNum;

    // Row 8: Day of Week Short
    ws.mergeCells(`${colLetterStart}${headerRow2}:${colLetterEnd}${headerRow2}`);
    const dowCell = ws.getCell(`${colLetterStart}${headerRow2}`);
    dowCell.value = day.dayOfWeekShort;

    // Row 9: S, T, T
    ws.getCell(`${colLetterStart}${headerRow3}`).value = 'S';
    ws.getCell(`${getColLetter(colStart + 1)}${headerRow3}`).value = 'T';
    ws.getCell(`${getColLetter(colStart + 2)}${headerRow3}`).value = 'T';
  });

  // Summary Headers if enabled
  if (includeMonthSummary && sumColIdx > 0) {
    const sumColLetterStart = getColLetter(sumColIdx - 1);
    const sumColLetterEnd = getColLetter(sumColIdx + 4);

    // Row 7: "Số ngày ăn trong tháng"
    ws.mergeCells(`${sumColLetterStart}${headerRow1}:${sumColLetterEnd}${headerRow1}`);
    const summaryHeader = ws.getCell(`${sumColLetterStart}${headerRow1}`);
    summaryHeader.value = 'Số ngày ăn trong tháng';

    // Row 8: "Số ngày báo ăn" & "Số ngày không báo ăn"
    const eatenColLetterEnd = getColLetter(sumColIdx + 1);
    ws.mergeCells(`${sumColLetterStart}${headerRow2}:${eatenColLetterEnd}${headerRow2}`);
    const eatenHeader = ws.getCell(`${sumColLetterStart}${headerRow2}`);
    eatenHeader.value = 'Số ngày báo ăn';

    const missedColLetterStart = getColLetter(sumColIdx + 2);
    ws.mergeCells(`${missedColLetterStart}${headerRow2}:${sumColLetterEnd}${headerRow2}`);
    const missedHeader = ws.getCell(`${missedColLetterStart}${headerRow2}`);
    missedHeader.value = 'Số ngày không báo ăn';

    // Row 9: S, T, T subheadings
    ws.getCell(`${sumColLetterStart}${headerRow3}`).value = 'S';
    ws.getCell(`${getColLetter(sumColIdx)}${headerRow3}`).value = 'T';
    ws.getCell(`${getColLetter(sumColIdx + 1)}${headerRow3}`).value = 'T';

    ws.getCell(`${getColLetter(sumColIdx + 2)}${headerRow3}`).value = 'S';
    ws.getCell(`${getColLetter(sumColIdx + 3)}${headerRow3}`).value = 'T';
    ws.getCell(`${getColLetter(sumColIdx + 4)}${headerRow3}`).value = 'T';
  }

  // Style Header rows
  ws.getRow(headerRow1).height = 19;
  ws.getRow(headerRow2).height = 18;
  ws.getRow(headerRow3).height = 16;

  for (let r = headerRow1; r <= headerRow3; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= totalColsCount; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Times New Roman', size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      // Highlight summary headers
      if (includeMonthSummary && c >= sumColIdx) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
      }
    }
  }

  // Data rows (Students)
  let currentExcelRow = 10;

  boardingStudents.forEach((st, idx) => {
    const rowObj = ws.getRow(currentExcelRow);
    rowObj.getCell(1).value = idx + 1;
    rowObj.getCell(2).value = st.full_name;

    const stDays = matrix[st.id] || {};

    // Populate day cells for this sheet
    sheetDays.forEach((day, dIdx) => {
      const dRec = stDays[day.dateStr];
      const hasB = Boolean(dRec?.breakfast);
      const hasL = Boolean(dRec?.lunch);
      const hasD = Boolean(dRec?.dinner);

      const colStart = 3 + dIdx * 3;
      rowObj.getCell(colStart).value = hasB ? '+' : '';
      rowObj.getCell(colStart + 1).value = hasL ? '+' : '';
      rowObj.getCell(colStart + 2).value = hasD ? '+' : '';
    });

    // If month summary is included, compute total whole month meals for this student
    if (includeMonthSummary && sumColIdx > 0) {
      let eatenB = 0;
      let eatenL = 0;
      let eatenD = 0;

      monthDays.forEach((day) => {
        const dRec = stDays[day.dateStr];
        if (dRec?.breakfast) eatenB++;
        if (dRec?.lunch) eatenL++;
        if (dRec?.dinner) eatenD++;
      });

      const missedB = Math.max(0, standardBreakfastDays - eatenB);
      const missedL = Math.max(0, standardLunchDays - eatenL);
      const missedD = Math.max(0, standardDinnerDays - eatenD);

      rowObj.getCell(sumColIdx).value = eatenB;
      rowObj.getCell(sumColIdx + 1).value = eatenL;
      rowObj.getCell(sumColIdx + 2).value = eatenD;

      rowObj.getCell(sumColIdx + 3).value = missedB > 0 ? missedB : '';
      rowObj.getCell(sumColIdx + 4).value = missedL > 0 ? missedL : '';
      rowObj.getCell(sumColIdx + 5).value = missedD > 0 ? missedD : '';
    }

    // Row styles
    rowObj.height = 18;
    for (let c = 1; c <= totalColsCount; c++) {
      const cell = rowObj.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Times New Roman', size: 9.5 };

      if (c === 2) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Bold '+' marks
      if (c >= 3 && (!includeMonthSummary || c < sumColIdx) && cell.value === '+') {
        cell.font = { name: 'Times New Roman', size: 9.5, bold: true };
      }
    }

    currentExcelRow++;
  });

  // TỔNG CỘNG row
  const sumRowIndex = currentExcelRow;
  const sumRowObj = ws.getRow(sumRowIndex);
  ws.mergeCells(`A${sumRowIndex}:B${sumRowIndex}`);

  const sumLabelCell = sumRowObj.getCell(1);
  sumLabelCell.value = 'CỘNG';
  sumLabelCell.font = { name: 'Times New Roman', size: 10, bold: true };
  sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sumLabelCell.border = thinBorder;
  sumRowObj.getCell(2).border = thinBorder;

  // Add COUNTIF formula for daily columns of this sheet
  const firstDataRow = 10;
  const lastDataRow = Math.max(firstDataRow, sumRowIndex - 1);

  for (let c = 3; c <= lastDayColIdx; c++) {
    const colLetter = getColLetter(c - 1);
    const startCellRef = `${colLetter}${firstDataRow}`;
    const endCellRef = `${colLetter}${lastDataRow}`;
    const cell = sumRowObj.getCell(c);
    cell.value = { formula: `COUNTIF(${startCellRef}:${endCellRef}, "+")` };
    cell.font = { name: 'Times New Roman', size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  // Add SUM formula for summary columns if included
  if (includeMonthSummary && sumColIdx > 0) {
    for (let c = sumColIdx; c <= totalColsCount; c++) {
      const colLetter = getColLetter(c - 1);
      const startCellRef = `${colLetter}${firstDataRow}`;
      const endCellRef = `${colLetter}${lastDataRow}`;
      const cell = sumRowObj.getCell(c);
      cell.value = { formula: `SUM(${startCellRef}:${endCellRef})` };
      cell.font = { name: 'Times New Roman', size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
  }

  sumRowObj.height = 20;

  // Signatures block
  currentExcelRow += 2;

  // Date line
  const leftColLetterStart = 'B';
  const leftColLetterEnd = getColLetter(Math.min(7, totalColsCount - 1));
  const rightColLetterStart = getColLetter(Math.max(8, totalColsCount - 7));
  const rightColLetterEnd = getColLetter(totalColsCount - 1);

  // Date on the right
  ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
  const dateCell = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
  dateCell.value = signDateText;
  dateCell.font = { name: 'Times New Roman', size: 10.5, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  currentExcelRow++;
  // Titles: GIÁO VIÊN CHỦ NHIỆM & HIỆU TRƯỞNG
  ws.mergeCells(`${leftColLetterStart}${currentExcelRow}:${leftColLetterEnd}${currentExcelRow}`);
  ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);

  const gvcnTitle = ws.getCell(`${leftColLetterStart}${currentExcelRow}`);
  gvcnTitle.value = 'GIÁO VIÊN CHỦ NHIỆM';
  gvcnTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  gvcnTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghTitle = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
  bghTitle.value = includeMonthSummary ? 'HIỆU TRƯỞNG' : 'BAN GIÁM HIỆU';
  bghTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  bghTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  currentExcelRow++;
  // Sub-titles: (Ký và ghi rõ họ tên), (Ký, đóng dấu)
  ws.mergeCells(`${leftColLetterStart}${currentExcelRow}:${leftColLetterEnd}${currentExcelRow}`);
  ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);

  const gvcnSub = ws.getCell(`${leftColLetterStart}${currentExcelRow}`);
  gvcnSub.value = '(Ký và ghi rõ họ tên)';
  gvcnSub.font = { name: 'Times New Roman', size: 9.5, italic: true };
  gvcnSub.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghSub = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
  bghSub.value = includeMonthSummary ? '(Ký, đóng dấu)' : '(Ký duyệt)';
  bghSub.font = { name: 'Times New Roman', size: 9.5, italic: true };
  bghSub.alignment = { horizontal: 'center', vertical: 'middle' };

  // Space for physical signature
  currentExcelRow += 4;
  ws.mergeCells(`${leftColLetterStart}${currentExcelRow}:${leftColLetterEnd}${currentExcelRow}`);
  ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);

  const gvcnName = ws.getCell(`${leftColLetterStart}${currentExcelRow}`);
  gvcnName.value = teacherName;
  gvcnName.font = { name: 'Times New Roman', size: 11, bold: true };
  gvcnName.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghName = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
  bghName.value = principalName;
  bghName.font = { name: 'Times New Roman', size: 11, bold: true };
  bghName.alignment = { horizontal: 'center', vertical: 'middle' };
}

/**
 * Xuất file Excel "Sổ Chấm Cơm Bán Trú Tháng" chuẩn biểu mẫu Bộ/Sở Giáo dục giống 100% hình gốc.
 * Tự động chia làm 2 trang riêng biệt:
 * - Trang 1: Nửa tháng đầu (từ ngày 01 đến ngày 15)
 * - Trang 2: Nửa tháng sau (từ ngày 16 đến ngày cuối tháng) kèm cột Tổng hợp cả tháng & Chữ ký
 * - Sheet 3: Toàn bộ tháng (dành cho người xem tổng thể liền mạch)
 */
export async function exportMonthlyBoardingExcel(params: ExportBoardingExcelParams): Promise<boolean> {
  const {
    classId,
    className,
    campusName = 'Suối Lư',
    schoolName = 'TRƯỜNG PTDTBT THCS XA DUNG',
    monthStr,
    students,
    teacherName = 'Giáo viên chủ nhiệm',
    principalName = 'Hiệu trưởng',
    existingMatrix,
  } = params;

  if (!classId || !monthStr) {
    throw new Error('Thiếu thông tin lớp học hoặc tháng xuất biểu mẫu.');
  }

  const safeStudents = Array.isArray(students) ? students : [];

  // 1. Lọc danh sách học sinh bán trú của lớp
  let boardingStudents = safeStudents.filter(
    (s) => s.class_id === classId && s.isBoarding !== false
  );

  // 2. Nếu chưa đánh dấu bán trú nhưng đã có học sinh trong lớp, lấy toàn bộ học sinh của lớp
  if (boardingStudents.length === 0) {
    const allClassStudents = safeStudents.filter((s) => s.class_id === classId);
    if (allClassStudents.length > 0) {
      boardingStudents = allClassStudents;
    }
  }

  // 2b. Nếu trong mảng truyền vào rỗng, kiểm tra trực tiếp từ StorageService
  if (boardingStudents.length === 0) {
    try {
      const storedStudents = await StorageService.getStudentsByClass(classId);
      if (storedStudents && storedStudents.length > 0) {
        const b = storedStudents.filter((s) => s.isBoarding !== false);
        boardingStudents = b.length > 0 ? b : storedStudents;
      }
    } catch (e) {
      console.warn('Could not fetch students from StorageService:', e);
    }
  }

  // 3. Nếu danh sách truyền vào chưa có, thử tìm trong các báo cáo ăn đã lưu của lớp
  if (boardingStudents.length === 0) {
    try {
      const classReports = await StorageService.getBoardingReportsByClass(classId);
      const studentMap = new Map<string, Student>();
      classReports.forEach((cr) => {
        cr.records?.forEach((rec) => {
          if (rec.student_id && rec.student_name && !studentMap.has(rec.student_id)) {
            studentMap.set(rec.student_id, {
              id: rec.student_id,
              class_id: classId,
              full_name: rec.student_name,
              gender: rec.gender,
              village: rec.village,
              isBoarding: true,
            });
          }
        });
      });
      if (studentMap.size > 0) {
        boardingStudents = Array.from(studentMap.values());
      }
    } catch (e) {
      console.warn('Could not extract students from boarding reports:', e);
    }
  }

  // 4. Nếu lớp hoàn toàn chưa được nhập danh sách học sinh vào hệ thống, để trống để GVCN Import Excel lên
  if (boardingStudents.length === 0) {
    boardingStudents = [];
  }

  const [yStr, mStr] = monthStr.split('-');
  const yearNum = Number(yStr);
  const monthNum = Number(mStr);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

  // Tạo danh sách các ngày trong tháng
  const monthDays: DayInfo[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const schedule = getMealScheduleForDate(dateStr);
    const dateObj = new Date(yearNum, monthNum - 1, d);
    const dow = dateObj.getDay();
    let dowShort = 'CN';
    if (dow === 1) dowShort = '2';
    else if (dow === 2) dowShort = '3';
    else if (dow === 3) dowShort = '4';
    else if (dow === 4) dowShort = '5';
    else if (dow === 5) dowShort = '6';
    else if (dow === 6) dowShort = '7';

    monthDays.push({
      dayNum: d,
      dateStr,
      dayOfWeekShort: dowShort,
      isMealDay: schedule.isMealDay,
      allowedMeals: {
        breakfast: schedule.breakfastAllowed,
        lunch: schedule.lunchAllowed,
        dinner: schedule.dinnerAllowed,
      },
    });
  }

  // Chuẩn bị ma trận ăn: studentId -> { dateStr: { breakfast, lunch, dinner } }
  let matrix = existingMatrix;
  if (!matrix) {
    matrix = {};
    const reports: BoardingDailyReport[] = await StorageService.getBoardingReportsByClassAndMonth(classId, monthStr);
    const reportMap = new Map<string, BoardingDailyReport>();
    reports.forEach((r) => reportMap.set(r.date, r));

    boardingStudents.forEach((st) => {
      matrix![st.id] = {};
      monthDays.forEach((day) => {
        const rep = reportMap.get(day.dateStr);
        if (rep && rep.records) {
          const stRec = rep.records.find((r) => r.student_id === st.id);
          if (stRec) {
            matrix![st.id][day.dateStr] = {
              breakfast: Boolean(stRec.breakfast),
              lunch: Boolean(stRec.lunch),
              dinner: Boolean(stRec.dinner),
            };
            return;
          }
        }

        // Mặc định theo quy tắc ngày trong tuần
        matrix![st.id][day.dateStr] = {
          breakfast: day.allowedMeals.breakfast,
          lunch: day.allowedMeals.lunch,
          dinner: day.allowedMeals.dinner,
        };
      });
    });
  }

  // Tính số ngày tiêu chuẩn trong tháng
  let standardBreakfastDays = params.standardBreakfastDays !== undefined ? params.standardBreakfastDays : 0;
  let standardLunchDays = params.standardLunchDays !== undefined ? params.standardLunchDays : 0;
  let standardDinnerDays = params.standardDinnerDays !== undefined ? params.standardDinnerDays : 0;

  if (params.standardBreakfastDays === undefined) {
    monthDays.forEach((d) => {
      if (d.allowedMeals.breakfast) standardBreakfastDays++;
      if (d.allowedMeals.lunch) standardLunchDays++;
      if (d.allowedMeals.dinner) standardDinnerDays++;
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số & Bán trú';
  wb.created = new Date();

  const context = {
    schoolName,
    campusName,
    className,
    monthNum,
    yearNum,
    daysInMonth,
    monthDays,
    boardingStudents,
    matrix,
    standardBreakfastDays,
    standardLunchDays,
    standardDinnerDays,
    teacherName,
    principalName,
  };

  const midDay = 15;

  // 1. TẠO TRANG 1: NỬA ĐẦU THÁNG (NGÀY 01 ĐẾN 15)
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Trang 1 (Ngày 01-${midDay})`,
      pageSubtitle: `(TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN NGÀY ${midDay})`,
      startDay: 1,
      endDay: midDay,
      includeMonthSummary: false,
      signDateText: `Xa Dung, ngày ${midDay} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
    },
    context
  );

  // 2. TẠO TRANG 2: NỬA CUỐI THÁNG (NGÀY 16 ĐẾN CUỐI THÁNG & TỔNG HỢP CẢ THÁNG)
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Trang 2 (Ngày ${midDay + 1}-${daysInMonth})`,
      pageSubtitle: `(TRANG 2: NỬA CUỐI THÁNG - TỪ NGÀY ${midDay + 1} ĐẾN NGÀY ${daysInMonth} & TỔNG HỢP CẢ THÁNG)`,
      startDay: midDay + 1,
      endDay: daysInMonth,
      includeMonthSummary: true,
      signDateText: `Xa Dung, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
    },
    context
  );

  // 3. TẠO SHEET 3: TOÀN BỘ THÁNG (Cho người dùng cần xem liền mạch trên máy tính)
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Toàn bộ tháng (01-${daysInMonth})`,
      pageSubtitle: `(BẢNG TỔNG HỢP LIỀN MẠCH TOÀN BỘ THÁNG ${monthNum}/${yearNum})`,
      startDay: 1,
      endDay: daysInMonth,
      includeMonthSummary: true,
      signDateText: `Xa Dung, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
    },
    context
  );

  // Set first sheet active
  wb.views = [
    {
      x: 0,
      y: 0,
      width: 10000,
      height: 20000,
      firstSheet: 0,
      activeTab: 0,
      visibility: 'visible',
    },
  ];

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanClassName = className.replace(/[^a-zA-Z0-9]/g, '_');
  a.download = `So_Cham_Com_Lop_${cleanClassName}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  return true;
}
