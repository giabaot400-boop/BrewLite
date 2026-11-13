# Đối chiếu sơ đồ

## Bổ sung kiến trúc ngày 13/11/2026

- D08/D09 đối chiếu source `88b4e12cf909226e9b376041d5da4205765b7649`.
- Mock là adapter bên trong NestJS, không actor/server thanh toán ngoài;
  payment replay đọc attempt đã lưu, không gọi mock lại.
- Next.js có UI/Server Components/BFF; cookie HttpOnly đi giữa browser và BFF,
  Bearer đi giữa server và NestJS. localStorage chứa giỏ/recovery, không JWT.
- Expiry chạy trong backend; CLI tạo application context tạm, dùng cùng
  workflow và flag. Không thêm service thứ tư hoặc API pha chế công khai.
- Context có người vận hành công cụ demo; không thêm mục tiêu người dùng,
  14 mã UC, 13 model và 27 AC giữ nguyên.
- Hai hình Sprint 1 không đổi. [Bảng delta và nguồn code](../../sprint3/A1_ARCHITECTURE_UPDATE.md)
  phân biệt source hiện tại, thiết kế lịch sử và kết quả kiểm thử.

## Thiết kế D01–D07 tại mốc 06/11/2026

- Master 14 mã UC: UC-01…13 + S2-UC-LOGOUT; UC12 extend UC08 có mã, UC13 extend UC09 success. Mock nội bộ không actor ngoài.
- State đúng chín cạnh đề; retry qua PENDING trong cùng tx, replay không cạnh; COMPLETED/CANCELLED kết thúc.
- Activity/sequence giữ giỏ ở PENDING/FAILED/chưa rõ; dọn chỉ paid-current đúng binding, cancel không resurrect cart.
- BFF dùng expected owner, capture token một lần cho /me và mutation; NestJS kiểm quyền riêng.
- Create precheck tất cả Product rồi CAS; conflict rollback/fresh snapshot, không savepoint/nested retry.
- Payment final-only same tx Order/kho/điểm; không activePayment/PROCESSING/UNKNOWN phía server, không worker ngoài.
- Cancel PAID trước PREPARING bù trừ full/mock/kho/điểm một lần; payment status success giữ lịch sử.
- ERD hai góc cùng 13 model =9 nền+4 mới; Payment đề ánh xạ PaymentAttempt.
- Legacy policy1 không tự payment/cancel/expiry; new policy2 deadline15min; tick60s/batch50/startup recheck.
- Hình/schema/API/test phải được kiểm tra khi hiện thực; hình không chứng minh runtime đạt.

 bỏ API quote và GET payment riêng. GET Order có latestPayment đầy đủ; recovery chính key dùng POST payment cùng key/body, không suy identity từ latestPayment. Chỉ kho Product, không reservation hoặc field stock trên Topping. Giữ13model/14mãUC/27AC, hold15phút và expiry backend. UI hiện tổng chính thức từ Order trước khách xác nhận payment.
