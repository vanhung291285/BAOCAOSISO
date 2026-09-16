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
  action: 'CREATE' | 'UPDATE' | 'LOCK' | 'UNLOCK' | 'SETTINGS_CHANGE';
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
