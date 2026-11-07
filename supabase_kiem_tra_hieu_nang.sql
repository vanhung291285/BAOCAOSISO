-- KIỂM TRA CHỈ ĐỌC - KHÔNG CHỈNH SỬA DỮ LIỆU
-- Chạy từng câu trong Supabase > SQL Editor (không có tham số hay API Key).

-- 1) Số lượng dữ liệu: đánh giá nguy cơ vượt 1000 rows/1 select.
SELECT 'students' AS bang, count(*) AS so_ban_ghi FROM public.students
UNION ALL SELECT 'daily_reports', count(*) FROM public.daily_reports
UNION ALL SELECT 'daily_report_values', count(*) FROM public.daily_report_values
UNION ALL SELECT 'classes', count(*) FROM public.classes
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'boarding_reports', count(*) FROM public.boarding_reports;

-- 2) Những chỉ mục đang có, theo bảng.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('students','daily_reports','daily_report_values','notifications','system_logs','boarding_reports')
ORDER BY tablename, indexname;

-- 3) Chính sách RLS hiện tại - cảnh báo nếu anon được phép sửa/xóa.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4) Những báo cáo trùng lớp + ngày (không thay đổi dữ liệu).
SELECT class_id, report_date, count(*) AS so_ban_ghi
FROM public.daily_reports
GROUP BY class_id, report_date HAVING count(*) > 1
ORDER BY so_ban_ghi DESC LIMIT 30;

-- 5) Bản ghi chỉ tiêu không có báo cáo gốc.
SELECT count(*) AS chi_tieu_khong_co_bao_cao
FROM public.daily_report_values v
LEFT JOIN public.daily_reports r ON r.id = v.report_id
WHERE r.id IS NULL;

-- 6) Kiểm tra tốc độ trên dữ liệu thật sau nâng cấp (thay ngày cho phù hợp).
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, class_id, report_date, status
FROM public.daily_reports
WHERE report_date = CURRENT_DATE;
