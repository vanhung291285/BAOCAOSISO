# Rà soát bước 1 — BAOCAOSISO phục vụ nghiên cứu KHKT (21/11/2026)

> Tài liệu rà soát mã nguồn, **không phải chứng nhận đã kiểm thử hệ thống đang chạy**. Không thay đổi chức năng, cơ sở dữ liệu hoặc cấu hình triển khai.

## Phạm vi và bằng chứng đã đọc

- `src/components/Sidebar.tsx`: menu người dùng, nghiệp vụ, báo cáo và nghiên cứu KHKT.
- `src/pages/AIPredictiveDropoutPage.tsx`: giao diện cảnh báo sớm, phân tích trường, nhật ký vận động.
- `src/services/aiPredictiveService.ts`: kiểu dữ liệu, chấm điểm nguy cơ, nhật ký can thiệp.
- `src/services/researchEvidence.ts`: so sánh tỷ lệ chuyên cần giữa hai giai đoạn.
- `package.json`: lệnh kiểm thử và xây dựng.
- `KIEM_TOAN_VA_TRIEN_KHAI.md`: các rủi ro đồng bộ, lưu dữ liệu, quyền truy cập đã được ghi nhận trước đây.

## Bản đồ module cần kiểm chứng

| Nhóm | Module / tệp | Mục tiêu kiểm chứng |
| --- | --- | --- |
| Quản trị | `AuthContext.tsx`, `UsersManagementPage.tsx` | Phân quyền ADMIN/BGH/GVCN; quyền phía Supabase |
| Cấu hình | `SettingsSchoolPage.tsx`, `SettingsCampusesPage.tsx`, `SettingsIndicatorsPage.tsx` | Cấu hình trường, điểm trường, chỉ tiêu |
| Chuyên cần | `AttendanceInputPage.tsx`, `storage.ts` | Nhập, lưu, đồng bộ và chống ghi đè |
| Bán trú | `BoardingManagementPage.tsx`, `MonthlyBoardingSheet.tsx` | Chấm ăn, tổng hợp tháng, bảo vệ dữ liệu |
| Báo cáo | `DailyReportPage.tsx`, `WeeklyReportPage.tsx`, `MonthlyReportPage.tsx` | Đối chiếu số liệu gốc và tổng hợp |
| AI nguy cơ | `aiPredictiveService.ts`, `AIPredictiveDropoutPage.tsx` | Công thức điểm, giải thích cảnh báo, độ chính xác |
| AI kế hoạch | `api/ai/dropout-prediction.ts` và dịch vụ gọi AI | Kiểm tra API, nguồn dữ liệu, fallback và xác nhận của giáo viên |
| AI suất ăn | `AIBoardingMealForecastTab.tsx`, `mealPlanning.ts` | So sánh dự báo với suất ăn thực tế |
| KHKT | `ResearchPage.tsx`, `researchEvidence.ts` | Minh chứng thực nghiệm và phương pháp so sánh |

## Phát hiện có căn cứ từ mã nguồn

1. `calculateDropoutRisk` xử lý các báo cáo có trạng thái SUBMITTED/LOCKED, tính các chỉ số vắng học và chấm điểm theo quy tắc. Không nên mô tả điểm này là **xác suất bỏ học đã hiệu chuẩn** khi chưa có tập dữ liệu kiểm định.
2. `InterventionLog` chứa thông tin về học sinh, người thực hiện, loại hoạt động và kết quả. Dịch vụ khai báo khóa `sso_ai_dropout_interventions_v1`; cần xác minh nơi lưu, đồng bộ và phân quyền trước khi sử dụng thật.
3. `compareResearchWeeks` chỉ ghép các lớp có cùng số buổi báo cáo và đạt ngưỡng ngày tối thiểu; đây là phép so sánh tỷ lệ chuyên cần, **không chứng minh quan hệ nhân quả** giữa phần mềm và mức cải thiện.
4. Báo cáo kiểm toán cũ nêu các rủi ro cache localStorage, ghi dữ liệu không nguyên tử, concurrent upsert, RLS và thao tác xóa. Cần kiểm tra lại trên mã hiện tại trước khi kết luận còn lỗi.
5. `package.json` có `npm run check` (TypeScript, tests, build); chưa chạy các lệnh này trong đợt rà soát bước 1.

## Thứ tự hoàn thiện an toàn

1. **P0 — An toàn dữ liệu trẻ em:** rà soát RLS, quyền theo lớp, giới hạn dữ liệu gửi API AI, nhật ký truy cập; dùng dữ liệu ẩn danh khi nghiên cứu.
2. **P0 — Tính toàn vẹn:** kiểm tra báo cáo đồng bộ nhiều thiết bị, mất mạng, thao tác đồng thời, backup và phục hồi; không sửa schema production trực tiếp.
3. **P1 — Nhật ký vận động:** chuyển sang lưu cloud có kiểm soát truy cập và lịch sử chỉnh sửa nếu hiện còn phụ thuộc localStorage; cần thiết kế migration.
4. **P1 — Đánh giá AI:** công bố công thức, giải thích chỉ số, so sánh với phương pháp thống kê cơ bản; ghi nhận cảnh báo sai, không tự gán nhãn học sinh.
5. **P1 — Dự báo suất ăn:** đo MAE/sai số dự báo theo bữa trên dữ liệu thực, có baseline đơn giản.
6. **P2 — Hồ sơ KHKT:** nhật ký nghiên cứu của học sinh, phân định vai trò AI/người hướng dẫn, báo cáo thử nghiệm và poster.

## Quy trình kiểm thử trước khi đề nghị hợp nhất

- `npm ci && npm run check`.
- Dùng Supabase **staging** với dữ liệu giả lập; không chạy SQL chưa kiểm tra trên production.
- Kiểm tra GVCN chỉ xem/sửa dữ liệu lớp được phân công; BGH/ADMIN theo phạm vi được cấp.
- Kiểm tra hai thiết bị, hai tab, mạng chập chờn, báo ăn và nhật ký vận động.
- Đối chiếu dự báo và kế hoạch AI với dữ liệu đầu vào; mọi đề xuất cần giáo viên xác nhận.
- Chỉ merge sau khi chủ dự án xem diff, kết quả test và phê duyệt.

## Phạm vi Pull Request này

Chỉ bổ sung tài liệu kiểm toán và lộ trình. **Không sửa mã ứng dụng, không chạm Supabase, không triển khai Vercel.**
