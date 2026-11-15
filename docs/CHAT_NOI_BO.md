# Chat nội bộ nhà trường

## Chức năng

- Nút Tin nhắn riêng với chatbot AI; dùng được trên điện thoại và máy tính.
- Nhắn riêng giữa hai tài khoản, thông báo toàn trường chỉ quản trị chat được gửi.
- Biểu tượng tin nhắn trên thanh đầu trang và nút chat đều hiện số chưa đọc. Tải ngay khi vào tài khoản, cập nhật mỗi 5 giây khi trang hiển thị, làm mới ngay khi quay lại ứng dụng hoặc có mạng; 100 tin gần nhất mỗi cuộc trò chuyện.
- Chỉ xác nhận gửi sau khi máy chủ lưu. Gửi lại cùng nội dung sau gián đoạn mạng dùng cùng mã gửi, tránh trùng tin.
- GVCN chỉ chọn lớp là tự kết nối chat, không cần mật khẩu. Máy chủ đối chiếu hồ sơ GVCN và lớp được phân công; không gửi email, không cấp mật khẩu cho giáo viên.
- Phiên GVCN tự tạo và tự nối lại sau khi hết hạn; cookie HttpOnly/Secure/SameSite riêng từng tài khoản, tồn tại tối đa một giờ. Các tab quản trị/GVCN trong cùng trình duyệt không ghi đè phiên của nhau. Quản trị vẫn dùng phiên đăng nhập chính đã xác thực. GVCN không thể tự nhận quyền quản trị, cấp tài khoản hoặc phát thông báo toàn trường.

## Kích hoạt lần đầu trên Supabase

1. Chạy `migrations/20261115_staff_chat.sql` trong SQL Editor. Bản SQL chỉ tạo bảng/hàm chat, không xóa dữ liệu cũ. Không cấp quyền anon/authenticated vào các bảng chat.
2. Vercel Production cần `SUPABASE_URL` (hoặc `VITE_SUPABASE_URL`) và `SUPABASE_SERVICE_ROLE_KEY` phía máy chủ. Không đặt service role key trong biến VITE_. Dự án đang dùng những biến này cho sổ chấm cơm; không cần tạo khóa mới nếu đã cấu hình đúng.
3. Tạo một người dùng quản trị chat trong Supabase → Authentication → Users → Add user. Tự đặt email và mật khẩu riêng, xác nhận email khi tạo (không cần gửi thư). Không nhập mật khẩu vào SQL/GitHub.
4. Lấy UUID vừa tạo và ID hồ sơ quản trị trong bảng `profiles`. Chạy câu lệnh sau sau khi thay hai giá trị mẫu:

```sql
INSERT INTO public.staff_chat_accounts
(id,profile_id,display_name,role_label,is_admin)
SELECT 'UUID_AUTH_VUA_TAO'::uuid,id,full_name,role,true
FROM public.profiles
WHERE id='ID_HO_SO_QUAN_TRI' AND role='ADMIN' AND active=true;
```

Cần đúng hồ sơ quản trị đang dùng để đăng nhập ứng dụng. Quyền quản trị chat được gán riêng tại đây, không suy ra từ vai trò do trình duyệt gửi lên.

5. Đăng nhập tài khoản quản trị ở trang chính bằng mật khẩu Supabase Auth. Chat tự dùng phiên đó. GVCN chỉ chọn lớp tại trang chính rồi mở Tin nhắn, không nhập mật khẩu ở bất kỳ bước nào. Tài khoản GVCN tự xuất hiện khi giáo viên vào ứng dụng. Quản trị có thể chọn Cấp tài khoản nhắn tin → GVCN → Kích hoạt GVCN không mật khẩu để người nhận xuất hiện trước lần truy cập đầu tiên.

Biểu tượng Tin nhắn hiển thị chấm đỏ và tổng số chưa đọc; tự cập nhật cả khi khung chat đóng.

## Kiểm tra sau kích hoạt

- Tài khoản A nhắn B; C không được đọc tin A–B.
- GVCN không gửi được thông báo toàn trường hoặc cấp tài khoản; quản trị gửi được đến một người và toàn trường.
- Kiểm tra đồng bộ giữa hai điện thoại, chưa đọc, tải lại trang và gửi lại sau gián đoạn.
- Không dùng dữ liệu học sinh thật để thử chức năng.

## Phân quyền và giới hạn

Quản trị được xác minh bằng Supabase Auth; phiên GVCN được máy chủ ký và giới hạn theo lớp được chọn. GVCN không được nâng quyền qua nội dung gửi từ trình duyệt. Bảng chat và hàm SQL chỉ dành cho service_role. Quản trị chat cũng không có API đọc hộp thư giữa hai người khác. Người quản lý trực tiếp Supabase vẫn có quyền quản trị dữ liệu.

**Chế độ GVCN không mật khẩu được chủ ứng dụng yêu cầu sau khi biết giới hạn:** chọn lớp không xác minh người dùng thực tế. Bất kỳ ai chọn đúng lớp cũng có thể đọc và gửi tin dưới tên GVCN lớp đó; đây là hộp thư theo lớp, không bảo đảm bí mật cá nhân. Không dùng để gửi mật khẩu hoặc thông tin nhạy cảm. Giao diện ghi rõ định danh theo lớp đã chọn. Không có endpoint công khai tự nhận quyền quản trị. Chỉ SQL quản trị mới cấp được quản trị chat đầu tiên hoặc thay quyền này. Muốn khóa tài khoản chat, đặt `staff_chat_accounts.enabled=false` trong Supabase; việc này có hiệu lực cho yêu cầu tiếp theo.

Hiện chưa có tệp đính kèm, cuộc gọi, push notification khi đóng ứng dụng, sửa/xóa tin hoặc tải lịch sử cũ hơn 100 tin. Không khẳng định đã có người nhận đọc tin vì chức năng hiện chỉ theo dõi chưa đọc của từng người dùng.
