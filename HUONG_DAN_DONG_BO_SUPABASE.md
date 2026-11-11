# BAOCAOSISO - Đồng bộ Supabase

## Đã chỉnh sửa
- getDailyReport: đọc trực tiếp daily_reports và daily_report_values từ Supabase, không lấy localStorage làm nguồn chính.
- getAllDailyReports/getDailyReports: đọc danh sách báo cáo có phân trang từ Supabase.
- Giữ nguyên sửa lỗi xếp hạng Supabase của bản đầu vào.

## Chưa thể cam kết
- Các module khác còn sử dụng localStorage; không được coi bản này là đã đồng bộ 100%.
- Lưu báo cáo hiện gồm nhiều truy vấn, chưa có transaction toàn phần.
- Chưa kiểm thử với Supabase thực tế, RLS, hay kiểm thử tải 100-500 người.
- Cần chạy npm ci, npm run lint, npm run build và thử nghiệm trên dự án Supabase staging.
- Không thay thế hệ thống đang chạy trước khi sao lưu dữ liệu và kiểm thử.

## GitHub
Giải nén cả hai ZIP vào cùng thư mục; chỉ tải mã nguồn đã giải nén lên GitHub.
