# Kết quả E kiểm thử tích hợp Orders Sprint 2

Ngày kiểm thử: 02/11/2026.
Người thực hiện: thành viên E.
Code Orders được kiểm thử: commit fecea6b,
nhánh feature/sprint2-orders, PR #15.

## Môi trường

- Windows, PostgreSQL 17.11.
- Prisma 7.10.1.
- Database riêng: brewlite_s2_test.
- Cấu hình test: backend/.env.test, không đưa lên Git.
- Đã áp dụng hai migration Sprint 1 và Sprint 2.
- Seed có 4 sản phẩm, 2 topping và 2 liên kết.
- User thử: integration-test-user-d.
- Test gọi trực tiếp OrdersService, không qua HTTP/Auth/UI.
- Test có ghi dữ liệu và giữ lại trong database test.

## Integration chính

File: backend/src/orders/orders.integration.ts.

Kết quả: ALL INTEGRATION TESTS PASSED (11/11).

Đã kiểm tra:
- Tạo đơn và lưu snapshot/ledger.
- Replay cùng key/payload không tạo đơn trùng.
- Cùng key nhưng payload khác trả IDEMPOTENCY_CONFLICT.
- Giá sai trả PRICE_CHANGED và lưu REJECTED.
- Sản phẩm không tồn tại trả VALIDATION_ERROR.
- Replay REJECTED ánh xạ lại chỉ số fieldErrors.
- Rollback khi xảy ra lỗi giữa các bước ghi.
- Hai request đồng thời chỉ tạo một Order và một ledger.

Giới hạn: IT-D11 giả lập lỗi Prisma P2034 để kiểm tra
nhánh retry, không phải bằng chứng xung đột PostgreSQL thật.

## Retry thật — SUCCEEDED

File: orders-p07-retry-succeeded.integration.ts.

- A đọc snapshot cũ khi chưa có ledger.
- B tạo và commit đơn, trả 201.
- A thực hiện 2 transaction, sau đó replay trả 200.
- Ledger cuối: SUCCEEDED.
- Số đơn theo userId/requestKey: 1.
- Kết quả: P07 SUCCEEDED REAL RETRY PASS.

## Retry thật — REJECTED

File: orders-p07-retry-rejected.integration.ts.

- A đọc snapshot cũ khi chưa có ledger.
- B lưu REJECTED và trả 409 PRICE_CHANGED.
- A thực hiện 2 transaction, sau đó trả 409 PRICE_CHANGED.
- Ledger cuối: REJECTED.
- Số đơn theo userId/requestKey: 0.
- Kết quả: P07 REJECTED REAL RETRY PASS.

HttpException 409 trong output là kết quả nghiệp vụ
được mong đợi, không phải bài test thất bại.

## Giới hạn bằng chứng

- Hai bài retry thật dùng hai PrismaClient và giữ transaction A
  để tạo tình huống snapshot cũ; không giả lập lỗi Prisma.
- Timeout transaction A được tăng lên 10 giây trong bài test.
  Không dùng kết quả này để xác nhận timeout vận hành 2 giây.
- Chưa xác nhận luồng HTTP, JWT/guard, BFF, cookie hoặc giao diện.
- Chưa xác nhận toàn bộ 37 ca kiểm thử Sprint 2 đã hoàn thành.

## Bằng chứng

- 01-orders-integration-11-pass.png
- 02-retry-succeeded-pass.png
- 03-retry-rejected-pass.png

Các ảnh được lưu riêng để gửi người review;
chưa khẳng định đã đưa ảnh vào repository.