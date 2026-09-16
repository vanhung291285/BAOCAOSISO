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
} from '../types';
import { getSupabaseClient, isSupabaseConnected } from './supabase';

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
          callback({ table: 'daily_reports', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_report_values' }, (payload) => {
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
    website: '',
    logo_url: '',
    principal_name: '',
    principal_title: 'Hiệu trưởng',
    reporter_name: '',
    reporter_title: 'Người lập biểu',
    report_title: 'BÁO CÁO SĨ SỐ HỌC SINH',
    footer_text: '',
    developer_name: 'Nguyễn Hùng',
    developer_contact: 'hungthcsnongu@gmail.com',
    primary_color: '#1d4ed8',
    input_mode: 'MODE_1_TOTAL_PRESENT',
    enable_campuses: false,
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
    if (s && s.developer_name === undefined) {
      s.developer_name = 'Nguyễn Hùng';
      s.developer_contact = 'hungthcsnongu@gmail.com';
      needsSave = true;
    }
    if (s && s.address && s.address.includes('Huyện Điện Biên Đông')) {
      s.address = s.address.replace(', Huyện Điện Biên Đông', '').replace('Huyện Điện Biên Đông, ', '').replace('Huyện Điện Biên Đông', '').trim();
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

  async saveDailyReport(
    classId: string,
    reportDate: string,
    user: Profile,
    valuesByGroup: Record<string, { total: number; present: number; absent: number }>,
    notes?: string,
    absent_students?: import('../types').AbsentStudent[]
  ): Promise<{ report: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const existingIndex = reports.findIndex((r) => r.class_id === classId && r.report_date === reportDate);

    const reportId = existingIndex >= 0 ? reports[existingIndex].id : `rep_${reportDate}_${classId}_${Date.now()}`;
    const oldReport = existingIndex >= 0 ? { ...reports[existingIndex] } : null;

    const report: DailyReport = {
      id: reportId,
      class_id: classId,
      report_date: reportDate,
      created_by: user.id,
      status: 'SUBMITTED',
      notes: notes ?? (existingIndex >= 0 ? reports[existingIndex].notes : ''),
      absent_students: absent_students ?? (existingIndex >= 0 ? reports[existingIndex].absent_students : undefined),
      created_at: existingIndex >= 0 ? reports[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
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

    // PERSIST DIRECTLY TO SUPABASE
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error: repErr } = await supabase.from('daily_reports').upsert(report);
        if (repErr) console.error('Supabase upsert daily_reports error:', repErr);

        if (newValues.length > 0) {
          const { error: valErr } = await supabase.from('daily_report_values').upsert(newValues);
          if (valErr) console.error('Supabase upsert daily_report_values error:', valErr);
        }
      } catch (err) {
        console.error('Supabase sync report error:', err);
      }
    }

    // Add audit log
    const classes = await this.getClasses();
    const cls = classes.find((c) => c.id === classId);
    await this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: oldReport ? 'UPDATE' : 'CREATE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: oldReport,
      new_data: { valuesByGroup, notes },
    });

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

        if (cloudReports && cloudReports.length > 0) {
          const repIds = cloudReports.map((r) => r.id);
          const { data: cloudValues } = await supabase
            .from('daily_report_values')
            .select('*')
            .in('report_id', repIds);

          if (cloudValues) {
            // Update local cache
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
        console.warn('Supabase fetch daily aggregate reports fallback to local:', err);
      }
    }

    const [classes, profiles, indicators] = await Promise.all([
      this.getClasses(),
      this.getProfiles(),
      this.getIndicatorGroups(),
    ]);

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const dayReports = reports.filter((r) => r.report_date === reportDate);

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
      const teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id);
      const rep = dayReports.find((r) => r.class_id === cls.id);
      const isReported = Boolean(rep);
      let status: ReportStatus = 'NOT_REPORTED';

      if (cls.is_locked || rep?.status === 'LOCKED') {
        status = 'LOCKED';
      } else if (isReported) {
        status = 'REPORTED';
      }

      if (isReported) {
        reportedClasses++;
      }

      const repValues = rep ? allValues.filter((v) => v.report_id === rep.id) : [];
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
      try {
        await supabase.from('system_logs').insert(item);
      } catch (e) {
        console.error('Supabase addLog error:', e);
      }
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
      const { error: sErr } = await supabase.from('school_settings').upsert(settings);
      details.school_settings = { count: 1, error: sErr?.message };

      // 2. school_years
      const years = await this.getSchoolYears();
      if (years.length > 0) {
        const { error: yErr } = await supabase.from('school_years').upsert(years);
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

      // 5. classes
      const classes = await this.getClasses();
      if (classes.length > 0) {
        const { error: clErr } = await supabase.from('classes').upsert(classes);
        details.classes = { count: classes.length, error: clErr?.message };
      }

      // 6. indicator_groups
      const indicators = await this.getIndicatorGroups();
      if (indicators.length > 0) {
        const { error: iErr } = await supabase.from('indicator_groups').upsert(indicators);
        details.indicator_groups = { count: indicators.length, error: iErr?.message };
      }

      // 7. daily_reports
      const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
      if (reports.length > 0) {
        // Upsert in batches of 50
        let repErrors: string | undefined;
        for (let i = 0; i < reports.length; i += 50) {
          const batch = reports.slice(i, i + 50);
          const { error: rErr } = await supabase.from('daily_reports').upsert(batch);
          if (rErr) repErrors = rErr.message;
        }
        details.daily_reports = { count: reports.length, error: repErrors };
      }

      // 8. daily_report_values
      const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
      const values: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
      if (values.length > 0) {
        let valErrors: string | undefined;
        for (let i = 0; i < values.length; i += 100) {
          const batch = values.slice(i, i + 100);
          const { error: vErr } = await supabase.from('daily_report_values').upsert(batch);
          if (vErr) valErrors = vErr.message;
        }
        details.daily_report_values = { count: values.length, error: valErrors };
      }

      // 9. system_logs
      const logs = await this.getLogs(100);
      if (logs.length > 0) {
        const { error: lErr } = await supabase.from('system_logs').upsert(logs);
        details.system_logs = { count: logs.length, error: lErr?.message };
      }

      const hasError = Object.values(details).some((d) => Boolean(d.error));

      let errorDetailsString = '';
      if (hasError) {
        const errorList = Object.entries(details)
          .filter(([_, d]) => Boolean(d.error))
          .map(([table, d]) => `${table}: ${d.error}`)
          .join(' | ');
        errorDetailsString = ` (Chi tiết: ${errorList}. Gợi ý: Hãy thử Copy kịch bản tạo bảng bên dưới và chạy lại trong Supabase SQL Editor để cập nhật cột mới).`;
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
        { data: settings },
        { data: years },
        { data: campuses },
        { data: profiles },
        { data: classes },
        { data: indicators },
        { data: reports },
        { data: values },
        { data: logs },
      ] = await Promise.all([
        supabase.from('school_settings').select('*').limit(1).maybeSingle(),
        supabase.from('school_years').select('*'),
        supabase.from('campuses').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('classes').select('*'),
        supabase.from('indicator_groups').select('*'),
        supabase.from('daily_reports').select('*'),
        supabase.from('daily_report_values').select('*'),
        supabase.from('system_logs').select('*').limit(200),
      ]);

      if (settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        counts.school_settings = 1;
      }
      if (years && years.length > 0) {
        localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(years));
        counts.school_years = years.length;
      }
      if (campuses && campuses.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(campuses));
        counts.campuses = campuses.length;
      }
      if (profiles && profiles.length > 0) {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
        counts.profiles = profiles.length;
      }
      if (classes && classes.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
        counts.classes = classes.length;
      }
      if (indicators && indicators.length > 0) {
        localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(indicators));
        counts.indicator_groups = indicators.length;
      }
      if (reports && reports.length > 0) {
        localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
        counts.daily_reports = reports.length;
      }
      if (values && values.length > 0) {
        localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(values));
        counts.daily_report_values = values.length;
      }
      if (logs && logs.length > 0) {
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
        counts.system_logs = logs.length;
      }

      notifyRealtimeChange('all');

      return {
        success: true,
        message: 'Đã tải và đồng bộ toàn bộ dữ liệu từ Supabase Cloud về máy thành công!',
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
      { key: 'daily_reports', label: 'Sổ báo cáo sĩ số ngày (daily_reports)', storageKey: STORAGE_KEYS.REPORTS },
      { key: 'daily_report_values', label: 'Chi tiết số liệu chỉ tiêu (daily_report_values)', storageKey: STORAGE_KEYS.VALUES },
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

      results.push({
        table: def.key,
        label: def.label,
        localCount,
        cloudCount,
        inSync: connected && !errorMsg && localCount === cloudCount,
        error: errorMsg,
      });
    }

    return results;
  },

  // --- Reset to Factory Default (Mặc định rỗng cấu hình mới) ---
  async resetToDefault(): Promise<void> {
    resetAllDataToEmpty();
  },
  async resetAllDataToEmpty(): Promise<void> {
    resetAllDataToEmpty();
  },
};
