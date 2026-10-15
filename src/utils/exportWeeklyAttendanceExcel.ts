import ExcelJS from 'exceljs';
import { SchoolSettings, SchoolWeeklyAggregate, ClassWeeklySummary, CampusWeeklySummary } from '../types';
import { formatDateVN } from './schoolWeeks';

interface BaseWeeklyExportOptions {
  settings: SchoolSettings;
  locationName?: string;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

/**
 * 1. Xuất Excel Báo cáo tuần TỔNG HỢP TOÀN TRƯỜNG
 */
export async function exportAttendanceWeeklySchoolExcel(
  aggregate: SchoolWeeklyAggregate,
  settings: SchoolSettings
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  const ws = wb.addWorksheet(`BaoCaoTuan_${aggregate.weekNumber}`, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  // Setup columns
  ws.columns = [
    { key: 'stt', width: 6 },
    { key: 'class', width: 10 },
    { key: 'campus', width: 18 },
    { key: 'teacher', width: 22 },
    { key: 'enrollment', width: 10 },
    // 5 ngày Thứ 2 -> Thứ 6 (Có mặt / Vắng)
    { key: 't2_pre', width: 9 },
    { key: 't2_abs', width: 8 },
    { key: 't3_pre', width: 9 },
    { key: 't3_abs', width: 8 },
    { key: 't4_pre', width: 9 },
    { key: 't4_abs', width: 8 },
    { key: 't5_pre', width: 9 },
    { key: 't5_abs', width: 8 },
    { key: 't6_pre', width: 9 },
    { key: 't6_abs', width: 8 },
    // Tổng kết
    { key: 'total_abs', width: 10 },
    { key: 'avg_rate', width: 13 },
    { key: 'boarding_meals', width: 14 },
    { key: 'early_reports', width: 12 },
  ];

  let rIdx = 1;

  // Header hành chính: UBND Xã & Quốc hiệu
  ws.mergeCells(`A${rIdx}:E${rIdx}`);
  const subDeptCell = ws.getCell(`A${rIdx}`);
  subDeptCell.value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
  subDeptCell.font = { name: 'Times New Roman', size: 10, bold: true };
  subDeptCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(`L${rIdx}:S${rIdx}`);
  const nationCell1 = ws.getCell(`L${rIdx}`);
  nationCell1.value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  nationCell1.font = { name: 'Times New Roman', size: 10, bold: true };
  nationCell1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 18;
  rIdx++;

  // Tên Trường & Tiêu ngữ
  ws.mergeCells(`A${rIdx}:E${rIdx}`);
  const schoolCell = ws.getCell(`A${rIdx}`);
  schoolCell.value = (settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG').toUpperCase();
  schoolCell.font = { name: 'Times New Roman', size: 10, bold: true };
  schoolCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells(`L${rIdx}:S${rIdx}`);
  const nationCell2 = ws.getCell(`L${rIdx}`);
  nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
  nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, italic: true };
  nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 18;
  rIdx++;

  rIdx++; // Dòng trống

  // Tiêu đề báo cáo
  ws.mergeCells(`A${rIdx}:S${rIdx}`);
  const titleCell = ws.getCell(`A${rIdx}`);
  titleCell.value = `BÁO CÁO TỔNG HỢP SĨ SỐ HỌC SINH VÀ CHUYÊN CẦN THEO TUẦN`;
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 24;
  rIdx++;

  // Tuần & Thời gian
  ws.mergeCells(`A${rIdx}:S${rIdx}`);
  const subTitleCell = ws.getCell(`A${rIdx}`);
  subTitleCell.value = `${aggregate.label} - Năm học 2026-2027 (Từ ngày ${formatDateVN(aggregate.startDate)} đến ngày ${formatDateVN(aggregate.endDate)})`;
  subTitleCell.font = { name: 'Times New Roman', size: 11, italic: true, bold: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rIdx).height = 18;
  rIdx += 2;

  // Bảng dữ liệu - Hàng tiêu đề 1 (Header 1)
  const header1Row = rIdx;
  ws.mergeCells(`A${rIdx}:A${rIdx + 1}`);
  ws.getCell(`A${rIdx}`).value = 'STT';

  ws.mergeCells(`B${rIdx}:B${rIdx + 1}`);
  ws.getCell(`B${rIdx}`).value = 'Lớp';

  ws.mergeCells(`C${rIdx}:C${rIdx + 1}`);
  ws.getCell(`C${rIdx}`).value = 'Phân hiệu';

  ws.mergeCells(`D${rIdx}:D${rIdx + 1}`);
  ws.getCell(`D${rIdx}`).value = 'Giáo viên chủ nhiệm';

  ws.mergeCells(`E${rIdx}:E${rIdx + 1}`);
  ws.getCell(`E${rIdx}`).value = 'Sĩ số';

  // 5 ngày
  ws.mergeCells(`F${rIdx}:G${rIdx}`);
  ws.getCell(`F${rIdx}`).value = 'Thứ Hai';

  ws.mergeCells(`H${rIdx}:I${rIdx}`);
  ws.getCell(`H${rIdx}`).value = 'Thứ Ba';

  ws.mergeCells(`J${rIdx}:K${rIdx}`);
  ws.getCell(`J${rIdx}`).value = 'Thứ Tư';

  ws.mergeCells(`L${rIdx}:M${rIdx}`);
  ws.getCell(`L${rIdx}`).value = 'Thứ Năm';

  ws.mergeCells(`N${rIdx}:O${rIdx}`);
  ws.getCell(`N${rIdx}`).value = 'Thứ Sáu';

  ws.mergeCells(`P${rIdx}:P${rIdx + 1}`);
  ws.getCell(`P${rIdx}`).value = 'Tổng vắng';

  ws.mergeCells(`Q${rIdx}:Q${rIdx + 1}`);
  ws.getCell(`Q${rIdx}`).value = 'Tỉ lệ CC (%)';

  ws.mergeCells(`R${rIdx}:R${rIdx + 1}`);
  ws.getCell(`R${rIdx}`).value = 'Suất ăn BT';

  ws.mergeCells(`S${rIdx}:S${rIdx + 1}`);
  ws.getCell(`S${rIdx}`).value = 'Báo sớm';

  rIdx++;

  // Hàng tiêu đề 2 (Sub-headers: Có / Vắng)
  const subCols = ['F', 'H', 'J', 'L', 'N'];
  const absCols = ['G', 'I', 'K', 'M', 'O'];
  subCols.forEach((col) => {
    ws.getCell(`${col}${rIdx}`).value = 'Có';
  });
  absCols.forEach((col) => {
    ws.getCell(`${col}${rIdx}`).value = 'Vắng';
  });

  // Định dạng tiêu đề bảng
  for (let r = header1Row; r <= rIdx; r++) {
    ws.getRow(r).height = 20;
    for (let c = 1; c <= 19; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' }, // Light indigo
      };
      cell.border = thinBorder;
    }
  }
  rIdx++;

  // Điền dữ liệu từng lớp
  aggregate.classesSummary.forEach((cls, i) => {
    const row = ws.getRow(rIdx);
    row.height = 19;

    row.getCell(1).value = i + 1;
    row.getCell(2).value = cls.classItem.class_name;
    row.getCell(3).value = cls.campusName;
    row.getCell(4).value = cls.teacherName;
    row.getCell(5).value = cls.totalEnrollment;

    // 5 ngày
    cls.days.forEach((d, dayIdx) => {
      const preColIdx = 6 + dayIdx * 2;
      const absColIdx = 7 + dayIdx * 2;
      row.getCell(preColIdx).value = d.isReported ? d.present : '-';
      row.getCell(absColIdx).value = d.isReported ? d.absent : '-';
    });

    row.getCell(16).value = cls.sumAbsent;
    row.getCell(17).value = `${cls.avgPresentRate.toFixed(1)}%`;
    row.getCell(18).value = cls.totalBoardingMeals;
    row.getCell(19).value = `${cls.earlyReportsCount}/5`;

    // Căn lề & border
    for (let c = 1; c <= 19; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.border = thinBorder;
      if (c === 4) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (c === 2 || c === 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      // Highlight vắng nếu > 0
      if ([7, 9, 11, 13, 15, 16].includes(c) && typeof cell.value === 'number' && cell.value > 0) {
        cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      }
    }

    rIdx++;
  });

  // Hàng TỔNG CỘNG TOÀN TRƯỜNG
  const totalRow = ws.getRow(rIdx);
  totalRow.height = 22;
  ws.mergeCells(`A${rIdx}:D${rIdx}`);
  totalRow.getCell(1).value = 'TỔNG CỘNG TOÀN TRƯỜNG';
  totalRow.getCell(5).value = aggregate.schoolTotals.totalStudents;

  aggregate.schoolTotals.dayTotals.forEach((dt, dayIdx) => {
    const preColIdx = 6 + dayIdx * 2;
    const absColIdx = 7 + dayIdx * 2;
    totalRow.getCell(preColIdx).value = dt.present;
    totalRow.getCell(absColIdx).value = dt.absent;
  });

  totalRow.getCell(16).value = aggregate.schoolTotals.totalWeeklyAbsent;
  totalRow.getCell(17).value = `${aggregate.schoolTotals.avgPresentRate.toFixed(1)}%`;
  totalRow.getCell(18).value = aggregate.schoolTotals.totalBoardingMeals;
  totalRow.getCell(19).value = `${aggregate.schoolTotals.fullyReportedClassesCount}/${aggregate.schoolTotals.totalClasses}`;

  for (let c = 1; c <= 19; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF3C7' }, // Light amber
    };
  }
  rIdx += 2;

  // Khối chữ ký cuối bảng
  const signRow = rIdx;
  ws.mergeCells(`B${signRow}:E${signRow}`);
  const reporterTitleCell = ws.getCell(`B${signRow}`);
  reporterTitleCell.value = 'NGƯỜI LẬP BIỂU';
  reporterTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
  reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`N${signRow}:S${signRow}`);
  const principalTitleCell = ws.getCell(`N${signRow}`);
  principalTitleCell.value = 'HIỆU TRƯỞNG';
  principalTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
  principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx++;

  ws.mergeCells(`B${rIdx}:E${rIdx}`);
  ws.getCell(`B${rIdx}`).value = '(Ký, ghi rõ họ tên)';
  ws.getCell(`B${rIdx}`).font = { name: 'Times New Roman', size: 10, italic: true };
  ws.getCell(`B${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`N${rIdx}:S${rIdx}`);
  ws.getCell(`N${rIdx}`).value = '(Ký, đóng dấu, ghi rõ họ tên)';
  ws.getCell(`N${rIdx}`).font = { name: 'Times New Roman', size: 10, italic: true };
  ws.getCell(`N${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx += 4;

  ws.mergeCells(`B${rIdx}:E${rIdx}`);
  ws.getCell(`B${rIdx}`).value = settings?.reporter_name || 'Vũ Văn Hùng';
  ws.getCell(`B${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`B${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`N${rIdx}:S${rIdx}`);
  ws.getCell(`N${rIdx}`).value = settings?.principal_name || 'Vũ Văn Hùng';
  ws.getCell(`N${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`N${rIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

  // Trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_cao_si_so_Tuan_${aggregate.weekNumber}_Toan_truong.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 2. Xuất Excel Báo cáo tuần TỪNG PHÂN HIỆU
 */
export async function exportAttendanceWeeklyCampusExcel(
  campusSummary: CampusWeeklySummary,
  aggregate: SchoolWeeklyAggregate,
  settings: SchoolSettings
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Tuan_${aggregate.weekNumber}_${campusSummary.campus.name.replace(/\s+/g, '_')}`, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
  });

  ws.columns = [
    { key: 'stt', width: 6 },
    { key: 'class', width: 12 },
    { key: 'teacher', width: 24 },
    { key: 'enrollment', width: 12 },
    { key: 't2_pre', width: 9 },
    { key: 't2_abs', width: 8 },
    { key: 't3_pre', width: 9 },
    { key: 't3_abs', width: 8 },
    { key: 't4_pre', width: 9 },
    { key: 't4_abs', width: 8 },
    { key: 't5_pre', width: 9 },
    { key: 't5_abs', width: 8 },
    { key: 't6_pre', width: 9 },
    { key: 't6_abs', width: 8 },
    { key: 'total_abs', width: 12 },
    { key: 'avg_rate', width: 14 },
    { key: 'boarding_meals', width: 14 },
  ];

  let rIdx = 1;

  // Header
  ws.mergeCells(`A${rIdx}:D${rIdx}`);
  ws.getCell(`A${rIdx}`).value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
  ws.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };

  ws.mergeCells(`K${rIdx}:Q${rIdx}`);
  ws.getCell(`K${rIdx}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  ws.getCell(`K${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
  ws.getCell(`K${rIdx}`).alignment = { horizontal: 'center' };
  rIdx++;

  ws.mergeCells(`A${rIdx}:D${rIdx}`);
  ws.getCell(`A${rIdx}`).value = (settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG').toUpperCase();
  ws.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };

  ws.mergeCells(`K${rIdx}:Q${rIdx}`);
  ws.getCell(`K${rIdx}`).value = 'Độc lập - Tự do - Hạnh phúc';
  ws.getCell(`K${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true, italic: true };
  ws.getCell(`K${rIdx}`).alignment = { horizontal: 'center' };
  rIdx += 2;

  // Title
  ws.mergeCells(`A${rIdx}:Q${rIdx}`);
  const titleCell = ws.getCell(`A${rIdx}`);
  titleCell.value = `BÁO CÁO SĨ SỐ THEO TUẦN - PHÂN HIỆU: ${campusSummary.campus.name.toUpperCase()}`;
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx++;

  ws.mergeCells(`A${rIdx}:Q${rIdx}`);
  const subTitleCell = ws.getCell(`A${rIdx}`);
  subTitleCell.value = `${aggregate.label} (Từ ngày ${formatDateVN(aggregate.startDate)} đến ngày ${formatDateVN(aggregate.endDate)})`;
  subTitleCell.font = { name: 'Times New Roman', size: 11, italic: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx += 2;

  // Table header
  const header1Row = rIdx;
  ws.mergeCells(`A${rIdx}:A${rIdx + 1}`);
  ws.getCell(`A${rIdx}`).value = 'STT';
  ws.mergeCells(`B${rIdx}:B${rIdx + 1}`);
  ws.getCell(`B${rIdx}`).value = 'Lớp';
  ws.mergeCells(`C${rIdx}:C${rIdx + 1}`);
  ws.getCell(`C${rIdx}`).value = 'GVCN';
  ws.mergeCells(`D${rIdx}:D${rIdx + 1}`);
  ws.getCell(`D${rIdx}`).value = 'Sĩ số';

  ws.mergeCells(`E${rIdx}:F${rIdx}`);
  ws.getCell(`E${rIdx}`).value = 'Thứ Hai';
  ws.mergeCells(`G${rIdx}:H${rIdx}`);
  ws.getCell(`G${rIdx}`).value = 'Thứ Ba';
  ws.mergeCells(`I${rIdx}:J${rIdx}`);
  ws.getCell(`I${rIdx}`).value = 'Thứ Tư';
  ws.mergeCells(`K${rIdx}:L${rIdx}`);
  ws.getCell(`K${rIdx}`).value = 'Thứ Năm';
  ws.mergeCells(`M${rIdx}:N${rIdx}`);
  ws.getCell(`M${rIdx}`).value = 'Thứ Sáu';

  ws.mergeCells(`O${rIdx}:O${rIdx + 1}`);
  ws.getCell(`O${rIdx}`).value = 'Tổng vắng';
  ws.mergeCells(`P${rIdx}:P${rIdx + 1}`);
  ws.getCell(`P${rIdx}`).value = 'Tỉ lệ CC (%)';
  ws.mergeCells(`Q${rIdx}:Q${rIdx + 1}`);
  ws.getCell(`Q${rIdx}`).value = 'Suất ăn BT';
  rIdx++;

  ['E', 'G', 'I', 'K', 'M'].forEach((col) => {
    ws.getCell(`${col}${rIdx}`).value = 'Có';
  });
  ['F', 'H', 'J', 'L', 'N'].forEach((col) => {
    ws.getCell(`${col}${rIdx}`).value = 'Vắng';
  });

  for (let r = header1Row; r <= rIdx; r++) {
    for (let c = 1; c <= 17; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light emerald
      cell.border = thinBorder;
    }
  }
  rIdx++;

  campusSummary.classes.forEach((cls, i) => {
    const row = ws.getRow(rIdx);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = cls.classItem.class_name;
    row.getCell(3).value = cls.teacherName;
    row.getCell(4).value = cls.totalEnrollment;

    cls.days.forEach((d, dayIdx) => {
      row.getCell(5 + dayIdx * 2).value = d.isReported ? d.present : '-';
      row.getCell(6 + dayIdx * 2).value = d.isReported ? d.absent : '-';
    });

    row.getCell(15).value = cls.sumAbsent;
    row.getCell(16).value = `${cls.avgPresentRate.toFixed(1)}%`;
    row.getCell(17).value = cls.totalBoardingMeals;

    for (let c = 1; c <= 17; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' };
    }
    rIdx++;
  });

  // Total
  const totalRow = ws.getRow(rIdx);
  ws.mergeCells(`A${rIdx}:C${rIdx}`);
  totalRow.getCell(1).value = `TỔNG CỘNG PHÂN HIỆU (${campusSummary.totalClasses} lớp)`;
  totalRow.getCell(4).value = campusSummary.totalStudents;

  campusSummary.dayAverages.forEach((da, dayIdx) => {
    totalRow.getCell(5 + dayIdx * 2).value = da.present;
    totalRow.getCell(6 + dayIdx * 2).value = da.absent;
  });

  totalRow.getCell(15).value = campusSummary.totalWeeklyAbsent;
  totalRow.getCell(16).value = `${campusSummary.avgPresentRate.toFixed(1)}%`;
  totalRow.getCell(17).value = campusSummary.totalWeeklyBoardingMeals;

  for (let c = 1; c <= 17; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  }
  rIdx += 2;

  // Signatures
  ws.mergeCells(`B${rIdx}:D${rIdx}`);
  ws.getCell(`B${rIdx}`).value = 'PHỤ TRÁCH PHÂN HIỆU';
  ws.getCell(`B${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`B${rIdx}`).alignment = { horizontal: 'center' };

  ws.mergeCells(`N${rIdx}:Q${rIdx}`);
  ws.getCell(`N${rIdx}`).value = 'HIỆU TRƯỞNG';
  ws.getCell(`N${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`N${rIdx}`).alignment = { horizontal: 'center' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_cao_si_so_Tuan_${aggregate.weekNumber}_${campusSummary.campus.name.replace(/\s+/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 3. Xuất Excel Báo cáo tuần TỪNG LỚP
 */
export async function exportAttendanceWeeklyClassExcel(
  classSummary: ClassWeeklySummary,
  weekLabel: string,
  settings: SchoolSettings
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phần mềm Quản lý Sĩ số';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Lop_${classSummary.classItem.class_name}`, {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
  });

  ws.columns = [
    { key: 'col1', width: 6 },
    { key: 'col2', width: 22 },
    { key: 'col3', width: 14 },
    { key: 'col4', width: 14 },
    { key: 'col5', width: 14 },
    { key: 'col6', width: 16 },
    { key: 'col7', width: 28 },
  ];

  let rIdx = 1;

  // Header
  ws.mergeCells(`A${rIdx}:C${rIdx}`);
  ws.getCell(`A${rIdx}`).value = (settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG').toUpperCase();
  ws.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };

  ws.mergeCells(`E${rIdx}:G${rIdx}`);
  ws.getCell(`E${rIdx}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  ws.getCell(`E${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true };
  ws.getCell(`E${rIdx}`).alignment = { horizontal: 'center' };
  rIdx++;

  ws.mergeCells(`A${rIdx}:C${rIdx}`);
  ws.getCell(`A${rIdx}`).value = `Lớp: ${classSummary.classItem.class_name} - Phân hiệu: ${classSummary.campusName}`;
  ws.getCell(`A${rIdx}`).font = { name: 'Times New Roman', size: 10, italic: true };

  ws.mergeCells(`E${rIdx}:G${rIdx}`);
  ws.getCell(`E${rIdx}`).value = 'Độc lập - Tự do - Hạnh phúc';
  ws.getCell(`E${rIdx}`).font = { name: 'Times New Roman', size: 10, bold: true, italic: true };
  ws.getCell(`E${rIdx}`).alignment = { horizontal: 'center' };
  rIdx += 2;

  // Title
  ws.mergeCells(`A${rIdx}:G${rIdx}`);
  const titleCell = ws.getCell(`A${rIdx}`);
  titleCell.value = `BÁO CÁO THEO DÕI SĨ SỐ VÀ CHUYÊN CẦN TUẦN CỦA LỚP ${classSummary.classItem.class_name}`;
  titleCell.font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx++;

  ws.mergeCells(`A${rIdx}:G${rIdx}`);
  const subTitleCell = ws.getCell(`A${rIdx}`);
  subTitleCell.value = `${weekLabel} - GVCN: ${classSummary.teacherName} (Sĩ số: ${classSummary.totalEnrollment} HS)`;
  subTitleCell.font = { name: 'Times New Roman', size: 11, italic: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  rIdx += 2;

  // Table 1: Theo dõi các ngày trong tuần
  const h1 = rIdx;
  ws.getCell(`A${rIdx}`).value = 'STT';
  ws.getCell(`B${rIdx}`).value = 'Buổi học';
  ws.getCell(`C${rIdx}`).value = 'Sĩ số';
  ws.getCell(`D${rIdx}`).value = 'Có mặt';
  ws.getCell(`E${rIdx}`).value = 'Vắng mặt';
  ws.getCell(`F${rIdx}`).value = 'Tỉ lệ CC (%)';
  ws.getCell(`G${rIdx}`).value = 'Suất ăn bán trú';

  for (let c = 1; c <= 7; c++) {
    const cell = ws.getRow(rIdx).getCell(c);
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    cell.border = thinBorder;
  }
  rIdx++;

  classSummary.days.forEach((d, idx) => {
    const row = ws.getRow(rIdx);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = d.dayLabel;
    row.getCell(3).value = d.isReported ? d.total : '-';
    row.getCell(4).value = d.isReported ? d.present : '-';
    row.getCell(5).value = d.isReported ? d.absent : '-';
    row.getCell(6).value = d.isReported ? `${d.rate.toFixed(1)}%` : '-';
    row.getCell(7).value = d.isReported ? `${d.boardingMeals} suất` : '-';

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (c === 5 && typeof cell.value === 'number' && cell.value > 0) {
        cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      }
    }
    rIdx++;
  });

  // Tổng kết lớp
  const tRow = ws.getRow(rIdx);
  ws.mergeCells(`A${rIdx}:B${rIdx}`);
  tRow.getCell(1).value = 'TỔNG CỘNG / TRUNG BÌNH';
  tRow.getCell(3).value = classSummary.totalEnrollment;
  tRow.getCell(4).value = classSummary.sumPresent;
  tRow.getCell(5).value = classSummary.sumAbsent;
  tRow.getCell(6).value = `${classSummary.avgPresentRate.toFixed(1)}%`;
  tRow.getCell(7).value = `${classSummary.totalBoardingMeals} suất`;

  for (let c = 1; c <= 7; c++) {
    const cell = tRow.getCell(c);
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  }
  rIdx += 2;

  // Table 2: Chi tiết danh sách học sinh vắng trong tuần
  if (classSummary.absentStudentsAllWeek.length > 0) {
    ws.mergeCells(`A${rIdx}:G${rIdx}`);
    const absentTitle = ws.getCell(`A${rIdx}`);
    absentTitle.value = 'DANH SÁCH CHI TIẾT HỌC SINH NGHỈ HỌC TRONG TUẦN';
    absentTitle.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF991B1B' } };
    absentTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    rIdx++;

    ws.getCell(`A${rIdx}`).value = 'STT';
    ws.getCell(`B${rIdx}`).value = 'Họ và tên học sinh';
    ws.getCell(`C${rIdx}`).value = 'Ngày nghỉ';
    ws.mergeCells(`D${rIdx}:E${rIdx}`);
    ws.getCell(`D${rIdx}`).value = 'Lý do nghỉ';
    ws.mergeCells(`F${rIdx}:G${rIdx}`);
    ws.getCell(`F${rIdx}`).value = 'Địa chỉ thôn / bản';

    for (let c = 1; c <= 7; c++) {
      const cell = ws.getRow(rIdx).getCell(c);
      cell.font = { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      cell.border = thinBorder;
    }
    rIdx++;

    classSummary.absentStudentsAllWeek.forEach((st, i) => {
      const row = ws.getRow(rIdx);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = st.studentName;
      row.getCell(3).value = st.dayLabel;
      ws.mergeCells(`D${rIdx}:E${rIdx}`);
      row.getCell(4).value = st.reason || 'Nghỉ học';
      ws.mergeCells(`F${rIdx}:G${rIdx}`);
      row.getCell(6).value = st.address || '-';

      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Times New Roman', size: 10 };
        cell.border = thinBorder;
        cell.alignment = { horizontal: c === 2 || c === 4 || c === 6 ? 'left' : 'center', vertical: 'middle' };
      }
      rIdx++;
    });
  }

  rIdx += 2;
  // Signatures
  ws.mergeCells(`B${rIdx}:C${rIdx}`);
  ws.getCell(`B${rIdx}`).value = 'GIÁO VIÊN CHỦ NHIỆM';
  ws.getCell(`B${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`B${rIdx}`).alignment = { horizontal: 'center' };

  ws.mergeCells(`F${rIdx}:G${rIdx}`);
  ws.getCell(`F${rIdx}`).value = 'HIỆU TRƯỞNG';
  ws.getCell(`F${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`F${rIdx}`).alignment = { horizontal: 'center' };
  rIdx += 4;

  ws.mergeCells(`B${rIdx}:C${rIdx}`);
  ws.getCell(`B${rIdx}`).value = classSummary.teacherName;
  ws.getCell(`B${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`B${rIdx}`).alignment = { horizontal: 'center' };

  ws.mergeCells(`F${rIdx}:G${rIdx}`);
  ws.getCell(`F${rIdx}`).value = settings?.principal_name || 'Vũ Văn Hùng';
  ws.getCell(`F${rIdx}`).font = { name: 'Times New Roman', size: 11, bold: true };
  ws.getCell(`F${rIdx}`).alignment = { horizontal: 'center' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao_cao_si_so_lop_${classSummary.classItem.class_name}_Tuan.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
