-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA: CẤU HÌNH CHỮ KÝ SỐ & SỔ BÁN TRÚ
-- Hệ thống Quản lý Báo cáo Sĩ số & Sổ chấm cơm Bán trú - Trường PTDTBT THCS Xa Dung
-- ==============================================================================

-- 1. BẢNG CẤU HÌNH CHỮ KÝ SỐ & ĐỊA DANH KÝ (boarding_signature_configs)
CREATE TABLE IF NOT EXISTS public.boarding_signature_configs (
    id TEXT PRIMARY KEY,                          -- 'default' hoặc 'sig_config_<class_id>'
    class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
    location_name TEXT DEFAULT 'Xa Dung',        -- Địa danh ký (e.g. 'Xa Dung', 'Điện Biên Đông')
    teacher_title TEXT DEFAULT 'GIÁO VIÊN CHỦ NHIỆM',
    teacher_name TEXT NOT NULL DEFAULT '',        -- Họ và tên GVCN ký
    principal_title TEXT DEFAULT 'HIỆU TRƯỞNG',
    principal_name TEXT DEFAULT '',               -- Họ và tên Hiệu trưởng
    accountant_title TEXT DEFAULT 'KẾ TOÁN BÁN TRÚ',
    accountant_name TEXT DEFAULT '',              -- Họ và tên Kế toán
    enable_digital_signature BOOLEAN DEFAULT true,-- Bật/tắt hiển thị chữ ký số điện tử
    signature_image_url TEXT DEFAULT '',          -- Ảnh chữ ký số GVCN (Base64 hoặc URL Storage)
    stamp_image_url TEXT DEFAULT '',              -- Ảnh con dấu đỏ điện tử
    certificate_serial TEXT DEFAULT '',           -- Mã số chứng thư số / Số hiệu ký điện tử
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG NHẬT KÝ KÝ DUYỆT SỔ CHẤM ĂN THÁNG (boarding_month_signatures)
CREATE TABLE IF NOT EXISTS public.boarding_month_signatures (
    id TEXT PRIMARY KEY,                          -- 'sig_<class_id>_<YYYY-MM>'
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    month TEXT NOT NULL,                          -- 'YYYY-MM' (ví dụ: '2026-09')
    is_signed BOOLEAN DEFAULT false,              -- Trạng thái đã ký số
    signed_by_name TEXT DEFAULT '',               -- Họ tên người ký
    signed_by_role TEXT DEFAULT 'GVCN',           -- Vai trò ('GVCN', 'BGH', 'KETOAN')
    signed_at TIMESTAMPTZ,                        -- Thời gian ký số
    location_name TEXT DEFAULT 'Xa Dung',
    signature_image_url TEXT DEFAULT '',
    certificate_hash TEXT DEFAULT '',             -- Mã Hash xác thực chống sửa đổi (SHA-256)
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_class_month_signature UNIQUE (class_id, month)
);

-- 3. CHỈ MỤC (INDEXES) TỐI ƯU TỐC ĐỘ TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_boarding_sig_configs_class ON public.boarding_signature_configs(class_id);
CREATE INDEX IF NOT EXISTS idx_boarding_month_sig_lookup ON public.boarding_month_signatures(class_id, month);

-- 4. BẬT ROW LEVEL SECURITY (RLS) & CHÍNH SÁCH TRUY CẬP AN TOÀN
ALTER TABLE public.boarding_signature_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_month_signatures ENABLE ROW LEVEL SECURITY;

-- Cho phép tất cả người dùng đọc và cập nhật chữ ký số (Anon & Authenticated)
CREATE POLICY "Allow all access to boarding_signature_configs"
ON public.boarding_signature_configs
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to boarding_month_signatures"
ON public.boarding_month_signatures
FOR ALL
USING (true)
WITH CHECK (true);

-- 5. BẬT TỰ ĐỘNG ĐỒNG BỘ REALTIME QUA SUPABASE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_signature_configs;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_month_signatures;
    END IF;
END $$;
