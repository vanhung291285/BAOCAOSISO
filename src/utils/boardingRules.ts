import { BoardingMealRecord, Student, SchoolSettings } from '../types';

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
 * Lấy cấu hình chấm ăn học sinh bán trú (đặc biệt là Thứ 6 và Thứ 7 theo cấu hình của Ban Giám Hiệu/Quản trị):
 * - Thứ 2, 3, 4, 5: Ăn Sáng, Ăn Trưa, Ăn Tối (3 bữa)
 * - Thứ 6: Mặc định Ăn Sáng, Ăn Trưa. Bữa Tối bật/tắt theo cấu hình quản trị.
 * - Thứ 7: Mặc định nghỉ, nhưng nếu Quản trị tích chọn (Sáng, Trưa, Tối) thì được phép tổ chức chấm ăn và đồng bộ sang sổ.
 */
export function getMealScheduleForDate(
  dateStr: string,
  offDaysMap?: Map<string, string> | Set<string> | Array<{ date: string; name?: string }>,
  customSettings?: Partial<SchoolSettings>
): DayMealSchedule {
  let offName: string | undefined;

  if (offDaysMap) {
    if (offDaysMap instanceof Map) {
      offName = offDaysMap.get(dateStr);
    } else if (offDaysMap instanceof Set) {
      if (offDaysMap.has(dateStr)) offName = 'Ngày nghỉ';
    } else if (Array.isArray(offDaysMap)) {
      const match = offDaysMap.find((o) => o && o.date === dateStr);
      if (match) offName = match.name || 'Ngày nghỉ';
    }
  } else if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('sso_school_off_days_v1');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const match = list.find((o: any) => o && o.date === dateStr);
          if (match) offName = match.name || 'Ngày nghỉ';
        }
      }
    } catch {}
  }

  // Đọc cấu hình trường từ storage nếu không truyền customSettings
  let schoolSettings: Partial<SchoolSettings> = customSettings || {};
  if (!customSettings && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const rawSettings = localStorage.getItem('sso_school_settings_v1') || localStorage.getItem('sso_school_settings');
      if (rawSettings) {
        schoolSettings = JSON.parse(rawSettings);
      }
    } catch {}
  }

  // Parse date safely in local time
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();

  if (offName) {
    const dowNames: Record<number, { dayName: string; shortName: string }> = {
      0: { dayName: 'Chủ Nhật', shortName: 'CN' },
      1: { dayName: 'Thứ Hai', shortName: 'T2' },
      2: { dayName: 'Thứ Ba', shortName: 'T3' },
      3: { dayName: 'Thứ Tư', shortName: 'T4' },
      4: { dayName: 'Thứ Năm', shortName: 'T5' },
      5: { dayName: 'Thứ Sáu', shortName: 'T6' },
      6: { dayName: 'Thứ Bảy', shortName: 'T7' },
    };
    const info = dowNames[dayOfWeek] || { dayName: 'Ngày nghỉ', shortName: 'Nghỉ' };
    return {
      dayOfWeek,
      dayName: info.dayName,
      shortName: info.shortName,
      isMealDay: false,
      breakfastAllowed: false,
      lunchAllowed: false,
      dinnerAllowed: false,
      note: `Nghỉ học / Lễ (${offName}): Học sinh về nhà (Không ăn)`,
    };
  }

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
    case 5: { // Thứ 6: Đọc cấu hình sáng, trưa, tối
      const fb = schoolSettings.friday_breakfast !== undefined ? Boolean(schoolSettings.friday_breakfast) : true;
      const fl = schoolSettings.friday_lunch !== undefined ? Boolean(schoolSettings.friday_lunch) : true;
      const fd = schoolSettings.friday_dinner !== undefined ? Boolean(schoolSettings.friday_dinner) : false;
      const isMeal = fb || fl || fd;
      
      let noteStr = '';
      if (fb && fl && fd) {
        noteStr = 'Ăn 3 bữa: Sáng, Trưa, Tối (Đã bật ăn tối Thứ 6 theo cấu hình)';
      } else if (fb && fl && !fd) {
        noteStr = 'Ăn 2 bữa: Sáng, Trưa (Chiều thứ 6 học sinh về nhà, không ăn tối)';
      } else if (isMeal) {
        const parts: string[] = [];
        if (fb) parts.push('Sáng');
        if (fl) parts.push('Trưa');
        if (fd) parts.push('Tối');
        noteStr = `Ăn các bữa: ${parts.join(', ')}`;
      } else {
        noteStr = 'Thứ 6 không tổ chức ăn bán trú theo cấu hình';
      }

      return {
        dayOfWeek: 5,
        dayName: 'Thứ Sáu',
        shortName: 'T6',
        isMealDay: isMeal,
        breakfastAllowed: fb,
        lunchAllowed: fl,
        dinnerAllowed: fd,
        note: noteStr,
      };
    }
    case 6: { // Thứ 7: Đọc cấu hình sáng, trưa, tối
      const sb = Boolean(schoolSettings.saturday_breakfast);
      const sl = Boolean(schoolSettings.saturday_lunch);
      const sd = Boolean(schoolSettings.saturday_dinner);
      const isMeal = sb || sl || sd;

      let noteStr = '';
      if (isMeal) {
        const parts: string[] = [];
        if (sb) parts.push('Sáng');
        if (sl) parts.push('Trưa');
        if (sd) parts.push('Tối');
        noteStr = `Thứ 7 có tổ chức chấm ăn (${parts.join(', ')}) theo cấu hình nhà trường`;
      } else {
        noteStr = 'Cuối tuần: Học sinh về gia đình (Không ăn)';
      }

      return {
        dayOfWeek: 6,
        dayName: 'Thứ Bảy',
        shortName: 'T7',
        isMealDay: isMeal,
        breakfastAllowed: sb,
        lunchAllowed: sl,
        dinnerAllowed: sd,
        note: noteStr,
      };
    }
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
  absentStudentsMap?: Map<string, { reason?: string }>,
  customSettings?: Partial<SchoolSettings>
): BoardingMealRecord[] {
  const schedule = getMealScheduleForDate(dateStr, undefined, customSettings);

  return boardingStudents.map((st) => {
    // Check if student is marked absent in daily report
    // Check by unique student id first. Only match by name if the class has a SINGLE student with that name
    const normName = st.full_name.trim().toLowerCase();
    const sameNameCount = boardingStudents.filter(
      (s) => s.full_name.trim().toLowerCase() === normName
    ).length;

    let isMarkedAbsent = false;
    let absentReason = '';

    if (absentStudentsMap) {
      if (st.id && absentStudentsMap.has(st.id)) {
        isMarkedAbsent = true;
        absentReason = absentStudentsMap.get(st.id)?.reason || 'Vắng học trong ngày';
      } else if (sameNameCount === 1 && absentStudentsMap.has(normName)) {
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

