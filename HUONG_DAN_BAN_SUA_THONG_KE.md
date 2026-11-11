# Bản sửa thống kê và xếp hạng BAOCAOSISO

- Nguồn chính: `daily_reports` và `daily_report_values` trên Supabase.
- Chỉ tính trạng thái `SUBMITTED`, `LOCKED` với chỉ tiêu `ALL` có `total_count > 0`, số có mặt/vắng không âm và không vượt tổng.
- Ngày chưa báo cáo: không tính thành đã báo, không tính tỷ lệ 100%.
- Bốn cấp độ: cùng ngày tham chiếu; tuần, tháng, học kỳ tích lũy đến ngày được chọn.
- Không sửa dữ liệu Supabase và không yêu cầu chạy SQL cho thay đổi này.

## Triển khai

Giải nén hai phần vào cùng thư mục, chạy `npm install`, `npm run lint`, `npm run build` và kiểm tra trên môi trường thử nghiệm trước khi đưa lên Vercel.

## Kiểm tra bắt buộc

1. Ngày 12/11/2026 không có bản ghi: 0 lớp đã báo, tỷ lệ ngày để trống.
2. Ngày 11/11/2026 có 43 bản ghi hợp lệ: hiện 43 lớp đã báo nếu cấu hình có 43 lớp.
3. Báo cáo `DRAFT` không được tính trong xếp hạng.
4. Báo cáo thiếu chỉ tiêu `ALL` không được tính đã báo.
5. Kiểm tra cùng ngày trên hai trình duyệt và các phân hiệu.

Chưa kiểm thử build hoặc kết nối Supabase thực tế. Các module khác vẫn cần kiểm toán riêng trước khi khẳng định toàn bộ sản phẩm hoàn thiện.
