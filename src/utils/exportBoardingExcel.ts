import ExcelJS from 'exceljs';
import { StorageService } from '../services/storage';
import { Student, BoardingDailyReport } from '../types';
import { getMealScheduleForDate, generateDefaultBoardingStudentsForClass } from './boardingRules';

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

// Convert column index (0-indexed) to letter references (e.g. A, ZZ)
function getColLetter(colIdx: number): string {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    let modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
}

/**
 * Xuất file Excel "Sổ Chấm Cơm Bán Trú Tháng" chuẩn biểu mẫu Bộ/Sở Giáo dục giống 100% hình gốc.
 * Cột ngày và thứ tự động cập nhật, chấm bằng dấu (+), ô trống khi nghỉ hoặc ngày cuối tuần/Thứ 6 tối.
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
    // Keep boardingStudents as empty array
    boardingStudents = [];
  }

  const [yStr, mStr] = monthStr.split('-');
  const yearNum = Number(yStr);
  const monthNum = Number(mStr);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

  // Tạo danh sách các ngày trong tháng
  const monthDays: Array<{
    dayNum: number;
    dateStr: string;
    dayOfWeekShort: string;
    isMealDay: boolean;
    allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
  }> = [];

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

  // Tính số ngày tiêu chuẩn trong tháng (sử dụng giá trị truyền vào từ giao diện hoặc tự động tính theo lịch)
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
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  const sheetName = `SoChamCom_T${monthNum}`;
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      showGridLines: true,
    },
  });

  // Setup Column Widths
  // Col 1 (A): STT, Col 2 (B): Họ và tên
  ws.getColumn(1).width = 4.5;
  ws.getColumn(2).width = 18;

  // Daily columns: S, T, T for each day
  for (let d = 1; d <= daysInMonth; d++) {
    const colStart = 3 + (d - 1) * 3;
    ws.getColumn(colStart).width = 3.1;
    ws.getColumn(colStart + 1).width = 3.1;
    ws.getColumn(colStart + 2).width = 3.1;
  }

  // Summary columns
  const sumColIdx = 3 + daysInMonth * 3;
  ws.getColumn(sumColIdx).width = 4.5; // S báo ăn
  ws.getColumn(sumColIdx + 1).width = 4.5; // T báo ăn
  ws.getColumn(sumColIdx + 2).width = 4.5; // T báo ăn
  ws.getColumn(sumColIdx + 3).width = 4.5; // S không báo ăn
  ws.getColumn(sumColIdx + 4).width = 4.5; // T không báo ăn
  ws.getColumn(sumColIdx + 5).width = 4.5; // T không báo ăn

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } },
  };

  // Header 1: School and Campus info
  ws.getCell('A1').value = schoolName.toUpperCase();
  ws.getCell('A1').font = { name: 'Times New Roman', size: 9, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };

  ws.getCell('A2').value = `PHÂN HIỆU: ${(campusName || 'XA DUNG').toUpperCase()}`;
  ws.getCell('A2').font = { name: 'Times New Roman', size: 9, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  // Header Main Title
  const totalColsCount = sumColIdx + 5;
  const titleRange = `A4:${getColLetter(totalColsCount - 1)}4`;
  ws.mergeCells(titleRange);
  const titleCell = ws.getCell('A4');
  titleCell.value = `SỔ CHẤM CƠM LỚP: ${className.toUpperCase()} THÁNG ${monthNum}/${yearNum}`;
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 24;

  // Header Table setup (Rows 6, 7, 8)
  const headerRow1 = 6;
  const headerRow2 = 7;
  const headerRow3 = 8;

  ws.mergeCells(`A${headerRow1}:A${headerRow3}`);
  const sttHeader = ws.getCell(`A${headerRow1}`);
  sttHeader.value = 'STT';

  ws.mergeCells(`B${headerRow1}:B${headerRow3}`);
  const nameHeader = ws.getCell(`B${headerRow1}`);
  nameHeader.value = 'Họ và tên';

  // Render Day Numbers & Day Of Week Headers
  monthDays.forEach((day, dIdx) => {
    const colStart = 2 + dIdx * 3; // 0-indexed column offset
    const colLetterStart = getColLetter(colStart);
    const colLetterEnd = getColLetter(colStart + 2);

    // Row 6: Day Number
    ws.mergeCells(`${colLetterStart}${headerRow1}:${colLetterEnd}${headerRow1}`);
    const dayNumCell = ws.getCell(`${colLetterStart}${headerRow1}`);
    dayNumCell.value = day.dayNum;

    // Row 7: Day Of Week Short
    ws.mergeCells(`${colLetterStart}${headerRow2}:${colLetterEnd}${headerRow2}`);
    const dowCell = ws.getCell(`${colLetterStart}${headerRow2}`);
    dowCell.value = day.dayOfWeekShort;

    // Row 8: S, T, T
    ws.getCell(`${colLetterStart}${headerRow3}`).value = 'S';
    ws.getCell(`${getColLetter(colStart + 1)}${headerRow3}`).value = 'T';
    ws.getCell(`${getColLetter(colStart + 2)}${headerRow3}`).value = 'T';
  });

  // Summary Headers
  const sumColLetterStart = getColLetter(sumColIdx - 1);
  const sumColLetterEnd = getColLetter(sumColIdx + 4);
  ws.mergeCells(`${sumColLetterStart}${headerRow1}:${sumColLetterEnd}${headerRow1}`);
  const summaryHeader = ws.getCell(`${sumColLetterStart}${headerRow1}`);
  summaryHeader.value = 'Số ngày ăn trong tháng';

  // Sub-summaries
  const eatenColLetterEnd = getColLetter(sumColIdx + 1);
  ws.mergeCells(`${sumColLetterStart}${headerRow2}:${eatenColLetterEnd}${headerRow2}`);
  const eatenHeader = ws.getCell(`${sumColLetterStart}${headerRow2}`);
  eatenHeader.value = 'Số ngày báo ăn';

  const missedColLetterStart = getColLetter(sumColIdx + 2);
  const missedColLetterEnd = getColLetter(sumColIdx + 4);
  ws.mergeCells(`${missedColLetterStart}${headerRow2}:${missedColLetterEnd}${headerRow2}`);
  const missedHeader = ws.getCell(`${missedColLetterStart}${headerRow2}`);
  missedHeader.value = 'Số ngày không báo ăn';

  // Row 8: S, T, T subheadings for summary
  ws.getCell(`${sumColLetterStart}${headerRow3}`).value = 'S';
  ws.getCell(`${getColLetter(sumColIdx)}${headerRow3}`).value = 'T';
  ws.getCell(`${getColLetter(sumColIdx + 1)}${headerRow3}`).value = 'T';

  ws.getCell(`${getColLetter(sumColIdx + 2)}${headerRow3}`).value = 'S';
  ws.getCell(`${getColLetter(sumColIdx + 3)}${headerRow3}`).value = 'T';
  ws.getCell(`${getColLetter(sumColIdx + 4)}${headerRow3}`).value = 'T';

  // Style Header block
  ws.getRow(headerRow1).height = 18;
  ws.getRow(headerRow2).height = 18;
  ws.getRow(headerRow3).height = 16;

  for (let r = headerRow1; r <= headerRow3; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= totalColsCount; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Times New Roman', size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      
      // Gray out summary header backgrounds
      if (c >= sumColIdx) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F4F7' },
        };
      }
    }
  }

  // Align corner headers
  sttHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  nameHeader.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  let currentExcelRow = 9;

  boardingStudents.forEach((st, idx) => {
    const rowObj = ws.getRow(currentExcelRow);
    rowObj.getCell(1).value = idx + 1;
    rowObj.getCell(2).value = st.full_name;

    const stDays = matrix![st.id] || {};
    let eatenB = 0;
    let eatenL = 0;
    let eatenD = 0;

    monthDays.forEach((day, dIdx) => {
      const dRec = stDays[day.dateStr];
      const hasB = Boolean(dRec?.breakfast);
      const hasL = Boolean(dRec?.lunch);
      const hasD = Boolean(dRec?.dinner);

      if (hasB) eatenB++;
      if (hasL) eatenL++;
      if (hasD) eatenD++;

      const colStart = 3 + dIdx * 3;
      rowObj.getCell(colStart).value = hasB ? '+' : '';
      rowObj.getCell(colStart + 1).value = hasL ? '+' : '';
      rowObj.getCell(colStart + 2).value = hasD ? '+' : '';
    });

    const missedB = Math.max(0, standardBreakfastDays - eatenB);
    const missedL = Math.max(0, standardLunchDays - eatenL);
    const missedD = Math.max(0, standardDinnerDays - eatenD);

    // Eaten summaries
    rowObj.getCell(sumColIdx).value = eatenB;
    rowObj.getCell(sumColIdx + 1).value = eatenL;
    rowObj.getCell(sumColIdx + 2).value = eatenD;

    // Missed summaries
    rowObj.getCell(sumColIdx + 3).value = missedB > 0 ? missedB : '';
    rowObj.getCell(sumColIdx + 4).value = missedL > 0 ? missedL : '';
    rowObj.getCell(sumColIdx + 5).value = missedD > 0 ? missedD : '';

    // Style the student row
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

      // Highlight "+" meals
      if (c >= 3 && c < sumColIdx && cell.value === '+') {
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

  // Add formula sums for daily columns
  for (let c = 3; c < sumColIdx; c++) {
    const colLetter = getColLetter(c - 1);
    const startCellRef = `${colLetter}9`;
    const endCellRef = `${colLetter}${sumRowIndex - 1}`;
    const cell = sumRowObj.getCell(c);
    cell.value = { formula: `COUNTIF(${startCellRef}:${endCellRef}, "+")` };
    cell.font = { name: 'Times New Roman', size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  // Add sums for eaten and missed summary columns
  for (let c = sumColIdx; c < totalColsCount; c++) {
    const colLetter = getColLetter(c - 1);
    const startCellRef = `${colLetter}9`;
    const endCellRef = `${colLetter}${sumRowIndex - 1}`;
    const cell = sumRowObj.getCell(c);
    cell.value = { formula: `SUM(${startCellRef}:${endCellRef})` };
    cell.font = { name: 'Times New Roman', size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  sumRowObj.height = 20;

  // Signatures blocks
  currentExcelRow += 3;
  ws.mergeCells(`B${currentExcelRow}:G${currentExcelRow}`);
  const dateSignColLetterStart = getColLetter(sumColIdx - 5);
  const dateSignColLetterEnd = getColLetter(totalColsCount - 1);
  ws.mergeCells(`${dateSignColLetterStart}${currentExcelRow}:${dateSignColLetterEnd}${currentExcelRow}`);

  const now = new Date();
  const dateSignText = `Xa Dung, ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
  const dateCell = ws.getCell(`${dateSignColLetterStart}${currentExcelRow}`);
  dateCell.value = dateSignText;
  dateCell.font = { name: 'Times New Roman', size: 11, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  currentExcelRow++;
  ws.mergeCells(`B${currentExcelRow}:G${currentExcelRow}`);
  ws.mergeCells(`${dateSignColLetterStart}${currentExcelRow}:${dateSignColLetterEnd}${currentExcelRow}`);

  const gvcnTitle = ws.getCell(`B${currentExcelRow}`);
  gvcnTitle.value = 'GIÁO VIÊN CHỦ NHIỆM';
  gvcnTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  gvcnTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghTitle = ws.getCell(`${dateSignColLetterStart}${currentExcelRow}`);
  bghTitle.value = 'HIỆU TRƯỞNG';
  bghTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  bghTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  currentExcelRow++;
  ws.mergeCells(`B${currentExcelRow}:G${currentExcelRow}`);
  ws.mergeCells(`${dateSignColLetterStart}${currentExcelRow}:${dateSignColLetterEnd}${currentExcelRow}`);

  const gvcnSub = ws.getCell(`B${currentExcelRow}`);
  gvcnSub.value = '(Ký và ghi rõ họ tên)';
  gvcnSub.font = { name: 'Times New Roman', size: 10, italic: true };
  gvcnSub.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghSub = ws.getCell(`${dateSignColLetterStart}${currentExcelRow}`);
  bghSub.value = '(Ký, đóng dấu)';
  bghSub.font = { name: 'Times New Roman', size: 10, italic: true };
  bghSub.alignment = { horizontal: 'center', vertical: 'middle' };

  // Leave space for physical signature
  currentExcelRow += 4;
  ws.mergeCells(`B${currentExcelRow}:G${currentExcelRow}`);
  ws.mergeCells(`${dateSignColLetterStart}${currentExcelRow}:${dateSignColLetterEnd}${currentExcelRow}`);

  const gvcnName = ws.getCell(`B${currentExcelRow}`);
  gvcnName.value = teacherName;
  gvcnName.font = { name: 'Times New Roman', size: 11, bold: true };
  gvcnName.alignment = { horizontal: 'center', vertical: 'middle' };

  const bghName = ws.getCell(`${dateSignColLetterStart}${currentExcelRow}`);
  bghName.value = principalName;
  bghName.font = { name: 'Times New Roman', size: 11, bold: true };
  bghName.alignment = { horizontal: 'center', vertical: 'middle' };

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
