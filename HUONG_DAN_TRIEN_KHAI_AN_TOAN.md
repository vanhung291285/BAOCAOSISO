# BAOCAOSISO — Bản sửa đồng bộ có kiểm soát

## Đã thay đổi
- `getLatestReport` và `getLatestReportForClass` truy vấn Supabase, không lấy báo cáo cũ trong localStorage làm nguồn chính.
- `saveDailyReport` chỉ cập nhật cache cục bộ sau khi Supabase xác nhận ghi báo cáo và chỉ tiêu thành công. **Chưa có transaction nguyên tử**: hai thao tác ghi trên Supabase vẫn có thể thành công một phần.
- `getSupabaseCredentials` dùng `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` từ môi trường build; không dùng URL chia sẻ, localStorage hoặc dự án hardcoded trong production.

## Bắt buộc trước khi deploy
1. Sao lưu database Supabase và repository GitHub.
2. Đặt Vercel Environment Variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable/anon key, tuyệt đối không phải service_role).
3. Chạy file `SQL_KIEM_TRA_KHONG_XOA_DU_LIEU.sql` trên Supabase SQL Editor và đối chiếu kết quả với schema thực tế.
4. Không chạy lại `supabase_schema.sql` có policy `Allow all` trên production.
5. Triển khai staging trước, thử lưu báo cáo, tải lại, hai thiết bị, thống kê ngày/tuần/tháng/học kỳ, nội trú và chấm ăn.

## Chưa hoàn thành / cần đối chiếu cơ sở dữ liệu thực tế
- SQL migration transaction và RLS theo tài khoản thực tế.
- Toàn bộ chức năng cấu hình trong `SchoolContext`, quản trị, chấm ăn và nội trú vẫn cần chuyển hoàn toàn sang cloud-first.
- Kiểm thử TypeScript/build, integration và 100–500 người dùng đồng thời chưa thực hiện.

**Không chạy SQL phá hủy, không xóa bảng và không thay đổi dữ liệu Supabase hiện có.**
