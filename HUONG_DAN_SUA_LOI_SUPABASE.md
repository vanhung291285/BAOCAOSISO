# BÁO CÁO SĨ SỐ – BẢN SỬA ỔN ĐỊNH KẾT NỐI SUPABASE

Ngày rà soát mã nguồn: **07/11/2026**. Đây là bản chỉnh trên mã nguồn ZIP do nhà trường cung cấp, không phải dữ liệu máy chủ đã được kiểm chứng trực tiếp.

## A. Nguyên nhân tìm được trong mã nguồn

| Vị trí | Nguyên nhân | Hậu quả |
|---|---|---|
| `src/services/storage.ts` – `getStudents()` | `students.select('*')` không phân trang | Với mặc định API 1.000 dòng, danh sách học sinh dài hơn có thể bị cắt mà không báo lỗi |
| `storage.ts` – tải lại báo cáo ngày/tuần/tháng | Cùng khoảng ngày bị tải lặp; `daily_report_values.in(...)` chưa phân trang | Tăng số request / tải thiếu chỉ tiêu khi dữ liệu lớn |
| `src/pages/DailyReportPage.tsx` | Polling mỗi 5 giây, kể cả khi tab ẩn | Gọi API nhiều lần không cần thiết; tranh chấp yêu cầu Realtime |
| `storage.ts` – `getSchoolYears()`, `getCampuses()`, `getClasses()` | `Promise.race` 3,5 giây, không hủy yêu cầu mạng gốc | Dữ liệu mới bị bỏ qua nếu phản hồi chậm; yêu cầu cũ vẫn chạy |
| `storage.ts` – `getMonthlyAggregate()` | Biến `allValues` được dùng trước khi khai báo | Có thể hỏng bước hợp nhất dữ liệu báo cáo tháng |
| `storage.ts` – `fetchAllRowsFromCloud()` | Khi truy vấn lỗi, vòng lặp trả về phần đã tải mà không báo lỗi | Có thể hiểu nhầm rằng bảng đã được đồng bộ đủ |
| `storage.ts` – `saveStudent()` / `saveStudents()` | Ghi Cloud lỗi nhưng hàm vẫn kết thúc bình thường | Người dùng tưởng đã đồng bộ thành công dù mới lưu ở máy |
| `storage.ts` – `saveDailyReport()` | Cắt thao tác nhiều bước sau 15 giây bằng Promise.race, để request đang chạy dở | Có thể báo lỗi dù máy chủ đang hoàn tất ghi |
| `storage.ts` – nạp học sinh | Quét tất cả học sinh với `.some` cho từng học sinh cục bộ | Tăng chi phí xử lý CPU khi danh sách lớn |
| `supabase_schema.sql` | `Allow all ... TO anon` cho nhiều bảng chứa dữ liệu học sinh | **Lỗ hổng bảo mật nghiêm trọng**, không phải lỗi tốc độ; cần dự án bảo mật tách riêng |

Các vấn đề trên **xác nhận qua đọc mã nguồn**. Chưa có logs từ dự án Supabase thực tế nên không khẳng định máy chủ đang lỗi, bao nhiêu request/giây hay cụ thể lỗi SQL nào xuất hiện lúc chậm.

## B. Những sửa đổi đã thực hiện

1. `src/services/supabase.ts`: thêm HTTP timeout thực với AbortController; thử lại một lần chỉ cho GET/HEAD khi mất mạng hoặc HTTP 429/502/503/504. **Không** tự thử lại thao tác ghi, tránh ghi trùng.
2. `src/services/storage.ts`: lấy học sinh bằng nhiều trang 500 dòng có sắp xếp ID ổn định; coalesce yêu cầu trùng, cache thành công 30 giây (local fallback 10 giây). Không tự đẩy toàn bộ local lên Cloud khi Cloud trả về rỗng; ưu tiên giá trị từ Cloud cho học sinh đã đồng bộ, chỉ giữ bản ghi mới nhập tại máy trong 5 phút nếu Cloud đã có danh sách.
3. `src/services/storage.ts`: thêm `fetchReportWindow()` để lấy báo cáo và chỉ tiêu **đầy đủ qua phân trang**, dùng chung cache 10 giây giữa báo cáo ngày/tuần/tháng; gộp các request cùng thời điểm.
4. Bỏ ba timer 3,5 giây không hủy được yêu cầu; dùng timeout HTTP tập trung.
5. Sửa lỗi `allValues` trong báo cáo tháng; loại bỏ xử lý học sinh O(N²) gây chậm.
6. `src/pages/DailyReportPage.tsx`: giảm polling dự phòng từ 5 giây còn 30 giây, không polling khi tab ẩn hoặc trình duyệt offline. Realtime vẫn dùng để nhận thay đổi tức thì.
7. Không tự chạy thao tác xóa học sinh trên Cloud trong `ensureInitialized` hoặc trong quá trình đọc dữ liệu. Chỉ thực hiện các thao tác xóa khi quản trị chủ động.
8. Khi ghi học sinh / danh sách học sinh lên Supabase lỗi, trả thông báo cụ thể rằng **mới lưu tạm trên thiết bị**. Không đánh đồng với việc lưu Cloud thành công.
9. Khi gửi báo cáo sĩ số, đợi xác nhận kết quả thực sự của chuỗi thao tác; timeout được áp dụng ở từng HTTP request.
10. `fetchAllRowsFromCloud()` báo lỗi rõ ở trang bị lỗi, không coi tải một phần là thành công.

## C. Triển khai mã nguồn đã sửa

**Trước tiên:** sao lưu cơ sở dữ liệu và xuất danh sách học sinh/báo cáo hiện tại. Không chạy lại toàn bộ `supabase_schema.sql`, `supabase_realtime_full_schema.sql` hoặc nút **Reset database** để khắc phục chậm.

1. Giải nén ZIP đã sửa. Đưa mã nguồn lên repository GitHub hiện dùng cho ứng dụng (hoặc sao chép các file đã sửa). **Không** upload thư mục `node_modules` hay mật khẩu Supabase service-role.
2. Với Vercel hoặc dịch vụ tương tự: kiểm tra biến môi trường `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trỏ đúng dự án Supabase của nhà trường. Biến Vite chỉ chứa khóa public/anon, **không đặt service_role key trong frontend**. Build command: `npm run build`, output: `dist`.
3. Deploy lại; trên điện thoại/máy tính nhấn tải lại trang (Ctrl+Shift+R ở máy tính) hoặc đóng/mở lại ứng dụng PWA khi bản mới có hiệu lực.
4. Mở Supabase Dashboard → **SQL Editor**, chọn đúng project và chạy **duy nhất** `supabase_toi_uu_ket_noi_an_toan.sql`. Script bổ sung chỉ mục, cập nhật thống kê, không xóa bảng hay dữ liệu.
5. Chạy `supabase_kiem_tra_hieu_nang.sql` **từng câu truy vấn** để đối chiếu số lượng bản ghi, chỉ mục và RLS.
6. Ở ứng dụng, dùng mục **Cài đặt Supabase → Kiểm tra kết nối**, kiểm tra các bảng đã truy cập được.
7. Thử luồng thật ở **ít nhất 2 thiết bị**: một GVCN gửi báo cáo, một BGH theo dõi tổng hợp ngày; thử thay ngày, báo cáo tháng, nhập học sinh; xác minh dữ liệu sau khi tải lại trang.

Nếu sau khi deploy một thiết bị vẫn thấy bản cũ, kiểm tra Service Worker/PWA cache; không xóa toàn bộ LocalStorage trước khi sao lưu dữ liệu chưa đồng bộ.

## D. Phép kiểm tra và hạn chế

- Đã kiểm tra cú pháp toàn bộ **67 file TS/TSX**, không có lỗi cú pháp.
- Đã chạy test mô phỏng phân trang: **1.120 báo cáo và 2.240 giá trị**, xác nhận lấy đủ trang, cache dùng lại dữ liệu, và lỗi truy vấn không bị nuốt.
- **Chưa** xác nhận được `npm run build` vì môi trường kiểm thử không cài đủ gói npm (npm ci thất bại). Cần chạy lệnh này trong máy hoặc CI có truy cập registry.
- **Chưa** kết nối hay thao tác trực tiếp cơ sở dữ liệu Supabase của nhà trường; không thể khẳng định hiệu năng thực tế cải thiện bao nhiêu phần trăm nếu không có logs/lượng dữ liệu thực.
- Các phần báo cáo chuyên sâu khác vẫn có thể cần tối ưu riêng khi database rất lớn; bản này tập trung vào những điểm tác động rộng và rõ ràng.

## E. Kiểm tra các lỗi còn lại khi có hiện tượng chậm

Mở DevTools → Network → lọc `supabase.co/rest/v1`. Kiểm tra:

- HTTP **401/403**: nhầm URL/khóa public, hoặc RLS không cấp quyền. Không sửa bằng cách công khai thêm quyền ghi.
- HTTP **429**: quá nhiều request hoặc giới hạn API; cần giảm tải, xem Supabase API logs và dashboard.
- HTTP **500/502/503/504**: lỗi server hoặc database quá tải; xem Supabase Logs/Query Performance.
- HTTP **400** với `PGRSTxxx` hoặc `42P01/42703/23503`: truy vấn không khớp schema/bảng/cột/khóa ngoại; cần xem lỗi cụ thể, không reset CSDL.
- Request treo lâu: xem Network waterfall, DNS/TLS, tốc độ mạng trường, CDN, thời gian chạy SQL thực trong Supabase.

**RLS / bảo mật:** Schema hiện tại cấp rộng `FOR ALL TO anon, authenticated USING (true)` ở nhiều bảng. Điều đó cho phép client có anon key đọc và ghi dữ liệu mà không có cơ chế xác thực và phân quyền thực sự. Vì ứng dụng sử dụng profile nội bộ thay vì Supabase Auth để xác thực, **không tự ý tắt các policy** ngay trên hệ thống đang hoạt động: có thể gây lỗi toàn bộ ứng dụng. Cần lên kế hoạch chuyển sang Supabase Auth và chính sách RLS theo vai trò; đây là việc bảo mật bắt buộc nhưng độc lập với bản tối ưu hiệu năng.

