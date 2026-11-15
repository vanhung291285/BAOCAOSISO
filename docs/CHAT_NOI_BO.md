# Chat nội bộ nhà trường

## Chức năng

- Nút Tin nhắn riêng với chatbot AI; dùng được trên điện thoại và máy tính.
- Nhắn riêng giữa hai tài khoản, thông báo toàn trường chỉ quản trị chat được gửi.
- Đếm chưa đọc, tự cập nhật (5 giây khi mở, 15 giây khi đóng), 100 tin gần nhất mỗi cuộc trò chuyện.
- Chỉ xác nhận gửi sau khi máy chủ lưu. Gửi lại cùng nội dung sau gián đoạn mạng dùng cùng mã gửi, tránh trùng tin.
- Quản trị chat cấp/đổi mật khẩu riêng từng giáo viên. Không gửi email hoặc tin nhắn tự động khi cấp tài khoản.
- Phiên chat chỉ giữ trong bộ nhớ trang; tải lại, đổi tài khoản hoặc đăng xuất cần đăng nhập chat lại. Mật khẩu báo cáo sĩ số không bị thay đổi.

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

5. Vào ứng dụng bằng tài khoản quản trị, mở Tin nhắn, đăng nhập bằng mật khẩu vừa tạo. Chọn Cấp tài khoản chat → chọn giáo viên → đặt mật khẩu riêng và cấp trực tiếp cho đúng người. GVCN mở Tin nhắn trong tài khoản của mình để nhập mật khẩu được cấp.

## Kiểm tra sau kích hoạt

- Tài khoản A nhắn B; C không được đọc tin A–B.
- GVCN không gửi được thông báo toàn trường hoặc cấp tài khoản; quản trị gửi được đến một người và toàn trường.
- Kiểm tra đồng bộ giữa hai điện thoại, chưa đọc, tải lại trang và gửi lại sau gián đoạn.
- Không dùng dữ liệu học sinh thật để thử chức năng.

## Phân quyền và giới hạn

Mọi yêu cầu đọc/gửi được xác minh bằng Supabase Auth ở máy chủ. Bảng chat và hàm SQL chỉ dành cho service_role. Quản trị chat cũng không có API đọc hộp thư giữa hai người khác. Người quản lý trực tiếp Supabase vẫn có quyền quản trị dữ liệu.

Không dùng chọn lớp làm bằng chứng danh tính. Không có endpoint công khai tự nhận quyền quản trị. Chỉ SQL quản trị mới cấp được quản trị chat đầu tiên hoặc thay quyền này. Muốn khóa tài khoản chat, đặt `staff_chat_accounts.enabled=false` trong Supabase; việc này có hiệu lực cho yêu cầu tiếp theo.

Hiện chưa có tệp đính kèm, cuộc gọi, push notification khi đóng ứng dụng, sửa/xóa tin hoặc tải lịch sử cũ hơn 100 tin. Không khẳng định đã có người nhận đọc tin vì chức năng hiện chỉ theo dõi chưa đọc của từng người dùng.
