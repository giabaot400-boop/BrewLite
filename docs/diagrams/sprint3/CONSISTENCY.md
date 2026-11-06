# Đối chiếu sơ đồ 1.3

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

V1.1 bỏ API quote và GET payment riêng. GET Order có latestPayment đầy đủ; recovery chính key dùng POST payment cùng key/body, không suy identity từ latestPayment. Chỉ kho Product, không reservation hoặc field stock trên Topping. Giữ13model/14mãUC/27AC, hold15phút và expiry backend. UI hiện tổng chính thức từ Order trước khách xác nhận payment.
