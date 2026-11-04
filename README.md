<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/009ac6a3-ad1f-42ef-bee2-245385a4fca0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Triển khai bản sửa đăng nhập

1. Dùng Node.js 20 trở lên. Giữ cấu hình Supabase của bản đang chạy và các biến môi trường hiện có.
2. Chạy `npm ci`, `npm run lint` và `npm run build`.
3. Đưa bản dựng lên đúng địa chỉ ứng dụng hiện tại để trình duyệt cập nhật service worker. Nếu dùng máy chủ Express trong gói, khởi động bằng `NODE_ENV=production npm start`.
4. Mở ứng dụng khi có mạng trên thiết bị từng gặp lỗi. Khi bản mới đã tải, đóng rồi mở lại ứng dụng và thử đăng nhập. Lần mở mới cần có mạng để lấy trang HTML hiện hành.

Bản sửa giữ luồng đăng nhập theo hồ sơ hiện có. Nếu triển khai trên hệ thống chứa dữ liệu thật, việc chuyển sang xác thực tài khoản qua Supabase Auth và giới hạn quyền truy cập từng bảng bằng RLS là một hạng mục riêng. Bản sửa này dùng cấu hình Supabase hiện hữu và không yêu cầu chạy lại SQL.
