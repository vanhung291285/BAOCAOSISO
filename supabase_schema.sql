-- ==============================================================================
-- SCHEMA CƠ SỞ DỮ LIỆU SUPABASE TOÀN DIỆN CHO:
-- SỔ BÁO CÁO SĨ SỐ HỌC SINH - TRƯỜNG PTDTBT THCS XA DUNG
-- Hỗ trợ đầy đủ: Tổng hợp báo cáo ngày, Báo cáo theo tháng từng lớp (Chuẩn 13 cột),
-- Quản trị trường học, Phân hiệu, Lớp học, Học sinh, Bán trú, Tài khoản & Thông báo
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
    school_name TEXT NOT NULL DEFAULT 'TRƯỜNG PTDTBT THCS XA DUNG',
    short_name TEXT DEFAULT 'THCS Xa Dung',
    department_name TEXT DEFAULT 'PHÒNG GD&ĐT HUYỆN ĐIỆN BIÊN ĐÔNG',
    sub_department_name TEXT DEFAULT 'TRƯỜNG PTDTBT THCS XA DUNG',
    address TEXT DEFAULT 'Xã Xa Dung, Huyện Điện Biên Đông, Tỉnh Điện Biên',
    commune TEXT DEFAULT 'Xa Dung',
    province TEXT DEFAULT 'Điện Biên',
    phone TEXT DEFAULT '0984246993',
    email TEXT DEFAULT 'thcsxadung@gmail.com',
    website TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    principal_name TEXT DEFAULT 'Kiều Việt Hưng',
    principal_title TEXT DEFAULT 'PHÓ HIỆU TRƯỞNG',
    reporter_name TEXT DEFAULT 'Trần Thanh Tú',
    reporter_title TEXT DEFAULT 'GIÁO VIÊN',
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

-- 7. TABLE: indicator_groups (Nhóm chỉ tiêu: Toàn trường, Bán trú...)
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

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

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

-- ==============================================================================
-- CHỈ MỤC TỐI ƯU TRUY VẤN BÁO CÁO & TỔNG HỢP (INDEXES)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_daily_reports_class_date ON public.daily_reports (class_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_daily_report_values_report ON public.daily_report_values (report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_values_indicator ON public.daily_report_values (indicator_group_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (class_id);

-- ==============================================================================
-- VIEW: view_class_monthly_attendance_summary
-- Tổng hợp dữ liệu sĩ số từng ngày theo tháng của từng lớp (Chuẩn 13 cột)
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

-- ==============================================================================
-- FUNCTION: get_class_monthly_attendance_report
-- Trả về danh sách chi tiết tất cả các ngày trong tháng (kể cả ngày chưa có báo cáo)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_class_monthly_attendance_report(p_class_id TEXT, p_year_month TEXT)
RETURNS TABLE (
    report_date DATE,
    day_str TEXT,
    day_label TEXT,
    class_name TEXT,
    teacher_name TEXT,
    total_all INT,
    absent_all INT,
    present_all INT,
    total_boarding INT,
    absent_boarding INT,
    bao_an_boarding INT,
    total_ngoai_tru INT,
    absent_ngoai_tru INT,
    absent_students_names TEXT,
    notes TEXT,
    absent_rate NUMERIC,
    present_rate NUMERIC,
    is_reported BOOLEAN
) AS $$
DECLARE
    v_year INT;
    v_month INT;
    v_start_date DATE;
    v_end_date DATE;
    v_class_name TEXT;
    v_teacher_name TEXT;
    v_default_total INT;
    v_default_boarding INT;
BEGIN
    v_year := split_part(p_year_month, '-', 1)::INT;
    v_month := split_part(p_year_month, '-', 2)::INT;
    v_start_date := make_date(v_year, v_month, 1);
    v_end_date := (v_start_date + interval '1 month - 1 day')::DATE;

    SELECT c.class_name, COALESCE(p.full_name, 'GVCN ' || c.class_name)
    INTO v_class_name, v_teacher_name
    FROM public.classes c
    LEFT JOIN public.profiles p ON c.homeroom_teacher_id = p.id OR p.assigned_class_id = c.id
    WHERE c.id = p_class_id OR c.class_name = p_class_id
    LIMIT 1;

    SELECT count(*) INTO v_default_total FROM public.students s WHERE s.class_id = p_class_id;
    IF v_default_total = 0 THEN v_default_total := 35; END IF;

    SELECT count(*) INTO v_default_boarding FROM public.students s WHERE s.class_id = p_class_id AND s.is_boarding = true;
    IF v_default_boarding = 0 THEN v_default_boarding := LEAST(25, v_default_total); END IF;

    RETURN QUERY
    WITH calendar AS (
        SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::DATE AS c_date
    )
    SELECT 
        cal.c_date AS report_date,
        to_char(cal.c_date, 'DD') AS day_str,
        'Ngày ' || to_char(cal.c_date, 'DD/MM') AS day_label,
        COALESCE(v_class_name, '') AS class_name,
        COALESCE(v_teacher_name, '') AS teacher_name,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.total_all, v_default_total)::INT ELSE NULL END AS total_all,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.absent_all, 0)::INT ELSE NULL END AS absent_all,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.present_all, v_default_total)::INT ELSE NULL END AS present_all,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.total_boarding, v_default_boarding)::INT ELSE NULL END AS total_boarding,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.absent_boarding, 0)::INT ELSE NULL END AS absent_boarding,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.bao_an_boarding, v_default_boarding)::INT ELSE NULL END AS bao_an_boarding,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.total_ngoai_tru, GREATEST(0, v_default_total - v_default_boarding))::INT ELSE NULL END AS total_ngoai_tru,
        CASE WHEN v.report_id IS NOT NULL THEN COALESCE(v.absent_ngoai_tru, 0)::INT ELSE NULL END AS absent_ngoai_tru,
        CASE 
            WHEN v.report_id IS NOT NULL THEN
                COALESCE(
                    CASE 
                        WHEN jsonb_typeof(v.absent_students) = 'array' AND jsonb_array_length(v.absent_students) > 0 THEN
                            (SELECT string_agg(s->>'full_name' || CASE WHEN (s->>'isBoarding')::boolean THEN ' (Bán Trú)' ELSE ' (Ngoại Trú)' END, E'\n') 
                             FROM jsonb_array_elements(v.absent_students) s)
                        ELSE v.notes
                    END, 
                    ''
                )
            ELSE ''
        END AS absent_students_names,
        COALESCE(v.notes, '') AS notes,
        CASE 
            WHEN v.report_id IS NOT NULL THEN
                ROUND((CASE WHEN COALESCE(v.total_all, v_default_total) > 0 THEN (COALESCE(v.absent_all, 0)::NUMERIC / COALESCE(v.total_all, v_default_total)::NUMERIC) * 100 ELSE 0 END), 2)
            ELSE NULL 
        END AS absent_rate,
        CASE 
            WHEN v.report_id IS NOT NULL THEN
                ROUND((CASE WHEN COALESCE(v.total_all, v_default_total) > 0 THEN (COALESCE(v.present_all, v_default_total)::NUMERIC / COALESCE(v.total_all, v_default_total)::NUMERIC) * 100 ELSE 100 END), 2)
            ELSE NULL 
        END AS present_rate,
        (v.report_id IS NOT NULL) AS is_reported
    FROM calendar cal
    LEFT JOIN public.view_class_monthly_attendance_summary v 
        ON (v.class_id = p_class_id OR v.class_name = p_class_id) AND v.report_date = cal.c_date
    ORDER BY cal.c_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_class_monthly_attendance_report(TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- FUNCTION: get_all_classes_monthly_attendance_summary
-- Tổng hợp sĩ số tháng cho TẤT CẢ các lớp học (cho Sheet Tổng Hợp toàn trường)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_all_classes_monthly_attendance_summary(p_year_month TEXT, p_campus_id TEXT DEFAULT NULL)
RETURNS TABLE (
    class_id TEXT,
    class_name TEXT,
    grade INT,
    campus_id TEXT,
    sort_order INT,
    teacher_name TEXT,
    total_students INT,
    total_boarding INT,
    total_ngoai_tru INT,
    reported_days_count INT,
    total_days_in_month INT,
    sum_absent_all INT,
    sum_present_all INT,
    sum_absent_boarding INT,
    sum_bao_an_boarding INT,
    sum_absent_ngoai_tru INT,
    avg_absent_rate NUMERIC,
    avg_present_rate NUMERIC
) AS $$
DECLARE
    v_year INT;
    v_month INT;
    v_start_date DATE;
    v_end_date DATE;
    v_days_count INT;
BEGIN
    v_year := split_part(p_year_month, '-', 1)::INT;
    v_month := split_part(p_year_month, '-', 2)::INT;
    v_start_date := make_date(v_year, v_month, 1);
    v_end_date := (v_start_date + interval '1 month - 1 day')::DATE;
    v_days_count := extract(day from v_end_date)::INT;

    RETURN QUERY
    WITH class_base AS (
        SELECT 
            c.id AS c_id,
            c.class_name AS c_name,
            c.grade AS c_grade,
            c.campus_id AS c_campus,
            c.sort_order AS c_sort,
            COALESCE(p.full_name, 'GVCN ' || c.class_name) AS t_name,
            COALESCE(NULLIF((SELECT count(*) FROM public.students s WHERE s.class_id = c.id), 0), 35)::INT AS c_total,
            COALESCE(NULLIF((SELECT count(*) FROM public.students s WHERE s.class_id = c.id AND s.is_boarding = true), 0), 25)::INT AS c_board
        FROM public.classes c
        LEFT JOIN public.profiles p ON c.homeroom_teacher_id = p.id OR p.assigned_class_id = c.id
        WHERE c.active = true
          AND (p_campus_id IS NULL OR p_campus_id = 'all' OR c.campus_id = p_campus_id)
    ),
    rep_agg AS (
        SELECT 
            v.class_id,
            count(DISTINCT v.report_date)::INT AS rep_days,
            COALESCE(sum(v.absent_all), 0)::INT AS sum_abs_all,
            COALESCE(sum(v.present_all), 0)::INT AS sum_pres_all,
            COALESCE(sum(v.absent_boarding), 0)::INT AS sum_abs_board,
            COALESCE(sum(v.bao_an_boarding), 0)::INT AS sum_bao_an,
            COALESCE(sum(v.absent_ngoai_tru), 0)::INT AS sum_abs_ngoai
        FROM public.view_class_monthly_attendance_summary v
        WHERE v.year_month = p_year_month
        GROUP BY v.class_id
    )
    SELECT 
        cb.c_id AS class_id,
        cb.c_name AS class_name,
        cb.c_grade AS grade,
        cb.c_campus AS campus_id,
        cb.c_sort AS sort_order,
        cb.t_name AS teacher_name,
        cb.c_total AS total_students,
        cb.c_board AS total_boarding,
        GREATEST(0, cb.c_total - cb.c_board)::INT AS total_ngoai_tru,
        COALESCE(ra.rep_days, 0)::INT AS reported_days_count,
        v_days_count AS total_days_in_month,
        COALESCE(ra.sum_abs_all, 0)::INT AS sum_absent_all,
        COALESCE(ra.sum_pres_all, cb.c_total * COALESCE(ra.rep_days, 0) - COALESCE(ra.sum_abs_all, 0))::INT AS sum_present_all,
        COALESCE(ra.sum_abs_board, 0)::INT AS sum_absent_boarding,
        COALESCE(ra.sum_bao_an, cb.c_board * COALESCE(ra.rep_days, 0) - COALESCE(ra.sum_abs_board, 0))::INT AS sum_bao_an_boarding,
        COALESCE(ra.sum_abs_ngoai, 0)::INT AS sum_absent_ngoai_tru,
        ROUND((CASE WHEN (cb.c_total * GREATEST(1, COALESCE(ra.rep_days, 0))) > 0 THEN (COALESCE(ra.sum_abs_all, 0)::NUMERIC / (cb.c_total * GREATEST(1, COALESCE(ra.rep_days, 0)))::NUMERIC) * 100 ELSE 0 END), 2) AS avg_absent_rate,
        ROUND((CASE WHEN (cb.c_total * GREATEST(1, COALESCE(ra.rep_days, 0))) > 0 THEN 100 - (COALESCE(ra.sum_abs_all, 0)::NUMERIC / (cb.c_total * GREATEST(1, COALESCE(ra.rep_days, 0)))::NUMERIC) * 100 ELSE 100 END), 2) AS avg_present_rate
    FROM class_base cb
    LEFT JOIN rep_agg ra ON cb.c_id = ra.class_id
    ORDER BY cb.c_grade ASC, cb.c_sort ASC, cb.c_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_all_classes_monthly_attendance_summary(TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- DỮ LIỆU BAN ĐẦU CẦN THIẾT (INITIAL SEED DATA)
-- ==============================================================================
INSERT INTO public.school_settings (
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
    'school_01', 'TRƯỜNG PTDTBT THCS XA DUNG', 'THCS Xa Dung',
    'PHÒNG GD&ĐT HUYỆN ĐIỆN BIÊN ĐÔNG', 'TRƯỜNG PTDTBT THCS XA DUNG',
    'Xã Xa Dung, Huyện Điện Biên Đông, Tỉnh Điện Biên', 'Xa Dung', 'Điện Biên',
    '0984246993', 'thcsxadung@gmail.com', '', '',
    'Kiều Việt Hưng', 'PHÓ HIỆU TRƯỞNG', 'Trần Thanh Tú', 'GIÁO VIÊN',
    'BÁO CÁO SĨ SỐ HỌC SINH', '', 'Vũ Văn Hùng', 'SĐT: 0984246993',
    '#1d4ed8', 'MODE_1_TOTAL_PRESENT', false, '2026-09-07',
    5, 98, 95, 90, true, '07:30', 0.5, 2.5, true, '07:30',
    'Lớp {class_name} chưa nộp báo cáo sĩ số ngày hôm nay ({date}). Thầy/Cô vui lòng cập nhật sớm trước 07h30 để BGH tổng hợp toàn trường và không bị trừ điểm thi đua!'
) ON CONFLICT (id) DO UPDATE SET updated_at = now();

INSERT INTO public.school_years (id, name, is_active, is_locked)
VALUES ('sy_2026_2027', '2026-2027', true, false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.indicator_groups (id, name, code, enabled, sort_order, show_total, show_present, show_absent, show_percentage, column_header_override, icon)
VALUES 
    ('ig_all', 'Học sinh toàn trường', 'ALL', true, 1, true, true, true, true, 'HS TOÀN TRƯỜNG', 'GraduationCap'),
    ('ig_boarding_half', 'Học sinh bán trú', 'BOARDING_HALF', true, 2, true, true, true, true, 'HS BÁN TRÚ', 'Utensils')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, role, active, phone)
VALUES 
    ('admin_01', 'Quản trị viên', 'admin@xadung.edu.vn', 'ADMIN', true, '0984246993'),
    ('bgh_01', 'Kiều Việt Hưng (Phó Hiệu trưởng)', 'bgh@xadung.edu.vn', 'BGH', true, '0984246993'),
    ('reporter_01', 'Trần Thanh Tú (Người lập biểu)', 'tu@xadung.edu.vn', 'GVCN', true, '0984246993')
ON CONFLICT (email) DO NOTHING;

-- ==============================================================================
-- 11. TABLE: boarding_reports (Báo cáo ăn bán trú chi tiết từng ngày của các lớp)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.boarding_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'LOCKED')),
    total_boarding_students INTEGER NOT NULL DEFAULT 0,
    breakfast_count INTEGER NOT NULL DEFAULT 0,
    lunch_count INTEGER NOT NULL DEFAULT 0,
    dinner_count INTEGER NOT NULL DEFAULT 0,
    absent_count INTEGER NOT NULL DEFAULT 0,
    total_meals INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    records JSONB DEFAULT '[]'::jsonb,
    submitted_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    submitted_by_name TEXT,
    submitted_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (class_id, date)
);

-- Bật Row Level Security (RLS) cho bảng boarding_reports
ALTER TABLE public.boarding_reports ENABLE ROW LEVEL SECURITY;

-- Tạo chính sách RLS cho phép truy cập tự do cho anon và authenticated
DROP POLICY IF EXISTS "Allow all for boarding_reports" ON public.boarding_reports;
CREATE POLICY "Allow all for boarding_reports" ON public.boarding_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
