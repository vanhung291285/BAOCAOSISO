-- ==============================================================================
-- SCHEMA CƠ SỞ DỮ LIỆU & TỰ ĐỘNG ĐỒNG BỘ REALTIME TỨC THÌ TRÊN SUPABASE
-- TRƯỜNG PTDTBT THCS XA DUNG - SỔ BÁO CÁO SĨ SỐ & BÁN TRÚ
-- Chạy script này trong: Supabase Dashboard -> SQL Editor -> New query -> Run
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

-- 3. TABLE: school_settings (Cấu hình trường học)
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
    student_results_url TEXT DEFAULT '',
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
    friday_breakfast BOOLEAN DEFAULT true,
    friday_lunch BOOLEAN DEFAULT true,
    friday_dinner BOOLEAN DEFAULT false,
    saturday_breakfast BOOLEAN DEFAULT false,
    saturday_lunch BOOLEAN DEFAULT false,
    saturday_dinner BOOLEAN DEFAULT false,
    allow_gvcn_report_friday BOOLEAN DEFAULT true,
    allow_gvcn_report_saturday BOOLEAN DEFAULT false,
    boarding_sheet_title TEXT DEFAULT 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ',
    grade_names JSONB DEFAULT '{"1": "Khối 1", "2": "Khối 2", "3": "Khối 3", "4": "Khối 4", "5": "Khối 5", "6": "Khối 6", "7": "Khối 7", "8": "Khối 8", "9": "Khối 9", "10": "Khối 10", "11": "Khối 11", "12": "Khối 12"}'::jsonb,
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
    school_year_id TEXT,
    campus_id TEXT,
    homeroom_teacher_id TEXT,
    room_number TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (class_name, school_year_id)
);

-- 7. TABLE: indicator_groups (Nhóm chỉ tiêu sĩ số)
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

-- 8. TABLE: daily_reports (Báo cáo sĩ số từng ngày của từng lớp)
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'LOCKED')),
    notes TEXT,
    absent_students JSONB DEFAULT '[]'::jsonb,
    reported_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ,
    CONSTRAINT unique_class_daily_report_date UNIQUE (class_id, report_date)
);

-- 9. TABLE: daily_report_values (Số liệu chi tiết cho từng chỉ tiêu)
CREATE TABLE IF NOT EXISTS public.daily_report_values (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    report_id TEXT NOT NULL,
    indicator_group_id TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    present_count INTEGER NOT NULL DEFAULT 0 CHECK (present_count >= 0),
    absent_count INTEGER NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_report_indicator UNIQUE (report_id, indicator_group_id)
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
    class_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    address TEXT,
    village TEXT,
    gender TEXT,
    student_code TEXT,
    birth_date TEXT,
    ethnicity TEXT,
    notes TEXT,
    is_boarding BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. TABLE: school_off_days (Quản lý các ngày nghỉ học sinh)
CREATE TABLE IF NOT EXISTS public.school_off_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date DATE NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'HOLIDAY',
    applies_to TEXT DEFAULT 'ALL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. TABLE: notifications (Thông báo & Nhắc nhở sĩ số GVCN)
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

-- 14. TABLE: boarding_reports (Báo cáo chấm ăn bán trú ngày)
CREATE TABLE IF NOT EXISTS public.boarding_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'LOCKED')),
    total_boarding_students INTEGER DEFAULT 0,
    breakfast_count INTEGER DEFAULT 0,
    lunch_count INTEGER DEFAULT 0,
    dinner_count INTEGER DEFAULT 0,
    absent_count INTEGER DEFAULT 0,
    total_meals INTEGER DEFAULT 0,
    notes TEXT,
    records JSONB NOT NULL DEFAULT '[]'::jsonb,
    submitted_by TEXT,
    submitted_by_name TEXT,
    submitted_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_class_boarding_date UNIQUE (class_id, date)
);

-- 15. TABLE: boarding_signature_configs (Cấu hình chữ ký số & địa danh ký)
CREATE TABLE IF NOT EXISTS public.boarding_signature_configs (
    id TEXT PRIMARY KEY,
    class_id TEXT,
    location_name TEXT DEFAULT 'Xa Dung',
    teacher_title TEXT DEFAULT 'GIÁO VIÊN CHỦ NHIỆM',
    teacher_name TEXT NOT NULL DEFAULT '',
    principal_title TEXT DEFAULT 'HIỆU TRƯỞNG',
    principal_name TEXT DEFAULT '',
    accountant_title TEXT DEFAULT 'KẾ TOÁN BÁN TRÚ',
    accountant_name TEXT DEFAULT '',
    enable_digital_signature BOOLEAN DEFAULT true,
    signature_image_url TEXT DEFAULT '',
    stamp_image_url TEXT DEFAULT '',
    certificate_serial TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 16. TABLE: boarding_month_signatures (Nhật ký ký duyệt sổ bán trú tháng)
CREATE TABLE IF NOT EXISTS public.boarding_month_signatures (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    month TEXT NOT NULL,
    is_signed BOOLEAN DEFAULT false,
    signed_by_name TEXT DEFAULT '',
    signed_by_role TEXT DEFAULT 'GVCN',
    signed_at TIMESTAMPTZ,
    location_name TEXT DEFAULT 'Xa Dung',
    signature_image_url TEXT DEFAULT '',
    certificate_hash TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    standard_breakfast INTEGER,
    standard_lunch INTEGER,
    standard_dinner INTEGER,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_class_month_signature UNIQUE (class_id, month)
);

-- ==============================================================================
-- BỔ SUNG CỘT TỰ ĐỘNG (NẾU BẢNG ĐÃ TỒN TẠI TỪ TRƯỚC)
-- ==============================================================================
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS student_results_url TEXT DEFAULT '';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS input_mode TEXT DEFAULT 'MODE_1_TOTAL_PRESENT';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS enable_campuses BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#1d4ed8';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS developer_name TEXT DEFAULT 'Vũ Văn Hùng';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS developer_contact TEXT DEFAULT 'SĐT: 0984246993';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS week1_start_date TEXT DEFAULT '2026-09-07';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS school_days_per_week INTEGER DEFAULT 5;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS ranking_threshold_excellent NUMERIC DEFAULT 98;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS ranking_threshold_good NUMERIC DEFAULT 95;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS ranking_threshold_fair NUMERIC DEFAULT 90;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS enable_early_report_bonus BOOLEAN DEFAULT true;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS early_report_deadline TEXT DEFAULT '07:30';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS early_report_bonus_points NUMERIC DEFAULT 0.5;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS early_report_max_bonus NUMERIC DEFAULT 2.5;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS enable_auto_reminder BOOLEAN DEFAULT true;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS auto_reminder_time TEXT DEFAULT '07:30';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS reminder_message_template TEXT DEFAULT 'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm trước 07h30 để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS friday_breakfast BOOLEAN DEFAULT true;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS friday_lunch BOOLEAN DEFAULT true;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS friday_dinner BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS saturday_breakfast BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS saturday_lunch BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS saturday_dinner BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS allow_gvcn_report_friday BOOLEAN DEFAULT true;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS allow_gvcn_report_saturday BOOLEAN DEFAULT false;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS boarding_sheet_title TEXT DEFAULT 'SỔ CHẤM ĂN HỌC SINH BÁN TRÚ';
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS grade_names JSONB DEFAULT '{"1": "Khối 1", "2": "Khối 2", "3": "Khối 3", "4": "Khối 4", "5": "Khối 5", "6": "Khối 6", "7": "Khối 7", "8": "Khối 8", "9": "Khối 9", "10": "Khối 10", "11": "Khối 11", "12": "Khối 12"}'::jsonb;

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS campus_id TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS room_number TEXT;

ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS reported_time TEXT;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS birth_date TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS ethnicity TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_boarding BOOLEAN DEFAULT false;

ALTER TABLE public.boarding_month_signatures ADD COLUMN IF NOT EXISTS standard_breakfast INTEGER;
ALTER TABLE public.boarding_month_signatures ADD COLUMN IF NOT EXISTS standard_lunch INTEGER;
ALTER TABLE public.boarding_month_signatures ADD COLUMN IF NOT EXISTS standard_dinner INTEGER;

-- ==============================================================================
-- HỦY BỎ CÁC RÀNG BUỘC KHÓA NGOẠI (FOREIGN KEYS) CHẶT CHẼ
-- Đảm bảo GVCN lưu báo cáo, điểm danh, thêm học sinh không bao giờ bị lỗi 23503
-- ==============================================================================
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.students DROP CONSTRAINT IF EXISTS students_class_id_fkey;
    ALTER TABLE IF EXISTS public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_class_id_fkey;
    ALTER TABLE IF EXISTS public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_created_by_fkey;
    ALTER TABLE IF EXISTS public.daily_report_values DROP CONSTRAINT IF EXISTS daily_report_values_report_id_fkey;
    ALTER TABLE IF EXISTS public.daily_report_values DROP CONSTRAINT IF EXISTS daily_report_values_indicator_group_id_fkey;
    ALTER TABLE IF EXISTS public.classes DROP CONSTRAINT IF EXISTS classes_homeroom_teacher_id_fkey;
    ALTER TABLE IF EXISTS public.classes DROP CONSTRAINT IF EXISTS classes_campus_id_fkey;
    ALTER TABLE IF EXISTS public.classes DROP CONSTRAINT IF EXISTS classes_school_year_id_fkey;
    ALTER TABLE IF EXISTS public.boarding_reports DROP CONSTRAINT IF EXISTS boarding_reports_class_id_fkey;
    ALTER TABLE IF EXISTS public.boarding_signature_configs DROP CONSTRAINT IF EXISTS boarding_signature_configs_class_id_fkey;
    ALTER TABLE IF EXISTS public.boarding_month_signatures DROP CONSTRAINT IF EXISTS boarding_month_signatures_class_id_fkey;
EXCEPTION WHEN OTHERS THEN END $$;

-- Nạp sẵn 8 lớp học tiêu chuẩn của trường nếu chưa có
INSERT INTO public.classes (id, class_name, grade, active, sort_order)
VALUES 
    ('c_6a', '6A', 6, true, 1),
    ('c_6b', '6B', 6, true, 2),
    ('c_7a', '7A', 7, true, 3),
    ('c_7b', '7B', 7, true, 4),
    ('c_8a', '8A', 8, true, 5),
    ('c_8b', '8B', 8, true, 6),
    ('c_9a', '9A', 9, true, 7),
    ('c_9b', '9B', 9, true, 8)
ON CONFLICT (id) DO UPDATE SET class_name = EXCLUDED.class_name, grade = EXCLUDED.grade;

-- ==============================================================================
-- PHÂN QUYỀN TOÀN DIỆN CHO WEB CLIENT (ANON, AUTHENTICATED & SERVICE_ROLE)
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- BẬT ROW LEVEL SECURITY VÀ THIẾT LẬP CHÍNH SÁCH MỞ HOÀN TOÀN
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
ALTER TABLE public.boarding_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_signature_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_month_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for profiles" ON public.profiles;
CREATE POLICY "Allow all for profiles" ON public.profiles FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_settings" ON public.school_settings;
CREATE POLICY "Allow all for school_settings" ON public.school_settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_years" ON public.school_years;
CREATE POLICY "Allow all for school_years" ON public.school_years FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for campuses" ON public.campuses;
CREATE POLICY "Allow all for campuses" ON public.campuses FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for classes" ON public.classes;
CREATE POLICY "Allow all for classes" ON public.classes FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for indicator_groups" ON public.indicator_groups;
CREATE POLICY "Allow all for indicator_groups" ON public.indicator_groups FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for daily_reports" ON public.daily_reports;
CREATE POLICY "Allow all for daily_reports" ON public.daily_reports FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for daily_report_values" ON public.daily_report_values;
CREATE POLICY "Allow all for daily_report_values" ON public.daily_report_values FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for system_logs" ON public.system_logs;
CREATE POLICY "Allow all for system_logs" ON public.system_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for students" ON public.students;
CREATE POLICY "Allow all for students" ON public.students FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for school_off_days" ON public.school_off_days;
CREATE POLICY "Allow all for school_off_days" ON public.school_off_days FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for notifications" ON public.notifications;
CREATE POLICY "Allow all for notifications" ON public.notifications FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for boarding_reports" ON public.boarding_reports;
CREATE POLICY "Allow all for boarding_reports" ON public.boarding_reports FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for boarding_signature_configs" ON public.boarding_signature_configs;
CREATE POLICY "Allow all for boarding_signature_configs" ON public.boarding_signature_configs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for boarding_month_signatures" ON public.boarding_month_signatures;
CREATE POLICY "Allow all for boarding_month_signatures" ON public.boarding_month_signatures FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- ==============================================================================
-- KÍCH HOẠT REPLICA IDENTITY FULL & PUBLICATION REALTIME (TỰ ĐỘNG ĐỒNG BỘ 100%)
-- REPLICA IDENTITY FULL giúp Supabase gửi toàn bộ trường khi cập nhật dữ liệu
-- ==============================================================================
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.school_settings REPLICA IDENTITY FULL;
ALTER TABLE public.school_years REPLICA IDENTITY FULL;
ALTER TABLE public.campuses REPLICA IDENTITY FULL;
ALTER TABLE public.classes REPLICA IDENTITY FULL;
ALTER TABLE public.indicator_groups REPLICA IDENTITY FULL;
ALTER TABLE public.daily_reports REPLICA IDENTITY FULL;
ALTER TABLE public.daily_report_values REPLICA IDENTITY FULL;
ALTER TABLE public.system_logs REPLICA IDENTITY FULL;
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER TABLE public.school_off_days REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.boarding_reports REPLICA IDENTITY FULL;
ALTER TABLE public.boarding_signature_configs REPLICA IDENTITY FULL;
ALTER TABLE public.boarding_month_signatures REPLICA IDENTITY FULL;

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
        'school_settings', 
        'school_years', 
        'campuses', 
        'profiles',
        'classes', 
        'indicator_groups', 
        'daily_reports', 
        'daily_report_values',
        'students',
        'school_off_days',
        'notifications',
        'system_logs',
        'boarding_reports',
        'boarding_signature_configs',
        'boarding_month_signatures'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- DỌN DẸP HỌC SINH MẪU TỰ SINH CŨ (BẢO VỆ 100% HỌC SINH DO GVCN ĐÃ TẢI LÊN)
-- ==============================================================================
DELETE FROM public.students
WHERE id LIKE 'std_seed_%'
   OR id LIKE 'seed_%'
   OR (
       id NOT LIKE 'std_17%' 
       AND id NOT LIKE 'std_18%' 
       AND id NOT LIKE 'std_19%' 
       AND id NOT LIKE 'std_2%'
       AND full_name IN (
           'Vừ A Lềnh', 'Sùng Thị Mỷ', 'Mùa A Tủa', 'Giàng A Chống', 'Thào Thị Dợ',
           'Hờ A Cháng', 'Cứ Thị Dế', 'Lầu A Lầu', 'Vừ Thị Sinh', 'Mùa Thị Pa',
           'Giàng Thị Hoa', 'Sùng A Dơ', 'Thào A Lử', 'Hờ Thị Dở', 'Cứ A Sùng',
           'Lầu Thị Mai', 'Vừ A Tủa', 'Sùng Thị Dua', 'Mùa A Súa', 'Giàng A Vừ',
           'Thào Thị Sua', 'Hờ A Tủa', 'Cứ Thị Mỷ', 'Lầu A Chống', 'Lý A Lềnh',
           'Khang Thị Dợ', 'Lò Văn Inh', 'Quàng Thị Lan', 'Cà Văn Bun', 'Tòng Thị Duyên',
           'Vừ A Cháng', 'Sùng Thị Chi', 'Mùa Thị Say', 'Giàng A Tế', 'Thào A Phềnh'
       )
   );

-- ==============================================================================
-- CHỈ MỤC (INDEXES) TỐI ƯU TRUY VẤN BÁO CÁO & TỔNG HỢP SIÊU TỐC
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_daily_reports_class_date ON public.daily_reports (class_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_daily_report_values_report ON public.daily_report_values (report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_values_indicator ON public.daily_report_values (indicator_group_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (class_id);
CREATE INDEX IF NOT EXISTS idx_boarding_reports_class_date ON public.boarding_reports (class_id, date);
CREATE INDEX IF NOT EXISTS idx_boarding_reports_date ON public.boarding_reports (date);
CREATE INDEX IF NOT EXISTS idx_boarding_sig_configs_class ON public.boarding_signature_configs (class_id);
CREATE INDEX IF NOT EXISTS idx_boarding_month_signatures_lookup ON public.boarding_month_signatures (class_id, month);

-- ==============================================================================
-- VIEW TỔNG HỢP: view_class_monthly_attendance_summary
-- ==============================================================================
CREATE OR REPLACE VIEW public.view_class_monthly_attendance_summary AS
SELECT 
    dr.id AS report_id,
    c.id AS class_id,
    c.class_name,
    c.grade,
    c.campus_id,
    c.sort_order,
    COALESCE(p.full_name, 'GVCN ' || c.class_name) AS teacher_name,
    dr.report_date,
    to_char(dr.report_date, 'YYYY-MM') AS year_month,
    to_char(dr.report_date, 'DD') AS day_str,
    dr.status,
    dr.reported_time,
    COALESCE(drv_all.total_count, (SELECT count(*) FROM public.students s WHERE s.class_id = c.id), 35)::INT AS total_all,
    COALESCE(drv_all.absent_count, jsonb_array_length(CASE WHEN jsonb_typeof(dr.absent_students) = 'array' THEN dr.absent_students ELSE '[]'::jsonb END), 0)::INT AS absent_all,
    COALESCE(drv_all.present_count, GREATEST(0, COALESCE(drv_all.total_count, 35) - COALESCE(drv_all.absent_count, 0)))::INT AS present_all,
    COALESCE(drv_board.total_count, (SELECT count(*) FROM public.students s WHERE s.class_id = c.id AND s.is_boarding = true), 25)::INT AS total_boarding,
    COALESCE(drv_board.absent_count, 0)::INT AS absent_boarding,
    GREATEST(0, COALESCE(drv_board.total_count, 25) - COALESCE(drv_board.absent_count, 0))::INT AS bao_an_boarding,
    GREATEST(0, COALESCE(drv_all.total_count, 35) - COALESCE(drv_board.total_count, 25))::INT AS total_ngoai_tru,
    GREATEST(0, COALESCE(drv_all.absent_count, 0) - COALESCE(drv_board.absent_count, 0))::INT AS absent_ngoai_tru,
    dr.notes,
    dr.absent_students
FROM public.daily_reports dr
JOIN public.classes c ON dr.class_id = c.id
LEFT JOIN public.profiles p ON c.homeroom_teacher_id = p.id OR p.assigned_class_id = c.id
LEFT JOIN public.daily_report_values drv_all ON dr.id = drv_all.report_id AND drv_all.indicator_group_id IN (SELECT id FROM public.indicator_groups WHERE code = 'ALL' OR id = 'ig_all')
LEFT JOIN public.daily_report_values drv_board ON dr.id = drv_board.report_id AND drv_board.indicator_group_id IN (SELECT id FROM public.indicator_groups WHERE code = 'BOARDING_HALF' OR id = 'ig_boarding_half' OR lower(name) LIKE '%bán trú%');

GRANT SELECT ON public.view_class_monthly_attendance_summary TO anon, authenticated;
