# E — Kiểm thử tích hợp Orders V2

Ngày kiểm thử: 10/11/2026.
Commit được kiểm thử: 87990d7.
Nhánh nguồn: integration/sprint3-orders-ce.

## Môi trường
- PostgreSQL local, database brewlite_s2_test.
- Ba migration đã áp dụng đầy đủ.
- Dùng apps/api/.env.test, không commit secret.
- Gọi trực tiếp OrdersService; chưa kiểm thử HTTP/BFF.

## Kết quả
- Typecheck frontend/backend: PASS.
- Nhóm unit test đã chạy: 70/70 PASS.
- PostgreSQL: 4/4 PASS.
  - Tạo đơn V2, snapshot, ledger SUCCEEDED và giữ kho ACTIVE.
  - Replay trả cùng đơn, không giữ kho thêm.
  - Hết kho lưu REJECTED, không tạo thêm đơn hoặc thay đổi kho.
  - Giả lập lỗi lưu ledger trong transaction PostgreSQL thật:
    Order, reservation và thay đổi stock đều rollback.
- Fixture dùng user/product ngẫu nhiên và đã được dọn.

## Lệnh kiểm thử PostgreSQL
npm.cmd exec --workspace apps/api -- tsx prisma/check-orders-v2-postgres.ts

## Chưa xác nhận
- Concurrency và retry của workflow V2 trên PostgreSQL.
- Promotion trong bài kiểm thử PostgreSQL này.
- HTTP/BFF, auth và frontend tích hợp.
- Payment, loyalty award/reversal, cancel và expiry.
- Chưa xác nhận hoàn thành toàn bộ Sprint 3.