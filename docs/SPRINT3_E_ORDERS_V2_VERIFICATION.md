# E — Kiểm thử tích hợp Orders V2

Ngày kiểm thử: 10/11/2026.
Commit được kiểm thử: 87990d7.
Nhánh nguồn: integration/sprint3-orders-ce.

## Môi trường
- PostgreSQL local, database brewlite_s2_test.
- Ba migration đã áp dụng đầy đủ.
- Dùng apps/api/.env.test, không commit secret.
- Kiểm thử trực tiếp OrdersService và HTTP NestJS; chưa kiểm thử BFF/frontend.

## Kết quả
- Typecheck frontend/backend: PASS.
- Nhóm unit test đã chạy: 70/70 PASS.
- PostgreSQL: 6/6 PASS
  - Tạo đơn V2, snapshot, ledger SUCCEEDED và giữ kho ACTIVE.
  - Replay trả cùng đơn, không giữ kho thêm.
  - Hết kho lưu REJECTED, không tạo thêm đơn hoặc thay đổi kho.
  - Giả lập lỗi lưu ledger trong transaction PostgreSQL thật:
    Order, reservation và thay đổi stock đều rollback.
- Fixture dùng user/product ngẫu nhiên và đã được dọn.

## Lệnh kiểm thử PostgreSQL
npm.cmd exec --workspace apps/api -- tsx prisma/check-orders-v2-postgres.ts
## Concurrency Orders V2 trên PostgreSQL
- Script: apps/api/prisma/check-orders-v2-concurrency.ts.
- Kết quả: 4/4 PASS.
- Hai transaction cùng đọc tồn khả dụng bằng 1.
- Một request tạo đơn; request còn lại retry rồi nhận OUT_OF_STOCK.
- Số lần chạy transaction quan sát được: 2 và 1.
- Chỉ một Order/item/reservation ACTIVE, không giữ kho vượt tồn.
- Hai ledger V2: một SUCCEEDED và một REJECTED.
- Fixture riêng đã được dọn.
- Dùng barrier kiểm thử; giữ nguyên timeout/retry của service.
## Promotion trên PostgreSQL
- Mã chữ thường được chuẩn hóa và áp dụng đúng.
- Subtotal 35.000, giảm 10% nhưng cap 2.000: total 33.000.
- Snapshot promotion và loyaltyPointsExpected = 3 được lưu đúng.
- Tắt promotion rồi replay: trả cùng đơn, total và snapshot không đổi.
- Fixture promotion riêng đã được dọn.
## HTTP Auth và Orders V2
- Kiểm thử trực tiếp NestJS tại localhost:3002, PostgreSQL brewlite_s2_test.
- /health: 200.
- POST /orders/v2 không token: 401 AUTH_REQUIRED.
- Đăng ký: 201; đăng nhập thành công; /auth/me: 200.
- Token hợp lệ nhưng items rỗng: 400 VALIDATION_ERROR.
- Tạo đơn V2: 201 PENDING, total 35000.
- Replay cùng key/payload: 200, cùng mã đơn.
- Chủ đơn đọc chi tiết: 200, đúng snapshot và tổng tiền.
- Tài khoản khác đọc chi tiết: 404 RESOURCE_NOT_FOUND.
- Lịch sử tài khoản khác: 200, items rỗng.
- Logout: 204; token đã thu hồi gọi Orders V2: 401 SESSION_INVALID.
- Đối chiếu DB: đúng chủ đơn, policy/canonicalVersion 2,
  ledger SUCCEEDED khớp hash, reservation ACTIVE qty 1.
- Stock 2, reservedStock 1, stockVersion 1 sau tạo đơn và replay.
- Đã dọn fixture HTTP; xác nhận đơn/sản phẩm/hai tài khoản test đều 0.
- Chưa kiểm thử qua BFF hoặc frontend.
## Chưa xác nhận
- Các tình huống retry exhaustion, timeout và tranh chấp khác.
- Các trường hợp promotion hết hạn, chưa bắt đầu, không tồn tại
  và không đạt minimumSubtotal trên PostgreSQL.
- BFF và frontend tích hợp; các trường hợp auth chưa liệt kê ở trên.
- Payment, loyalty award/reversal, cancel và expiry.
- Chưa xác nhận hoàn thành toàn bộ Sprint 3.