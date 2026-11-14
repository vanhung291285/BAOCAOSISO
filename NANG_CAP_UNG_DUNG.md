# BAOCAOSISO — Nâng cấp lưu dữ liệu và trợ lý nhà trường

## Chức năng đã triển khai
- Lưu sĩ số bằng PostgreSQL RPC trong một giao dịch, kiểm tra số liệu tại máy chủ, giữ khóa chính ổn định.
- Phát hiện phiên bản cũ khi hai thiết bị sửa cùng lớp/ngày. Gửi lại cùng mã lần gửi không nhân đôi báo cáo.
- Kiểm tra báo cáo/năm học đã khóa; giữ nguyên chính sách bảng hiện có bằng SECURITY INVOKER.
- Bản nháp IndexedDB theo dự án/năm học/tài khoản/lớp/ngày; khôi phục theo lựa chọn của giáo viên. Không tự tính bản nháp thành báo cáo đã gửi.
- Thông báo trạng thái mạng, lỗi tải dữ liệu, xung đột và lỗi lưu riêng biệt. Không tự gửi khi nối mạng trở lại.
- Báo ăn chờ máy chủ xác nhận, kiểm tra tổng suất ăn; không còn thông báo thành công dựa trên lưu trình duyệt.
- Trung tâm Trợ lý dữ liệu tại #/operations: lọc ngày/lớp/phân hiệu, số lớp đã báo hợp lệ, danh sách chưa báo, học sinh vắng, kiểm tra chênh lệch, dự thảo báo cáo và sao chép để chia sẻ.
- Trợ lý hội thoại dùng số liệu xác nhận; không gọi dịch vụ AI bên ngoài cho danh sách học sinh. Câu hỏi vượt kỳ dữ liệu được báo thiếu dữ liệu.
- Không dùng mẫu 35 học sinh, 240 bán trú hoặc 100% để thay thế dữ liệu thiếu trong trợ lý hội thoại mới.

- Tải các màn hình theo nhu cầu, tách thư viện xuất Excel khỏi luồng dữ liệu khởi động.
- Báo cáo không đoán tên GVCN từ tên lớp; thiếu cấu hình thì hiển thị Chưa phân công.

## SQL
migrations/20261114_atomic_attendance.sql là migration bổ sung. Không chạy lại toàn bộ supabase_schema.sql trên cơ sở dữ liệu đang dùng.
Migration đã áp dụng tại dự án được người dùng chọn.
Đã chạy thử RPC với vai trò anon trong giao dịch ROLLBACK: lưu, giữ khóa chính, gửi lại cùng mã lần gửi và từ chối phiên bản cũ.
Đã đối chiếu số lượng dữ liệu trước/sau; không lưu bản ghi kiểm thử.

## Cách dùng
1. Mở Tổng quan → Trợ lý dữ liệu, hoặc chọn mục Trợ lý dữ liệu & đối chiếu ở menu.
2. Chọn ngày, phân hiệu và lớp. Nhấn Làm mới để lấy dữ liệu máy chủ.
3. Mở báo cáo từng lớp để xử lý chênh lệch.
4. Khi nhập sĩ số, đợi xác nhận bản nháp trên thiết bị. Sau đó bấm gửi để lưu máy chủ.
5. Nếu gặp xung đột, giữ bản nháp, tải bản máy chủ để đối chiếu; không ghi đè tự động.
6. Nếu báo ăn lỗi sau khi sĩ số đã lưu, mở mục Báo ăn và gửi lại phần báo ăn.

## Kiểm tra
npm ci
npm run check
Lệnh check gồm TypeScript, kiểm thử hồi quy TypeScript/IndexedDB/PostgreSQL cục bộ và build Vite/PWA.

## Giới hạn cần tiếp tục xử lý
- Quyền tài khoản hiện vẫn theo luồng đăng nhập cũ. Lọc GVCN ở giao diện không thay thế Supabase Auth/RLS; chưa xác nhận bảo vệ server-side theo giáo viên. Migration này không mở rộng quyền dữ liệu và không tắt RLS.
- Báo ăn là một lần ghi riêng với báo cáo sĩ số; lỗi được thông báo, chưa nằm chung transaction và chưa chống ghi đè báo ăn giữa thiết bị.
- Ngày nghỉ đặc biệt/phân hiệu cần đối chiếu lịch cấu hình; màn hình trợ lý không tự áp dụng phạt thi đua.
- Trợ lý dữ liệu mới nhận diện nhóm câu hỏi bằng quy tắc; không phải mô hình ngôn ngữ tổng quát. Các mô-đun AI soạn bài/dự báo cũ vẫn cần thẩm định đầu ra.
- Chưa thử tải hàng trăm giáo viên đồng thời hoặc kiểm tra mọi thiết bị Zalo/iOS/Android.
