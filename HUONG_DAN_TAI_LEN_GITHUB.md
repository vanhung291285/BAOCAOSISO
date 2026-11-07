# Hướng dẫn tải ứng dụng Báo cáo sĩ số lên GitHub (bằng trình duyệt)

## Giải thích lỗi
GitHub giới hạn mỗi lần tải bằng trình duyệt tối đa 100 tệp. Gói ZIP cũ chứa 159 tệp. Gói gọn mới gồm 111 tệp cần thiết, chia hai lượt: Lần 1 có 80 tệp và Lần 2 có 31 tệp.

## Quan trọng: phải GIẢI NÉN, không đưa tệp .zip trực tiếp lên kho mã nguồn

1. Tải `BAOCAOSISO_GITHUB_LAN_1_MA_NGUON.zip` và `BAOCAOSISO_GITHUB_LAN_2_PUBLIC.zip` về máy.
2. Giải nén **riêng từng ZIP** để có các thư mục chứa mã nguồn.
3. Vào kho mã nguồn GitHub cần cập nhật, ở **thư mục gốc** (nơi phải có `package.json` và `index.html`), chọn **Add file → Upload files**.
4. Mở thư mục vừa giải nén của **lần 1**. Chọn **các nội dung bên trong** (không kéo cả thư mục có tên `BAOCAOSISO_GITHUB_LAN_1_MA_NGUON`). Kéo các tệp và thư mục như `src`, `api`, `package.json`, `index.html` vào vùng tải lên GitHub. Giữ nguyên cấu trúc thư mục. Chọn Commit changes.
5. Quay lại **thư mục gốc** của cùng repository, chọn **Add file → Upload files** lần nữa.
6. Giải nén **lần 2**, kéo nguyên thư mục `public` (không kéo thư mục giải nén bao ngoài) vào vùng tải lên, rồi Commit changes.
7. Kiểm tra tại trang chính repository phải thấy `src/`, `api/`, `public/`, `package.json`, `index.html`, `vite.config.ts`, `vercel.json` nằm **ngang hàng ở gốc**. Không được có lớp thư mục bọc ngoài làm sai Root Directory.
8. Nếu Vercel đã liên kết GitHub, theo dõi deployment mới. Build command: `npm run build`; Output Directory: `dist`; Root Directory: `./`.

### Nếu repository hiện có các tệp cũ
Các tệp có cùng đường dẫn sẽ được GitHub cập nhật. Các tệp patch/test cũ không được tự động xóa khỏi repository; việc này không ngăn build nếu chúng không nằm trong scripts triển khai. Không xóa bừa dữ liệu hoặc cấu hình Supabase.

### Lưu ý bảo mật và dữ liệu
- Không chạy lại `supabase_schema.sql` để sửa lỗi tải GitHub. SQL chỉ được chạy khi thực sự thực hiện nâng cấp CSDL và đã sao lưu dữ liệu.
- Giữ nguyên các biến môi trường trên Vercel (Supabase URL, anon key và biến API nếu dùng), không tải tệp `.env` chứa khóa bí mật lên GitHub.
- Mã nguồn cũ có chứa URL và khóa `anon` Supabase phía trình duyệt. Khóa `anon` không tương đương khóa quản trị, nhưng nếu các chính sách RLS lỏng lẻo, cơ sở dữ liệu vẫn có thể bị lộ. Nên dùng repository riêng tư trong khi chưa kiểm tra RLS.

### Phương án không cần chia lần
Dùng GitHub Desktop để commit/push toàn bộ mã nguồn trong `BAOCAOSISO_GITHUB_DAY_DU_GON.zip` sau khi giải nén. Cách này không chịu giới hạn 100 tệp/lượt của giao diện web.
