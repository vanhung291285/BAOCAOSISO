-- BAOCAOSISO / BẢN BỔ SUNG INDEX KHÔNG PHÁ HỦY DỮ LIỆU (07/11/2026)
-- CHỈ CHẠY trên đúng project Supabase đang sử dụng, sau khi sao lưu.
-- Không DROP TABLE / DELETE / TRUNCATE / thay đổi RLS.
-- Lưu ý: một số chỉ mục đã có từ supabase_schema.sql; IF NOT EXISTS giúp chạy lặp an toàn.

-- Tra cứu sĩ số theo ngày, tổng hợp tháng/tuần, truy vấn theo lớp.
CREATE INDEX IF NOT EXISTS idx_bcss_daily_reports_date_class
  ON public.daily_reports (report_date, class_id);

-- Giữ nguyên unique (class_id, report_date) từ schema gốc.
CREATE INDEX IF NOT EXISTS idx_bcss_report_values_indicator_report
  ON public.daily_report_values (indicator_group_id, report_id);

-- Danh sách học sinh theo lớp và phân loại bán trú.
CREATE INDEX IF NOT EXISTS idx_bcss_students_class_boarding
  ON public.students (class_id, is_boarding);

-- Tra cứu thông báo gần nhất theo giáo viên hoặc lớp.
CREATE INDEX IF NOT EXISTS idx_bcss_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bcss_notifications_class_recent
  ON public.notifications (class_id, created_at DESC)
  WHERE class_id IS NOT NULL;

-- Truy vấn nhật ký cấu hình gần nhất (chỉ sử dụng khi phục hồi).
CREATE INDEX IF NOT EXISTS idx_bcss_system_logs_action_recent
  ON public.system_logs (action, created_at DESC);

-- Báo cáo ăn bán trú: bản SQL gốc đã có (class_id, date) và (date).
-- Không tạo lại chỉ mục trùng lặp.

-- Cập nhật thống kê giúp trình tối ưu PostgreSQL đánh giá truy vấn.
ANALYZE public.daily_reports;
ANALYZE public.daily_report_values;
ANALYZE public.students;
ANALYZE public.notifications;
ANALYZE public.system_logs;
