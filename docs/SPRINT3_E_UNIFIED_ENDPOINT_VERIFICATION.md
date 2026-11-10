# E — Kiểm thử endpoint Orders thống nhất

Ngày kiểm thử: 11/11/2026, giờ Việt Nam.
Repository: BrewLite (A1).
Commit ứng dụng được kiểm thử: 4e1d3ce.
PR nguồn: https://github.com/giabaot400-boop/BrewLite/pull/50

## Môi trường
- NestJS local tại localhost:3002.
- PostgreSQL local, database brewlite_s2_test.
- Dùng tài khoản và sản phẩm test riêng.
- Không lưu secret/token trong báo cáo.

## Kết quả
- Typecheck frontend/backend: PASS.
- Bộ test controller/HTTP mock/service: 39/39 PASS.
  Lượt controller 8/8 riêng nằm trong bộ 39, không cộng trùng.
- GET /health: 200.
- POST /orders không token: 401 AUTH_REQUIRED.
- Đăng ký và đăng nhập tài khoản test thành công.
- schemaVersion dạng chuỗi "2": 400 VALIDATION_ERROR.
- POST /orders/v2: 404, route cũ đã bỏ.
- V2 qua POST /orders: 201; replay: 200 cùng mã đơn.
- V1 không schemaVersion qua POST /orders: 201;
  replay: 200 cùng mã đơn.
- Payload V2 dùng key V1 và ngược lại:
  cả hai trả 409 IDEMPOTENCY_CONFLICT.

## Đối chiếu PostgreSQL
- Hai ledger SUCCEEDED; requestHash khớp Order.
- V2: checkoutPolicyVersion 2, canonicalVersion 2,
  có paymentDeadline và một reservation.
- V1 mới: checkoutPolicyVersion 1, canonicalVersion 1,
  không paymentDeadline và không reservation.
- Sản phẩm stock 3, reservedStock 1, stockVersion 1:
  chỉ đơn V2 giữ kho.

## Điểm chưa chốt
- V1 mới chưa giữ kho/deadline tại commit này.
  Đây là hành vi quan sát được, không xác nhận đã đạt chính sách Sprint 3.
- Chưa kiểm thử replay ledger V1 lịch sử tạo từ phiên bản cũ.
- Chưa kiểm thử BFF/frontend trên bản endpoint mới.
- Chưa xác nhận CHECKOUT_CHANGED.details.reason đã thống nhất.
- Chưa nghiệm thu payment/cancel/refund/expiry/CLI hoặc toàn bộ Sprint 3.
- Kết quả nền 87990d7 trong PR #46 không tự áp dụng cho commit này.

## Dọn dữ liệu
- Đã xóa đúng fixture HTTP trong transaction và COMMIT.
- Kiểm tra sau dọn: test_orders = 0, test_products = 0, test_users = 0.
- Dọn fixture không phải kiểm thử nghiệp vụ cancel/release.