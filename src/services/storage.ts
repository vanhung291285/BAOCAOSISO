import {
  Profile,
  SchoolSettings,
  SchoolYear,
  Campus,
  ClassItem,
  IndicatorGroup,
  DailyReport,
  DailyReportValue,
  SystemLog,
  ClassReportRow,
  ReportStatus,
  SchoolOffDay,
  AttendanceRankingSummary,
  ClassAttendanceRank,
  AttendancePeriodType,
  CampusRankingSummary,
  SchoolWeekInfo,
  AppNotification,
  NotificationType,
} from '../types';
import { getSupabaseClient, isSupabaseConnected } from './supabase';
import {
  DEFAULT_WEEK1_START_DATE,
  DEFAULT_SCHOOL_DAYS_PER_WEEK,
  DEFAULT_EARLY_REPORT_DEADLINE,
  DEFAULT_EARLY_REPORT_BONUS_PER_DAY,
  DEFAULT_EARLY_REPORT_MAX_BONUS,
  getSchoolWeekFromDate,
  getSchoolWeekInfo,
  checkIsReportEarly,
  addDaysToDateStr,
  parseDateParts,
  getTodayDateStr,
  formatDateVN,
} from '../utils/schoolWeeks';

const STORAGE_KEYS = {
  SETTINGS: 'sso_school_settings_v1',
  YEARS: 'sso_school_years_v1',
  CAMPUSES: 'sso_campuses_v1',
  CLASSES: 'sso_classes_v1',
  PROFILES: 'sso_profiles_v1',
  INDICATORS: 'sso_indicator_groups_v1',
  REPORTS: 'sso_daily_reports_v1',
  VALUES: 'sso_daily_report_values_v1',
  LOGS: 'sso_system_logs_v1',
  OFF_DAYS: 'sso_school_off_days_v1',
  STUDENTS: 'sso_students_v1',
  NOTIFICATIONS: 'sso_notifications_v1',
};

export interface TableSyncStatus {
  table: string;
  label: string;
  localCount: number;
  cloudCount: number;
  inSync: boolean;
  error?: string;
}

// Cross-tab and in-tab realtime notification channel
const realtimeChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('sso_attendance_realtime')
    : null;

export function notifyRealtimeChange(table: string, payload?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sso_realtime_update', { detail: { table, payload } }));
    realtimeChannel?.postMessage({ table, payload, timestamp: Date.now() });
  }
}

export function subscribeRealtime(callback: (event: { table: string; payload?: any }) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (e: any) => {
    callback(e.detail);
  };
  const handleBroadcast = (e: MessageEvent) => {
    callback(e.data);
  };

  window.addEventListener('sso_realtime_update', handleCustom);
  realtimeChannel?.addEventListener('message', handleBroadcast);

  // If Supabase is connected, subscribe to Postgres changes across all core tables
  const supabase = getSupabaseClient();
  let channel: any = null;
  if (supabase) {
    try {
      channel = supabase
        .channel('public:all_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, (payload) => {
          try {
            if (payload.new && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
              const newRep = payload.new as DailyReport;
              const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
              let reps: DailyReport[] = raw ? JSON.parse(raw) : [];
              const idx = reps.findIndex(r => r.id === newRep.id || (r.class_id === newRep.class_id && r.report_date === newRep.report_date));
              if (idx >= 0) reps[idx] = newRep;
              else reps.push(newRep);
              localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reps));
            } else if (payload.old && payload.eventType === 'DELETE') {
              const oldId = (payload.old as any).id;
              const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
              let reps: DailyReport[] = raw ? JSON.parse(raw) : [];
              reps = reps.filter(r => r.id !== oldId);
              localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reps));
            }
          } catch (e) {
            console.warn('Error merging realtime daily_reports:', e);
          }
          callback({ table: 'daily_reports', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_report_values' }, (payload) => {
          try {
            if (payload.new && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
              const newVal = payload.new as DailyReportValue;
              const raw = localStorage.getItem(STORAGE_KEYS.VALUES);
              let vals: DailyReportValue[] = raw ? JSON.parse(raw) : [];
              const idx = vals.findIndex(v => v.id === newVal.id || (v.report_id === newVal.report_id && v.indicator_group_id === newVal.indicator_group_id));
              if (idx >= 0) vals[idx] = newVal;
              else vals.push(newVal);
              localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(vals));
            }
          } catch (e) {
            console.warn('Error merging realtime daily_report_values:', e);
          }
          callback({ table: 'daily_report_values', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, (payload) => {
          callback({ table: 'classes', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'school_settings' }, (payload) => {
          callback({ table: 'school_settings', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'school_years' }, (payload) => {
          callback({ table: 'school_years', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'indicator_groups' }, (payload) => {
          callback({ table: 'indicator_groups', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (payload) => {
          try {
            if (payload.new && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
              const newNotif = payload.new as AppNotification;
              const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
              let notifs: AppNotification[] = raw ? JSON.parse(raw) : [];
              const idx = notifs.findIndex(n => n.id === newNotif.id);
              if (idx >= 0) notifs[idx] = newNotif;
              else notifs.unshift(newNotif);
              localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 100)));
            } else if (payload.old && payload.eventType === 'DELETE') {
              const oldId = (payload.old as any).id;
              const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
              let notifs: AppNotification[] = raw ? JSON.parse(raw) : [];
              notifs = notifs.filter(n => n.id !== oldId);
              localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
            }
          } catch (e) {
            console.warn('Error merging realtime notifications:', e);
          }
          callback({ table: 'notifications', payload });
        })
        .subscribe();
    } catch (e) {
      console.warn('Supabase realtime subscription failed:', e);
    }
  }

  return () => {
    window.removeEventListener('sso_realtime_update', handleCustom);
    realtimeChannel?.removeEventListener('message', handleBroadcast);
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
  };
}

// ----------------------------------------------------
// INITIAL SEED DATA BUILDER (MẶC ĐỊNH RỖNG ĐỂ CẤU HÌNH TỪ ĐẦU)
// ----------------------------------------------------
export const STORAGE_CLEAN_VERSION_KEY = 'sso_clean_state_v3_blank_slate';

export function getInitialData() {
  const now = new Date().toISOString();
  const settings: SchoolSettings = {
    id: 'school_01',
    school_name: '',
    short_name: '',
    department_name: '',
    sub_department_name: '',
    address: '',
    commune: '',
    province: '',
    phone: '',
    email: '',
    website: 'https://thcsxadung.db.edu.vn',
    student_results_url: 'https://kqht.db.edu.vn',
    logo_url: '',
    principal_name: '',
    principal_title: 'Hiệu trưởng',
    reporter_name: '',
    reporter_title: 'Người lập biểu',
    report_title: 'BÁO CÁO SĨ SỐ HỌC SINH',
    footer_text: '',
    developer_name: 'Vũ Văn Hùng',
    developer_contact: 'SĐT: 0984246993',
    primary_color: '#1d4ed8',
    input_mode: 'MODE_1_TOTAL_PRESENT',
    enable_campuses: false,
    week1_start_date: DEFAULT_WEEK1_START_DATE,
    school_days_per_week: DEFAULT_SCHOOL_DAYS_PER_WEEK,
    ranking_threshold_excellent: 98,
    ranking_threshold_good: 95,
    ranking_threshold_fair: 90,
    enable_early_report_bonus: true,
    early_report_deadline: DEFAULT_EARLY_REPORT_DEADLINE,
    early_report_bonus_points: DEFAULT_EARLY_REPORT_BONUS_PER_DAY,
    early_report_max_bonus: DEFAULT_EARLY_REPORT_MAX_BONUS,
    enable_auto_reminder: true,
    auto_reminder_time: '07:30',
    reminder_message_template: 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm trước 07h30 để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!',
    created_at: now,
    updated_at: now,
  };

  const years: SchoolYear[] = [
    { id: 'year_2026_2027', name: '2026-2027', is_active: true, is_locked: false, created_at: now },
  ];

  const campuses: Campus[] = [];

  const indicators: IndicatorGroup[] = [
    {
      id: 'ig_all',
      name: 'Học sinh toàn trường',
      code: 'ALL',
      enabled: true,
      sort_order: 1,
      show_total: true,
      show_present: true,
      show_absent: true,
      show_percentage: true,
      column_header_override: 'Học sinh toàn trường',
      created_at: now,
    },
    {
      id: 'ig_boarding_half',
      name: 'Học sinh bán trú',
      code: 'BOARDING_HALF',
      enabled: true,
      sort_order: 2,
      show_total: true,
      show_present: true,
      show_absent: true,
      show_percentage: true,
      column_header_override: 'Học sinh bán trú',
      created_at: now,
    },
  ];

  const classes: ClassItem[] = [];

  const profiles: Profile[] = [
    {
      id: 'u_admin',
      full_name: 'Quản trị viên Hệ thống',
      email: 'admin@db.edu.vn',
      role: 'ADMIN',
      active: true,
      phone: '',
      created_at: now,
    },
  ];

  const dailyReports: DailyReport[] = [];
  const dailyReportValues: DailyReportValue[] = [];
  const logs: SystemLog[] = [];

  return {
    settings,
    years,
    campuses,
    indicators,
    classes,
    profiles,
    dailyReports,
    dailyReportValues,
    logs,
  };
}

// Reset toàn bộ dữ liệu cục bộ về trạng thái rỗng để người dùng cấu hình từ đầu
export function resetAllDataToEmpty() {
  if (typeof window === 'undefined') return;
  const seed = getInitialData();
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(seed.settings));
  localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(seed.years));
  localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(seed.campuses));
  localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(seed.indicators));
  localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(seed.classes));
  localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(seed.profiles));
  localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(seed.dailyReports));
  localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(seed.dailyReportValues));
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(seed.logs));
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify([]));
  localStorage.setItem(STORAGE_CLEAN_VERSION_KEY, 'v3_blank_slate');
  localStorage.setItem('sso_current_user_id', 'u_admin');
  notifyRealtimeChange('all_reset');
}

// Ensure initial data exists in storage
export function ensureInitialized() {
  if (typeof window === 'undefined') return;

  if (localStorage.getItem(STORAGE_CLEAN_VERSION_KEY) !== 'v3_blank_slate') {
    resetAllDataToEmpty();
    return;
  }

  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    resetAllDataToEmpty();
  }
}

// ----------------------------------------------------
// STORAGE SERVICE CRUD & FULL SUPABASE PERSISTENCE API
// ----------------------------------------------------
export const StorageService = {
  // --- 1. School Settings ---
  async getSettings(): Promise<SchoolSettings> {
    ensureInitialized();
    let s: SchoolSettings | null = null;
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
        if (!error && data) {
          s = data;
        }
      } catch (err) {
        console.warn('Supabase fetch settings fallback to local', err);
      }
    }
    
    if (!s) {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      s = raw ? JSON.parse(raw) : getInitialData().settings;
    }

    let needsSave = false;
    
    if (s && !s.enable_campuses) {
      // Auto-enable if we have campuses in DB
      const campusesRaw = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
      const campuses = campusesRaw ? JSON.parse(campusesRaw) : [];
      if (campuses.length > 0) {
        s.enable_campuses = true;
        needsSave = true;
      }
    }

    if (s && (s.report_title === 'BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH' || s.report_title?.includes('HỌC SINH SĨ SỐ HỌC SINH'))) {
      s.report_title = s.report_title.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
      needsSave = true;
    }
    if (s && (s.developer_name === undefined || s.developer_name === 'Nguyễn Hùng')) {
      s.developer_name = 'Vũ Văn Hùng';
      s.developer_contact = 'SĐT: 0984246993';
      needsSave = true;
    }
    if (s && (!s.developer_contact || s.developer_contact === 'hungthcsnongu@gmail.com')) {
      s.developer_contact = 'SĐT: 0984246993';
      needsSave = true;
    }
    if (s && s.address && s.address.includes('Huyện Điện Biên Đông')) {
      s.address = s.address.replace(', Huyện Điện Biên Đông', '').replace('Huyện Điện Biên Đông, ', '').replace('Huyện Điện Biên Đông', '').trim();
      needsSave = true;
    }
    if (s && !s.week1_start_date) {
      s.week1_start_date = DEFAULT_WEEK1_START_DATE;
      needsSave = true;
    }
    if (s && s.enable_auto_reminder === undefined) {
      s.enable_auto_reminder = true;
      s.auto_reminder_time = '07:45';
      s.reminder_message_template = 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm để BGH tổng hợp toàn trường!';
      needsSave = true;
    }

    if (s) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
      if (needsSave && supabase && isSupabaseConnected()) {
        try {
          await supabase.from('school_settings').upsert(s);
        } catch (e) {
          console.error(e);
        }
      }
    }
    return s as SchoolSettings;
  },

  async getSchoolSettings(): Promise<SchoolSettings> {
    return this.getSettings();
  },

  async updateSettings(settings: Partial<SchoolSettings>, updatedBy?: Profile): Promise<SchoolSettings> {
    ensureInitialized();
    const current = await this.getSettings();
    const updated: SchoolSettings = {
      ...current,
      ...settings,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error } = await supabase.from('school_settings').upsert(updated);
        if (error) console.error('Supabase update school_settings error:', error);
      } catch (e) {
        console.error('Supabase update settings error:', e);
      }
    }

    if (updatedBy) {
      await this.addLog({
        user_id: updatedBy.id,
        user_name: updatedBy.full_name,
        user_role: updatedBy.role,
        action: 'SETTINGS_CHANGE',
        old_data: current,
        new_data: updated,
      });
    }

    notifyRealtimeChange('school_settings', updated);
    return updated;
  },

  // --- 2. School Years ---
  async getSchoolYears(): Promise<SchoolYear[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('school_years').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch school_years fallback to local', err);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEYS.YEARS);
    return raw ? JSON.parse(raw) : [];
  },

  async saveSchoolYear(year: SchoolYear): Promise<void> {
    const list = await this.getSchoolYears();
    const index = list.findIndex((y) => y.id === year.id);
    if (index >= 0) {
      list[index] = year;
    } else {
      list.push(year);
    }
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error } = await supabase.from('school_years').upsert(year);
        if (error) console.error('Supabase upsert school_years error:', error);
      } catch (e) {
        console.error('Supabase saveSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async setActiveSchoolYear(yearId: string): Promise<void> {
    const list = await this.getSchoolYears();
    const updated = list.map((y) => ({
      ...y,
      is_active: y.id === yearId,
    }));
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').update({ is_active: false }).neq('id', yearId);
        await supabase.from('school_years').update({ is_active: true }).eq('id', yearId);
      } catch (e) {
        console.error('Supabase setActiveSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async deleteSchoolYear(yearId: string): Promise<void> {
    const list = await this.getSchoolYears();
    const filtered = list.filter((y) => y.id !== yearId);
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').delete().eq('id', yearId);
      } catch (e) {
        console.error('Supabase deleteSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async toggleLockSchoolYear(yearId: string, locked: boolean): Promise<void> {
    const list = await this.getSchoolYears();
    const updated = list.map((y) => (y.id === yearId ? { ...y, is_locked: locked } : y));
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').update({ is_locked: locked }).eq('id', yearId);
      } catch (e) {
        console.error('Supabase toggleLockSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  // --- 3. Campuses ---
  async getCampuses(): Promise<Campus[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('campuses').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch campuses fallback to local', err);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
    const campuses = raw ? JSON.parse(raw) : [];

    // Auto-seed requested campuses if none exist
    if (campuses.length === 0) {
      const defaultCampuses = [
        { id: 'c_1', name: 'Phân hiệu chính', active: true, created_at: new Date().toISOString() },
        { id: 'c_2', name: 'Phân hiệu Suối Lư', active: true, created_at: new Date().toISOString() },
        { id: 'c_3', name: 'Phân hiệu Nà Sản', active: true, created_at: new Date().toISOString() },
      ];
      localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(defaultCampuses));
      
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
      if (settings && !settings.enable_campuses) {
        settings.enable_campuses = true;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      }

      const classesRaw = localStorage.getItem(STORAGE_KEYS.CLASSES);
      if (classesRaw) {
        let classes = JSON.parse(classesRaw);
        classes = classes.map((c: any, i: number) => ({
          ...c,
          campus_id: c.campus_id || defaultCampuses[i % defaultCampuses.length].id
        }));
        localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
      }
      return defaultCampuses;
    }

    return campuses;
  },

  async saveCampus(campus: Campus): Promise<void> {
    const list = await this.getCampuses();
    const idx = list.findIndex((c) => c.id === campus.id);
    if (idx >= 0) list[idx] = campus;
    else list.push(campus);
    localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('campuses').upsert(campus);
      } catch (e) {
        console.error('Supabase saveCampus error:', e);
      }
    }

    notifyRealtimeChange('campuses');
  },

  async deleteCampus(campusId: string): Promise<void> {
    const list = await this.getCampuses();
    const filtered = list.filter((c) => c.id !== campusId);
    localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('campuses').delete().eq('id', campusId);
      } catch (e) {
        console.error('Supabase deleteCampus error:', e);
      }
    }

    notifyRealtimeChange('campuses');
  },

  // --- 4. Indicator Groups ---
  async getIndicatorGroups(): Promise<IndicatorGroup[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('indicator_groups').select('*').order('sort_order', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch indicator_groups fallback to local', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEYS.INDICATORS);
    let groups: IndicatorGroup[] = raw ? JSON.parse(raw) : [];

    let migrated = false;
    groups = groups.map((g) => {
      if (g.id === 'ig_all' && g.name.toLowerCase() === 'học sinh toàn trường') {
        migrated = true;
        return {
          ...g,
          name: 'Học sinh của lớp theo cấu hình',
          column_header_override: 'Học sinh của lớp theo cấu hình',
        };
      }
      const lower = `${g.name} ${g.code}`.toLowerCase();
      if ((lower.includes('ngoại trú') || lower.includes('không ăn') || lower.includes('ngoai tru') || lower.includes('khong an')) && g.icon !== 'home') {
        migrated = true;
        return {
          ...g,
          icon: 'home',
        };
      }
      return g;
    });

    const hasBoardingFull = groups.some((g) => g.id === 'ig_boarding_full');
    if (hasBoardingFull) {
      groups = groups.filter((g) => g.id !== 'ig_boarding_full');
      migrated = true;
    }

    if (migrated) {
      localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(groups));
    }

    return groups.sort((a, b) => a.sort_order - b.sort_order);
  },

  async saveIndicatorGroup(group: IndicatorGroup): Promise<void> {
    const list = await this.getIndicatorGroups();
    const idx = list.findIndex((g) => g.id === group.id);
    if (idx >= 0) list[idx] = group;
    else list.push(group);
    list.sort((a, b) => a.sort_order - b.sort_order);
    localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('indicator_groups').upsert(group);
      } catch (e) {
        console.error('Supabase saveIndicatorGroup error:', e);
      }
    }

    notifyRealtimeChange('indicator_groups');
  },

  async deleteIndicatorGroup(groupId: string): Promise<void> {
    const list = await this.getIndicatorGroups();
    const filtered = list.filter((g) => g.id !== groupId);
    localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('indicator_groups').delete().eq('id', groupId);
      } catch (e) {
        console.error('Supabase deleteIndicatorGroup error:', e);
      }
    }

    notifyRealtimeChange('indicator_groups');
  },

  // --- 5. Classes ---
  async getClasses(): Promise<ClassItem[]> {
    ensureInitialized();
    let data: ClassItem[] | null = null;
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudData, error } = await supabase.from('classes').select('*').order('sort_order', { ascending: true });
        if (!error && cloudData && cloudData.length > 0) {
          localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(cloudData));
          data = cloudData;
        }
      } catch (err) {
        console.warn('Supabase fetch classes fallback to local', err);
      }
    }

    if (!data) {
      const raw = localStorage.getItem(STORAGE_KEYS.CLASSES);
      data = raw ? JSON.parse(raw) : [];
    }
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return data.sort((a, b) => {
      if (a.grade !== b.grade) {
        return (a.grade || 0) - (b.grade || 0);
      }
      return collator.compare(a.class_name, b.class_name);
    });
  },

  async saveClass(classItem: ClassItem): Promise<void> {
    const list = await this.getClasses();
    const idx = list.findIndex((c) => c.id === classItem.id);
    if (idx >= 0) list[idx] = classItem;
    else list.push(classItem);
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => {
      if (a.grade !== b.grade) {
        return (a.grade || 0) - (b.grade || 0);
      }
      return collator.compare(a.class_name, b.class_name);
    });
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('classes').upsert(classItem);
      } catch (e) {
        console.error('Supabase saveClass error:', e);
      }
    }

    notifyRealtimeChange('classes');
  },

  async deleteClass(classId: string): Promise<void> {
    const list = await this.getClasses();
    const filtered = list.filter((c) => c.id !== classId);
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('classes').delete().eq('id', classId);
      } catch (e) {
        console.error('Supabase deleteClass error:', e);
      }
    }

    notifyRealtimeChange('classes');
  },

  async toggleClassLock(classId: string, isLocked: boolean): Promise<void> {
    const list = await this.getClasses();
    const target = list.find((c) => c.id === classId);
    if (target) {
      target.is_locked = isLocked;
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(list));

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          await supabase.from('classes').update({ is_locked: isLocked }).eq('id', classId);
        } catch (e) {
          console.error('Supabase toggleClassLock error:', e);
        }
      }

      notifyRealtimeChange('classes');
    }
  },

  // --- 5.5. Students ---
  async getStudents(): Promise<import('../types').Student[]> {
    ensureInitialized();
    let data: import('../types').Student[] | null = null;
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudData, error } = await supabase.from('students').select('*').order('full_name', { ascending: true });
        if (!error && cloudData && cloudData.length > 0) {
          localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(cloudData));
          data = cloudData;
        }
      } catch (err) {
        console.warn('Supabase fetch students fallback to local', err);
      }
    }

    if (!data) {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      data = raw ? JSON.parse(raw) : [];
    }
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return data.sort((a, b) => collator.compare(a.full_name, b.full_name));
  },

  async saveStudent(student: import('../types').Student): Promise<void> {
    const list = await this.getStudents();
    const idx = list.findIndex((s) => s.id === student.id);
    if (idx >= 0) list[idx] = student;
    else list.push(student);
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => collator.compare(a.full_name, b.full_name));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('students').upsert(student);
      } catch (e) {
        console.error('Supabase saveStudent error:', e);
      }
    }

    notifyRealtimeChange('students');
  },

  async deleteStudent(studentId: string): Promise<void> {
    const list = await this.getStudents();
    const filtered = list.filter((s) => s.id !== studentId);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('students').delete().eq('id', studentId);
      } catch (e) {
        console.error('Supabase deleteStudent error:', e);
      }
    }

    notifyRealtimeChange('students');
  },

  async getStudentsByClass(classId: string): Promise<import('../types').Student[]> {
    const all = await this.getStudents();
    return all.filter((s) => s.class_id === classId);
  },

  async saveStudents(students: import('../types').Student[]): Promise<void> {
    const all = await this.getStudents();
    const updated = [...all];
    for (const student of students) {
      const idx = updated.findIndex((s) => s.id === student.id);
      if (idx >= 0) updated[idx] = student;
      else updated.push(student);
    }
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    updated.sort((a, b) => collator.compare(a.full_name, b.full_name));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('students').upsert(students);
      } catch (e) {
        console.error('Supabase saveStudents bulk error:', e);
      }
    }
    notifyRealtimeChange('students');
  },

  // --- 6. Profiles (Users) ---
  async getProfiles(): Promise<Profile[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch profiles fallback to local', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    let list: Profile[] = raw ? JSON.parse(raw) : getInitialData().profiles;
    let modified = false;
    list = list.map((p) => {
      if (p.role === 'ADMIN' && p.email !== 'admin@db.edu.vn') {
        p.email = 'admin@db.edu.vn';
        modified = true;
      }
      return p;
    });
    if (modified) {
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
    }
    return list;
  },

  async saveProfile(profile: Profile): Promise<void> {
    const list = await this.getProfiles();
    const idx = list.findIndex((p) => p.id === profile.id);
    if (idx >= 0) list[idx] = profile;
    else list.push(profile);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('profiles').upsert(profile);
      } catch (e) {
        console.error('Supabase saveProfile error:', e);
      }
    }

    notifyRealtimeChange('profiles');
  },

  async deleteProfile(profileId: string): Promise<void> {
    const list = await this.getProfiles();
    const filtered = list.filter((p) => p.id !== profileId);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('profiles').delete().eq('id', profileId);
      } catch (e) {
        console.error('Supabase deleteProfile error:', e);
      }
    }

    notifyRealtimeChange('profiles');
  },

  // --- 7. Daily Reports & Values ---
  getLocalDailyReport(
    classId: string,
    reportDate: string
  ): { report?: DailyReport; values: DailyReportValue[] } {
    ensureInitialized();
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const report = reports.find((r) => r.class_id === classId && r.report_date === reportDate);
    if (!report) return { report: undefined, values: [] };
    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    const values = allValues.filter((v) => v.report_id === report.id);
    return { report, values };
  },

  async getDailyReport(
    classId: string,
    reportDate: string
  ): Promise<{ report?: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();
    const supabase = getSupabaseClient();

    if (supabase && isSupabaseConnected()) {
      try {
        const { data: rep, error: rErr } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('class_id', classId)
          .eq('report_date', reportDate)
          .maybeSingle();

        if (!rErr && rep) {
          const { data: vals, error: vErr } = await supabase
            .from('daily_report_values')
            .select('*')
            .eq('report_id', rep.id);

          if (!vErr && vals) {
            // Update local cache
            const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
            const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
            const rIdx = reports.findIndex((r) => r.id === rep.id);
            if (rIdx >= 0) reports[rIdx] = rep;
            else reports.push(rep);
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

            const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
            let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
            allValues = allValues.filter((v) => v.report_id !== rep.id).concat(vals);
            localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));

            return { report: rep, values: vals };
          }
        }
      } catch (err) {
        console.warn('Supabase fetch report fallback to local:', err);
      }
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const report = reports.find((r) => r.class_id === classId && r.report_date === reportDate);

    if (!report) {
      return { report: undefined, values: [] };
    }

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    const values = allValues.filter((v) => v.report_id === report.id);

    return { report, values };
  },

  async getLatestReport(
    classId: string,
    beforeDate?: string
  ): Promise<{ report?: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();
    const supabase = getSupabaseClient();

    if (supabase && isSupabaseConnected()) {
      try {
        let query = supabase
          .from('daily_reports')
          .select('*')
          .eq('class_id', classId);

        if (beforeDate) {
          query = query.lt('report_date', beforeDate);
        }

        const { data: reps, error: rErr } = await query
          .order('report_date', { ascending: false })
          .limit(5);

        if (!rErr && reps && reps.length > 0) {
          for (const rep of reps) {
            const { data: vals, error: vErr } = await supabase
              .from('daily_report_values')
              .select('*')
              .eq('report_id', rep.id);

            if (!vErr && vals && vals.length > 0) {
              return { report: rep, values: vals };
            }
          }
        }
      } catch (err) {
        console.warn('Supabase fetch latest report fallback to local:', err);
      }
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const classReports = reports
      .filter((r) => r.class_id === classId && (!beforeDate || r.report_date < beforeDate))
      .sort((a, b) => b.report_date.localeCompare(a.report_date));

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    for (const report of classReports) {
      const values = allValues.filter((v) => v.report_id === report.id);
      if (values.length > 0 && values.some((v) => v.total_count > 0)) {
        return { report, values };
      }
    }

    const fallbackReport = classReports[0];
    if (fallbackReport) {
      const values = allValues.filter((v) => v.report_id === fallbackReport.id);
      return { report: fallbackReport, values };
    }

    return { report: undefined, values: [] };
  },

  async getLatestReportForClass(
    classId: string,
    beforeDate?: string
  ): Promise<{ report?: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];

    // Filter by class and date (if provided), sort descending by report_date
    const classReports = reports
      .filter((r) => r.class_id === classId && (!beforeDate || r.report_date < beforeDate))
      .sort((a, b) => b.report_date.localeCompare(a.report_date));

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    for (const r of classReports) {
      const vals = allValues.filter((v) => v.report_id === r.id);
      const hasPositiveTotal = vals.some((v) => v.total_count > 0);
      if (hasPositiveTotal) {
        return { report: r, values: vals };
      }
    }

    return { report: undefined, values: [] };
  },

  async saveDailyReport(
    classId: string,
    reportDate: string,
    user: Profile,
    valuesByGroup: Record<string, { total: number; present: number; absent: number }>,
    notes?: string,
    absent_students?: import('../types').AbsentStudent[]
  ): Promise<{ report: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();

    // Guard: Prevent saving empty report where total is 0
    const maxTotal = Object.values(valuesByGroup).reduce(
      (acc, curr) => Math.max(acc, Number(curr.total) || 0),
      0
    );
    if (maxTotal <= 0) {
      throw new Error('Không thể lưu báo cáo rỗng: Sĩ số tổng số học sinh của lớp phải lớn hơn 0.');
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const existingIndex = reports.findIndex((r) => r.class_id === classId && r.report_date === reportDate);

    const reportId = existingIndex >= 0 ? reports[existingIndex].id : `rep_${reportDate}_${classId}_${Date.now()}`;
    const oldReport = existingIndex >= 0 ? { ...reports[existingIndex] } : null;

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const initialReportedTime = existingIndex >= 0 && reports[existingIndex].reported_time
      ? reports[existingIndex].reported_time
      : currentTimeStr;

    const report: DailyReport = {
      id: reportId,
      class_id: classId,
      report_date: reportDate,
      created_by: user.id,
      status: 'SUBMITTED',
      notes: notes ?? (existingIndex >= 0 ? reports[existingIndex].notes : ''),
      absent_students: absent_students ?? (existingIndex >= 0 ? reports[existingIndex].absent_students : undefined),
      reported_time: initialReportedTime,
      created_at: existingIndex >= 0 ? reports[existingIndex].created_at : now.toISOString(),
      updated_at: now.toISOString(),
    };

    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.push(report);
    }
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    // Update values
    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    allValues = allValues.filter((v) => v.report_id !== reportId);

    const newValues: DailyReportValue[] = [];
    Object.entries(valuesByGroup).forEach(([groupId, vals]) => {
      const vItem: DailyReportValue = {
        id: `val_${reportId}_${groupId}`,
        report_id: reportId,
        indicator_group_id: groupId,
        total_count: vals.total,
        present_count: vals.present,
        absent_count: vals.absent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      allValues.push(vItem);
      newValues.push(vItem);
    });

    localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));

    // PERSIST DIRECTLY TO SUPABASE (Awaited with timeout to ensure cloud persistence before realtime broadcast)
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const upsertPromise = (async () => {
          // 1. Tự động kiểm tra / đẩy profile của người tạo lên Supabase nếu chưa có để tránh lỗi FK
          if (user && user.id) {
            try {
              await supabase.from('profiles').upsert(user);
            } catch (pErr) {
              console.warn('Supabase upsert user profile warning:', pErr);
            }
          }

          // 2. Tìm ID báo cáo thực tế trên Cloud nếu đã tồn tại cho (class_id, report_date)
          let effectiveReportId = reportId;
          try {
            const { data: cloudRep } = await supabase
              .from('daily_reports')
              .select('id')
              .eq('class_id', classId)
              .eq('report_date', reportDate)
              .maybeSingle();
            if (cloudRep && cloudRep.id) {
              effectiveReportId = cloudRep.id;
            }
          } catch (e) {
            console.warn('Supabase check existing report error:', e);
          }

          let repData: any = {
            ...report,
            id: effectiveReportId,
            report_date: reportDate,
          };

          let { error: repErr } = await supabase.from('daily_reports').upsert(repData, { onConflict: 'class_id,report_date' });

          // Nếu Supabase báo lỗi chưa có cột (schema cũ) -> loại bỏ các cột mở rộng và thử lại
          if (repErr && (repErr.message?.includes('reported_time') || repErr.message?.includes('absent_students') || repErr.message?.includes('locked_at') || repErr.code === 'PGRST204')) {
            const { reported_time: _unused1, absent_students: _unused2, locked_at: _unused3, ...repWithoutExtra } = repData;
            const retryRes = await supabase.from('daily_reports').upsert(repWithoutExtra, { onConflict: 'class_id,report_date' });
            repErr = retryRes.error;
          }

          // Nếu lỗi khóa ngoại người tạo (23503) -> thử lại với created_by = null
          if (repErr && (repErr.code === '23503' || repErr.message?.includes('foreign key') || repErr.message?.includes('profiles'))) {
            const repWithoutCreator = { ...repData, created_by: null };
            const retryRes = await supabase.from('daily_reports').upsert(repWithoutCreator, { onConflict: 'class_id,report_date' });
            repErr = retryRes.error;
          }

          if (repErr) {
            console.error('Supabase upsert daily_reports error:', repErr);
            return;
          }

          // 3. Chuẩn bị và đẩy daily_report_values với report_id chính xác
          if (newValues.length > 0) {
            // Lấy danh sách ID giá trị chỉ tiêu hiện có trên Cloud để tái sử dụng nếu cần
            const cloudValKeyMap = new Map<string, string>();
            try {
              const { data: cloudVals } = await supabase
                .from('daily_report_values')
                .select('id, indicator_group_id')
                .eq('report_id', effectiveReportId);
              if (cloudVals) {
                cloudVals.forEach((cv) => cloudValKeyMap.set(cv.indicator_group_id, cv.id));
              }
            } catch {}

            const cloudValues = newValues.map((v) => ({
              ...v,
              id: cloudValKeyMap.get(v.indicator_group_id) || `val_${effectiveReportId}_${v.indicator_group_id}`,
              report_id: effectiveReportId,
              total_count: Math.max(0, Number(v.total_count) || 0),
              present_count: Math.max(0, Number(v.present_count) || 0),
              absent_count: Math.max(0, Number(v.absent_count) || 0),
            }));

            let { error: valErr } = await supabase
              .from('daily_report_values')
              .upsert(cloudValues, { onConflict: 'report_id,indicator_group_id' });

            // Nếu gặp lỗi FK với indicator_groups, tự động đẩy indicator_groups trước rồi thử lại
            if (valErr && (valErr.code === '23503' || valErr.message?.includes('indicator_groups'))) {
              const indicators = await this.getIndicatorGroups();
              if (indicators.length > 0) {
                await supabase.from('indicator_groups').upsert(indicators);
                const retryVal = await supabase
                  .from('daily_report_values')
                  .upsert(cloudValues, { onConflict: 'report_id,indicator_group_id' });
                valErr = retryVal.error;
              }
            }

            if (valErr) {
              console.error('Supabase upsert daily_report_values error:', valErr);
            }
          }
        })();

        // Wait up to 4 seconds for Supabase to commit so other clients reading from cloud immediately see it
        await Promise.race([
          upsertPromise,
          new Promise((resolve) => setTimeout(resolve, 4000))
        ]);
      } catch (err) {
        console.error('Supabase sync report error:', err);
      }
    }

    // Add audit log
    // Read from localStorage synchronously to prevent blocking the UI
    const rawClasses = localStorage.getItem('classes') || localStorage.getItem(STORAGE_KEYS.CLASSES);
    let cls;
    try {
       const classes = rawClasses ? JSON.parse(rawClasses) : [];
       cls = classes.find(c => c.id === classId);
    } catch(e) {}

    // Fire and forget log for instant UI
    this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: oldReport ? 'UPDATE' : 'CREATE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: oldReport,
      new_data: { valuesByGroup, notes },
    }).catch(console.error);

    // Auto-resolve any pending attendance reminders for this class and date
    this.resolveAttendanceReminders(classId, reportDate, user, cls?.class_name || classId).catch(console.error);

    notifyRealtimeChange('daily_reports', { reportId, classId, reportDate });
    return { report, values: newValues };
  },

  async lockReport(reportId: string, locked: boolean, adminUser: Profile): Promise<void> {
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const rep = reports.find((r) => r.id === reportId);
    if (rep) {
      rep.status = locked ? 'LOCKED' : 'SUBMITTED';
      rep.locked_at = locked ? new Date().toISOString() : undefined;
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          await supabase
            .from('daily_reports')
            .update({
              status: rep.status,
              locked_at: rep.locked_at || null,
            })
            .eq('id', reportId);
        } catch (e) {
          console.error('Supabase lockReport error:', e);
        }
      }

      const classes = await this.getClasses();
      const cls = classes.find((c) => c.id === rep.class_id);
      await this.addLog({
        user_id: adminUser.id,
        user_name: adminUser.full_name,
        user_role: adminUser.role,
        action: locked ? 'LOCK' : 'UNLOCK',
        class_name: cls?.class_name,
        report_date: rep.report_date,
      });

      notifyRealtimeChange('daily_reports');
    }
  },

  /**
   * Reset / Xóa báo cáo sĩ số của một lớp theo ngày về trạng thái CHƯA BÁO CÁO (nếu báo cáo nhầm)
   */
  async deleteDailyReport(classId: string, reportDate: string, user: Profile): Promise<boolean> {
    ensureInitialized();

    // Kiểm tra quyền
    const isAllowed = user.role === 'ADMIN' || user.role === 'BGH' || (user.role === 'GVCN' && user.assigned_class_id === classId);
    if (!isAllowed) {
      throw new Error('Bạn không có quyền reset báo cáo sĩ số này!');
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const reportToDelete = reports.find((r) => r.class_id === classId && r.report_date === reportDate);

    if (!reportToDelete) {
      return false;
    }
    
    // Kiểm tra khóa
    if (reportToDelete.status === 'LOCKED') {
      throw new Error('Báo cáo đã bị khóa, không thể reset!');
    }

    // 1. Xóa khỏi danh sách reports cục bộ
    const filteredReports = reports.filter((r) => r.id !== reportToDelete.id);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(filteredReports));

    // 2. Xóa các giá trị chỉ tiêu tương ứng trong daily_report_values
    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    const filteredValues = allValues.filter((v) => v.report_id !== reportToDelete.id);
    localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(filteredValues));

    // 3. Xóa trên Supabase nếu có kết nối
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('daily_report_values').delete().eq('report_id', reportToDelete.id);
        await supabase.from('daily_reports').delete().eq('class_id', classId).eq('report_date', reportDate);
      } catch (err) {
        console.error('Supabase delete daily report error:', err);
      }
    }

    // 4. Ghi log kiểm toán
    const classes = await this.getClasses();
    const cls = classes.find((c) => c.id === classId);
    await this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: 'DELETE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: reportToDelete,
      new_data: { status: 'NOT_REPORTED', note: 'Reset trạng thái báo cáo nhầm về Chưa báo cáo' },
    });

    notifyRealtimeChange('daily_reports', { classId, reportDate, action: 'RESET' });
    return true;
  },

  async lockAllReportsForDate(reportDate: string, locked: boolean, adminUser: Profile, campusId?: string): Promise<void> {
    ensureInitialized();
    const classes = await this.getClasses();
    let targetClasses = classes.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      targetClasses = targetClasses.filter((c) => c.campus_id === campusId);
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const now = new Date().toISOString();

    const supabase = getSupabaseClient();
    const isConnected = supabase && isSupabaseConnected();

    let changed = false;

    for (const cls of targetClasses) {
      const existingIndex = reports.findIndex((r) => r.class_id === cls.id && r.report_date === reportDate);
      if (existingIndex >= 0) {
        if (reports[existingIndex].status !== (locked ? 'LOCKED' : 'SUBMITTED')) {
          reports[existingIndex].status = locked ? 'LOCKED' : 'SUBMITTED';
          reports[existingIndex].locked_at = locked ? now : undefined;
          changed = true;

          if (isConnected) {
            try {
              await supabase
                .from('daily_reports')
                .update({
                  status: reports[existingIndex].status,
                  locked_at: reports[existingIndex].locked_at || null,
                })
                .eq('id', reports[existingIndex].id);
            } catch (e) {
              console.error('Supabase lockAllReports error:', e);
            }
          }
        }
      } else if (locked) {
        // Create empty locked report for unreported classes
        const newReport: DailyReport = {
          id: `rep_${reportDate}_${cls.id}_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          class_id: cls.id,
          report_date: reportDate,
          created_by: adminUser.id,
          created_at: now,
          updated_at: now,
          status: 'LOCKED',
          locked_at: now,
          notes: '',
          absent_students: [],
        };
        reports.push(newReport);
        changed = true;

        if (isConnected) {
          try {
            await supabase.from('daily_reports').insert(newReport);
          } catch (e) {
            console.error('Supabase insert locked report error:', e);
          }
        }
      }
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

      await this.addLog({
        user_id: adminUser.id,
        user_name: adminUser.full_name,
        user_role: adminUser.role,
        action: locked ? 'LOCK' : 'UNLOCK',
        class_name: campusId && campusId !== 'all' ? `Tất cả lớp (${campusId})` : 'Tất cả lớp',
        report_date: reportDate,
      });

      notifyRealtimeChange('daily_reports');
    }
  },

  // --- 8. Aggregate Reports for Day ---
  async getDailyAggregate(reportDate: string, campusId?: string): Promise<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    unreportedClasses: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
  }> {
    ensureInitialized();

    // Pull fresh data from Supabase if connected
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudReports } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('report_date', reportDate);

        if (cloudReports) {
          const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
          let reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
          
          cloudReports.forEach((cRep) => {
            const idx = reports.findIndex((r) => r.id === cRep.id || (r.class_id === cRep.class_id && r.report_date === cRep.report_date));
            if (idx >= 0) reports[idx] = cRep;
            else reports.push(cRep);
          });
          localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

          const repIds = cloudReports.map((r) => r.id);
          if (repIds.length > 0) {
            const { data: cloudValues } = await supabase
              .from('daily_report_values')
              .select('*')
              .in('report_id', repIds);

            if (cloudValues) {
              const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
              let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
              cloudValues.forEach((cVal) => {
                const vIdx = allValues.findIndex(v => v.id === cVal.id || (v.report_id === cVal.report_id && v.indicator_group_id === cVal.indicator_group_id));
                if (vIdx >= 0) allValues[vIdx] = cVal;
                else allValues.push(cVal);
              });
              localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));
            }
          }
        }
      } catch (err) {
        console.warn('Supabase fetch daily aggregate reports fallback to local:', err);
      }
    }

    const [classes, profiles, indicators, allNotifs] = await Promise.all([
      this.getClasses(),
      this.getProfiles(),
      this.getIndicatorGroups(),
      this.getNotifications(),
    ]);

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const dayReports = reports.filter((r) => r.report_date === reportDate);

    // Calculate distinct past report dates to determine unreported days count
    const distinctDates = Array.from(new Set(reports.map((r) => r.report_date))).filter((d) => d <= reportDate);
    const evaluationDates = distinctDates.length > 0 ? distinctDates : [reportDate];

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    let activeClasses = classes.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      activeClasses = activeClasses.filter(c => c.campus_id === campusId);
    }
    const totalClasses = activeClasses.length;

    let reportedClasses = 0;
    const totals: Record<string, { total: number; present: number; absent: number; rate: number }> = {};
    indicators.forEach((ig) => {
      totals[ig.id] = { total: 0, present: 0, absent: 0, rate: 0 };
    });

    const rows: ClassReportRow[] = activeClasses.map((cls) => {
      const teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id) || profiles.find((p) => p.assigned_class_id === cls.id);
      const rep = dayReports.find((r) => r.class_id === cls.id);
      const repValues = rep ? allValues.filter((v) => v.report_id === rep.id) : [];
      const hasRealData = repValues.some((v) => (v.total_count || 0) > 0);
      const isReported = Boolean(rep && (hasRealData || rep.status === 'LOCKED'));
      let status: ReportStatus = 'NOT_REPORTED';

      if (cls.is_locked || rep?.status === 'LOCKED') {
        status = 'LOCKED';
      } else if (isReported) {
        status = 'REPORTED';
      }

      if (isReported) {
        reportedClasses++;
      }

      // Calculate reminder & unsubmitted stats for this specific class
      const classNotifs = allNotifs.filter(
        (n) =>
          (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT') &&
          (n.class_id === cls.id || (teacher && n.user_id === teacher.id))
      );
      const todayReminders = classNotifs.filter((n) => n.date === reportDate).length;
      const totalReminders = classNotifs.length;

      let unreportedDays = 0;
      evaluationDates.forEach((d) => {
        const hasDRep = reports.some(
          (r) => r.class_id === cls.id && r.report_date === d && (r.status === 'SUBMITTED' || r.status === 'LOCKED')
        );
        if (!hasDRep) unreportedDays++;
      });
      if (status === 'NOT_REPORTED' && unreportedDays === 0) {
        unreportedDays = 1;
      }

      const values: Record<string, { total: number; present: number; absent: number; rate: number }> = {};

      indicators.forEach((ig) => {
        const val = repValues.find((v) => v.indicator_group_id === ig.id);
        const total = val ? val.total_count : 0;
        const present = val ? val.present_count : 0;
        const absent = val ? val.absent_count : 0;
        const rate = total > 0 ? (absent / total) * 100 : 0;

        values[ig.id] = { total, present, absent, rate };

        if (isReported) {
          totals[ig.id].total += total;
          totals[ig.id].present += present;
          totals[ig.id].absent += absent;
        }
      });

      const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];
      const mainTotal = values[mainIndicator?.id]?.total || 0;
      const mainAbsent = values[mainIndicator?.id]?.absent || 0;
      const mainPresent = values[mainIndicator?.id]?.present || 0;

      const overallRate = mainTotal > 0 ? (mainAbsent / mainTotal) * 100 : 0;
      const overallPresentRate = mainTotal > 0 ? (mainPresent / mainTotal) * 100 : 0;

      return {
        classItem: cls,
        teacher,
        report: rep,
        status,
        values,
        overallRate,
        overallPresentRate,
        reminderStats: {
          todayReminders,
          totalReminders,
          unreportedDays,
        },
      };
    });

    indicators.forEach((ig) => {
      const t = totals[ig.id];
      t.rate = t.total > 0 ? (t.absent / t.total) * 100 : 0;
    });

    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];
    const mainSchoolTotal = totals[mainIndicator?.id]?.total || 0;
    const mainSchoolPresent = totals[mainIndicator?.id]?.present || 0;
    const mainSchoolAbsent = totals[mainIndicator?.id]?.absent || 0;
    const mainSchoolRate = mainSchoolTotal > 0 ? (mainSchoolAbsent / mainSchoolTotal) * 100 : 0;
    const mainSchoolPresentRate = mainSchoolTotal > 0 ? (mainSchoolPresent / mainSchoolTotal) * 100 : 0;

    return {
      date: reportDate,
      totalClasses,
      reportedClasses,
      unreportedClasses: totalClasses - reportedClasses,
      rows,
      totals,
      overallSchool: {
        total: mainSchoolTotal,
        present: mainSchoolPresent,
        absent: mainSchoolAbsent,
        rate: mainSchoolRate,
        presentRate: mainSchoolPresentRate,
      },
    };
  },

  // --- 9. Monthly Aggregate ---
  async getMonthlyAggregate(yearMonth: string, campusId?: string): Promise<{
    yearMonth: string;
    totalDaysReported: number;
    totalAbsentAccumulated: number;
    avgAbsentRate: number;
    highestAbsentClass: { className: string; rate: number } | null;
    lowestAbsentClass: { className: string; rate: number } | null;
    dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[];
  }> {
    ensureInitialized();

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudReports } = await supabase
          .from('daily_reports')
          .select('*')
          .gte('report_date', `${yearMonth}-01`)
          .lte('report_date', `${yearMonth}-31`);

        if (cloudReports && cloudReports.length > 0) {
          const repIds = cloudReports.map((r) => r.id);
          const { data: cloudValues } = await supabase
            .from('daily_report_values')
            .select('*')
            .in('report_id', repIds);

          if (cloudValues) {
            const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
            let reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
            cloudReports.forEach((cRep) => {
              const idx = reports.findIndex((r) => r.id === cRep.id);
              if (idx >= 0) reports[idx] = cRep;
              else reports.push(cRep);
            });
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

            const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
            let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
            allValues = allValues.filter((v) => !repIds.includes(v.report_id)).concat(cloudValues);
            localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));
          }
        }
      } catch (err) {
        console.warn('Supabase fetch monthly aggregate fallback to local:', err);
      }
    }

    const [allClasses, indicators] = await Promise.all([
      this.getClasses(),
      this.getIndicatorGroups(),
    ]);

    let activeClasses = allClasses.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      activeClasses = activeClasses.filter((c) => c.campus_id === campusId);
    }
    const activeClassIds = new Set(activeClasses.map((c) => c.id));

    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    // Only include reports for the active filtered classes
    const monthReports = reports.filter((r) => r.report_date.startsWith(yearMonth) && activeClassIds.has(r.class_id));

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    const dateMap = new Map<string, DailyReport[]>();
    monthReports.forEach((r) => {
      const list = dateMap.get(r.report_date) || [];
      list.push(r);
      dateMap.set(r.report_date, list);
    });

    const dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[] = [];
    let totalAbsentAccumulated = 0;
    let sumRates = 0;

    const classStats = new Map<string, { className: string; total: number; absent: number }>();
    activeClasses.forEach((c) => classStats.set(c.id, { className: c.class_name, total: 0, absent: 0 }));

    Array.from(dateMap.keys()).sort().forEach((date) => {
      const repList = dateMap.get(date) || [];
      let dayTotal = 0;
      let dayAbsent = 0;

      repList.forEach((r) => {
        const val = allValues.find((v) => v.report_id === r.id && v.indicator_group_id === mainIndicator?.id);
        if (val) {
          dayTotal += val.total_count;
          dayAbsent += val.absent_count;

          const cStat = classStats.get(r.class_id);
          if (cStat) {
            cStat.total += val.total_count;
            cStat.absent += val.absent_count;
          }
        }
      });

      const dayRate = dayTotal > 0 ? (dayAbsent / dayTotal) * 100 : 0;
      totalAbsentAccumulated += dayAbsent;
      sumRates += dayRate;

      dayStats.push({
        date,
        reportedCount: repList.length,
        totalStudents: dayTotal,
        absentStudents: dayAbsent,
        rate: dayRate,
      });
    });

    const totalDaysReported = dayStats.length;
    const avgAbsentRate = totalDaysReported > 0 ? sumRates / totalDaysReported : 0;

    let highestAbsentClass: { className: string; rate: number } | null = null;
    let lowestAbsentClass: { className: string; rate: number } | null = null;

    Array.from(classStats.values()).forEach((c) => {
      if (c.total > 0) {
        const rate = (c.absent / c.total) * 100;
        if (!highestAbsentClass || rate > highestAbsentClass.rate) {
          highestAbsentClass = { className: c.className, rate };
        }
        if (!lowestAbsentClass || rate < lowestAbsentClass.rate) {
          lowestAbsentClass = { className: c.className, rate };
        }
      }
    });

    return {
      yearMonth,
      totalDaysReported,
      totalAbsentAccumulated,
      avgAbsentRate,
      highestAbsentClass,
      lowestAbsentClass,
      dayStats,
    };
  },

  // --- 9.1 Quản lý Ngày Nghỉ Học Sinh (Không xếp loại những ngày nghỉ) ---
  async getOffDays(): Promise<SchoolOffDay[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.OFF_DAYS);
    if (!raw) {
      const defaultOffDays: SchoolOffDay[] = [
        { id: 'off_2026_09_02', date: '2026-09-02', name: 'Nghỉ lễ Quốc khánh 2/9', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2026_09_03', date: '2026-09-03', name: 'Nghỉ lễ Quốc khánh (Nghỉ bù)', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2026_11_20', date: '2026-11-20', name: 'Kỷ niệm Ngày Nhà giáo Việt Nam 20/11', type: 'SPECIAL', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_01_01', date: '2027-01-01', name: 'Nghỉ Tết Dương lịch', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_04_30', date: '2027-04-30', name: 'Nghỉ lễ 30/4 Giải phóng miền Nam', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_05_01', date: '2027-05-01', name: 'Nghỉ Quốc tế Lao động 1/5', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
      ];
      localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(defaultOffDays));
      return defaultOffDays;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  async saveOffDay(offDay: SchoolOffDay): Promise<void> {
    const list = await this.getOffDays();
    const idx = list.findIndex((o) => o.id === offDay.id || o.date === offDay.date);
    if (idx >= 0) {
      list[idx] = offDay;
    } else {
      list.push(offDay);
    }
    localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_off_days').upsert({
          id: offDay.id,
          date: offDay.date,
          name: offDay.name,
          type: offDay.type || 'HOLIDAY',
          applies_to: offDay.applies_to || 'ALL',
          created_at: offDay.created_at || new Date().toISOString(),
        });
      } catch (e) {}
    }

    notifyRealtimeChange('off_days', list);
  },

  async deleteOffDay(id: string): Promise<void> {
    const list = await this.getOffDays();
    const updated = list.filter((o) => o.id !== id);
    localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_off_days').delete().eq('id', id);
      } catch (e) {}
    }

    notifyRealtimeChange('off_days', updated);
  },

  // --- 9.2 Tổng kết & Xếp hạng duy trì sĩ số (Tuần / Tháng / Năm - Loại trừ ngày nghỉ) ---
  async getAttendanceRanking(options: {
    periodType: AttendancePeriodType;
    startDate: string;
    endDate: string;
    periodLabel: string;
    weekNumber?: number;
    schoolWeekInfo?: SchoolWeekInfo;
    campusId?: string;
    grade?: number | 'ALL';
    excludeSundays?: boolean;
    excludeSaturdays?: boolean;
    excludeEmptySchoolDays?: boolean;
  }): Promise<AttendanceRankingSummary> {
    ensureInitialized();
    const {
      periodType,
      startDate,
      endDate,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      campusId = 'all',
      grade = 'ALL',
      excludeSundays = true,
      excludeSaturdays = periodType === 'WEEK' ? true : false,
      excludeEmptySchoolDays = true,
    } = options;

    const [allClasses, indicators, profiles, offDays, campuses, settings] = await Promise.all([
      this.getClasses(),
      this.getIndicatorGroups(),
      this.getProfiles(),
      this.getOffDays(),
      this.getCampuses(),
      this.getSettings(),
    ]);

    const thresholdExcellent = settings?.ranking_threshold_excellent ?? 98;
    const thresholdGood = settings?.ranking_threshold_good ?? 95;
    const thresholdFair = settings?.ranking_threshold_fair ?? 90;
    const enableEarlyBonus = settings?.enable_early_report_bonus ?? true;
    const earlyDeadline = settings?.early_report_deadline || DEFAULT_EARLY_REPORT_DEADLINE;
    const bonusPerDay = settings?.early_report_bonus_points ?? DEFAULT_EARLY_REPORT_BONUS_PER_DAY;
    const maxBonus = settings?.early_report_max_bonus ?? DEFAULT_EARLY_REPORT_MAX_BONUS;

    let targetClasses = allClasses.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      targetClasses = targetClasses.filter((c) => c.campus_id === campusId);
    }
    if (grade !== 'ALL') {
      targetClasses = targetClasses.filter((c) => c.grade === Number(grade));
    }

    const targetClassIds = new Set(targetClasses.map((c) => c.id));
    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    // Filter reports in date range
    const periodReports = reports.filter(
      (r) => r.report_date >= startDate && r.report_date <= endDate && targetClassIds.has(r.class_id)
    );

    // Group reports by date
    const reportsByDate = new Map<string, DailyReport[]>();
    periodReports.forEach((r) => {
      const list = reportsByDate.get(r.report_date) || [];
      list.push(r);
      reportsByDate.set(r.report_date, list);
    });

    // Generate list of all calendar days in [startDate, endDate] safely without timezone shifts
    const dateList: string[] = [];
    let curDate = startDate;
    while (curDate <= endDate) {
      dateList.push(curDate);
      curDate = addDaysToDateStr(curDate, 1);
    }

    const excludedOffDays: Array<{ date: string; name: string }> = [];
    const validDates: string[] = [];

    // Check each date
    dateList.forEach((dStr) => {
      const [y, m, d] = parseDateParts(dStr);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      const dayOfWeek = dt.getDay(); // 0 = Sunday, 6 = Saturday

      // 1. Check Sunday
      if (excludeSundays && dayOfWeek === 0) {
        excludedOffDays.push({ date: dStr, name: 'Chủ nhật (Nghỉ cuối tuần)' });
        return;
      }

      // 2. Check Saturday if enabled
      if (excludeSaturdays && dayOfWeek === 6) {
        excludedOffDays.push({ date: dStr, name: 'Thứ bảy (Nghỉ cuối tuần)' });
        return;
      }

      // 3. Check OffDays registry
      const offMatch = offDays.find(
        (o) => o.date === dStr && (o.applies_to === 'ALL' || o.applies_to === campusId)
      );
      if (offMatch) {
        excludedOffDays.push({ date: dStr, name: offMatch.name });
        return;
      }

      // 4. Check if school had no reports (entire school day off)
      const dayReports = reportsByDate.get(dStr) || [];
      if (excludeEmptySchoolDays && dayReports.length === 0) {
        excludedOffDays.push({ date: dStr, name: 'Ngày không có lịch học / Toàn trường nghỉ' });
        return;
      }

      validDates.push(dStr);
    });

    // Calculate attendance score for ALL active classes first to determine both schoolRank and campusRank
    const allCalculatedRanks: ClassAttendanceRank[] = [];
    let totalSchoolPossible = 0;
    let totalSchoolPresent = 0;
    let totalSchoolAbsent = 0;

    const totalActiveSchoolClasses = allClasses.filter((c) => c.active).length;

    // Process all active classes
    allClasses.filter((c) => c.active).forEach((cls) => {
      const teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id);
      const campusObj = campuses.find((c) => c.id === cls.campus_id);
      const cName = campusObj?.name || 'Khu chính';
      const cId = cls.campus_id || 'main';

      let classPossible = 0;
      let classPresent = 0;
      let classAbsent = 0;
      let reportedDays = 0;
      let earlyReportDays = 0;
      const reportTimes: string[] = [];
      let lastKnownTotal = 0;

      validDates.forEach((dateStr) => {
        const dayRep = reports.find((r) => r.class_id === cls.id && r.report_date === dateStr);
        if (dayRep) {
          reportedDays++;

          // Kiểm tra xem báo cáo có được gửi sớm trước giờ quy định không
          const { isEarly, timeStr } = checkIsReportEarly(dayRep, earlyDeadline);
          if (isEarly) {
            earlyReportDays++;
          }
          if (timeStr && timeStr !== '--:--') {
            reportTimes.push(timeStr);
          }

          const val = allValues.find(
            (v) => v.report_id === dayRep.id && v.indicator_group_id === mainIndicator?.id
          );
          if (val) {
            classPossible += val.total_count;
            classPresent += val.present_count;
            classAbsent += val.absent_count;
            if (val.total_count > 0) lastKnownTotal = val.total_count;
          }
        }
      });

      // If no report on valid dates, fallback enrollment
      if (lastKnownTotal === 0) {
        const anyRep = reports.find((r) => r.class_id === cls.id);
        if (anyRep) {
          const val = allValues.find((v) => v.report_id === anyRep.id && v.indicator_group_id === mainIndicator?.id);
          if (val) lastKnownTotal = val.total_count;
        }
      }

      const attendanceRate = classPossible > 0 ? (classPresent / classPossible) * 100 : 0;
      const absentRate = classPossible > 0 ? (classAbsent / classPossible) * 100 : 0;

      // Tính điểm cộng nộp báo cáo sớm
      const rawEarlyBonus = enableEarlyBonus ? earlyReportDays * bonusPerDay : 0;
      const earlyBonusPoints = maxBonus > 0 ? Math.min(rawEarlyBonus, maxBonus) : rawEarlyBonus;
      const roundedAttendanceRate = Math.round(attendanceRate * 100) / 100;
      const roundedEarlyBonus = Math.round(earlyBonusPoints * 100) / 100;
      const totalScore = Math.round((roundedAttendanceRate + roundedEarlyBonus) * 100) / 100;

      // Tính giờ báo cáo trung bình
      let averageReportTime: string | undefined = undefined;
      if (reportTimes.length > 0) {
        const totalMinutes = reportTimes.reduce((acc, t) => {
          const [h, m] = t.split(':').map(Number);
          return acc + (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
        }, 0);
        const avgMin = Math.round(totalMinutes / reportTimes.length);
        const avgH = Math.floor(avgMin / 60);
        const avgM = avgMin % 60;
        averageReportTime = `${String(avgH).padStart(2, '0')}:${String(avgM).padStart(2, '0')}`;
      }

      let classification: ClassAttendanceRank['classification'] = 'NEEDS_IMPROVEMENT';
      let classificationLabel = 'Cần cố gắng';

      if (classPossible > 0) {
        const evalScore = enableEarlyBonus ? totalScore : roundedAttendanceRate;
        if (evalScore >= thresholdExcellent) {
          classification = 'EXCELLENT';
          classificationLabel = 'Xuất sắc';
        } else if (evalScore >= thresholdGood) {
          classification = 'GOOD';
          classificationLabel = 'Tốt';
        } else if (evalScore >= thresholdFair) {
          classification = 'FAIR';
          classificationLabel = 'Khá';
        } else {
          classification = 'NEEDS_IMPROVEMENT';
          classificationLabel = 'Cần cố gắng';
        }
      } else {
        classificationLabel = 'Chưa có số liệu';
      }

      totalSchoolPossible += classPossible;
      totalSchoolPresent += classPresent;
      totalSchoolAbsent += classAbsent;

      allCalculatedRanks.push({
        rank: 0,
        schoolRank: 0,
        totalClassesInSchool: totalActiveSchoolClasses,
        campusId: cId,
        campusName: cName,
        campusRank: 0,
        totalClassesInCampus: 0,
        classItem: cls,
        teacher,
        enrollment: lastKnownTotal,
        validSchoolDays: validDates.length,
        reportedDays,
        totalPossibleAttendances: classPossible,
        totalPresentAttendances: classPresent,
        totalAbsentAttendances: classAbsent,
        attendanceRate: roundedAttendanceRate,
        absentRate: Math.round(absentRate * 100) / 100,
        earlyReportDays,
        earlyBonusPoints: roundedEarlyBonus,
        averageReportTime,
        totalScore,
        classification,
        classificationLabel,
      });
    });

    // So sánh thứ hạng thi đua toàn diện (Điểm tổng > Tỷ lệ chuyên cần > Số ngày báo sớm > Giờ nộp sớm > Ít vắng)
    const compareRanks = (a: ClassAttendanceRank, b: ClassAttendanceRank) => {
      // 1. Điểm thi đua tổng kết (đã bao gồm điểm thưởng báo sớm)
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // 2. Tỷ lệ chuyên cần (%)
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      // 3. Số ngày báo sớm nhiều hơn
      if (b.earlyReportDays !== a.earlyReportDays) {
        return b.earlyReportDays - a.earlyReportDays;
      }
      // 4. Giờ báo cáo trung bình sớm hơn
      if (a.averageReportTime && b.averageReportTime && a.averageReportTime !== b.averageReportTime) {
        return a.averageReportTime.localeCompare(b.averageReportTime);
      }
      // 5. Ít lượt vắng hơn
      if (a.totalAbsentAttendances !== b.totalAbsentAttendances) {
        return a.totalAbsentAttendances - b.totalAbsentAttendances;
      }
      // 6. Số ngày đã báo cáo
      return b.reportedDays - a.reportedDays;
    };

    // 1. Sort all school-wide to calculate schoolRank
    allCalculatedRanks.sort(compareRanks);

    allCalculatedRanks.forEach((item, idx) => {
      item.schoolRank = idx + 1;
    });

    // 2. Group by campus to calculate campusRank and campusSummaries
    const campusGroups = new Map<string, ClassAttendanceRank[]>();
    allCalculatedRanks.forEach((item) => {
      const cId = item.campusId || 'main';
      const grp = campusGroups.get(cId) || [];
      grp.push(item);
      campusGroups.set(cId, grp);
    });

    const campusSummaries: CampusRankingSummary[] = [];

    // Order campuses: match order in campuses array if available
    const knownCampusIds = new Set<string>();
    campuses.forEach((c) => {
      knownCampusIds.add(c.id);
      const grp = campusGroups.get(c.id) || [];
      // Sort within campus with comprehensive emulation criteria
      grp.sort(compareRanks);

      grp.forEach((item, idx) => {
        item.campusRank = idx + 1;
        item.totalClassesInCampus = grp.length;
      });

      const totalStudents = grp.reduce((acc, r) => acc + r.enrollment, 0);
      const totalPresent = grp.reduce((acc, r) => acc + r.totalPresentAttendances, 0);
      const totalAbsent = grp.reduce((acc, r) => acc + r.totalAbsentAttendances, 0);
      const totalPossible = grp.reduce((acc, r) => acc + r.totalPossibleAttendances, 0);
      const attendanceRate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 10000) / 100 : 0;

      campusSummaries.push({
        campusId: c.id,
        campusName: c.name,
        totalClasses: grp.length,
        totalStudents,
        totalPresent,
        totalAbsent,
        attendanceRate,
        rankings: grp,
        topPerformers: grp.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3),
      });
    });

    // Handle any remaining groups (e.g. main/unassigned)
    campusGroups.forEach((grp, cId) => {
      if (!knownCampusIds.has(cId)) {
        grp.sort(compareRanks);
        grp.forEach((item, idx) => {
          item.campusRank = idx + 1;
          item.totalClassesInCampus = grp.length;
        });

        const totalStudents = grp.reduce((acc, r) => acc + r.enrollment, 0);
        const totalPresent = grp.reduce((acc, r) => acc + r.totalPresentAttendances, 0);
        const totalAbsent = grp.reduce((acc, r) => acc + r.totalAbsentAttendances, 0);
        const totalPossible = grp.reduce((acc, r) => acc + r.totalPossibleAttendances, 0);
        const attendanceRate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 10000) / 100 : 0;

        campusSummaries.push({
          campusId: cId,
          campusName: grp[0]?.campusName || 'Khu chính',
          totalClasses: grp.length,
          totalStudents,
          totalPresent,
          totalAbsent,
          attendanceRate,
          rankings: grp,
          topPerformers: grp.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3),
        });
      }
    });

    // 3. Filter list according to request criteria (campusId and grade)
    let filteredRanks = [...allCalculatedRanks];
    if (campusId && campusId !== 'all') {
      filteredRanks = filteredRanks.filter((r) => r.campusId === campusId || r.classItem.campus_id === campusId);
    }
    if (grade !== 'ALL') {
      filteredRanks = filteredRanks.filter((r) => r.classItem.grade === Number(grade));
    }

    // Set rank for display based on context
    filteredRanks.forEach((item, idx) => {
      if (campusId && campusId !== 'all') {
        item.rank = item.campusRank || (idx + 1);
      } else {
        item.rank = idx + 1;
      }
    });

    const topPerformers = filteredRanks.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3);
    const schoolAttendanceRate =
      totalSchoolPossible > 0
        ? Math.round((totalSchoolPresent / totalSchoolPossible) * 10000) / 100
        : 0;

    return {
      periodType,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      dateRange: { start: startDate, end: endDate },
      totalDaysInRange: dateList.length,
      totalExcludedDays: excludedOffDays.length,
      excludedOffDays,
      totalValidDays: validDates.length,
      schoolAttendanceRate,
      totalStudents: filteredRanks.reduce((acc, r) => acc + r.enrollment, 0),
      totalPresent: filteredRanks.reduce((acc, r) => acc + r.totalPresentAttendances, 0),
      totalAbsent: filteredRanks.reduce((acc, r) => acc + r.totalAbsentAttendances, 0),
      rankings: filteredRanks,
      topPerformers,
      campusSummaries,
    };
  },

  /**
   * Đồng bộ & Lấy nhanh thông tin xếp hạng thi đua cho lớp của GVCN
   */
  async getClassAttendanceRanking(classId: string, periodType: AttendancePeriodType = 'WEEK'): Promise<ClassAttendanceRank | null> {
    const settings = await this.getSettings();
    const week1Start = settings?.week1_start_date || DEFAULT_WEEK1_START_DATE;
    const todayStr = getTodayDateStr();
    let startDate = '';
    let endDate = '';
    let periodLabel = '';
    let weekNumber: number | undefined = undefined;
    let schoolWeekInfo: SchoolWeekInfo | undefined = undefined;

    if (periodType === 'WEEK') {
      schoolWeekInfo = getSchoolWeekFromDate(todayStr, week1Start);
      startDate = schoolWeekInfo.startDate;
      endDate = schoolWeekInfo.endDate;
      periodLabel = schoolWeekInfo.label;
      weekNumber = schoolWeekInfo.weekNumber;
    } else if (periodType === 'MONTH') {
      const d = new Date();
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      periodLabel = `Tháng ${month}/${year}`;
    } else {
      const d = new Date();
      const year = d.getFullYear();
      startDate = `${year}-09-01`;
      endDate = `${year + 1}-05-31`;
      periodLabel = 'Năm học';
    }

    const summary = await this.getAttendanceRanking({
      periodType,
      startDate,
      endDate,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      campusId: 'all',
      grade: 'ALL',
      excludeSundays: true,
      excludeSaturdays: true,
      excludeEmptySchoolDays: true,
    });

    const found = summary.rankings.find((r) => r.classItem.id === classId);
    return found || null;
  },

  // --- 10. Audit Logs ---
  async getLogs(limit: number = 50): Promise<SystemLog[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase
          .from('system_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch system_logs fallback to local', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    const logs: SystemLog[] = raw ? JSON.parse(raw) : [];
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  },

  async addLog(log: Omit<SystemLog, 'id' | 'created_at'>): Promise<void> {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    const logs: SystemLog[] = raw ? JSON.parse(raw) : [];
    const item: SystemLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    logs.unshift(item);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(0, 200)));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      Promise.resolve().then(async () => {
        try {
          await supabase.from('system_logs').insert(item);
        } catch (e) {
          console.error('Supabase addLog error:', e);
        }
      });
    }
  },

  // --- 11. TWO-WAY MASS SYNC ENGINES ---

  /**
   * Uploads every table & row from Local Storage up to Supabase Cloud
   */
  async syncAllToSupabase(): Promise<{
    success: boolean;
    message: string;
    details: Record<string, { count: number; error?: string }>;
  }> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return {
        success: false,
        message: 'Chưa kết nối tới Supabase Cloud. Vui lòng cấu hình URL và API Key.',
        details: {},
      };
    }

    const details: Record<string, { count: number; error?: string }> = {};

    try {
      // 1. school_settings
      const settings = await this.getSettings();
      let { error: sErr } = await supabase.from('school_settings').upsert(settings);
      if (sErr && (sErr.message?.includes('auto_reminder') || sErr.message?.includes('early_report') || sErr.code === 'PGRST204')) {
        const {
          enable_auto_reminder: _e1,
          auto_reminder_time: _e2,
          reminder_message_template: _e3,
          enable_early_report_bonus: _e4,
          early_report_deadline: _e5,
          early_report_bonus_points: _e6,
          early_report_max_bonus: _e7,
          ...settingsFallback
        } = settings;
        const retrySettings = await supabase.from('school_settings').upsert(settingsFallback);
        sErr = retrySettings.error;
      }
      details.school_settings = { count: 1, error: sErr?.message };

      // 2. school_years
      const years = await this.getSchoolYears();
      if (years.length > 0) {
        let { error: yErr } = await supabase.from('school_years').upsert(years);
        if (yErr && yErr.message?.includes('is_locked')) {
          const yearsClean = years.map(({ is_locked: _l, ...rest }) => rest);
          const retryY = await supabase.from('school_years').upsert(yearsClean);
          yErr = retryY.error;
        }
        details.school_years = { count: years.length, error: yErr?.message };
      }

      // 3. campuses
      const campuses = await this.getCampuses();
      if (campuses.length > 0) {
        const { error: cErr } = await supabase.from('campuses').upsert(campuses);
        details.campuses = { count: campuses.length, error: cErr?.message };
      }

      // 4. profiles
      const profiles = await this.getProfiles();
      if (profiles.length > 0) {
        const { error: pErr } = await supabase.from('profiles').upsert(profiles);
        details.profiles = { count: profiles.length, error: pErr?.message };
      }

      // 5. classes (Sanitize foreign keys so PostgreSQL does not throw foreign key errors)
      const classes = await this.getClasses();
      const validYearIds = new Set(years.map((y) => y.id));
      const validCampusIds = new Set(campuses.map((c) => c.id));
      const validProfileIds = new Set(profiles.map((p) => p.id));

      const cleanedClasses = classes.map((cls) => ({
        ...cls,
        school_year_id: cls.school_year_id && validYearIds.has(cls.school_year_id) ? cls.school_year_id : (years[0]?.id || null),
        campus_id: cls.campus_id && validCampusIds.has(cls.campus_id) ? cls.campus_id : null,
        homeroom_teacher_id: cls.homeroom_teacher_id && validProfileIds.has(cls.homeroom_teacher_id) ? cls.homeroom_teacher_id : null,
        is_locked: Boolean(cls.is_locked),
        sort_order: Number(cls.sort_order || 0),
      }));

      if (cleanedClasses.length > 0) {
        let { error: clErr } = await supabase.from('classes').upsert(cleanedClasses);
        if (clErr && (clErr.message?.includes('is_locked') || clErr.message?.includes('campus_id') || clErr.message?.includes('sort_order'))) {
          const fallbackClasses = cleanedClasses.map(({ is_locked: _l, campus_id: _c, sort_order: _s, ...rest }) => rest);
          const retryCl = await supabase.from('classes').upsert(fallbackClasses);
          clErr = retryCl.error;
        }
        details.classes = { count: cleanedClasses.length, error: clErr?.message };
      }

      const validClassIds = new Set(cleanedClasses.map((c) => c.id));

      // 6. indicator_groups (Tự động loại bỏ icon nếu Supabase schema chưa có cột icon)
      const indicators = await this.getIndicatorGroups();
      if (indicators.length > 0) {
        let { error: iErr } = await supabase.from('indicator_groups').upsert(indicators);
        if (iErr && (iErr.message?.includes('icon') || iErr.code === 'PGRST204')) {
          const indicatorsClean = indicators.map(({ icon: _i, ...rest }) => rest);
          const retryI = await supabase.from('indicator_groups').upsert(indicatorsClean);
          iErr = retryI.error;
        }
        details.indicator_groups = { count: indicators.length, error: iErr?.message };
      }

      // 7. students (Danh sách học sinh của các lớp)
      const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      const students: import('../types').Student[] = rawStudents ? JSON.parse(rawStudents) : [];
      const validStudents = students
        .filter((s) => validClassIds.has(s.class_id))
        .map((s) => ({
          id: s.id,
          class_id: s.class_id,
          full_name: s.full_name,
          address: s.address || '',
          is_boarding: Boolean(s.isBoarding ?? (s as any).is_boarding),
          created_at: s.created_at || new Date().toISOString(),
        }));

      if (validStudents.length > 0) {
        let stErrors: string | undefined;
        for (let i = 0; i < validStudents.length; i += 50) {
          const batch = validStudents.slice(i, i + 50);
          const { error: stErr } = await supabase.from('students').upsert(batch);
          if (stErr) {
            stErrors = stErr.message;
          }
        }
        details.students = { count: validStudents.length, error: stErrors };
      } else {
        details.students = { count: 0 };
      }

      // 8. daily_reports (Khớp ID từ Cloud theo class_id + report_date và giải quyết triệt để unique constraint)
      const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
      const successfulReportIds = new Set<string>();
      const reportIdRemap = new Map<string, string>(); // localReportId -> cloudReportId
      const cloudRepsKeyMap = new Map<string, string>();

      // Lấy danh sách báo cáo đã có trên Cloud để tái sử dụng đúng ID, tránh vi phạm UNIQUE (class_id, report_date)
      try {
        const { data: cloudReps } = await supabase.from('daily_reports').select('id, class_id, report_date');
        if (cloudReps) {
          cloudReps.forEach((cr) => {
            const dateStr = String(cr.report_date).split('T')[0];
            cloudRepsKeyMap.set(`${cr.class_id}_${dateStr}`, cr.id);
          });
        }
      } catch (e) {
        console.warn('Lỗi lấy cloud reports map:', e);
      }

      const validReports = reports
        .filter((r) => validClassIds.has(r.class_id))
        .map((r) => {
          const dateStr = String(r.report_date).split('T')[0];
          const cloudKey = `${r.class_id}_${dateStr}`;
          const finalId = cloudRepsKeyMap.get(cloudKey) || r.id;
          reportIdRemap.set(r.id, finalId);
          return {
            ...r,
            id: finalId,
            report_date: dateStr,
            created_by: r.created_by && validProfileIds.has(r.created_by) ? r.created_by : null,
            reported_time: r.reported_time || null,
            status: (r.status === 'DRAFT' || r.status === 'LOCKED') ? r.status : 'SUBMITTED',
          };
        });

      if (validReports.length > 0) {
        let repErrors: string | undefined;
        for (let i = 0; i < validReports.length; i += 50) {
          const batch = validReports.slice(i, i + 50);
          let { error: rErr } = await supabase.from('daily_reports').upsert(batch, { onConflict: 'class_id,report_date' });
          if (rErr && (rErr.message?.includes('reported_time') || rErr.message?.includes('locked_at') || rErr.code === 'PGRST204')) {
            const batchCleaned = batch.map(({ reported_time: _rt, locked_at: _la, ...rest }) => rest);
            const retryRes = await supabase.from('daily_reports').upsert(batchCleaned, { onConflict: 'class_id,report_date' });
            rErr = retryRes.error;
          }
          if (!rErr) {
            batch.forEach((r) => successfulReportIds.add(r.id));
          } else {
            for (const singleReport of batch) {
              const { error: sRepErr } = await supabase.from('daily_reports').upsert(singleReport, { onConflict: 'class_id,report_date' });
              if (!sRepErr) {
                successfulReportIds.add(singleReport.id);
              }
            }
            repErrors = rErr.message;
          }
        }
        details.daily_reports = { count: validReports.length, error: repErrors };
      } else {
        details.daily_reports = { count: 0 };
      }

      // 9. daily_report_values (Khớp ID từ Cloud theo report_id + indicator_group_id và giải quyết triệt để foreign key)
      const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
      const values: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

      // Lấy danh sách ID báo cáo thực tế đang có trên Cloud sau khi vừa đẩy daily_reports
      let existingCloudReportIds = new Set<string>();
      const cloudKeyToId = new Map<string, string>();
      try {
        const { data: cloudReps } = await supabase.from('daily_reports').select('id, class_id, report_date');
        if (cloudReps && cloudReps.length > 0) {
          cloudReps.forEach((cr) => {
            existingCloudReportIds.add(cr.id);
            const dateStr = String(cr.report_date).split('T')[0];
            cloudKeyToId.set(`${cr.class_id}_${dateStr}`, cr.id);
          });
        }
      } catch (e) {
        console.warn('Lỗi lấy cloud daily_reports:', e);
      }

      // Lấy danh sách chỉ tiêu thực tế trên Cloud
      let existingCloudIndIds = new Set<string>();
      try {
        const { data: cloudInds } = await supabase.from('indicator_groups').select('id');
        if (cloudInds && cloudInds.length > 0) {
          cloudInds.forEach((ci) => existingCloudIndIds.add(ci.id));
        } else {
          indicators.forEach((i) => existingCloudIndIds.add(i.id));
        }
      } catch (e) {
        indicators.forEach((i) => existingCloudIndIds.add(i.id));
      }

      // Lấy danh sách values hiện có trên Cloud để tái sử dụng ID nếu có
      const cloudValuesKeyMap = new Map<string, string>();
      try {
        const { data: cloudVals } = await supabase.from('daily_report_values').select('id, report_id, indicator_group_id');
        if (cloudVals) {
          cloudVals.forEach((cv) => {
            cloudValuesKeyMap.set(`${cv.report_id}_${cv.indicator_group_id}`, cv.id);
          });
        }
      } catch (e) {
        console.warn('Lỗi lấy cloud values map:', e);
      }

      // Map local report ID -> local report
      const localRepMap = new Map(reports.map((r) => [r.id, r]));

      const validValues: DailyReportValue[] = [];
      for (const val of values) {
        let targetReportId = reportIdRemap.get(val.report_id) || val.report_id;
        if (!existingCloudReportIds.has(targetReportId)) {
          const locRep = localRepMap.get(val.report_id);
          if (locRep) {
            const key = `${locRep.class_id}_${String(locRep.report_date).split('T')[0]}`;
            const mappedId = cloudKeyToId.get(key);
            if (mappedId) {
              targetReportId = mappedId;
            }
          }
        }

        // BẮT BUỘC: targetReportId phải thực sự tồn tại trong bảng daily_reports trên Cloud
        // VÀ indicator_group_id phải tồn tại trong bảng indicator_groups trên Cloud
        if (existingCloudReportIds.has(targetReportId) && existingCloudIndIds.has(val.indicator_group_id)) {
          const key = `${targetReportId}_${val.indicator_group_id}`;
          const finalValId = cloudValuesKeyMap.get(key) || val.id;
          validValues.push({
            ...val,
            id: finalValId,
            report_id: targetReportId,
            total_count: Math.max(0, Number(val.total_count) || 0),
            present_count: Math.max(0, Number(val.present_count) || 0),
            absent_count: Math.max(0, Number(val.absent_count) || 0),
          });
        }
      }

      if (validValues.length > 0) {
        let valErrors: string | undefined;
        for (let i = 0; i < validValues.length; i += 100) {
          const batch = validValues.slice(i, i + 100);
          try {
            const { error: vErr } = await supabase.from('daily_report_values').upsert(batch, { onConflict: 'report_id,indicator_group_id' });
            if (vErr) {
              let individualErrors = 0;
              for (const singleVal of batch) {
                try {
                  const { error: singleErr } = await supabase.from('daily_report_values').upsert(singleVal, { onConflict: 'report_id,indicator_group_id' });
                  if (singleErr) individualErrors++;
                } catch {
                  individualErrors++;
                }
              }
              if (individualErrors > 0 && individualErrors === batch.length) {
                valErrors = vErr.message;
              }
            }
          } catch (bErr: any) {
            valErrors = bErr?.message;
          }
        }
        details.daily_report_values = { count: validValues.length, error: valErrors };
      } else {
        details.daily_report_values = { count: 0 };
      }

      // 10. school_off_days (Quản lý ngày nghỉ lễ, tết, thời tiết)
      const offDays = await this.getOffDays();
      if (offDays.length > 0) {
        const cleanedOffDays = offDays.map((o) => ({
          id: o.id,
          date: o.date,
          name: o.name,
          type: o.type || 'HOLIDAY',
          applies_to: o.applies_to || 'ALL',
          created_at: o.created_at || new Date().toISOString(),
        }));
        const { error: oErr } = await supabase.from('school_off_days').upsert(cleanedOffDays);
        details.school_off_days = { count: offDays.length, error: oErr?.message };
      } else {
        details.school_off_days = { count: 0 };
      }

      // 11. notifications (Thông báo hệ thống & Nhắc nhở sĩ số GVCN)
      const rawNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const notifications: AppNotification[] = rawNotifs ? JSON.parse(rawNotifs) : [];
      if (notifications.length > 0) {
        const cleanedNotifs = notifications.map((n) => ({
          id: n.id,
          user_id: n.user_id,
          class_id: n.class_id && validClassIds.has(n.class_id) ? n.class_id : null,
          class_name: n.class_name || null,
          type: n.type,
          title: n.title,
          message: n.message,
          date: n.date || null,
          read: Boolean(n.read),
          action_url: n.action_url || null,
          created_by_name: n.created_by_name || null,
          urgent: Boolean(n.urgent),
          created_at: n.created_at || new Date().toISOString(),
        }));
        const { error: nErr } = await supabase.from('notifications').upsert(cleanedNotifs);
        details.notifications = { count: notifications.length, error: nErr?.message };
      } else {
        details.notifications = { count: 0 };
      }

      // 12. system_logs
      const logs = await this.getLogs(100);
      if (logs.length > 0) {
        const cleanedLogs = logs.map((l) => ({
          ...l,
          report_date: l.report_date && l.report_date.trim() !== '' ? l.report_date : null,
        }));
        const { error: lErr } = await supabase.from('system_logs').upsert(cleanedLogs);
        details.system_logs = { count: logs.length, error: lErr?.message };
      } else {
        details.system_logs = { count: 0 };
      }

      const hasError = Object.values(details).some((d) => Boolean(d.error));

      let errorDetailsString = '';
      if (hasError) {
        const errorList = Object.entries(details)
          .filter(([_, d]) => Boolean(d.error))
          .map(([table, d]) => `${table}: ${d.error}`)
          .join(' | ');
        errorDetailsString = ` (Chi tiết: ${errorList}. Gợi ý: Hãy thử Copy kịch bản tạo bảng bên dưới và chạy lại trong Supabase SQL Editor để cập nhật bảng/cột mới).`;
      }

      return {
        success: !hasError,
        message: hasError
          ? `Đồng bộ hoàn tất một phần.${errorDetailsString}`
          : 'Đã đẩy toàn bộ thiết lập và dữ liệu lên Supabase thành công 100%!',
        details,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ lên Supabase: ${err?.message || err}`,
        details,
      };
    }
  },

  /**
   * Đồng bộ riêng lẻ 1 bảng cụ thể lên Supabase Cloud
   */
  async syncTableToSupabase(tableKey: string): Promise<{ success: boolean; message: string; count: number }> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return { success: false, message: 'Chưa kết nối tới Supabase Cloud.', count: 0 };
    }

    try {
      if (tableKey === 'school_settings') {
        const settings = await this.getSettings();
        let { error } = await supabase.from('school_settings').upsert(settings);
        if (error && (error.message?.includes('auto_reminder') || error.message?.includes('early_report') || error.code === 'PGRST204')) {
          const {
            enable_auto_reminder: _e1,
            auto_reminder_time: _e2,
            reminder_message_template: _e3,
            enable_early_report_bonus: _e4,
            early_report_deadline: _e5,
            early_report_bonus_points: _e6,
            early_report_max_bonus: _e7,
            ...settingsFallback
          } = settings;
          const retry = await supabase.from('school_settings').upsert(settingsFallback);
          error = retry.error;
        }
        if (error) throw new Error(error.message);
        return { success: true, message: 'Đã đẩy cấu hình nhà trường lên Supabase!', count: 1 };
      }

      if (tableKey === 'school_years') {
        const years = await this.getSchoolYears();
        let { error } = await supabase.from('school_years').upsert(years);
        if (error && error.message?.includes('is_locked')) {
          const clean = years.map(({ is_locked: _l, ...rest }) => rest);
          const retry = await supabase.from('school_years').upsert(clean);
          error = retry.error;
        }
        if (error) throw new Error(error.message);
        return { success: true, message: `Đã đẩy ${years.length} năm học lên Supabase!`, count: years.length };
      }

      if (tableKey === 'campuses') {
        const campuses = await this.getCampuses();
        const { error } = await supabase.from('campuses').upsert(campuses);
        if (error) throw new Error(error.message);
        return { success: true, message: `Đã đẩy ${campuses.length} phân hiệu lên Supabase!`, count: campuses.length };
      }

      if (tableKey === 'profiles') {
        const profiles = await this.getProfiles();
        const { error } = await supabase.from('profiles').upsert(profiles);
        if (error) throw new Error(error.message);
        return { success: true, message: `Đã đẩy ${profiles.length} tài khoản lên Supabase!`, count: profiles.length };
      }

      if (tableKey === 'classes') {
        const [classes, years, campuses, profiles] = await Promise.all([
          this.getClasses(),
          this.getSchoolYears(),
          this.getCampuses(),
          this.getProfiles(),
        ]);
        const validYearIds = new Set(years.map((y) => y.id));
        const validCampusIds = new Set(campuses.map((c) => c.id));
        const validProfileIds = new Set(profiles.map((p) => p.id));

        const cleanedClasses = classes.map((cls) => ({
          ...cls,
          school_year_id: cls.school_year_id && validYearIds.has(cls.school_year_id) ? cls.school_year_id : (years[0]?.id || null),
          campus_id: cls.campus_id && validCampusIds.has(cls.campus_id) ? cls.campus_id : null,
          homeroom_teacher_id: cls.homeroom_teacher_id && validProfileIds.has(cls.homeroom_teacher_id) ? cls.homeroom_teacher_id : null,
          is_locked: Boolean(cls.is_locked),
          sort_order: Number(cls.sort_order || 0),
        }));

        let { error } = await supabase.from('classes').upsert(cleanedClasses);
        if (error && (error.message?.includes('is_locked') || error.message?.includes('campus_id') || error.message?.includes('sort_order'))) {
          const fallback = cleanedClasses.map(({ is_locked: _l, campus_id: _c, sort_order: _s, ...rest }) => rest);
          const retry = await supabase.from('classes').upsert(fallback);
          error = retry.error;
        }
        if (error) throw new Error(error.message);
        return { success: true, message: `Đã đẩy ${cleanedClasses.length} lớp học lên Supabase!`, count: cleanedClasses.length };
      }

      if (tableKey === 'indicator_groups') {
        const indicators = await this.getIndicatorGroups();
        let { error } = await supabase.from('indicator_groups').upsert(indicators);
        if (error && (error.message?.includes('icon') || error.code === 'PGRST204')) {
          const indicatorsClean = indicators.map(({ icon: _i, ...rest }) => rest);
          const retry = await supabase.from('indicator_groups').upsert(indicatorsClean);
          error = retry.error;
        }
        if (error) throw new Error(error.message);
        return { success: true, message: `Đã đẩy ${indicators.length} nhóm chỉ tiêu lên Supabase!`, count: indicators.length };
      }

      if (tableKey === 'students') {
        const classes = await this.getClasses();
        const validClassIds = new Set(classes.map((c) => c.id));
        const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        const students: import('../types').Student[] = rawStudents ? JSON.parse(rawStudents) : [];
        const validStudents = students
          .filter((s) => validClassIds.has(s.class_id))
          .map((s) => ({
            id: s.id,
            class_id: s.class_id,
            full_name: s.full_name,
            address: s.address || '',
            is_boarding: Boolean(s.isBoarding ?? (s as any).is_boarding),
            created_at: s.created_at || new Date().toISOString(),
          }));

        if (validStudents.length > 0) {
          const { error } = await supabase.from('students').upsert(validStudents, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        }
        return { success: true, message: `Đã đẩy ${validStudents.length} học sinh lên Supabase!`, count: validStudents.length };
      }

      if (tableKey === 'daily_reports') {
        const [classes, profiles] = await Promise.all([this.getClasses(), this.getProfiles()]);
        const validClassIds = new Set(classes.map((c) => c.id));
        const validProfileIds = new Set(profiles.map((p) => p.id));
        const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
        const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];

        // Khớp ID báo cáo trên cloud theo (class_id, report_date)
        const cloudRepsKeyMap = new Map<string, string>();
        try {
          const { data: cloudReps } = await supabase.from('daily_reports').select('id, class_id, report_date');
          if (cloudReps) {
            cloudReps.forEach((cr) => {
              const dateStr = String(cr.report_date).split('T')[0];
              cloudRepsKeyMap.set(`${cr.class_id}_${dateStr}`, cr.id);
            });
          }
        } catch (e) {}

        const validReports = reports
          .filter((r) => validClassIds.has(r.class_id))
          .map((r) => {
            const dateStr = String(r.report_date).split('T')[0];
            const cloudKey = `${r.class_id}_${dateStr}`;
            const finalId = cloudRepsKeyMap.get(cloudKey) || r.id;
            return {
              ...r,
              id: finalId,
              report_date: dateStr,
              created_by: r.created_by && validProfileIds.has(r.created_by) ? r.created_by : null,
              reported_time: r.reported_time || null,
              status: (r.status === 'DRAFT' || r.status === 'LOCKED') ? r.status : 'SUBMITTED',
            };
          });

        if (validReports.length > 0) {
          for (let i = 0; i < validReports.length; i += 50) {
            const batch = validReports.slice(i, i + 50);
            let { error } = await supabase.from('daily_reports').upsert(batch, { onConflict: 'class_id,report_date' });
            if (error && (error.message?.includes('reported_time') || error.message?.includes('locked_at') || error.code === 'PGRST204')) {
              const batchCleaned = batch.map(({ reported_time: _rt, locked_at: _la, ...rest }) => rest);
              const retry = await supabase.from('daily_reports').upsert(batchCleaned, { onConflict: 'class_id,report_date' });
              error = retry.error;
            }
            if (error) throw new Error(error.message);
          }
        }
        return { success: true, message: `Đã đẩy ${validReports.length} báo cáo sĩ số ngày lên Supabase!`, count: validReports.length };
      }

      if (tableKey === 'daily_report_values') {
        const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
        const values: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
        const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
        const localReports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
        const localRepMap = new Map(localReports.map((r) => [r.id, r]));

        // Tự động kiểm tra: nếu Cloud chưa có daily_reports hoặc ít hơn trên máy, tự động đẩy daily_reports trước
        let { data: cloudReps } = await supabase.from('daily_reports').select('id, class_id, report_date');
        if ((!cloudReps || cloudReps.length === 0) && localReports.length > 0) {
          await this.syncTableToSupabase('daily_reports');
          const refetch = await supabase.from('daily_reports').select('id, class_id, report_date');
          cloudReps = refetch.data || [];
        }

        const existingCloudReportIds = new Set<string>();
        const cloudKeyToId = new Map<string, string>();
        if (cloudReps && cloudReps.length > 0) {
          cloudReps.forEach((cr) => {
            existingCloudReportIds.add(cr.id);
            const dateStr = String(cr.report_date).split('T')[0];
            cloudKeyToId.set(`${cr.class_id}_${dateStr}`, cr.id);
          });
        }

        // Lấy danh sách chỉ tiêu thực tế trên Cloud
        let { data: cloudInds } = await supabase.from('indicator_groups').select('id');
        if (!cloudInds || cloudInds.length === 0) {
          await this.syncTableToSupabase('indicator_groups');
          const refetchInd = await supabase.from('indicator_groups').select('id');
          cloudInds = refetchInd.data || [];
        }
        const existingCloudIndIds = new Set(cloudInds?.map((ci) => ci.id) || []);

        const cloudValuesKeyMap = new Map<string, string>();
        try {
          const { data: cloudVals } = await supabase.from('daily_report_values').select('id, report_id, indicator_group_id');
          if (cloudVals) {
            cloudVals.forEach((cv) => {
              cloudValuesKeyMap.set(`${cv.report_id}_${cv.indicator_group_id}`, cv.id);
            });
          }
        } catch (e) {}

        const validValues: DailyReportValue[] = [];
        for (const val of values) {
          let targetReportId = val.report_id;
          if (!existingCloudReportIds.has(targetReportId)) {
            const locRep = localRepMap.get(val.report_id);
            if (locRep) {
              const key = `${locRep.class_id}_${String(locRep.report_date).split('T')[0]}`;
              const mappedId = cloudKeyToId.get(key);
              if (mappedId) {
                targetReportId = mappedId;
              }
            }
          }

          // BẮT BUỘC: targetReportId phải thực sự tồn tại trong daily_reports trên Cloud
          if (existingCloudReportIds.has(targetReportId) && existingCloudIndIds.has(val.indicator_group_id)) {
            const key = `${targetReportId}_${val.indicator_group_id}`;
            const finalValId = cloudValuesKeyMap.get(key) || val.id;
            validValues.push({
              ...val,
              id: finalValId,
              report_id: targetReportId,
              total_count: Math.max(0, Number(val.total_count) || 0),
              present_count: Math.max(0, Number(val.present_count) || 0),
              absent_count: Math.max(0, Number(val.absent_count) || 0),
            });
          }
        }

        let syncedCount = 0;
        if (validValues.length > 0) {
          for (let i = 0; i < validValues.length; i += 100) {
            const batch = validValues.slice(i, i + 100);
            try {
              const { error } = await supabase.from('daily_report_values').upsert(batch, { onConflict: 'report_id,indicator_group_id' });
              if (!error) {
                syncedCount += batch.length;
              } else {
                for (const singleVal of batch) {
                  try {
                    const { error: sErr } = await supabase.from('daily_report_values').upsert(singleVal, { onConflict: 'report_id,indicator_group_id' });
                    if (!sErr) syncedCount++;
                  } catch {}
                }
              }
            } catch {
              for (const singleVal of batch) {
                try {
                  const { error: sErr } = await supabase.from('daily_report_values').upsert(singleVal, { onConflict: 'report_id,indicator_group_id' });
                  if (!sErr) syncedCount++;
                } catch {}
              }
            }
          }
        }
        return { success: true, message: `Đã đẩy thành công ${syncedCount} chi tiết số liệu chỉ tiêu lên Supabase!`, count: syncedCount };
      }

      if (tableKey === 'school_off_days') {
        const offDays = await this.getOffDays();
        if (offDays.length > 0) {
          const cleanedOffDays = offDays.map((o) => ({
            id: o.id,
            date: o.date,
            name: o.name,
            type: o.type || 'HOLIDAY',
            applies_to: o.applies_to || 'ALL',
            created_at: o.created_at || new Date().toISOString(),
          }));
          const { error } = await supabase.from('school_off_days').upsert(cleanedOffDays, { onConflict: 'date' });
          if (error) throw new Error(error.message);
        }
        return { success: true, message: `Đã đẩy ${offDays.length} ngày nghỉ lên Supabase!`, count: offDays.length };
      }

      if (tableKey === 'notifications') {
        const rawNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        const notifications: AppNotification[] = rawNotifs ? JSON.parse(rawNotifs) : [];
        if (notifications.length > 0) {
          const cleanedNotifs = notifications.map((n) => ({
            id: n.id,
            user_id: n.user_id,
            class_id: n.class_id || null,
            class_name: n.class_name || null,
            type: n.type,
            title: n.title,
            message: n.message,
            date: n.date || null,
            read: Boolean(n.read),
            action_url: n.action_url || null,
            created_by_name: n.created_by_name || null,
            urgent: Boolean(n.urgent),
            created_at: n.created_at || new Date().toISOString(),
          }));
          const { error } = await supabase.from('notifications').upsert(cleanedNotifs);
          if (error) throw new Error(error.message);
        }
        return { success: true, message: `Đã đẩy ${notifications.length} thông báo lên Supabase!`, count: notifications.length };
      }

      if (tableKey === 'system_logs') {
        const logs = await this.getLogs(100);
        if (logs.length > 0) {
          const cleanedLogs = logs.map((l) => ({
            ...l,
            report_date: l.report_date && l.report_date.trim() !== '' ? l.report_date : null,
          }));
          const { error } = await supabase.from('system_logs').upsert(cleanedLogs);
          if (error) throw new Error(error.message);
        }
        return { success: true, message: `Đã đẩy ${logs.length} dòng nhật ký lên Supabase!`, count: logs.length };
      }

      return { success: false, message: `Bảng "${tableKey}" không hợp lệ.`, count: 0 };
    } catch (err: any) {
      return { success: false, message: `Lỗi đẩy bảng ${tableKey}: ${err?.message || err}`, count: 0 };
    }
  },

  /**
   * Tải toàn bộ dữ liệu từ 1 bảng trên Supabase (hỗ trợ phân trang để lấy đủ 100% bản ghi)
   */
  async fetchAllRowsFromCloud(tableKey: string): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) return [];

    const allRows: any[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data, error } = await supabase
          .from(tableKey)
          .select('*')
          .range(from, from + pageSize - 1);

        if (error || !data || data.length === 0) {
          hasMore = false;
          break;
        }

        allRows.push(...data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      } catch {
        hasMore = false;
        break;
      }
    }

    return allRows;
  },

  /**
   * Tải và hợp nhất dữ liệu từ 1 bảng trên Supabase về Local Storage
   */
  async syncTableFromSupabase(tableKey: string): Promise<{ success: boolean; message: string; count: number }> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return { success: false, message: 'Chưa kết nối tới Supabase Cloud.', count: 0 };
    }

    try {
      if (tableKey === 'school_settings') {
        const { data: settings } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
        if (settings) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
          notifyRealtimeChange('settings');
          return { success: true, message: 'Đã tải cấu hình nhà trường từ Supabase về máy!', count: 1 };
        }
        return { success: false, message: 'Chưa có dữ liệu cấu hình trên Supabase.', count: 0 };
      }

      const cloudRows = await this.fetchAllRowsFromCloud(tableKey);
      if (cloudRows.length === 0) {
        return { success: true, message: `Bảng ${tableKey} trên Supabase chưa có bản ghi nào.`, count: 0 };
      }

      const storageMap: Record<string, string> = {
        school_years: STORAGE_KEYS.YEARS,
        campuses: STORAGE_KEYS.CAMPUSES,
        profiles: STORAGE_KEYS.PROFILES,
        classes: STORAGE_KEYS.CLASSES,
        indicator_groups: STORAGE_KEYS.INDICATORS,
        students: STORAGE_KEYS.STUDENTS,
        daily_reports: STORAGE_KEYS.REPORTS,
        daily_report_values: STORAGE_KEYS.VALUES,
        school_off_days: STORAGE_KEYS.OFF_DAYS,
        notifications: STORAGE_KEYS.NOTIFICATIONS,
        system_logs: STORAGE_KEYS.LOGS,
      };

      const storageKey = storageMap[tableKey];
      if (storageKey) {
        const rawLocal = localStorage.getItem(storageKey);
        let localList: any[] = rawLocal ? JSON.parse(rawLocal) : [];

        // Hợp nhất dữ liệu Cloud vào Local theo ID hoặc Unique Key
        const localMap = new Map<string, any>();
        localList.forEach((item) => {
          if (item && item.id) localMap.set(item.id, item);
        });

        cloudRows.forEach((cItem) => {
          if (cItem && cItem.id) {
            localMap.set(cItem.id, { ...(localMap.get(cItem.id) || {}), ...cItem });
          }
        });

        const merged = Array.from(localMap.values());
        localStorage.setItem(storageKey, JSON.stringify(merged));
        notifyRealtimeChange(tableKey as any);

        return {
          success: true,
          message: `Đã tải và hợp nhất thành công ${cloudRows.length} bản ghi của bảng "${tableKey}" về máy!`,
          count: merged.length,
        };
      }

      return { success: false, message: `Bảng "${tableKey}" không hợp lệ.`, count: 0 };
    } catch (err: any) {
      return { success: false, message: `Lỗi tải bảng ${tableKey}: ${err?.message || err}`, count: 0 };
    }
  },

  /**
   * Đồng bộ 2 chiều (Two-Way Sync): Tải Cloud về -> Hợp nhất -> Đẩy ngược lên Cloud để 2 bên khớp 100%
   */
  async syncTableTwoWay(tableKey: string): Promise<{ success: boolean; message: string; count: number }> {
    ensureInitialized();
    // 1. Tải từ Cloud về trước để không làm mất dữ liệu trên Cloud
    await this.syncTableFromSupabase(tableKey);
    // 2. Đẩy toàn bộ dữ liệu hợp nhất lên Cloud
    return await this.syncTableToSupabase(tableKey);
  },

  /**
   * Pulls every table & row from Supabase Cloud and saves to Local Storage
   */
  async syncAllFromSupabase(): Promise<{
    success: boolean;
    message: string;
    counts: Record<string, number>;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return {
        success: false,
        message: 'Chưa kết nối tới Supabase Cloud.',
        counts: {},
      };
    }

    const counts: Record<string, number> = {};

    try {
      const [
        settingsRes,
        years,
        campuses,
        profiles,
        classes,
        indicators,
        students,
        reports,
        values,
        offDays,
        notifications,
        logs,
      ] = await Promise.all([
        supabase.from('school_settings').select('*').limit(1).maybeSingle(),
        this.fetchAllRowsFromCloud('school_years'),
        this.fetchAllRowsFromCloud('campuses'),
        this.fetchAllRowsFromCloud('profiles'),
        this.fetchAllRowsFromCloud('classes'),
        this.fetchAllRowsFromCloud('indicator_groups'),
        this.fetchAllRowsFromCloud('students'),
        this.fetchAllRowsFromCloud('daily_reports'),
        this.fetchAllRowsFromCloud('daily_report_values'),
        this.fetchAllRowsFromCloud('school_off_days'),
        this.fetchAllRowsFromCloud('notifications'),
        this.fetchAllRowsFromCloud('system_logs'),
      ]);

      const settings = settingsRes?.data;
      if (settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        counts.school_settings = 1;
      }

      const updateMergedList = (storageKey: string, cloudList: any[]) => {
        if (!cloudList || cloudList.length === 0) return 0;
        const raw = localStorage.getItem(storageKey);
        let current: any[] = raw ? JSON.parse(raw) : [];
        const map = new Map<string, any>();
        current.forEach((item) => {
          if (item && item.id) map.set(item.id, item);
        });
        cloudList.forEach((item) => {
          if (item && item.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
        });
        const merged = Array.from(map.values());
        localStorage.setItem(storageKey, JSON.stringify(merged));
        return merged.length;
      };

      if (years && years.length > 0) counts.school_years = updateMergedList(STORAGE_KEYS.YEARS, years);
      if (campuses && campuses.length > 0) counts.campuses = updateMergedList(STORAGE_KEYS.CAMPUSES, campuses);
      if (profiles && profiles.length > 0) counts.profiles = updateMergedList(STORAGE_KEYS.PROFILES, profiles);
      if (classes && classes.length > 0) counts.classes = updateMergedList(STORAGE_KEYS.CLASSES, classes);
      if (indicators && indicators.length > 0) counts.indicator_groups = updateMergedList(STORAGE_KEYS.INDICATORS, indicators);
      if (students && students.length > 0) counts.students = updateMergedList(STORAGE_KEYS.STUDENTS, students);
      if (reports && reports.length > 0) counts.daily_reports = updateMergedList(STORAGE_KEYS.REPORTS, reports);
      if (values && values.length > 0) counts.daily_report_values = updateMergedList(STORAGE_KEYS.VALUES, values);
      if (offDays && offDays.length > 0) counts.school_off_days = updateMergedList(STORAGE_KEYS.OFF_DAYS, offDays);
      if (notifications && notifications.length > 0) counts.notifications = updateMergedList(STORAGE_KEYS.NOTIFICATIONS, notifications);
      if (logs && logs.length > 0) counts.system_logs = updateMergedList(STORAGE_KEYS.LOGS, logs);

      notifyRealtimeChange('all');

      return {
        success: true,
        message: 'Đã tải và hợp nhất toàn bộ dữ liệu từ Supabase Cloud về máy thành công!',
        counts,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi tải dữ liệu từ Supabase: ${err?.message || err}`,
        counts,
      };
    }
  },

  /**
   * Compare record counts between Local Cache and Supabase Cloud
   */
  async getSupabaseSyncStatus(): Promise<TableSyncStatus[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    const connected = Boolean(supabase && isSupabaseConnected());

    const tableDefs = [
      { key: 'school_settings', label: 'Cấu hình nhà trường (school_settings)', storageKey: STORAGE_KEYS.SETTINGS, isObject: true },
      { key: 'school_years', label: 'Cấu hình năm học (school_years)', storageKey: STORAGE_KEYS.YEARS },
      { key: 'campuses', label: 'Phân hiệu / Điểm trường (campuses)', storageKey: STORAGE_KEYS.CAMPUSES },
      { key: 'profiles', label: 'Tài khoản người dùng (profiles)', storageKey: STORAGE_KEYS.PROFILES },
      { key: 'classes', label: 'Danh sách lớp học (classes)', storageKey: STORAGE_KEYS.CLASSES },
      { key: 'indicator_groups', label: 'Nhóm chỉ tiêu sĩ số (indicator_groups)', storageKey: STORAGE_KEYS.INDICATORS },
      { key: 'students', label: 'Danh sách học sinh (students)', storageKey: STORAGE_KEYS.STUDENTS },
      { key: 'daily_reports', label: 'Sổ báo cáo sĩ số ngày (daily_reports)', storageKey: STORAGE_KEYS.REPORTS },
      { key: 'daily_report_values', label: 'Chi tiết số liệu chỉ tiêu (daily_report_values)', storageKey: STORAGE_KEYS.VALUES },
      { key: 'school_off_days', label: 'Lịch nghỉ học sinh (school_off_days)', storageKey: STORAGE_KEYS.OFF_DAYS },
      { key: 'notifications', label: 'Thông báo hệ thống & Nhắc nhở (notifications)', storageKey: STORAGE_KEYS.NOTIFICATIONS },
      { key: 'system_logs', label: 'Nhật ký thao tác & kiểm toán (system_logs)', storageKey: STORAGE_KEYS.LOGS },
    ];

    const results: TableSyncStatus[] = [];

    for (const def of tableDefs) {
      const raw = localStorage.getItem(def.storageKey);
      let localCount = 0;
      if (raw) {
        if (def.isObject) {
          localCount = 1;
        } else {
          try {
            const parsed = JSON.parse(raw);
            localCount = Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            localCount = 0;
          }
        }
      }

      let cloudCount = 0;
      let errorMsg: string | undefined;

      if (connected && supabase) {
        try {
          const { count, error } = await supabase
            .from(def.key)
            .select('*', { count: 'exact', head: true });

          if (error) {
            errorMsg = error.message;
          } else {
            cloudCount = count || 0;
          }
        } catch (e: any) {
          errorMsg = e?.message || 'Không thể truy vấn';
        }
      }

      const isInSync = connected && !errorMsg && (
        def.key === 'system_logs'
          ? cloudCount >= localCount
          : localCount === cloudCount
      );

      results.push({
        table: def.key,
        label: def.label,
        localCount,
        cloudCount,
        inSync: isInSync,
        error: errorMsg,
      });
    }

    return results;
  },

  // --- HỆ THỐNG THÔNG BÁO TỰ ĐỘNG & NHẮC NHỞ GVCN CHƯA BÁO CÁO SĨ SỐ ---
  async getNotifications(userId?: string, classId?: string): Promise<AppNotification[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    let list: AppNotification[] = raw ? JSON.parse(raw) : [];

    // Nếu kết nối Supabase, đồng bộ thông báo từ Cloud về để thiết bị nhận được thông báo ngay lập tức
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        let query = supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (userId && classId) {
          query = query.or(`user_id.eq.${userId},class_id.eq.${classId}`);
        } else if (userId) {
          query = query.eq('user_id', userId);
        } else if (classId) {
          query = query.eq('class_id', classId);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const cloudNotifs = data as AppNotification[];
          for (const cNotif of cloudNotifs) {
            const idx = list.findIndex((n) => n.id === cNotif.id);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...cNotif };
            } else {
              list.push(cNotif);
            }
          }
          localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list.slice(0, 100)));
        }
      } catch (e) {
        // Fallback local
      }
    }

    if (userId && classId) {
      list = list.filter((n) => n.user_id === userId || n.class_id === classId);
    } else if (userId) {
      list = list.filter((n) => n.user_id === userId);
    } else if (classId) {
      list = list.filter((n) => n.class_id === classId);
    }

    // Sắp xếp thông báo mới nhất lên đầu
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getUnreadNotificationCount(userId: string, classId?: string): Promise<number> {
    const list = await this.getNotifications(userId, classId);
    return list.filter((n) => !n.read).length;
  },

  async saveNotification(notif: AppNotification): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list: AppNotification[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((n) => n.id === notif.id);
    if (idx >= 0) {
      list[idx] = notif;
    } else {
      list.unshift(notif);
    }
    // Giữ tối đa 100 thông báo gần nhất
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list.slice(0, 100)));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('notifications').upsert({
          id: notif.id,
          user_id: notif.user_id,
          class_id: notif.class_id || null,
          class_name: notif.class_name || null,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          date: notif.date || null,
          read: Boolean(notif.read),
          action_url: notif.action_url || null,
          created_by_name: notif.created_by_name || null,
          urgent: Boolean(notif.urgent),
          created_at: notif.created_at || new Date().toISOString(),
        });
      } catch (e) {
        // Fallback silently if table does not exist yet
      }
    }

    notifyRealtimeChange('notifications', { notifId: notif.id, userId: notif.user_id });
  },

  async markNotificationAsRead(id: string): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) return;
    const list: AppNotification[] = JSON.parse(raw);
    const target = list.find((n) => n.id === id);
    if (target) {
      target.read = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          await supabase.from('notifications').update({ read: true }).eq('id', id);
        } catch (e) {}
      }

      notifyRealtimeChange('notifications', { notifId: id, userId: target.user_id });
    }
  },

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) return;
    const list: AppNotification[] = JSON.parse(raw);
    let changed = false;
    list.forEach((n) => {
      if (n.user_id === userId && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          await supabase.from('notifications').update({ read: true }).eq('user_id', userId);
        } catch (e) {}
      }

      notifyRealtimeChange('notifications', { userId });
    }
  },

  async deleteNotification(id: string): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) return;
    const list: AppNotification[] = JSON.parse(raw);
    const filtered = list.filter((n) => n.id !== id);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('notifications').delete().eq('id', id);
      } catch (e) {}
    }

    notifyRealtimeChange('notifications', { notifId: id });
  },

  async clearAllNotifications(userId: string): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) return;
    const list: AppNotification[] = JSON.parse(raw);
    const filtered = list.filter((n) => n.user_id !== userId);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('notifications').delete().eq('user_id', userId);
      } catch (e) {}
    }

    notifyRealtimeChange('notifications', { userId });
  },

  async resolveAttendanceReminders(classId: string, reportDate: string, user: Profile, className: string): Promise<void> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list: AppNotification[] = raw ? JSON.parse(raw) : [];

    list.forEach((n) => {
      if (n.class_id === classId && n.date === reportDate && (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT')) {
        n.read = true;
      }
    });

    // Thêm thông báo xác nhận nộp báo cáo thành công cho tài khoản GVCN
    const successNotif: AppNotification = {
      id: `notif_success_${classId}_${reportDate}_${Date.now()}`,
      user_id: user.id,
      class_id: classId,
      class_name: className,
      type: 'ATTENDANCE_SUCCESS',
      title: '✅ Đã nộp báo cáo sĩ số thành công',
      message: `Đã nộp thành công báo cáo sĩ số lớp ${className} ngày ${formatDateVN(reportDate)}. Báo cáo đã được ghi nhận vào hệ thống.`,
      date: reportDate,
      read: false,
      action_url: '/attendance',
      created_at: new Date().toISOString(),
      created_by_name: 'Hệ thống Báo cáo Sĩ số',
    };
    list.unshift(successNotif);

    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list.slice(0, 100)));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('class_id', classId)
          .eq('date', reportDate);

        await supabase.from('notifications').upsert({
          id: successNotif.id,
          user_id: successNotif.user_id,
          class_id: successNotif.class_id || null,
          class_name: successNotif.class_name || null,
          type: successNotif.type,
          title: successNotif.title,
          message: successNotif.message,
          date: successNotif.date || null,
          read: Boolean(successNotif.read),
          action_url: successNotif.action_url || null,
          created_by_name: successNotif.created_by_name || null,
          urgent: false,
          created_at: successNotif.created_at,
        });
      } catch (e) {
        console.warn('Supabase resolveAttendanceReminders error:', e);
      }
    }

    notifyRealtimeChange('notifications', { userId: user.id, classId, reportDate });
  },

  /**
   * Tự động kiểm tra và gửi báo cáo/nhắc nhở về tài khoản GVCN nếu lớp chưa báo cáo sĩ số
   * @param targetDate Ngày kiểm tra (mặc định hôm nay YYYY-MM-DD)
   * @param forceTriggerByBGH Nếu BGH chủ động bấm nút "Nhắc nhở tự động"
   * @param senderUser Thông tin BGH gửi nhắc nhở (nếu có)
   */
  async checkAndGenerateGVCNReminders(
    targetDate?: string,
    forceTriggerByBGH?: boolean,
    senderUser?: Profile
  ): Promise<{ sentCount: number; remindedClasses: string[]; skippedClasses: string[] }> {
    ensureInitialized();
    const dateToCheck = targetDate || getTodayDateStr();
    const settings = await this.getSettings();

    // Nếu không phải BGH bấm ép buộc và cài đặt đã tắt tự động nhắc nhở -> bỏ qua
    if (!forceTriggerByBGH && settings.enable_auto_reminder === false) {
      return { sentCount: 0, remindedClasses: [], skippedClasses: [] };
    }

    const classes = await this.getClasses();
    const activeClasses = classes.filter((c) => c.active && !c.is_locked);
    if (activeClasses.length === 0) {
      return { sentCount: 0, remindedClasses: [], skippedClasses: [] };
    }

    const profiles = await this.getProfiles();
    const aggregate = await this.getDailyAggregate(dateToCheck);
    const existingNotifs = await this.getNotifications();

    const remindedClasses: string[] = [];
    const skippedClasses: string[] = [];
    let sentCount = 0;

    for (const cls of activeClasses) {
      // Tìm xem lớp này đã báo cáo chưa
      const row = aggregate.rows.find((r) => r.classItem.id === cls.id);
      const isReported = row && row.status !== 'NOT_REPORTED';

      if (isReported) {
        continue; // Lớp đã nộp báo cáo
      }

      // Lớp chưa nộp -> Tìm giáo viên chủ nhiệm
      let teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id);
      if (!teacher) {
        teacher = profiles.find((p) => p.assigned_class_id === cls.id && p.role === 'GVCN');
      }
      if (!teacher) {
        teacher = profiles.find((p) => p.assigned_class_id === cls.id);
      }
      if (!teacher) {
        teacher = profiles.find(
          (p) =>
            p.role === 'GVCN' &&
            (p.email.toLowerCase().includes(cls.class_name.toLowerCase()) ||
              p.full_name.toLowerCase().includes(cls.class_name.toLowerCase()))
        );
      }

      const targetUserId = teacher ? teacher.id : `class_target_${cls.id}`;

      // Kiểm tra xem đã có thông báo nhắc nhở chưa đọc cho lớp này và ngày này chưa
      const alreadyHasUnreadReminder = existingNotifs.some(
        (n) =>
          (n.class_id === cls.id || (teacher && n.user_id === teacher.id)) &&
          n.date === dateToCheck &&
          !n.read &&
          (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT')
      );

      // Nếu không phải BGH ép buộc gửi và đã có thông báo nhắc nhở chưa đọc -> không gửi trùng lặp
      if (!forceTriggerByBGH && alreadyHasUnreadReminder) {
        continue;
      }

      const formattedDate = formatDateVN(dateToCheck);
      const customTemplate = settings.reminder_message_template;
      let reminderMsg = customTemplate
        ? customTemplate.replace('{class_name}', cls.class_name).replace('{date}', formattedDate)
        : `Lớp ${cls.class_name} chưa nộp báo cáo sĩ số ngày hôm nay (${formattedDate}). Thầy/Cô vui lòng cập nhật sớm để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!`;

      if (forceTriggerByBGH) {
        reminderMsg = `🚨 Ban Giám Hiệu (${senderUser?.full_name || 'BGH'}) nhắc nhở: Lớp ${cls.class_name} chưa nộp báo cáo sĩ số ngày ${formattedDate}. Thầy/Cô vui lòng vào hệ thống và nộp báo cáo ngay!`;
      }

      const newNotif: AppNotification = {
        id: `notif_remind_${cls.id}_${dateToCheck}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: targetUserId,
        class_id: cls.id,
        class_name: cls.class_name,
        type: forceTriggerByBGH ? 'BGH_ALERT' : 'ATTENDANCE_REMINDER',
        title: forceTriggerByBGH
          ? `🚨 BGH NHẮC NHỞ: Lớp ${cls.class_name} chưa báo cáo sĩ số`
          : `⏰ Nhắc nhở tự động: Lớp ${cls.class_name} chưa báo cáo sĩ số`,
        message: reminderMsg,
        date: dateToCheck,
        read: false,
        action_url: `/attendance`,
        created_at: new Date().toISOString(),
        created_by_name: forceTriggerByBGH ? (senderUser?.full_name ? `BGH - ${senderUser.full_name}` : 'Ban Giám Hiệu') : 'Hệ thống tự động',
        urgent: true,
      };

      await this.saveNotification(newNotif);
      remindedClasses.push(cls.class_name);
      sentCount++;
    }

    if (sentCount > 0) {
      notifyRealtimeChange('notifications', { count: sentCount, targetDate: dateToCheck });
    }

    return { sentCount, remindedClasses, skippedClasses };
  },

  /**
   * Thống kê chi tiết số lần thông báo và số lần không báo cáo của GVCN / Lớp học
   */
  async getClassUnreportedStats(classId?: string, teacherId?: string): Promise<{
    todayReminders: number;
    totalReminders: number;
    unreportedDays: number;
    reportedDays: number;
    totalSchoolDays: number;
  }> {
    ensureInitialized();
    const notifs = await this.getNotifications();
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const today = getTodayDateStr();

    const classNotifs = notifs.filter(
      (n) =>
        (n.type === 'ATTENDANCE_REMINDER' || n.type === 'BGH_ALERT') &&
        ((classId && n.class_id === classId) || (teacherId && n.user_id === teacherId))
    );

    const todayReminders = classNotifs.filter((n) => n.date === today).length;
    const totalReminders = classNotifs.length;

    // Lấy danh sách các ngày học đã diễn ra
    const allReportDates = Array.from(new Set(reports.map((r) => r.report_date))).sort();
    const distinctDates = allReportDates.length > 0 ? allReportDates : [today];

    let reportedDays = 0;
    let unreportedDays = 0;

    if (classId) {
      distinctDates.forEach((d) => {
        const hasRep = reports.some((r) => r.class_id === classId && r.report_date === d && (r.status === 'SUBMITTED' || r.status === 'LOCKED'));
        if (hasRep) reportedDays++;
        else unreportedDays++;
      });
    }

    return {
      todayReminders,
      totalReminders,
      unreportedDays: Math.max(unreportedDays, todayReminders > 0 ? 1 : 0),
      reportedDays,
      totalSchoolDays: distinctDates.length,
    };
  },

  // --- Reset to Factory Default (Mặc định rỗng cấu hình mới) ---
  async resetToDefault(): Promise<void> {
    resetAllDataToEmpty();
  },
  async resetAllDataToEmpty(): Promise<void> {
    resetAllDataToEmpty();
  },
};
