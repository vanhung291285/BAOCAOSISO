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
    developer_name TEXT DEFAULT 'Nguyễn Hùng',
    developer_contact TEXT DEFAULT 'hungthcsnongu@gmail.com',
    primary_color TEXT DEFAULT '#1d4ed8',
    input_mode TEXT DEFAULT 'MODE_1_TOTAL_PRESENT' CHECK (input_mode IN ('MODE_1_TOTAL_PRESENT', 'MODE_2_TOTAL_ABSENT', 'MODE_3_ALL_THREE')),
    enable_campuses BOOLEAN DEFAULT false,
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.school_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_years;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.indicator_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_report_values;
`;
