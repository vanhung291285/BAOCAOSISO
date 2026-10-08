import ExcelJS from 'exceljs';
import { StorageService } from '../services/storage';
import { Student, BoardingDailyReport, BoardingSignatureConfig, BoardingMonthSignature } from '../types';
import { getMealScheduleForDate, buildDefaultMealRecords, generateDefaultBoardingStudentsForClass } from './boardingRules';
import { getTodayDateStr } from './schoolWeeks';

export interface ExportBoardingExcelParams {
  classId: string;
  className: string;
  campusName?: string;
  schoolName?: string;
  locationName?: string; // Địa danh ký (e.g. 'Xa Dung')
  monthStr: string; // 'YYYY-MM'
  students: Student[];
  teacherName?: string;
  teacherTitle?: string;
  principalName?: string;
  signingDate?: string; // Ngày ký tự động / tùy chỉnh
  existingMatrix?: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>>;
  standardBreakfastDays?: number;
  standardLunchDays?: number;
  standardDinnerDays?: number;
  sigConfig?: BoardingSignatureConfig;
  monthSig?: BoardingMonthSignature | null;
  sheetTitle?: string;
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

/**
 * Chèn ảnh chữ ký hoặc con dấu điện tử vào sheet Excel
 */
function addSignatureImageToWorksheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  base64String: string,
  colPosition: number,
  rowPosition: number,
  width = 120,
  height = 50
) {
  try {
    if (!base64String || typeof base64String !== 'string') return;
    let base64Clean = base64String.trim();
    let ext: 'png' | 'jpeg' = 'png';

    if (base64Clean.startsWith('data:image/')) {
      const match = base64Clean.match(/^data:image\/(png|jpeg|jpg);base64,(.*)$/);
      if (match) {
        ext = match[1] === 'jpg' ? 'jpeg' : (match[1] as 'png' | 'jpeg');
        base64Clean = match[2];
      } else {
        const parts = base64Clean.split(',');
        if (parts.length > 1) {
          base64Clean = parts[1];
        }
      }
    }

    if (!base64Clean) return;

    const imgId = wb.addImage({
      base64: base64Clean,
      extension: ext,
    });

    ws.addImage(imgId, {
      tl: { col: Math.max(0, colPosition), row: Math.max(0, rowPosition) },
      ext: { width, height },
      editAs: 'oneCell',
    });
  } catch (err) {
    console.warn('Could not add signature image to Excel worksheet:', err);
  }
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
  includeSignature?: boolean;
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
    teacherTitle?: string;
    principalName: string;
    sigConfig?: BoardingSignatureConfig;
    monthSig?: BoardingMonthSignature | null;
    sheetTitle?: string;
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
    teacherTitle,
    principalName,
    sigConfig,
    monthSig,
    sheetTitle,
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
      paperSize: 9, // A4 chuẩn
      fitToPage: true,
      fitToWidth: 1, // Luôn vừa khít 1 trang A4 chiều ngang, hiển thị đầy đủ 100% tất cả các cột
      fitToHeight: boardingStudents.length <= 36 ? 1 : 2, // <= 36 HS vừa khít trọn vẹn 1 trang A4, đông hơn tự động chia trang chuẩn
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 },
      showGridLines: false, // Tắt dòng kẻ mặc định của trang in để không bị kẻ ô li ti ở phần tiêu đề và chữ ký
      printTitlesRow: '7:9', // Lặp lại hàng tiêu đề STT, Họ tên, Thứ, Ngày, Bữa ăn trên tất cả các trang in khi nhiều trang
    },
    views: [
      {
        state: 'frozen',
        xSplit: 2, // Cố định 2 cột STT và Họ và tên khi cuộn ngang
        ySplit: 9, // Cố định các hàng tiêu đề khi cuộn dọc
        topLeftCell: 'C10',
        activeCell: 'A1',
        showGridLines: false, // Tắt lưới Excel trên màn hình để nền trắng sạch sẽ quanh tiêu đề và chữ ký như mẫu gốc
      },
    ],
  });

  // Tự động co giãn kích thước cột Họ và tên theo độ dài tên dài nhất trong lớp
  const studentCount = boardingStudents.length;
  const maxNameLen = Math.max(
    ...boardingStudents.map((s) => (s.full_name || '').trim().length),
    15
  );
  const isTrang1 = numDays <= 16 && !includeMonthSummary;
  const isTrang2 = numDays <= 16 && includeMonthSummary;

  // Họ và tên tự động co giãn thông minh: không quá rộng gây tràn trang, không quá hẹp gây cắt chữ
  const nameColWidth = numDays <= 16
    ? Math.min(Math.max(18, maxNameLen * 1.05 + 1.5), 23)
    : Math.min(Math.max(17, maxNameLen * 0.95 + 1.0), 21);

  ws.getColumn(1).width = 4.2; // STT gọn gàng, rõ ràng
  ws.getColumn(2).width = nameColWidth; // Họ và tên tự động co giãn theo danh sách thực tế

  // Kích thước các cột chấm ăn ngày (S, T, T) tự động tối ưu chuẩn in ấn A4 Landscape
  // Trang 1 (15 ngày = 45 cột): 2.35 -> Bề rộng vừa khít khổ A4 ngang, tỷ lệ phóng to in ấn ~95-98%, chữ cực rõ nét
  // Trang 2 (15-16 ngày = 45-48 cột + 6 cột tổng): 2.15 -> In vừa vặn toàn bộ 56 cột trên 1 trang ngang
  // Toàn bộ tháng (31 ngày = 93 cột + 6 cột tổng): 1.95 -> Vừa vặn 101 cột
  const mealColWidth = isTrang1 ? 2.35 : isTrang2 ? 2.15 : 1.95;

  for (let d = 0; d < numDays; d++) {
    const colStart = 3 + d * 3;
    ws.getColumn(colStart).width = mealColWidth; // S
    ws.getColumn(colStart + 1).width = mealColWidth; // T
    ws.getColumn(colStart + 2).width = mealColWidth; // T
  }

  // Summary columns: Tự động co giãn phù hợp để hiển thị số ngày ăn/nghỉ rõ ràng (chứa số 2-3 chữ số)
  if (includeMonthSummary && sumColIdx > 0) {
    const sumWidth = isTrang2 ? 3.9 : 3.4;
    for (let c = sumColIdx; c <= sumColIdx + 5; c++) {
      ws.getColumn(c).width = sumWidth;
    }
  }

  // Header 1: School & Campus info (Rows 1 & 2)
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = schoolName.toUpperCase();
  ws.getCell('A1').font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 18;

  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `PHÂN HIỆU: ${(campusName || 'XA DUNG').toUpperCase()}`;
  ws.getCell('A2').font = { name: 'Times New Roman', size: 10.5, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(2).height = 16;

  // Row 3 spacer
  ws.getRow(3).height = 4;

  // Header Main Title (Row 4)
  const titleRange = `A4:${getColLetter(totalColsCount - 1)}4`;
  ws.mergeCells(titleRange);
  const titleCell = ws.getCell('A4');
  const mainSheetTitle = (sheetTitle || 'SỔ CHẤM CƠM').toUpperCase();
  titleCell.value = `${mainSheetTitle} LỚP: ${className.toUpperCase()} THÁNG ${monthNum}/${yearNum}`;
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 24;

  // Header Subtitle (Row 5): e.g. "(TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN 15)"
  const subtitleRange = `A5:${getColLetter(totalColsCount - 1)}5`;
  ws.mergeCells(subtitleRange);
  const subtitleCell = ws.getCell('A5');
  subtitleCell.value = pageSubtitle.toUpperCase();
  subtitleCell.font = { name: 'Times New Roman', size: 10, bold: true, italic: true };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 17;

  // Row 6 spacer
  ws.getRow(6).height = 4;

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

    // Row 8: Day of Week Short (T.2, T.3, ... CN)
    ws.mergeCells(`${colLetterStart}${headerRow2}:${colLetterEnd}${headerRow2}`);
    const dowCell = ws.getCell(`${colLetterStart}${headerRow2}`);
    dowCell.value = day.dayOfWeekShort === 'CN' ? 'CN' : `T.${day.dayOfWeekShort}`;

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

  // Style Header rows - Căn chỉnh chiều cao và cỡ chữ chuẩn in ấn sắc nét
  ws.getRow(headerRow1).height = 19;
  ws.getRow(headerRow2).height = 16;
  ws.getRow(headerRow3).height = 16;

  for (let r = headerRow1; r <= headerRow3; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= totalColsCount; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      const fontSize = r === headerRow1 ? 10 : r === headerRow2 ? 9.5 : 9;
      cell.font = { name: 'Times New Roman', size: fontSize, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      // Nền sáng thanh lịch, rõ ràng cho header
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };

      // Highlight summary headers
      if (includeMonthSummary && c >= sumColIdx) {
        const isMissed = c >= sumColIdx + 3;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isMissed ? 'FFFFF1F2' : 'FFEFF6FF' },
        };
      }
    }
  }

  // Data rows (Students)
  let currentExcelRow = 10;
  // Chiều cao dòng học sinh tự động co giãn: 16.5pt nếu <= 36 HS (vừa vặn 1 trang A4 hoàn hảo), 15.5pt nếu > 36 HS
  const dataRowHeight = studentCount <= 36 ? 16.5 : 15.5;

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

      // Quy tắc kế toán bán trú: Số ngày báo ăn (S, T, T) + Số ngày không báo ăn (S, T, T) = Định mức báo (S, T, T)
      const missedB = Math.max(0, standardBreakfastDays - eatenB);
      const missedL = Math.max(0, standardLunchDays - eatenL);
      const missedD = Math.max(0, standardDinnerDays - eatenD);

      rowObj.getCell(sumColIdx).value = eatenB;
      rowObj.getCell(sumColIdx + 1).value = eatenL;
      rowObj.getCell(sumColIdx + 2).value = eatenD;

      rowObj.getCell(sumColIdx + 3).value = missedB;
      rowObj.getCell(sumColIdx + 4).value = missedL;
      rowObj.getCell(sumColIdx + 5).value = missedD;
    }

    // Row styles - Cỡ chữ chuẩn 10pt Times New Roman, in sắc nét, hiển thị đầy đủ không tràn
    rowObj.height = dataRowHeight;
    for (let c = 1; c <= totalColsCount; c++) {
      const cell = rowObj.getCell(c);
      cell.border = thinBorder;
      
      const isSTT = c === 1;
      const isName = c === 2;
      const isSummary = includeMonthSummary && c >= sumColIdx;

      cell.font = {
        name: 'Times New Roman',
        size: isName ? 10 : 9.5,
        bold: isName || isSummary,
        color: { argb: 'FF000000' },
      };

      if (isName) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, shrinkToFit: true };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Bold '+' marks rõ nét
      if (c >= 3 && (!includeMonthSummary || c < sumColIdx) && cell.value === '+') {
        cell.font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF000000' } };
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
  sumLabelCell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF000000' } };
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
    cell.font = { name: 'Times New Roman', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.numFmt = '#,##0';
  }

  // Add SUM formula for summary columns if included
  if (includeMonthSummary && sumColIdx > 0) {
    for (let c = sumColIdx; c <= totalColsCount; c++) {
      const colLetter = getColLetter(c - 1);
      const startCellRef = `${colLetter}${firstDataRow}`;
      const endCellRef = `${colLetter}${lastDataRow}`;
      const cell = sumRowObj.getCell(c);
      cell.value = { formula: `SUM(${startCellRef}:${endCellRef})` };
      cell.font = { name: 'Times New Roman', size: 9.5, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      cell.numFmt = '#,##0';
    }
  }

  sumRowObj.height = 20;

  // Signatures block - Chỉ hiển thị khi includeSignature !== false
  const includeSig = options.includeSignature !== false;
  if (includeSig) {
    currentExcelRow++;
    ws.getRow(currentExcelRow).height = 6;

    currentExcelRow++;
    const colSpanCount = Math.min(16, totalColsCount);
    const rightColStartIdx = Math.max(2, totalColsCount - colSpanCount);
    const rightColLetterStart = getColLetter(rightColStartIdx);
    const rightColLetterEnd = getColLetter(totalColsCount - 1);

    // 1. Dòng Địa danh & Ngày ký
    ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
    const dateCell = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
    dateCell.value = signDateText;
    dateCell.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF000000' } };
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentExcelRow).height = 16;

    // 2. Chức danh người ký
    currentExcelRow++;
    ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
    const gvcnTitle = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
    gvcnTitle.value = (sigConfig?.teacher_title || teacherTitle || 'GIÁO VIÊN CHỦ NHIỆM').toUpperCase();
    gvcnTitle.font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    gvcnTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentExcelRow).height = 17;

    // 3. Phụ đề (Ký và ghi rõ họ tên)
    currentExcelRow++;
    ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
    const gvcnSub = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
    gvcnSub.value = '(Ký và ghi rõ họ tên)';
    gvcnSub.font = { name: 'Times New Roman', size: 9, italic: true, color: { argb: 'FF475569' } };
    gvcnSub.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentExcelRow).height = 14;

    // 4. Vùng chữ ký số / con dấu / ký tay
    const hasSigImage = Boolean(sigConfig?.signature_image_url);
    const hasStampImage = Boolean(sigConfig?.stamp_image_url);
    const isSignedDigital = Boolean(monthSig?.is_signed);

    const sigRowStart = currentExcelRow + 1;

    if (hasSigImage || hasStampImage || isSignedDigital) {
      // Dòng hiển thị chứng nhận ký điện tử
      currentExcelRow++;
      ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
      const badgeCell = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
      if (isSignedDigital) {
        badgeCell.value = monthSig?.certificate_hash
          ? `[✓ ĐÃ KÝ ĐIỆN TỬ: ${monthSig.certificate_hash}]`
          : '[✓ ĐÃ KÝ ĐIỆN TỬ]';
        badgeCell.font = { name: 'Times New Roman', size: 8.5, bold: true, color: { argb: 'FF047857' } }; // Xanh lá cây
      } else {
        badgeCell.value = '(Chữ ký điện tử)';
        badgeCell.font = { name: 'Times New Roman', size: 8.5, italic: true, color: { argb: 'FF64748B' } };
      }
      badgeCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currentExcelRow).height = 14;

      currentExcelRow++;
      ws.getRow(currentExcelRow).height = 20;
      currentExcelRow++;
      ws.getRow(currentExcelRow).height = 18;

      // Chèn ảnh chữ ký
      if (hasSigImage && sigConfig?.signature_image_url) {
        addSignatureImageToWorksheet(
          wb,
          ws,
          sigConfig.signature_image_url,
          rightColStartIdx + Math.floor(colSpanCount / 2) - 2.5,
          sigRowStart - 0.2,
          125,
          48
        );
      }

      // Chèn ảnh con dấu (nếu có)
      if (hasStampImage && sigConfig?.stamp_image_url) {
        addSignatureImageToWorksheet(
          wb,
          ws,
          sigConfig.stamp_image_url,
          rightColStartIdx + Math.floor(colSpanCount / 2) - 1.5,
          sigRowStart - 0.5,
          75,
          60
        );
      }
    } else {
      // Space for physical signature (3 rows at 12pt)
      currentExcelRow++;
      ws.getRow(currentExcelRow).height = 12;
      currentExcelRow++;
      ws.getRow(currentExcelRow).height = 12;
      currentExcelRow++;
      ws.getRow(currentExcelRow).height = 12;
    }

    // 5. Dòng Họ và tên GVCN
    currentExcelRow++;
    ws.mergeCells(`${rightColLetterStart}${currentExcelRow}:${rightColLetterEnd}${currentExcelRow}`);
    const gvcnName = ws.getCell(`${rightColLetterStart}${currentExcelRow}`);
    gvcnName.value = teacherName;
    gvcnName.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF000000' } };
    gvcnName.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentExcelRow).height = 19;
  }
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

  // Lấy toàn bộ danh sách học sinh bán trú của lớp để xuất biểu mẫu ăn bán trú đầy đủ 100%
  const normClassKeys = new Set(
    [classId, className]
      .filter(Boolean)
      .flatMap((k) => [
        String(k).trim().toLowerCase(),
        String(k).replace(/^c_/, '').trim().toLowerCase(),
        String(k).replace(/^lớp\s*/i, '').trim().toLowerCase(),
      ])
  );

  let boardingStudents = safeStudents.filter((s) => {
    if (s.isBoarding === false) return false;
    if (normClassKeys.size === 0) return true;
    const sCls = String(s.class_id || '').trim().toLowerCase();
    const sClsClean = sCls.replace(/^c_/, '').replace(/^lớp\s*/i, '');
    return normClassKeys.has(sCls) || normClassKeys.has(sClsClean);
  });

  // Nếu safeStudents được truyền vào từ caller nhưng chưa khớp do caller đã filter trước, dùng safeStudents
  if (boardingStudents.length === 0 && safeStudents.length > 0) {
    boardingStudents = safeStudents.filter((s) => s.isBoarding !== false);
  }

  // 2b. Nếu trong mảng truyền vào rỗng, kiểm tra trực tiếp từ StorageService
  if (boardingStudents.length === 0) {
    try {
      const clsStds = await StorageService.getStudentsByClass(classId, className);
      boardingStudents = clsStds.filter((s) => s.isBoarding !== false);
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

  // 4. Tự động sinh danh sách 35 học sinh bán trú chuẩn mẫu nếu lớp chưa có để xuất file hoàn chỉnh
  if (boardingStudents.length === 0) {
    try {
      boardingStudents = generateDefaultBoardingStudentsForClass(classId, className);
    } catch (e) {
      console.warn('Could not generate default boarding students:', e);
      boardingStudents = [];
    }
  }

  // Giữ nguyên 100% thứ tự danh sách học sinh theo file Excel gốc của lớp và loại bỏ trùng lặp (nếu có)
  const seenIds = new Set<string>();
  const uniqueBoarding: Student[] = [];
  for (const s of boardingStudents) {
    if (!s || !s.full_name) continue;
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    uniqueBoarding.push(s);
  }
  boardingStudents = uniqueBoarding;

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
  let matrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>> = {};
  const reportedDates = new Set<string>();

  if (existingMatrix) {
    boardingStudents.forEach((st) => {
      matrix[st.id] = {};
      monthDays.forEach((day) => {
        const rec = existingMatrix[st.id]?.[day.dateStr];
        const hasMeal = rec?.breakfast || rec?.lunch || rec?.dinner;
        if (hasMeal) {
          reportedDates.add(day.dateStr);
        }
        matrix[st.id][day.dateStr] = {
          breakfast: Boolean(rec?.breakfast),
          lunch: Boolean(rec?.lunch),
          dinner: Boolean(rec?.dinner),
        };
      });
    });
  } else {
    const reports: BoardingDailyReport[] = await StorageService.getBoardingReportsByClassAndMonth(classId, monthStr);
    const reportMap = new Map<string, BoardingDailyReport>();
    reports.forEach((r) => {
      if (!r) return;
      const cleanDate = String(r.date).split('T')[0].trim();
      let recs = r.records;
      if (typeof recs === 'string') {
        try { recs = JSON.parse(recs); } catch { recs = []; }
      }
      if (!Array.isArray(recs) || recs.length === 0) {
        recs = buildDefaultMealRecords(boardingStudents, cleanDate, classId);
      }
      reportMap.set(cleanDate, {
        ...r,
        date: cleanDate,
        records: recs,
      });
    });

    // Fallback: Đồng bộ từ daily_reports nếu chưa có boarding_reports
    try {
      const dailyReports = await StorageService.getDailyReportsByMonth(classId, monthStr);
      dailyReports.forEach((dr) => {
        // Chỉ lấy các ngày GVCN ĐÃ NỘP BÁO CÁO THỰC SỰ (SUBMITTED hoặc LOCKED)
        if (dr.status !== 'SUBMITTED' && dr.status !== 'LOCKED') return;
        const cleanDate = String(dr.report_date).split('T')[0].trim();
        if (!reportMap.has(cleanDate)) {
          const absentMap = new Map<string, { reason?: string }>();
          if (dr.absent_students) {
            dr.absent_students.forEach((ab) => {
              if (ab.id) {
                absentMap.set(ab.id, { reason: ab.reason });
              } else if (ab.full_name) {
                absentMap.set(ab.full_name.trim().toLowerCase(), { reason: ab.reason });
              }
            });
          }
          const synthRecords = buildDefaultMealRecords(boardingStudents, cleanDate, classId, absentMap);
          let bCount = 0, lCount = 0, dCount = 0, abCount = 0;
          synthRecords.forEach((r) => {
            if (r.breakfast) bCount++;
            if (r.lunch) lCount++;
            if (r.dinner) dCount++;
            if (r.is_absent) abCount++;
          });
          reportMap.set(cleanDate, {
            id: `boarding_rep_${classId}_${cleanDate}`,
            class_id: classId,
            date: cleanDate,
            status: 'SUBMITTED',
            total_boarding_students: boardingStudents.length,
            breakfast_count: bCount,
            lunch_count: lCount,
            dinner_count: dCount,
            absent_count: abCount,
            total_meals: bCount + lCount + dCount,
            records: synthRecords,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });
    } catch (err) {
      console.warn('Excel export daily report sync fallback warning:', err);
    }

    reportMap.forEach((_, cleanDate) => {
      reportedDates.add(cleanDate);
    });

    boardingStudents.forEach((st) => {
      matrix[st.id] = {};
      const normName = st.full_name.trim().toLowerCase();
      const sameNameCount = boardingStudents.filter(
        (s) => s.full_name.trim().toLowerCase() === normName
      ).length;

      monthDays.forEach((day) => {
        const rep = reportMap.get(day.dateStr);
        if (rep) {
          let recs = rep.records;
          if (typeof recs === 'string') {
            try { recs = JSON.parse(recs); } catch { recs = []; }
          }
          const stRec = Array.isArray(recs)
            ? recs.find((r) => r.student_id === st.id) ||
              (sameNameCount === 1
                ? recs.find((r) => !r.student_id && r.student_name && r.student_name.trim().toLowerCase() === normName)
                : undefined)
            : undefined;

          if (stRec) {
            if (!stRec.is_absent) {
              matrix[st.id][day.dateStr] = {
                breakfast: Boolean(stRec.breakfast),
                lunch: Boolean(stRec.lunch),
                dinner: Boolean(stRec.dinner),
              };
              return;
            }
          } else {
            // Ngày này lớp có báo ăn nhưng học sinh chưa có trong bản ghi cũ (mới bổ sung):
            // Mặc định để trống (false)
            matrix[st.id][day.dateStr] = {
              breakfast: false,
              lunch: false,
              dinner: false,
            };
            return;
          }
        }

        // Mặc định để trống hoàn toàn khi chưa chấm / chưa báo ăn (KHÔNG điền trước dấu +)
        matrix[st.id][day.dateStr] = {
          breakfast: false,
          lunch: false,
          dinner: false,
        };
      });
    });
  }

  // Tính số ngày tiêu chuẩn trong tháng (Định mức báo ăn)
  let standardBreakfastDays = params.standardBreakfastDays ?? 0;
  let standardLunchDays = params.standardLunchDays ?? 0;
  let standardDinnerDays = params.standardDinnerDays ?? 0;

  if (standardBreakfastDays === 0 && standardLunchDays === 0 && standardDinnerDays === 0) {
    try {
      const customStd = await StorageService.getBoardingStandardConfig(classId, monthStr);
      if (customStd) {
        if (customStd.breakfast !== undefined) standardBreakfastDays = customStd.breakfast;
        if (customStd.lunch !== undefined) standardLunchDays = customStd.lunch;
        if (customStd.dinner !== undefined) standardDinnerDays = customStd.dinner;
      }
    } catch (e) {
      console.warn('Could not load boarding standard config for Excel export:', e);
    }
  }

  if (standardBreakfastDays === 0 && standardLunchDays === 0 && standardDinnerDays === 0) {
    let bCount = 0;
    let lCount = 0;
    let dCount = 0;

    monthDays.forEach((d) => {
      if (d.allowedMeals.breakfast) bCount++;
      if (d.allowedMeals.lunch) lCount++;
      if (d.allowedMeals.dinner) dCount++;
    });
    standardBreakfastDays = bCount;
    standardLunchDays = lCount;
    standardDinnerDays = dCount;
  }

  let sigConfig = params.sigConfig;
  if (!sigConfig) {
    try {
      sigConfig = await StorageService.getBoardingSignatureConfig(classId);
    } catch (e) {
      console.warn('Could not fetch signature config:', e);
    }
  }

  let monthSig = params.monthSig;
  if (monthSig === undefined) {
    try {
      monthSig = await StorageService.getBoardingMonthSignature(classId, monthStr);
    } catch (e) {
      console.warn('Could not fetch month signature:', e);
    }
  }

  const effectiveTeacher = params.teacherName || sigConfig?.teacher_name || teacherName || 'Giáo viên chủ nhiệm';
  const effectiveTeacherTitle = params.teacherTitle || sigConfig?.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM';

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
    teacherName: effectiveTeacher,
    teacherTitle: effectiveTeacherTitle,
    principalName,
    sigConfig,
    monthSig,
    sheetTitle: params.sheetTitle,
  };

  const loc = params.locationName?.trim() || 'Xa Dung';
  const midDay = 15;

  // 1. TẠO TRANG 1: NỬA ĐẦU THÁNG (NGÀY 01 ĐẾN 15) - Bỏ chữ ký
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Trang 1 (Ngày 01-${midDay})`,
      pageSubtitle: `(TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN NGÀY ${midDay})`,
      startDay: 1,
      endDay: midDay,
      includeMonthSummary: false,
      includeSignature: false,
      signDateText: `${loc}, ngày ${midDay} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
    },
    context
  );

  // 2. TẠO TRANG 2: NỬA CUỐI THÁNG (NGÀY 16 ĐẾN CUỐI THÁNG & TỔNG HỢP CẢ THÁNG) - Chỉ lấy chữ ký của GVCN, bỏ chữ ký Hiệu trưởng
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Trang 2 (Ngày ${midDay + 1}-${daysInMonth})`,
      pageSubtitle: `(TRANG 2: NỬA CUỐI THÁNG - TỪ NGÀY ${midDay + 1} ĐẾN NGÀY ${daysInMonth} & TỔNG HỢP CẢ THÁNG)`,
      startDay: midDay + 1,
      endDay: daysInMonth,
      includeMonthSummary: true,
      signDateText: `${loc}, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
    },
    context
  );

  // 3. TẠO SHEET 3: TOÀN BỘ THÁNG (Cho người dùng cần xem liền mạch trên máy tính) - Chỉ lấy chữ ký của GVCN, bỏ chữ ký Hiệu trưởng
  buildBoardingWorksheet(
    wb,
    {
      sheetName: `Toàn bộ tháng (01-${daysInMonth})`,
      pageSubtitle: `(BẢNG TỔNG HỢP LIỀN MẠCH TOÀN BỘ THÁNG ${monthNum}/${yearNum})`,
      startDay: 1,
      endDay: daysInMonth,
      includeMonthSummary: true,
      signDateText: `${loc}, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`,
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
