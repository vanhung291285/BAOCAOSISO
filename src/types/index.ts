export type UserRole = 'ADMIN' | 'BGH' | 'GVCN';

export type InputCalculationMode = 'MODE_1_TOTAL_PRESENT' | 'MODE_2_TOTAL_ABSENT' | 'MODE_3_ALL_THREE';

export type ReportStatus = 'NOT_REPORTED' | 'REPORTED' | 'LOCKED';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  assigned_class_id?: string;
  active: boolean;
  phone?: string;
  created_at: string;
}

export interface SchoolSettings {
  id: string;
  school_name: string;
  short_name: string;
  department_name?: string; // e.g. "PHÒNG GD&ĐT HUYỆN ĐIỆN BIÊN ĐÔNG"
  sub_department_name?: string; // e.g. "UBND HUYỆN ĐIỆN BIÊN ĐÔNG"
  address: string;
  commune: string;
  province: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  principal_name: string;
  principal_title: string;
  reporter_name?: string;
  reporter_title?: string;
  report_title: string;
  footer_text: string;
  developer_name?: string;
  developer_contact?: string;
  primary_color: string;
  input_mode: InputCalculationMode;
  enable_campuses: boolean;
  // Cấu hình năm học & xếp loại thi đua tuần
  week1_start_date?: string; // Ngày bắt đầu Tuần 1 (mặc định: '2026-09-07')
  school_days_per_week?: number; // Số ngày học trong tuần (mặc định: 5 ngày, thứ 2 đến thứ 6)
  ranking_threshold_excellent?: number; // Ngưỡng xếp loại Xuất sắc (mặc định: 98%)
  ranking_threshold_good?: number; // Ngưỡng xếp loại Tốt (mặc định: 95%)
  ranking_threshold_fair?: number; // Ngưỡng xếp loại Khá (mặc định: 90%)
  // Cấu hình cộng điểm thi đua báo cáo sớm
  enable_early_report_bonus?: boolean; // Bật tính điểm thưởng báo sớm (mặc định: true)
  early_report_deadline?: string; // Giờ quy định báo sớm (mặc định: '07:30')
  early_report_bonus_points?: number; // Số điểm cộng mỗi ngày báo sớm (mặc định: 0.5)
  early_report_max_bonus?: number; // Điểm cộng tối đa mỗi tuần (mặc định: 2.5)
  created_at: string;
  updated_at: string;
}

export interface SchoolYear {
  id: string;
  name: string; // e.g. "2025-2026", "2026-2027"
  is_active: boolean;
  is_locked?: boolean;
  created_at: string;
}

export interface Campus {
  id: string;
  name: string; // e.g. "Phân hiệu chính", "Phân hiệu Nà Sản", "Phân hiệu Suối Lư"
  active: boolean;
  principal_name?: string;
  principal_title?: string;
  reporter_name?: string;
  reporter_title?: string;
  created_at: string;
}

export interface ClassItem {
  id: string;
  class_name: string; // e.g. "6A1", "6A9", "9D1"
  grade: number; // 6, 7, 8, 9
  school_year_id: string;
  campus_id?: string;
  homeroom_teacher_id?: string;
  active: boolean;
  is_locked?: boolean;
  sort_order?: number;
  created_at: string;
}

export interface IndicatorGroup {
  id: string;
  name: string; // e.g. "Học sinh toàn trường", "Học sinh bán trú", "Học sinh nội trú"
  code: string; // e.g. "ALL", "BOARDING_HALF", "BOARDING_FULL", "WEEKEND_STAY"
  enabled: boolean;
  sort_order: number;
  show_total: boolean;
  show_present: boolean;
  show_absent: boolean;
  show_percentage: boolean;
  column_header_override?: string;
  created_at: string;
}

export interface AbsentStudent {
  full_name: string;
  address?: string;
  reason?: string;
}

export interface DailyReport {
  id: string;
  class_id: string;
  report_date: string; // YYYY-MM-DD
  created_by: string; // Profile ID
  status: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  notes?: string;
  absent_students?: AbsentStudent[];
  reported_time?: string; // Giờ nộp báo cáo (HH:mm) ví dụ: "07:15"
  created_at: string;
  updated_at: string;
  locked_at?: string;
}

export interface DailyReportValue {
  id: string;
  report_id: string;
  indicator_group_id: string;
  total_count: number;
  present_count: number;
  absent_count: number;
  created_at: string;
  updated_at: string;
}

export interface SystemLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: 'CREATE' | 'UPDATE' | 'LOCK' | 'UNLOCK' | 'SETTINGS_CHANGE' | 'DELETE';
  class_name?: string;
  report_date?: string;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

export interface ClassReportRow {
  classItem: ClassItem;
  teacher?: Profile;
  report?: DailyReport;
  status: ReportStatus;
  values: Record<string, { total: number; present: number; absent: number; rate: number }>;
  overallRate: number; // Tỷ lệ vắng % toàn lớp
  overallPresentRate: number;
}

export type AttendancePeriodType = 'WEEK' | 'MONTH' | 'YEAR';

export interface SchoolOffDay {
  id: string;
  date: string; // YYYY-MM-DD
  name: string; // e.g. "Nghỉ lễ Quốc Khánh 2/9", "Nghỉ Tết", "Nghỉ rét đậm"
  type: 'HOLIDAY' | 'WEEKEND' | 'WEATHER' | 'SPECIAL' | 'OTHER';
  applies_to?: string; // 'ALL' or specific campus_id
  created_at: string;
}

export interface ClassAttendanceRank {
  rank: number; // Thứ hạng hiển thị trong danh sách hiện tại
  schoolRank: number; // Thứ hạng toàn trường (1 .. N)
  totalClassesInSchool: number; // Tổng số lớp toàn trường
  campusId?: string;
  campusName?: string;
  campusRank: number; // Thứ hạng trong phân hiệu / điểm trường
  totalClassesInCampus: number; // Tổng số lớp trong phân hiệu đó
  classItem: ClassItem;
  teacher?: Profile;
  enrollment: number; // Sĩ số học sinh
  validSchoolDays: number; // Số ngày học thực tế tính thi đua (đã trừ ngày nghỉ)
  reportedDays: number; // Số ngày lớp đã báo cáo
  totalPossibleAttendances: number; // Tổng số lượt học sinh cần đến lớp
  totalPresentAttendances: number; // Tổng số lượt học sinh có mặt
  totalAbsentAttendances: number; // Tổng số lượt học sinh vắng
  attendanceRate: number; // Tỷ lệ duy trì sĩ số (% có mặt)
  absentRate: number; // Tỷ lệ vắng (%)
  // Điểm cộng và thời gian báo sớm thi đua
  earlyReportDays: number; // Số ngày báo sớm (trước giờ quy định)
  earlyBonusPoints: number; // Tổng điểm cộng báo cáo sớm
  averageReportTime?: string; // Giờ nộp báo cáo trung bình (ví dụ: '07:15')
  totalScore: number; // Điểm thi đua tổng hợp = attendanceRate + earlyBonusPoints
  classification: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT';
  classificationLabel: string;
}

export interface CampusRankingSummary {
  campusId: string;
  campusName: string;
  totalClasses: number;
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  attendanceRate: number;
  rankings: ClassAttendanceRank[];
  topPerformers: ClassAttendanceRank[];
}

export interface SchoolWeekInfo {
  weekNumber: number;
  startDate: string; // YYYY-MM-DD (Thứ 2)
  endDate: string; // YYYY-MM-DD (Hết Thứ 6)
  label: string; // e.g. "Tuần 1 (07/09 - 11/09/2026)"
  isCurrent?: boolean;
}

export interface AttendanceRankingSummary {
  periodType: AttendancePeriodType;
  periodLabel: string;
  weekNumber?: number;
  schoolWeekInfo?: SchoolWeekInfo;
  dateRange: { start: string; end: string };
  totalDaysInRange: number;
  totalExcludedDays: number;
  excludedOffDays: Array<{ date: string; name: string }>;
  totalValidDays: number; // Số ngày học tính thi đua
  schoolAttendanceRate: number; // Tỷ lệ toàn trường
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  rankings: ClassAttendanceRank[];
  topPerformers: ClassAttendanceRank[];
  campusSummaries: CampusRankingSummary[];
}
