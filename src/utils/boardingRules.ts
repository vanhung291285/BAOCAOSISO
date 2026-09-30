import { BoardingMealRecord, Student } from '../types';

export interface DayMealSchedule {
  dayOfWeek: number; // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
  dayName: string; // "Thứ Hai", "Thứ Sáu", ...
  shortName: string; // "T2", "T6", ...
  isMealDay: boolean; // Có tổ chức ăn bán trú không
  breakfastAllowed: boolean; // Có phục vụ ăn sáng
  lunchAllowed: boolean; // Có phục vụ ăn trưa
  dinnerAllowed: boolean; // Có phục vụ ăn tối
  note: string;
}

/**
 * Quy định ăn bán trú trường PTDTBT THCS Xa Dung:
 * - Thứ 2, 3, 4, 5: Ăn Sáng, Ăn Trưa, Ăn Tối (3 bữa)
 * - Thứ 6: Ăn Sáng, Ăn Trưa. Chiều/Tối thứ 6 học sinh về nhà nên KHÔNG ăn tối.
 * - Thứ 7, Chủ Nhật: Học sinh nghỉ về gia đình, KHÔNG tổ chức ăn bán trú.
 */
export function getMealScheduleForDate(dateStr: string): DayMealSchedule {
  // Parse date safely in local time
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();

  switch (dayOfWeek) {
    case 1: // Thứ 2
      return {
        dayOfWeek: 1,
        dayName: 'Thứ Hai',
        shortName: 'T2',
        isMealDay: true,
        breakfastAllowed: true,
        lunchAllowed: true,
        dinnerAllowed: true,
        note: 'Ăn 3 bữa: Sáng, Trưa, Tối',
      };
    case 2: // Thứ 3
      return {
        dayOfWeek: 2,
        dayName: 'Thứ Ba',
        shortName: 'T3',
        isMealDay: true,
        breakfastAllowed: true,
        lunchAllowed: true,
        dinnerAllowed: true,
        note: 'Ăn 3 bữa: Sáng, Trưa, Tối',
      };
    case 3: // Thứ 4
      return {
        dayOfWeek: 3,
        dayName: 'Thứ Tư',
        shortName: 'T4',
        isMealDay: true,
        breakfastAllowed: true,
        lunchAllowed: true,
        dinnerAllowed: true,
        note: 'Ăn 3 bữa: Sáng, Trưa, Tối',
      };
    case 4: // Thứ 5
      return {
        dayOfWeek: 4,
        dayName: 'Thứ Năm',
        shortName: 'T5',
        isMealDay: true,
        breakfastAllowed: true,
        lunchAllowed: true,
        dinnerAllowed: true,
        note: 'Ăn 3 bữa: Sáng, Trưa, Tối',
      };
    case 5: // Thứ 6
      return {
        dayOfWeek: 5,
        dayName: 'Thứ Sáu',
        shortName: 'T6',
        isMealDay: true,
        breakfastAllowed: true,
        lunchAllowed: true,
        dinnerAllowed: false,
        note: 'Ăn 2 bữa: Sáng, Trưa (Chiều thứ 6 học sinh về nhà, không ăn tối)',
      };
    case 6: // Thứ 7
      return {
        dayOfWeek: 6,
        dayName: 'Thứ Bảy',
        shortName: 'T7',
        isMealDay: false,
        breakfastAllowed: false,
        lunchAllowed: false,
        dinnerAllowed: false,
        note: 'Cuối tuần: Học sinh về gia đình (Không ăn)',
      };
    case 0: // Chủ nhật
    default:
      return {
        dayOfWeek: 0,
        dayName: 'Chủ Nhật',
        shortName: 'CN',
        isMealDay: false,
        breakfastAllowed: false,
        lunchAllowed: false,
        dinnerAllowed: false,
        note: 'Cuối tuần: Học sinh về gia đình (Không ăn)',
      };
  }
}

/**
 * Tạo danh sách chấm ăn mặc định cho các học sinh bán trú trong ngày.
 * Quy tắc:
 * - Học sinh KHÔNG báo vắng: Mặc định được chấm ăn các bữa theo quy định ngày đó.
 * - Học sinh BÁO VẮNG: Mặc định vắng ăn (tất cả các bữa = false) và kèm lý do vắng.
 */
export function buildDefaultMealRecords(
  boardingStudents: Student[],
  dateStr: string,
  classId: string,
  absentStudentsMap?: Map<string, { reason?: string }>
): BoardingMealRecord[] {
  const schedule = getMealScheduleForDate(dateStr);

  return boardingStudents.map((st) => {
    // Check if student is marked absent in daily report
    // Check by id or by name normalization
    const normName = st.full_name.trim().toLowerCase();
    let isMarkedAbsent = false;
    let absentReason = '';

    if (absentStudentsMap) {
      if (absentStudentsMap.has(st.id)) {
        isMarkedAbsent = true;
        absentReason = absentStudentsMap.get(st.id)?.reason || 'Vắng học trong ngày';
      } else if (absentStudentsMap.has(normName)) {
        isMarkedAbsent = true;
        absentReason = absentStudentsMap.get(normName)?.reason || 'Vắng học trong ngày';
      }
    }

    if (isMarkedAbsent) {
      return {
        id: `meal_${classId}_${dateStr}_${st.id}`,
        class_id: classId,
        date: dateStr,
        student_id: st.id,
        student_name: st.full_name,
        gender: st.gender,
        village: st.village || st.address,
        breakfast: false,
        lunch: false,
        dinner: false,
        is_absent: true,
        absent_reason: absentReason,
        notes: '',
      };
    }

    return {
      id: `meal_${classId}_${dateStr}_${st.id}`,
      class_id: classId,
      date: dateStr,
      student_id: st.id,
      student_name: st.full_name,
      gender: st.gender,
      village: st.village || st.address,
      breakfast: schedule.breakfastAllowed,
      lunch: schedule.lunchAllowed,
      dinner: schedule.dinnerAllowed,
      is_absent: false,
      absent_reason: '',
      notes: '',
    };
  });
}

/**
 * Danh sách 35 học sinh mẫu đặc trưng trường PTDTBT THCS Xa Dung (Điện Biên)
 * Họ tên, giới tính, thôn bản thực tế vùng cao Xa Dung
 */
export const DEFAULT_BOARDING_STUDENTS_SEED: Array<{
  name: string;
  gender: 'Nam' | 'Nữ';
  village: string;
  ethnicity: string;
}> = [
  { name: 'Vừ A Lềnh', gender: 'Nam', village: 'Bản Háng Đồng', ethnicity: 'Mông' },
  { name: 'Sùng Thị Mỷ', gender: 'Nữ', village: 'Bản Phi Lĩnh', ethnicity: 'Mông' },
  { name: 'Mùa A Tủa', gender: 'Nam', village: 'Bản Xa Dung A', ethnicity: 'Mông' },
  { name: 'Giàng A Chống', gender: 'Nam', village: 'Bản Háng Tàu', ethnicity: 'Mông' },
  { name: 'Thào Thị Dợ', gender: 'Nữ', village: 'Bản Suối Lư', ethnicity: 'Mông' },
  { name: 'Hờ A Cháng', gender: 'Nam', village: 'Bản Cồ Dê', ethnicity: 'Mông' },
  { name: 'Cứ Thị Dế', gender: 'Nữ', village: 'Bản Xa Dung B', ethnicity: 'Mông' },
  { name: 'Lầu A Lầu', gender: 'Nam', village: 'Bản Háng Đồng', ethnicity: 'Mông' },
  { name: 'Vừ Thị Sinh', gender: 'Nữ', village: 'Bản Phi Lĩnh', ethnicity: 'Mông' },
  { name: 'Mùa Thị Pa', gender: 'Nữ', village: 'Bản Xa Dung A', ethnicity: 'Mông' },
  { name: 'Giàng Thị Hoa', gender: 'Nữ', village: 'Bản Háng Tàu', ethnicity: 'Mông' },
  { name: 'Sùng A Dơ', gender: 'Nam', village: 'Bản Suối Lư', ethnicity: 'Mông' },
  { name: 'Thào A Lử', gender: 'Nam', village: 'Bản Cồ Dê', ethnicity: 'Mông' },
  { name: 'Hờ Thị Dở', gender: 'Nữ', village: 'Bản Xa Dung B', ethnicity: 'Mông' },
  { name: 'Cứ A Sùng', gender: 'Nam', village: 'Bản Háng Đồng', ethnicity: 'Mông' },
  { name: 'Lầu Thị Mai', gender: 'Nữ', village: 'Bản Phi Lĩnh', ethnicity: 'Mông' },
  { name: 'Vừ A Tủa', gender: 'Nam', village: 'Bản Xa Dung A', ethnicity: 'Mông' },
  { name: 'Sùng Thị Dua', gender: 'Nữ', village: 'Bản Háng Tàu', ethnicity: 'Mông' },
  { name: 'Mùa A Súa', gender: 'Nam', village: 'Bản Suối Lư', ethnicity: 'Mông' },
  { name: 'Giàng A Vừ', gender: 'Nam', village: 'Bản Cồ Dê', ethnicity: 'Mông' },
  { name: 'Thào Thị Sua', gender: 'Nữ', village: 'Bản Xa Dung B', ethnicity: 'Mông' },
  { name: 'Hờ A Tủa', gender: 'Nam', village: 'Bản Háng Đồng', ethnicity: 'Mông' },
  { name: 'Cứ Thị Mỷ', gender: 'Nữ', village: 'Bản Phi Lĩnh', ethnicity: 'Mông' },
  { name: 'Lầu A Chống', gender: 'Nam', village: 'Bản Xa Dung A', ethnicity: 'Mông' },
  { name: 'Lý A Lềnh', gender: 'Nam', village: 'Bản Háng Tàu', ethnicity: 'Mông' },
  { name: 'Khang Thị Dợ', gender: 'Nữ', village: 'Bản Suối Lư', ethnicity: 'Mông' },
  { name: 'Lò Văn Inh', gender: 'Nam', village: 'Bản Nà Sản', ethnicity: 'Thái' },
  { name: 'Quàng Thị Lan', gender: 'Nữ', village: 'Bản Nà Sản', ethnicity: 'Thái' },
  { name: 'Cà Văn Bun', gender: 'Nam', village: 'Bản Nà Sản', ethnicity: 'Thái' },
  { name: 'Tòng Thị Duyên', gender: 'Nữ', village: 'Bản Nà Sản', ethnicity: 'Thái' },
  { name: 'Vừ A Cháng', gender: 'Nam', village: 'Bản Háng Đồng', ethnicity: 'Mông' },
  { name: 'Sùng Thị Chi', gender: 'Nữ', village: 'Bản Phi Lĩnh', ethnicity: 'Mông' },
  { name: 'Mùa Thị Say', gender: 'Nữ', village: 'Bản Xa Dung A', ethnicity: 'Mông' },
  { name: 'Giàng A Tế', gender: 'Nam', village: 'Bản Háng Tàu', ethnicity: 'Mông' },
  { name: 'Thào A Phềnh', gender: 'Nam', village: 'Bản Suối Lư', ethnicity: 'Mông' },
];

/**
 * Tự động tạo danh sách 35 học sinh bán trú chuẩn cho một lớp học
 */
export function generateDefaultBoardingStudentsForClass(classId: string, className: string): Student[] {
  const cleanCls = className.replace(/[^a-zA-Z0-9]/g, '');
  const now = new Date().toISOString();
  return DEFAULT_BOARDING_STUDENTS_SEED.map((s, idx) => ({
    id: `std_${cleanCls}_${String(idx + 1).padStart(2, '0')}`,
    class_id: classId,
    full_name: s.name,
    student_code: `HS${cleanCls}${String(idx + 1).padStart(2, '0')}`,
    gender: s.gender,
    village: s.village,
    address: s.village,
    ethnicity: s.ethnicity,
    isBoarding: true,
    created_at: now,
  }));
}

