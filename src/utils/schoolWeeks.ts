import { SchoolWeekInfo } from '../types';

export const DEFAULT_WEEK1_START_DATE = '2026-09-07'; // Thứ Hai, ngày 07/09/2026
export const DEFAULT_SCHOOL_DAYS_PER_WEEK = 5; // Thứ 2 đến hết sáng Thứ 6 (5 ngày học tiêu chuẩn)
export const DEFAULT_EARLY_REPORT_DEADLINE = '07:30'; // Mặc định báo cáo trước 07:30 sáng
export const DEFAULT_EARLY_REPORT_BONUS_PER_DAY = 0.5; // +0.5 điểm mỗi ngày báo sớm
export const DEFAULT_EARLY_REPORT_MAX_BONUS = 2.5; // Tối đa +2.5 điểm/tuần (5 ngày x 0.5)

/**
 * Trích xuất [năm, tháng (1-12), ngày (1-31)] từ chuỗi YYYY-MM-DD
 */
export function parseDateParts(dateStr: string): [number, number, number] {
  const parts = (dateStr || '').split('-').map(Number);
  return [parts[0] || 2026, parts[1] || 9, parts[2] || 7];
}

/**
 * Định dạng YYYY-MM-DD từ năm, tháng, ngày an toàn không lệch múi giờ
 */
export function formatDateYMD(year: number, month: number, day: number): string {
  const mm = month < 10 ? `0${month}` : `${month}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Cộng/trừ số ngày đối với chuỗi YYYY-MM-DD an toàn tuyệt đối theo lịch Việt Nam
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = parseDateParts(dateStr);
  const dt = new Date(y, m - 1, d, 12, 0, 0); // 12h trưa tránh mọi rủi ro DST và midnight UTC offset
  dt.setDate(dt.getDate() + days);
  return formatDateYMD(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/**
 * Tính khoảng cách số ngày giữa 2 chuỗi ngày (d2 - d1)
 */
export function getDaysDifference(d1Str: string, d2Str: string): number {
  const [y1, m1, day1] = parseDateParts(d1Str);
  const [y2, m2, day2] = parseDateParts(d2Str);
  const dt1 = new Date(y1, m1 - 1, day1, 12, 0, 0);
  const dt2 = new Date(y2, m2 - 1, day2, 12, 0, 0);
  return Math.round((dt2.getTime() - dt1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Lấy ngày hôm nay dạng YYYY-MM-DD theo giờ địa phương (Việt Nam)
 */
export function getTodayDateStr(): string {
  const d = new Date();
  return formatDateYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY
 */
export function formatDateVN(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Format date to short day/month e.g. "07/09"
 */
export function formatDayMonthVN(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

/**
 * Lấy thứ trong tuần dạng tiếng Việt
 */
export function getDayOfWeekNameVN(dateStr: string): string {
  const [y, m, d] = parseDateParts(dateStr);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const day = dt.getDay();
  switch (day) {
    case 0:
      return 'Chủ nhật';
    case 1:
      return 'Thứ Hai';
    case 2:
      return 'Thứ Ba';
    case 3:
      return 'Thứ Tư';
    case 4:
      return 'Thứ Năm';
    case 5:
      return 'Thứ Sáu';
    case 6:
      return 'Thứ Bảy';
    default:
      return '';
  }
}

/**
 * Lấy thông tin tuần học theo số thứ tự tuần (Tuần 1 bắt đầu từ 07/09/2026)
 * Theo lịch Việt Nam: Một tuần học bắt đầu từ Thứ Hai đến hết sáng Thứ Sáu (5 ngày học)
 */
export function getSchoolWeekInfo(
  weekNumber: number,
  week1StartDate: string = DEFAULT_WEEK1_START_DATE
): SchoolWeekInfo {
  const safeWeekNum = Math.max(1, Math.min(weekNumber, 45));
  
  // Thứ 2 của tuần được tính: Ngày bắt đầu Tuần 1 (07/09/2026) + (safeWeekNum - 1) * 7 ngày
  const mondayYMD = addDaysToDateStr(week1StartDate, (safeWeekNum - 1) * 7);

  // Thứ 6 của tuần học: Thứ 2 + 4 ngày
  const fridayYMD = addDaysToDateStr(mondayYMD, 4);

  const mStr = formatDayMonthVN(mondayYMD);
  const fStr = formatDateVN(fridayYMD);

  return {
    weekNumber: safeWeekNum,
    startDate: mondayYMD,
    endDate: fridayYMD,
    label: `Tuần ${safeWeekNum} (Thứ 2 ${mStr} - Thứ 6 ${fStr})`,
  };
}

/**
 * Xác định tuần học tương ứng với một ngày bất kỳ theo lịch Việt Nam
 * (Tuần tính từ Thứ Hai đến Chủ Nhật, trong đó học từ Thứ Hai đến Thứ Sáu)
 */
export function getSchoolWeekFromDate(
  dateStr: string,
  week1StartDate: string = DEFAULT_WEEK1_START_DATE
): SchoolWeekInfo {
  const [y, m, d] = parseDateParts(dateStr);
  const target = new Date(y, m - 1, d, 12, 0, 0);
  const targetDay = target.getDay(); // 0 = Sun, 1 = Mon ...
  
  // Tìm ngày Thứ Hai của tuần chứa ngày target (lịch Việt Nam: Thứ 2 là ngày đầu tuần)
  const diffToMonday = targetDay === 0 ? -6 : 1 - targetDay;
  const targetMonday = addDaysToDateStr(dateStr, diffToMonday);

  // Tính số ngày chênh lệch giữa Thứ Hai tuần này và Thứ Hai Tuần 1 (07/09/2026)
  const diffDays = getDaysDifference(week1StartDate, targetMonday);
  const calculatedWeek = Math.floor(diffDays / 7) + 1;

  const weekNum = calculatedWeek < 1 ? 1 : calculatedWeek > 37 ? 37 : calculatedWeek;
  const weekInfo = getSchoolWeekInfo(weekNum, week1StartDate);

  // Thuộc tuần hiện tại nếu ngày đó nằm từ Thứ Hai đến hết Chủ Nhật của tuần
  const sundayOfThisWeek = addDaysToDateStr(weekInfo.startDate, 6);
  const isCurrent = dateStr >= weekInfo.startDate && dateStr <= sundayOfThisWeek;

  return {
    ...weekInfo,
    isCurrent,
  };
}

/**
 * Tạo danh sách toàn bộ các tuần học trong năm học (37 tuần tiêu chuẩn của Bộ GD&ĐT Việt Nam)
 * Bắt đầu từ Tuần 1 (07/09/2026), mỗi tuần bắt đầu từ Thứ Hai đến hết Thứ Sáu.
 */
export function generateSchoolYearWeeks(
  week1StartDate: string = DEFAULT_WEEK1_START_DATE,
  totalWeeks: number = 37,
  referenceDate?: string
): SchoolWeekInfo[] {
  const todayStr = referenceDate || getTodayDateStr();
  const weeks: SchoolWeekInfo[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const info = getSchoolWeekInfo(w, week1StartDate);
    const sundayOfThisWeek = addDaysToDateStr(info.startDate, 6);
    const isCurrent = todayStr >= info.startDate && todayStr <= sundayOfThisWeek;
    weeks.push({
      ...info,
      isCurrent,
    });
  }

  return weeks;
}

/**
 * Kiểm tra xem một báo cáo có được gửi sớm hay không (trước giờ quy định, vd 07:30)
 */
export function checkIsReportEarly(
  report?: { created_at?: string; report_date?: string; reported_time?: string },
  deadlineStr: string = DEFAULT_EARLY_REPORT_DEADLINE
): { isEarly: boolean; timeStr: string; minutesEarly: number } {
  if (!report) {
    return { isEarly: false, timeStr: '--:--', minutesEarly: 0 };
  }

  let hours = 0;
  let minutes = 0;
  let hasValidTime = false;

  // 1. Nếu có trường reported_time đã lưu trước đó (HH:mm)
  if (report.reported_time && report.reported_time.includes(':')) {
    const [h, m] = report.reported_time.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      hours = h;
      minutes = m;
      hasValidTime = true;
    }
  }

  // 2. Nếu chưa có, phân tích từ created_at
  if (!hasValidTime && report.created_at) {
    const d = new Date(report.created_at);
    if (!isNaN(d.getTime())) {
      hours = d.getHours();
      minutes = d.getMinutes();
      hasValidTime = true;
    }
  }

  if (!hasValidTime) {
    return { isEarly: false, timeStr: '--:--', minutesEarly: 0 };
  }

  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const [deadH, deadM] = (deadlineStr || DEFAULT_EARLY_REPORT_DEADLINE).split(':').map(Number);
  const deadlineMin = (deadH || 7) * 60 + (deadM || 30);
  const reportMin = hours * 60 + minutes;

  const isEarly = reportMin <= deadlineMin;
  const minutesEarly = isEarly ? deadlineMin - reportMin : 0;

  return { isEarly, timeStr, minutesEarly };
}

