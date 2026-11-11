# Thống kê chuyên cần 4 cấp độ – 11/11/2026

- Ngày chọn là ngày chốt dữ liệu (as-of date) cho ngày, tuần, tháng, học kỳ.
- Chỉ đọc báo cáo SUBMITTED/LOCKED từ Supabase; chỉ tính bản ghi có chỉ tiêu ALL hợp lệ.
- Tỷ lệ = tổng present / tổng total * 100; không lấy trung bình tỷ lệ lớp.
- Khoảng không có báo cáo hợp lệ: hiển thị “Chưa có báo cáo”, biểu đồ để trống.
- Một ngày không báo cáo không làm mất thống kê lịch sử của tuần, tháng, học kỳ.
- Cùng một snapshot dữ liệu dùng cho 4 thẻ và biểu đồ.
- Không ghi SQL hoặc xóa dữ liệu cũ; chỉ thay đổi luồng đọc và tổng hợp.

## Lưu ý triển khai
- Cần kiểm tra quyền SELECT Supabase trên daily_reports và daily_report_values.
- Chưa kiểm thử build/đồng bộ Supabase thực tế; triển khai thử nghiệm trước.
- Các hàm tính toán cũ dùng cho màn hình khác chưa được thay thế hoàn toàn.
- Học kỳ hiện quy ước tuần 1–18 và 19–37, cần đối chiếu cấu hình năm học.
- Demo mở trực tiếp DE​MO_XEM_TRUOC.html (tên tệp không có ký tự ẩn).
