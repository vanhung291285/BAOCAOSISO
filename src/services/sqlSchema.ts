export const SUPABASE_SQL_SCHEMA = `-- ==============================================================================
-- SCHEMA CƠ SỞ DỮ LIỆU SUPABASE CHO:
-- SỔ BÁO CÁO SĨ SỐ HỌC SINH - TRƯỜNG PTDTBT THCS XA DUNG
-- Đồng bộ toàn diện: Cấu hình trường, Năm học, Phân hiệu, Lớp học, Tài khoản,
-- Nhóm chỉ tiêu, Báo cáo ngày, Chi tiết sĩ số & Lịch sử nhật ký
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLE: profiles (Tài khoản người dùng: Quản trị, BGH, GVCN)
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'GVCN' CHECK (role IN ('ADMIN', 'BGH', 'GVCN')),
    assigned_class_id TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABLE: school_settings (Cấu hình trường học - Đầy đủ thông tin biểu mẫu)
CREATE TABLE IF NOT EXISTS public.school_settings (
    id TEXT PRIMARY KEY DEFAULT 'school_01',
    school_name TEXT NOT NULL DEFAULT '',
    short_name TEXT DEFAULT '',
    department_name TEXT DEFAULT '',
    sub_department_name TEXT DEFAULT '',
    address TEXT DEFAULT '',
    commune TEXT DEFAULT '',
    province TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    website TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    principal_name TEXT DEFAULT '',
    principal_title TEXT DEFAULT 'Hiệu trưởng',
    reporter_name TEXT DEFAULT '',
    reporter_title TEXT DEFAULT 'Người lập biểu',
    report_title TEXT DEFAULT 'BÁO CÁO SĨ SỐ HỌC SINH',
    footer_text TEXT DEFAULT '',
    developer_name TEXT DEFAULT 'Vũ Văn Hùng',
    developer_contact TEXT DEFAULT 'SĐT: 0984246993',
    primary_color TEXT DEFAULT '#1d4ed8',
    input_mode TEXT DEFAULT 'MODE_1_TOTAL_PRESENT' CHECK (input_mode IN ('MODE_1_TOTAL_PRESENT', 'MODE_2_TOTAL_ABSENT', 'MODE_3_ALL_THREE')),
    enable_campuses BOOLEAN DEFAULT false,
    week1_start_date TEXT DEFAULT '2026-09-07',
    school_days_per_week INTEGER DEFAULT 5,
    ranking_threshold_excellent NUMERIC DEFAULT 98,
    ranking_threshold_good NUMERIC DEFAULT 95,
    ranking_threshold_fair NUMERIC DEFAULT 90,
    enable_early_report_bonus BOOLEAN DEFAULT true,
    early_report_deadline TEXT DEFAULT '07:30',
    early_report_bonus_points NUMERIC DEFAULT 0.5,
    early_report_max_bonus NUMERIC DEFAULT 2.5,
    enable_auto_reminder BOOLEAN DEFAULT true,
    auto_reminder_time TEXT DEFAULT '07:30',
    reminder_message_template TEXT DEFAULT 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm trước 07h30 để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABLE: school_years (Cấu hình năm học)
CREATE TABLE IF NOT EXISTS public.school_years (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. TABLE: campuses (Cấu hình phân hiệu / điểm trường)
CREATE TABLE IF NOT EXISTS public.campuses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    principal_name TEXT,
    principal_title TEXT,
    reporter_name TEXT,
    reporter_title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TABLE: classes (Quản lý lớp học)
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_name TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    campus_id TEXT REFERENCES public.campuses(id) ON DELETE SET NULL,
    homeroom_teacher_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (class_name, school_year_id)
);

-- 7. TABLE: indicator_groups (Nhóm chỉ tiêu: Học sinh toàn trường, Bán trú, ...)
CREATE TABLE IF NOT EXISTS public.indicator_groups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    show_total BOOLEAN NOT NULL DEFAULT true,
    show_present BOOLEAN NOT NULL DEFAULT true,
    show_absent BOOLEAN NOT NULL DEFAULT true,
    show_percentage BOOLEAN NOT NULL DEFAULT true,
    column_header_override TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TABLE: daily_reports (Báo cáo sĩ số từng ngày của lớp)
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'LOCKED')),
    notes TEXT,
    absent_students JSONB DEFAULT '[]'::jsonb,
    reported_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ,
    UNIQUE (class_id, report_date)
);

-- 9. TABLE: daily_report_values (Số liệu chi tiết cho từng chỉ tiêu)
CREATE TABLE IF NOT EXISTS public.daily_report_values (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    report_id TEXT NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
    indicator_group_id TEXT NOT NULL REFERENCES public.indicator_groups(id) ON DELETE CASCADE,
    total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    present_count INTEGER NOT NULL DEFAULT 0 CHECK (present_count >= 0),
    absent_count INTEGER NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (report_id, indicator_group_id)
);

-- 10. TABLE: system_logs (Nhật ký thao tác & kiểm toán)
CREATE TABLE IF NOT EXISTS public.system_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    class_name TEXT,
    report_date DATE,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. TABLE: students (Danh sách học sinh theo từng lớp)
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    address TEXT,
    is_boarding BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. TABLE: school_off_days (Quản lý các ngày nghỉ học sinh - lễ, tết, thời tiết)
CREATE TABLE IF NOT EXISTS public.school_off_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date DATE NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'HOLIDAY',
    applies_to TEXT DEFAULT 'ALL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. TABLE: notifications (Thông báo hệ thống & Nhắc nhở sĩ số GVCN)
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    class_id TEXT,
    class_name TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    date TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    created_by_name TEXT,
    urgent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- CẬP NHẬT CẤU TRÚC BẢNG (MIGRATIONS)
-- Tự động thêm các cột mới nếu đã tạo bảng từ phiên bản trước đó
-- ==============================================================================
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN input_mode TEXT DEFAULT 'MODE_1_TOTAL_PRESENT' CHECK (input_mode IN ('MODE_1_TOTAL_PRESENT', 'MODE_2_TOTAL_ABSENT', 'MODE_3_ALL_THREE'));
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN enable_campuses BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN primary_color TEXT DEFAULT '#1d4ed8';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN developer_name TEXT DEFAULT 'Vũ Văn Hùng';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN developer_contact TEXT DEFAULT 'SĐT: 0984246993';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN week1_start_date TEXT DEFAULT '2026-09-07';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN school_days_per_week INTEGER DEFAULT 5;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN ranking_threshold_excellent NUMERIC DEFAULT 98;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN ranking_threshold_good NUMERIC DEFAULT 95;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN ranking_threshold_fair NUMERIC DEFAULT 90;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN enable_early_report_bonus BOOLEAN DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN early_report_deadline TEXT DEFAULT '07:30';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN early_report_bonus_points NUMERIC DEFAULT 0.5;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN early_report_max_bonus NUMERIC DEFAULT 2.5;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN enable_auto_reminder BOOLEAN DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN auto_reminder_time TEXT DEFAULT '07:30';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_settings ADD COLUMN reminder_message_template TEXT DEFAULT 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm trước 07h30 để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!';
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.classes ADD COLUMN campus_id TEXT REFERENCES public.campuses(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.classes ADD COLUMN is_locked BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.classes ADD COLUMN sort_order INTEGER DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.school_years ADD COLUMN is_locked BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.indicator_groups ADD COLUMN icon TEXT;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.daily_reports ADD COLUMN locked_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.daily_reports ADD COLUMN reported_time TEXT;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.campuses ADD COLUMN principal_name TEXT;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.campuses ADD COLUMN principal_title TEXT;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.campuses ADD COLUMN reporter_name TEXT;
    EXCEPTION WHEN duplicate_column THEN END;

    BEGIN
        ALTER TABLE public.campuses ADD COLUMN reporter_title TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- ==============================================================================
-- PHÂN QUYỀN ROW LEVEL SECURITY (RLS) & ANONYMOUS KEY ACCESS
-- Đảm bảo Web Client sử dụng Supabase Anon Key và Authenticated đều truy xuất trơn tru
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicator_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_report_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_off_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cấp quyền truy cập cho anon & authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Policies: Cho phép đọc/ghi an toàn từ ứng dụng
DROP POLICY IF EXISTS "Allow all for profiles" ON public.profiles;
CREATE POLICY "Allow all for profiles" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_settings" ON public.school_settings;
CREATE POLICY "Allow all for school_settings" ON public.school_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_years" ON public.school_years;
CREATE POLICY "Allow all for school_years" ON public.school_years FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for campuses" ON public.campuses;
CREATE POLICY "Allow all for campuses" ON public.campuses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for classes" ON public.classes;
CREATE POLICY "Allow all for classes" ON public.classes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for indicator_groups" ON public.indicator_groups;
CREATE POLICY "Allow all for indicator_groups" ON public.indicator_groups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for daily_reports" ON public.daily_reports;
CREATE POLICY "Allow all for daily_reports" ON public.daily_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for daily_report_values" ON public.daily_report_values;
CREATE POLICY "Allow all for daily_report_values" ON public.daily_report_values FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for system_logs" ON public.system_logs;
CREATE POLICY "Allow all for system_logs" ON public.system_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for students" ON public.students;
CREATE POLICY "Allow all for students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_off_days" ON public.school_off_days;
CREATE POLICY "Allow all for school_off_days" ON public.school_off_days FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for notifications" ON public.notifications;
CREATE POLICY "Allow all for notifications" ON public.notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- REALTIME SUBSCRIPTIONS
-- Tự động đẩy thông báo thời gian thực khi có báo cáo mới hoặc thay đổi cấu hình
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'public.school_settings', 
        'public.school_years', 
        'public.campuses', 
        'public.classes', 
        'public.indicator_groups', 
        'public.daily_reports', 
        'public.daily_report_values',
        'public.students',
        'public.school_off_days',
        'public.notifications'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname || '.' || tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
        END IF;
    END LOOP;
END $$;
`;

export const generateFullDatabaseSqlScript = (): string => {
  const escapeSql = (val: any): string => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return isNaN(val) ? '0' : val.toString();
    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val).replace(/'/g, "''");
      return `'${jsonStr}'::jsonb`;
    }
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
  };

  let sql = `${SUPABASE_SQL_SCHEMA}\n\n`;
  sql += `-- ==============================================================================\n`;
  sql += `-- DỮ LIỆU THỰC TẾ TRONG HỆ THỐNG (DATA DUMP INSERT / UPSERT)\n`;
  sql += `-- Được tạo tự động từ ứng dụng lúc: ${new Date().toLocaleString('vi-VN')}\n`;
  sql += `-- ==============================================================================\n\n`;

  try {
    // 1. school_settings
    const rawSettings = localStorage.getItem('sso_school_settings');
    if (rawSettings) {
      const s = JSON.parse(rawSettings);
      sql += `-- 1. DỮ LIỆU CẤU HÌNH TRƯỜNG\n`;
      sql += `INSERT INTO public.school_settings (
    id, school_name, short_name, department_name, sub_department_name,
    address, commune, province, phone, email, website, logo_url,
    principal_name, principal_title, reporter_name, reporter_title,
    report_title, footer_text, developer_name, developer_contact,
    primary_color, input_mode, enable_campuses, week1_start_date,
    school_days_per_week, ranking_threshold_excellent, ranking_threshold_good,
    ranking_threshold_fair, enable_early_report_bonus, early_report_deadline,
    early_report_bonus_points, early_report_max_bonus, enable_auto_reminder,
    auto_reminder_time, reminder_message_template
) VALUES (
    ${escapeSql(s.id || 'school_01')}, ${escapeSql(s.school_name)}, ${escapeSql(s.short_name)}, ${escapeSql(s.department_name)}, ${escapeSql(s.sub_department_name)},
    ${escapeSql(s.address)}, ${escapeSql(s.commune)}, ${escapeSql(s.province)}, ${escapeSql(s.phone)}, ${escapeSql(s.email)}, ${escapeSql(s.website)}, ${escapeSql(s.logo_url)},
    ${escapeSql(s.principal_name)}, ${escapeSql(s.principal_title || 'Hiệu trưởng')}, ${escapeSql(s.reporter_name)}, ${escapeSql(s.reporter_title || 'Người lập biểu')},
    ${escapeSql(s.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH')}, ${escapeSql(s.footer_text)}, ${escapeSql(s.developer_name || 'Vũ Văn Hùng')}, ${escapeSql(s.developer_contact || 'SĐT: 0984246993')},
    ${escapeSql(s.primary_color || '#1d4ed8')}, ${escapeSql(s.input_mode || 'MODE_1_TOTAL_PRESENT')}, ${escapeSql(Boolean(s.enable_campuses))}, ${escapeSql(s.week1_start_date || '2026-09-07')},
    ${escapeSql(Number(s.school_days_per_week) || 5)}, ${escapeSql(Number(s.ranking_threshold_excellent) || 98)}, ${escapeSql(Number(s.ranking_threshold_good) || 95)},
    ${escapeSql(Number(s.ranking_threshold_fair) || 90)}, ${escapeSql(Boolean(s.enable_early_report_bonus))}, ${escapeSql(s.early_report_deadline || '07:30')},
    ${escapeSql(Number(s.early_report_bonus_points) || 0.5)}, ${escapeSql(Number(s.early_report_max_bonus) || 2.5)}, ${escapeSql(Boolean(s.enable_auto_reminder))},
    ${escapeSql(s.auto_reminder_time || '07:30')}, ${escapeSql(s.reminder_message_template)}
) ON CONFLICT (id) DO UPDATE SET
    school_name = EXCLUDED.school_name,
    short_name = EXCLUDED.short_name,
    principal_name = EXCLUDED.principal_name,
    reporter_name = EXCLUDED.reporter_name,
    updated_at = timezone('utc'::text, now());\n\n`;
    }

    // 2. school_years
    const rawYears = localStorage.getItem('sso_school_years');
    if (rawYears) {
      const years = JSON.parse(rawYears);
      if (Array.isArray(years) && years.length > 0) {
        sql += `-- 2. NĂM HỌC (${years.length} bản ghi)\n`;
        years.forEach((y) => {
          sql += `INSERT INTO public.school_years (id, name, is_active, is_locked)
VALUES (${escapeSql(y.id)}, ${escapeSql(y.name)}, ${escapeSql(Boolean(y.is_active))}, ${escapeSql(Boolean(y.is_locked))})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, is_locked = EXCLUDED.is_locked;\n`;
        });
        sql += `\n`;
      }
    }

    // 3. campuses
    const rawCampuses = localStorage.getItem('sso_campuses');
    if (rawCampuses) {
      const campuses = JSON.parse(rawCampuses);
      if (Array.isArray(campuses) && campuses.length > 0) {
        sql += `-- 3. PHÂN HIỆU / ĐIỂM TRƯỜNG (${campuses.length} bản ghi)\n`;
        campuses.forEach((c) => {
          sql += `INSERT INTO public.campuses (id, name, active, principal_name, principal_title, reporter_name, reporter_title)
VALUES (${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(Boolean(c.active))}, ${escapeSql(c.principal_name)}, ${escapeSql(c.principal_title)}, ${escapeSql(c.reporter_name)}, ${escapeSql(c.reporter_title)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;\n`;
        });
        sql += `\n`;
      }
    }

    // 4. profiles
    const rawProfiles = localStorage.getItem('sso_profiles');
    if (rawProfiles) {
      const profiles = JSON.parse(rawProfiles);
      if (Array.isArray(profiles) && profiles.length > 0) {
        sql += `-- 4. TÀI KHOẢN NGƯỜI DÙNG (${profiles.length} tài khoản)\n`;
        profiles.forEach((p) => {
          sql += `INSERT INTO public.profiles (id, full_name, email, role, assigned_class_id, active, phone)
VALUES (${escapeSql(p.id)}, ${escapeSql(p.full_name)}, ${escapeSql(p.email)}, ${escapeSql(p.role)}, ${escapeSql(p.assigned_class_id)}, ${escapeSql(Boolean(p.active))}, ${escapeSql(p.phone)})
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, role = EXCLUDED.role, assigned_class_id = EXCLUDED.assigned_class_id, active = EXCLUDED.active;\n`;
        });
        sql += `\n`;
      }
    }

    // 5. classes
    const rawClasses = localStorage.getItem('sso_classes');
    if (rawClasses) {
      const classes = JSON.parse(rawClasses);
      if (Array.isArray(classes) && classes.length > 0) {
        sql += `-- 5. LỚP HỌC (${classes.length} lớp)\n`;
        classes.forEach((cls) => {
          sql += `INSERT INTO public.classes (id, class_name, grade, school_year_id, campus_id, homeroom_teacher_id, active, is_locked, sort_order)
VALUES (${escapeSql(cls.id)}, ${escapeSql(cls.class_name)}, ${escapeSql(cls.grade)}, ${escapeSql(cls.school_year_id)}, ${escapeSql(cls.campus_id)}, ${escapeSql(cls.homeroom_teacher_id)}, ${escapeSql(Boolean(cls.active))}, ${escapeSql(Boolean(cls.is_locked))}, ${escapeSql(Number(cls.sort_order) || 0)})
ON CONFLICT (id) DO UPDATE SET class_name = EXCLUDED.class_name, grade = EXCLUDED.grade, school_year_id = EXCLUDED.school_year_id, campus_id = EXCLUDED.campus_id, homeroom_teacher_id = EXCLUDED.homeroom_teacher_id, is_locked = EXCLUDED.is_locked, sort_order = EXCLUDED.sort_order;\n`;
        });
        sql += `\n`;
      }
    }

    // 6. indicator_groups
    const rawIndicators = localStorage.getItem('sso_indicator_groups');
    if (rawIndicators) {
      const indicators = JSON.parse(rawIndicators);
      if (Array.isArray(indicators) && indicators.length > 0) {
        sql += `-- 6. NHÓM CHỈ TIÊU (${indicators.length} chỉ tiêu)\n`;
        indicators.forEach((ind) => {
          sql += `INSERT INTO public.indicator_groups (id, name, code, enabled, sort_order, show_total, show_present, show_absent, show_percentage, column_header_override, icon)
VALUES (${escapeSql(ind.id)}, ${escapeSql(ind.name)}, ${escapeSql(ind.code)}, ${escapeSql(Boolean(ind.enabled))}, ${escapeSql(Number(ind.sort_order) || 0)}, ${escapeSql(Boolean(ind.show_total))}, ${escapeSql(Boolean(ind.show_present))}, ${escapeSql(Boolean(ind.show_absent))}, ${escapeSql(Boolean(ind.show_percentage))}, ${escapeSql(ind.column_header_override)}, ${escapeSql(ind.icon)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, enabled = EXCLUDED.enabled, sort_order = EXCLUDED.sort_order, icon = EXCLUDED.icon;\n`;
        });
        sql += `\n`;
      }
    }

    // 7. students
    const rawStudents = localStorage.getItem('sso_students');
    if (rawStudents) {
      const students = JSON.parse(rawStudents);
      if (Array.isArray(students) && students.length > 0) {
        sql += `-- 7. DANH SÁCH HỌC SINH (${students.length} học sinh)\n`;
        students.forEach((s) => {
          sql += `INSERT INTO public.students (id, class_id, full_name, address, is_boarding)
VALUES (${escapeSql(s.id)}, ${escapeSql(s.class_id)}, ${escapeSql(s.full_name)}, ${escapeSql(s.address)}, ${escapeSql(Boolean(s.isBoarding ?? s.is_boarding))})
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, address = EXCLUDED.address, is_boarding = EXCLUDED.is_boarding;\n`;
        });
        sql += `\n`;
      }
    }

    // 8. daily_reports
    const rawReports = localStorage.getItem('sso_daily_reports');
    if (rawReports) {
      const reports = JSON.parse(rawReports);
      if (Array.isArray(reports) && reports.length > 0) {
        sql += `-- 8. SỔ BÁO CÁO SĨ SỐ NGÀY (${reports.length} báo cáo)\n`;
        reports.forEach((r) => {
          const dateStr = String(r.report_date).split('T')[0];
          sql += `INSERT INTO public.daily_reports (id, class_id, report_date, created_by, status, notes, absent_students, reported_time, locked_at)
VALUES (${escapeSql(r.id)}, ${escapeSql(r.class_id)}, ${escapeSql(dateStr)}::date, ${escapeSql(r.created_by)}, ${escapeSql(r.status || 'SUBMITTED')}, ${escapeSql(r.notes)}, ${escapeSql(r.absent_students || [])}, ${escapeSql(r.reported_time)}, ${escapeSql(r.locked_at)})
ON CONFLICT (class_id, report_date) DO UPDATE SET created_by = EXCLUDED.created_by, status = EXCLUDED.status, notes = EXCLUDED.notes, absent_students = EXCLUDED.absent_students, reported_time = EXCLUDED.reported_time, locked_at = EXCLUDED.locked_at;\n`;
        });
        sql += `\n`;
      }
    }

    // 9. daily_report_values
    const rawValues = localStorage.getItem('sso_daily_report_values');
    if (rawValues) {
      const values = JSON.parse(rawValues);
      if (Array.isArray(values) && values.length > 0) {
        sql += `-- 9. CHI TIẾT SỐ LIỆU CHỈ TIÊU (${values.length} dòng số liệu)\n`;
        values.forEach((v) => {
          sql += `INSERT INTO public.daily_report_values (id, report_id, indicator_group_id, total_count, present_count, absent_count)
VALUES (${escapeSql(v.id)}, ${escapeSql(v.report_id)}, ${escapeSql(v.indicator_group_id)}, ${escapeSql(Number(v.total_count) || 0)}, ${escapeSql(Number(v.present_count) || 0)}, ${escapeSql(Number(v.absent_count) || 0)})
ON CONFLICT (report_id, indicator_group_id) DO UPDATE SET total_count = EXCLUDED.total_count, present_count = EXCLUDED.present_count, absent_count = EXCLUDED.absent_count;\n`;
        });
        sql += `\n`;
      }
    }

    // 10. school_off_days
    const rawOffDays = localStorage.getItem('sso_school_off_days');
    if (rawOffDays) {
      const offDays = JSON.parse(rawOffDays);
      if (Array.isArray(offDays) && offDays.length > 0) {
        sql += `-- 10. LỊCH NGHỈ HỌC SINH (${offDays.length} ngày nghỉ)\n`;
        offDays.forEach((o) => {
          sql += `INSERT INTO public.school_off_days (id, date, name, type, applies_to)
VALUES (${escapeSql(o.id)}, ${escapeSql(o.date)}::date, ${escapeSql(o.name)}, ${escapeSql(o.type || 'HOLIDAY')}, ${escapeSql(o.applies_to || 'ALL')})
ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, applies_to = EXCLUDED.applies_to;\n`;
        });
        sql += `\n`;
      }
    }

    // 11. notifications
    const rawNotifs = localStorage.getItem('sso_notifications');
    if (rawNotifs) {
      const notifs = JSON.parse(rawNotifs);
      if (Array.isArray(notifs) && notifs.length > 0) {
        sql += `-- 11. THÔNG BÁO HỆ THỐNG (${notifs.length} thông báo)\n`;
        notifs.slice(0, 100).forEach((n) => {
          sql += `INSERT INTO public.notifications (id, user_id, class_id, class_name, type, title, message, date, read, action_url, created_by_name, urgent)
VALUES (${escapeSql(n.id)}, ${escapeSql(n.user_id)}, ${escapeSql(n.class_id)}, ${escapeSql(n.class_name)}, ${escapeSql(n.type)}, ${escapeSql(n.title)}, ${escapeSql(n.message)}, ${escapeSql(n.date)}, ${escapeSql(Boolean(n.read))}, ${escapeSql(n.action_url)}, ${escapeSql(n.created_by_name)}, ${escapeSql(Boolean(n.urgent))})
ON CONFLICT (id) DO NOTHING;\n`;
        });
        sql += `\n`;
      }
    }

    // 12. system_logs
    const rawLogs = localStorage.getItem('sso_system_logs');
    if (rawLogs) {
      const logs = JSON.parse(rawLogs);
      if (Array.isArray(logs) && logs.length > 0) {
        sql += `-- 12. NHẬT KÝ HỆ THỐNG (${logs.length} dòng nhật ký)\n`;
        logs.slice(0, 100).forEach((l) => {
          sql += `INSERT INTO public.system_logs (id, user_id, user_name, user_role, action, class_name, report_date, old_data, new_data)
VALUES (${escapeSql(l.id)}, ${escapeSql(l.user_id)}, ${escapeSql(l.user_name)}, ${escapeSql(l.user_role)}, ${escapeSql(l.action)}, ${escapeSql(l.class_name)}, ${l.report_date ? `${escapeSql(l.report_date)}::date` : 'NULL'}, ${escapeSql(l.old_data)}, ${escapeSql(l.new_data)})
ON CONFLICT (id) DO NOTHING;\n`;
        });
        sql += `\n`;
      }
    }

    sql += `-- ==============================================================================\n`;
    sql += `-- HOÀN TẤT ĐẨY TOÀN BỘ CƠ SỞ DỮ LIỆU & DỮ LIỆU SĨ SỐ LÊN SUPABASE!\n`;
    sql += `-- ==============================================================================\n`;
  } catch (err: any) {
    sql += `\n-- Lỗi sinh dữ liệu: ${err?.message || err}\n`;
  }

  return sql;
};

