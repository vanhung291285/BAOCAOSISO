# BAOCAOSISO – Báo cáo rà soát và giới hạn xác minh (11/11/2026)

## Đã thay đổi trong gói này
- AttendanceInputPage.tsx: gắn số phiên tải và số phiên chỉnh sửa, từ chối phản hồi tải dữ liệu cũ hoặc phản hồi về sau khi GVCN đã sửa biểu mẫu.
- Chỉ khởi tạo lại khi đổi lớp/ngày, không tự xóa danh sách học sinh vắng chỉ vì chỉ tiêu tổng được tính về 0.
- storage.ts: không trả về thành công khi không có kết nối Supabase ở thao tác saveDailyReport.

## Lỗi/rủi ro tìm thấy nhưng CHƯA được khắc phục triệt để
1. getDailyReport ưu tiên localStorage và cache 25 giây trước cloud; có thể hiển thị dữ liệu cũ từ thiết bị. Cần thiết kế cloud-first, xử lý lỗi và đồng bộ an toàn.
2. saveDailyReport ghi localStorage trước rồi mới ghi cloud; nếu cloud thất bại local có dữ liệu chưa xác nhận. Cần mô hình outbox có trạng thái rõ ràng hoặc chỉ cập nhật cache sau cloud commit.
3. Lưu daily_reports và daily_report_values qua nhiều yêu cầu không có transaction: có thể lưu nửa chừng. Cần PostgreSQL RPC trong một transaction và tích hợp phía frontend.
4. ID báo cáo được tạo bằng Date.now và kiểm tra tồn tại trước khi upsert: cần ràng buộc UNIQUE(class_id, report_date), xử lý concurrent upsert và optimistic concurrency.
5. Có thao tác ghi lớp/profiles trong quá trình lưu báo cáo; không nên để GVCN ghi cấu hình lớp/tài khoản. Cần rà soát RLS và quyền server-side.
6. Cấu hình Supabase có fallback URL/anon key và có thể thay đổi bằng localStorage. Cần cấu hình môi trường thống nhất và kiểm soát tenant.
7. Nhiều module sử dụng localStorage (báo ăn, ký tên, cấu hình, AI); chưa xác minh tất cả các luồng có lưu cloud thành công.
8. Có mã xóa boarding_reports trực tiếp; cần kiểm tra quyền, điều kiện và giao dịch.
9. Chưa thực hiện kiểm thử thực tế trên Supabase, kiểm thử bảo mật, thử tải 100–500 giáo viên, và build TypeScript (môi trường không cài được dependencies).

## Kiểm tra bắt buộc trước triển khai production
- npm ci; npm run lint; npm run build.
- GVCN nhập 3 học sinh vắng, để yên 60 giây, kiểm tra không reset; lưu, đăng nhập thiết bị khác, xác nhận dữ liệu trên cloud.
- Hai tab cùng lớp/ngày, cùng chỉnh sửa; xác nhận không ghi đè im lặng.
- Tắt mạng khi lưu, xác nhận không báo thành công; bật mạng, thử lại.
- Test các chức năng: quản trị, cấu hình, phân hiệu, lớp, học sinh, báo cáo ngày/tuần/tháng, bán trú, sổ chấm ăn, chữ ký, thông báo, export, phân quyền.
- Backup DB, thử nghiệm trên staging; chỉ triển khai chính thức sau khi đạt các bài test.

Không chạy supabase_schema.sql trên DB production nếu chưa kiểm tra migration và chính sách RLS. Gói này là bản sửa lỗi ưu tiên, KHÔNG phải chứng nhận đã sửa toàn bộ hệ thống.
