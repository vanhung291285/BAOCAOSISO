import * as XLSX from 'xlsx';
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
}

/**
 * Xuất file Excel "Sổ Chấm Cơm Bán Trú Tháng" chuẩn biểu mẫu Bộ/Sở Giáo dục
 * Bao gồm:
 * - Tiêu đề trường, phân hiệu, lớp, tháng/năm
 * - Bảng chấm ăn chi tiết từng ngày (Sáng, Trưa, Tối: S - T - T)
 * - Cột tổng hợp số ngày báo ăn (S - T - T) và không báo ăn (S - T - T)
 * - Cột ngày ăn thực của từng học sinh
 * - Dòng TỔNG CỘNG suất ăn toàn lớp theo từng bữa và cả tháng
 * - Khối chữ ký xác nhận của GVCN và Ban Giám Hiệu
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

  // 4. Nếu lớp hoàn toàn chưa được nhập danh sách học sinh vào hệ thống:
  // Tự động khởi tạo danh sách 35 học sinh bán trú chuẩn cho lớp (đặc thù THCS Xa Dung)
  // và lưu vào cơ sở dữ liệu để lớp luôn có danh sách học sinh sử dụng lâu dài
  if (boardingStudents.length === 0) {
    boardingStudents = generateDefaultBoardingStudentsForClass(classId, className);
    try {
      await StorageService.saveStudents(boardingStudents);
    } catch (e) {
      console.warn('Could not auto-save default students:', e);
    }
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

  // Tính số ngày tiêu chuẩn trong tháng
  let standardBreakfastDays = 0;
  let standardLunchDays = 0;
  let standardDinnerDays = 0;
  monthDays.forEach((d) => {
    if (d.allowedMeals.breakfast) standardBreakfastDays++;
    if (d.allowedMeals.lunch) standardLunchDays++;
    if (d.allowedMeals.dinner) standardDinnerDays++;
  });

  // Mảng dữ liệu Excel dạng AOA (Array of Arrays)
  const rows: any[][] = [];

  // 1. Tiêu đề trường và phân hiệu
  rows.push([schoolName.toUpperCase()]);
  rows.push([`PHÂN HIỆU: ${(campusName || 'Suối Lư').toUpperCase()}`]);
  rows.push([]);

  // 2. Tiêu đề chính của biểu mẫu
  rows.push([
    '',
    '',
    '',
    '',
    '',
    `SỔ CHẤM CƠM LỚP ${className.toUpperCase()} - THÁNG ${monthNum}/${yearNum}`,
  ]);
  rows.push([
    '',
    '',
    '',
    '',
    '',
    `(Biểu tổng hợp các ngày ăn của học sinh bán trú trong tháng)`,
  ]);
  rows.push([]);

  // 3. Hàng Header 1: STT, Họ và tên, Ngày (1..days), Số ngày ăn trong tháng, Ngày ăn thực
  const headerRow1: any[] = ['STT', 'Họ và tên'];
  monthDays.forEach((d) => {
    headerRow1.push(d.dayNum, '', '');
  });
  headerRow1.push('Số ngày ăn trong tháng', '', '', '', '', '', 'Ngày ăn thực');
  rows.push(headerRow1);

  // 4. Hàng Header 2: '', '', Thứ (2..CN), Số ngày báo ăn, Số ngày không báo ăn, ''
  const headerRow2: any[] = ['', ''];
  monthDays.forEach((d) => {
    headerRow2.push(d.dayOfWeekShort, '', '');
  });
  headerRow2.push('Số ngày báo ăn', '', '', 'Số ngày không báo ăn', '', '', '');
  rows.push(headerRow2);

  // 5. Hàng Header 3: '', '', Bữa (S, T, T), S, T, T, S, T, T, ''
  const headerRow3: any[] = ['', ''];
  monthDays.forEach(() => {
    headerRow3.push('S', 'T', 'T');
  });
  headerRow3.push('S', 'T', 'T', 'S', 'T', 'T', '');
  rows.push(headerRow3);

  // Mảng tích lũy tổng cộng từng cột
  // Mỗi ngày có 3 cột bữa: S, T, T
  const dayTotals: Array<{ breakfast: number; lunch: number; dinner: number }> = monthDays.map(() => ({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  }));

  let totalAllEatenB = 0;
  let totalAllEatenL = 0;
  let totalAllEatenD = 0;
  let totalAllMissedB = 0;
  let totalAllMissedL = 0;
  let totalAllMissedD = 0;
  let totalAllActualDays = 0;

  // 6. Điền dữ liệu từng học sinh
  boardingStudents.forEach((st, idx) => {
    const rData: any[] = [idx + 1, st.full_name];
    const stDays = matrix![st.id] || {};

    let eatenB = 0;
    let eatenL = 0;
    let eatenD = 0;

    monthDays.forEach((d, dIdx) => {
      const dRec = stDays[d.dateStr];
      const hasB = Boolean(dRec?.breakfast);
      const hasL = Boolean(dRec?.lunch);
      const hasD = Boolean(dRec?.dinner);

      if (hasB) {
        eatenB++;
        dayTotals[dIdx].breakfast++;
      }
      if (hasL) {
        eatenL++;
        dayTotals[dIdx].lunch++;
      }
      if (hasD) {
        eatenD++;
        dayTotals[dIdx].dinner++;
      }

      rData.push(hasB ? '+' : '', hasL ? '+' : '', hasD ? '+' : '');
    });

    const missedB = Math.max(0, standardBreakfastDays - eatenB);
    const missedL = Math.max(0, standardLunchDays - eatenL);
    const missedD = Math.max(0, standardDinnerDays - eatenD);
    const actualDays = Math.round(((eatenB + eatenL + eatenD) / 3) * 10) / 10;

    totalAllEatenB += eatenB;
    totalAllEatenL += eatenL;
    totalAllEatenD += eatenD;
    totalAllMissedB += missedB;
    totalAllMissedL += missedL;
    totalAllMissedD += missedD;
    totalAllActualDays += actualDays;

    rData.push(eatenB, eatenL, eatenD, missedB, missedL, missedD, actualDays);
    rows.push(rData);
  });

  // 7. Hàng TỔNG CỘNG
  const totalRow: any[] = ['', 'TỔNG CỘNG'];
  monthDays.forEach((_, dIdx) => {
    totalRow.push(
      dayTotals[dIdx].breakfast || '',
      dayTotals[dIdx].lunch || '',
      dayTotals[dIdx].dinner || ''
    );
  });
  totalRow.push(
    totalAllEatenB,
    totalAllEatenL,
    totalAllEatenD,
    totalAllMissedB,
    totalAllMissedL,
    totalAllMissedD,
    Math.round(totalAllActualDays * 10) / 10
  );
  rows.push(totalRow);

  // 8. Hàng ghi chú định mức
  rows.push([]);
  rows.push([
    `* Ghi chú: Định mức số ngày ăn chuẩn trong tháng: Sáng = ${standardBreakfastDays} ngày, Trưa = ${standardLunchDays} ngày, Tối = ${standardDinnerDays} ngày.`,
  ]);
  rows.push([
    `* Dấu (+) là học sinh có ăn. Để trống là học sinh nghỉ ăn. Ngày ăn thực = Tổng số bữa ăn thực tế quy đổi.`,
  ]);
  rows.push([]);

  // 9. Khối chữ ký xác nhận
  const signColGVCN = 1;
  const signColBGH = 2 + monthDays.length * 3; // Căn về phía bên phải

  const now = new Date();
  const dateSignText = `Xa Dung, ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;

  const signRow1: any[] = [];
  signRow1[signColBGH] = dateSignText;
  rows.push(signRow1);

  const signRow2: any[] = [];
  signRow2[signColGVCN] = 'NGƯỜI LẬP BIỂU (GVCN)';
  signRow2[signColBGH] = 'HIỆU TRƯỞNG / BAN GIÁM HIỆU';
  rows.push(signRow2);

  const signRow3: any[] = [];
  signRow3[signColGVCN] = '(Ký và ghi rõ họ tên)';
  signRow3[signColBGH] = '(Ký, đóng dấu)';
  rows.push(signRow3);

  // Khoảng trống ký tên
  rows.push([]);
  rows.push([]);
  rows.push([]);

  const signRow4: any[] = [];
  signRow4[signColGVCN] = teacherName;
  signRow4[signColBGH] = principalName;
  rows.push(signRow4);

  // Tạo Worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Cấu hình các ô merge (trộn ô)
  const headerStartRow = 6; // Hàng thứ 7 (0-indexed = 6)
  const merges: XLSX.Range[] = [
    // Tiêu đề chính
    { s: { r: 3, c: 5 }, e: { r: 3, c: 22 } },
    { s: { r: 4, c: 5 }, e: { r: 4, c: 22 } },

    // STT & Họ và tên (merge 3 hàng header)
    { s: { r: headerStartRow, c: 0 }, e: { r: headerStartRow + 2, c: 0 } },
    { s: { r: headerStartRow, c: 1 }, e: { r: headerStartRow + 2, c: 1 } },
  ];

  // Merge từng ngày (mỗi ngày 3 cột S, T, T)
  let cIdx = 2;
  monthDays.forEach(() => {
    // Merge Ngày
    merges.push({ s: { r: headerStartRow, c: cIdx }, e: { r: headerStartRow, c: cIdx + 2 } });
    // Merge Thứ
    merges.push({ s: { r: headerStartRow + 1, c: cIdx }, e: { r: headerStartRow + 1, c: cIdx + 2 } });
    cIdx += 3;
  });

  // Merge nhóm tổng kết
  // Số ngày ăn trong tháng (6 cột)
  merges.push({ s: { r: headerStartRow, c: cIdx }, e: { r: headerStartRow, c: cIdx + 5 } });
  // Số ngày báo ăn (3 cột)
  merges.push({ s: { r: headerStartRow + 1, c: cIdx }, e: { r: headerStartRow + 1, c: cIdx + 2 } });
  // Số ngày không báo ăn (3 cột)
  merges.push({ s: { r: headerStartRow + 1, c: cIdx + 3 }, e: { r: headerStartRow + 1, c: cIdx + 5 } });
  // Ngày ăn thực (3 hàng)
  merges.push({ s: { r: headerStartRow, c: cIdx + 6 }, e: { r: headerStartRow + 2, c: cIdx + 6 } });

  ws['!merges'] = merges;

  // Cấu hình độ rộng các cột (Column widths)
  const colWidths: XLSX.ColInfo[] = [
    { wch: 5 }, // STT
    { wch: 22 }, // Họ và tên
  ];

  // Mỗi ngày: 3 cột S, T, T (độ rộng 3.5 ký tự mỗi cột)
  monthDays.forEach(() => {
    colWidths.push({ wch: 3.5 }, { wch: 3.5 }, { wch: 3.5 });
  });

  // Các cột tổng hợp
  colWidths.push(
    { wch: 4.5 }, // Báo ăn S
    { wch: 4.5 }, // Báo ăn T
    { wch: 4.5 }, // Báo ăn T
    { wch: 4.5 }, // Không báo ăn S
    { wch: 4.5 }, // Không báo ăn T
    { wch: 4.5 }, // Không báo ăn T
    { wch: 11 } // Ngày ăn thực
  );

  ws['!cols'] = colWidths;

  // Tạo Workbook và xuất file
  const wb = XLSX.utils.book_new();
  const sheetName = `SoChamCom_T${monthNum}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const cleanClassName = className.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `So_Cham_Com_Lop_${cleanClassName}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return true;
}
