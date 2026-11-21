import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildBoardingWorksheet } from '../src/utils/exportBoardingExcel';

function makeStudents(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'student-' + i, full_name: 'Học sinh bán trú số ' + (i + 1),
    class_id: '6A1', isBoarding: true,
  }));
}

test('boarding print retains every student, meal column and monthly summary', async () => {
  const students = makeStudents(45);
  const monthDays = Array.from({ length: 30 }, (_, i) => ({
    dayNum: i + 1, dateStr: '2026-11-' + String(i + 1).padStart(2, '0'),
    dayOfWeekShort: '2', isMealDay: true,
    allowedMeals: { breakfast: true, lunch: true, dinner: true },
  }));
  const context = {
    schoolName: 'TRƯỜNG PTDTBT THCS XA DUNG', campusName: 'PHÌ NHỪ',
    className: '6A1', monthNum: 11, yearNum: 2026, daysInMonth: 30,
    monthDays, boardingStudents: students, matrix: {},
    standardBreakfastDays: 15, standardLunchDays: 15, standardDinnerDays: 12,
    teacherName: 'Giáo viên chủ nhiệm', principalName: 'Hiệu trưởng',
  };
  const wb = new ExcelJS.Workbook();
  buildBoardingWorksheet(wb, {
    sheetName: 'Trang 2', pageSubtitle: 'Từ ngày 16 đến 30',
    startDay: 16, endDay: 30, includeMonthSummary: true,
    signDateText: 'Xa Dung, ngày 30 tháng 11 năm 2026',
  }, context as any);
  const ws = wb.getWorksheet('Trang 2')!;
  // 2 identity columns + 15 days x 3 meals + 6 monthly summary columns.
  assert.equal(ws.columnCount, 53);
  assert.equal(ws.getCell('B54').value, 'Học sinh bán trú số 45');
  assert.equal(ws.getCell('BA7').value, 'Số ngày ăn trong tháng');
  assert.equal(ws.pageSetup.printArea, 'A1:BA63');
  assert.equal(ws.pageSetup.fitToWidth, 1);
  assert.equal(ws.pageSetup.fitToHeight, 0);
  assert.equal(ws.pageSetup.orientation, 'landscape');
  assert.equal(ws.pageSetup.paperSize, 8);
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(await wb.xlsx.writeBuffer() as any);
  const printed = copy.getWorksheet('Trang 2')!;
  assert.equal(printed.pageSetup.printArea, ws.pageSetup.printArea);
  assert.equal(printed.getCell('B54').value, 'Học sinh bán trú số 45');
  assert.equal(printed.getCell('BA7').value, 'Số ngày ăn trong tháng');
});

test('32 boarding students use expanded rows and one-page vertical fit', () => {
  const students = makeStudents(32);
  const monthDays = Array.from({ length: 30 }, (_, i) => ({
    dayNum: i + 1, dateStr: '2026-11-' + String(i + 1).padStart(2, '0'),
    dayOfWeekShort: '2', isMealDay: true,
    allowedMeals: { breakfast: true, lunch: true, dinner: true },
  }));
  const wb = new ExcelJS.Workbook();
  buildBoardingWorksheet(wb, {
    sheetName: 'Trang 1', pageSubtitle: 'Ngày 01-15', startDay: 1,
    endDay: 15, includeMonthSummary: false, includeSignature: false,
    signDateText: 'Xa Dung, ngày 15 tháng 11 năm 2026',
  }, {
    schoolName: 'TRƯỜNG PTDTBT THCS XA DUNG', campusName: 'PHÌ NHỪ',
    className: '6A1', monthNum: 11, yearNum: 2026, daysInMonth: 30,
    monthDays, boardingStudents: students, matrix: {},
    standardBreakfastDays: 15, standardLunchDays: 15, standardDinnerDays: 12,
    teacherName: 'Giáo viên chủ nhiệm', principalName: 'Hiệu trưởng',
  } as any);
  const ws = wb.getWorksheet('Trang 1')!;
  assert.equal(ws.getRow(10).height, 21);
  assert.equal(ws.pageSetup.fitToWidth, 1);
  assert.equal(ws.pageSetup.fitToHeight, 1);
  assert.equal(ws.getCell('B41').value, 'Học sinh bán trú số 32');
  assert.equal(ws.pageSetup.printArea, 'A1:AU42');
  assert.ok(ws.getColumn(3).width! >= 3.7);
});
