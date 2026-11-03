# E kiểm thử HTTP Auth và Orders Sprint 2

Ngày kiểm thử: 03/11/2026.
Commit kiểm thử: 3bfa4fb.
Nhánh nguồn: feature/sprint2-orders-auth-integration.

## Môi trường
- PostgreSQL 17.11, database riêng brewlite_s2_test.
- Backend dùng backend/.env.test và JWT secret tạm.
- Kiểm thử HTTP trực tiếp NestJS tại localhost:3001.
- Không đưa env, secret hoặc token vào Git.

## Kết quả đạt
- Không có token: me/orders trả 401 AUTH_REQUIRED.
- Đăng ký hợp lệ: 201, chỉ trả user id/email.
- Đăng nhập hợp lệ: 200, có token và expiresAt.
- me với token hợp lệ: 200, đúng user, giữ nguyên expiresAt.
- Tạo đơn có xác thực: 201, PENDING, tổng 94000.
- Replay cùng key/payload: 200, trả cùng mã đơn.
- Đối chiếu DB: Order thuộc đúng user đăng nhập;
  Order và OrderRequest khớp orderId, userId, requestKey, requestHash.
- Logout: 204; DB đã ghi revokedAt trước expiresAt.
- Token đã logout bị chặn ở me/orders với HTTP 401.
- Sai mật khẩu: 401 INVALID_CREDENTIALS.
- Email trùng sau trim/lowercase: 409 EMAIL_ALREADY_EXISTS.
- Mật khẩu ASCII 14 ký tự bị từ chối; 15 ký tự được chấp nhận.
- Mật khẩu ASCII 73 byte bị từ chối; 72 byte được chấp nhận.
- Token giả: me/orders trả 401 SESSION_INVALID.

## Lỗi cần xử lý
AUTH-E-01: Phiên đã thu hồi nhưng chưa hết hạn trả sai mã lỗi.

Sau logout:
- revokedAt có giá trị, thời điểm kiểm tra trước expiresAt.
- GET /auth/me và POST /orders trả 401 SESSION_EXPIRED.
- Mong đợi theo v0.6: 401 SESSION_INVALID cho phiên bị thu hồi.

Quyền truy cập đã bị chặn; phần phân loại mã lỗi chưa đạt.
Chưa xác nhận đã sửa hoặc kiểm thử lại.

## Chưa kiểm tra
- Token/phiên thực sự hết hạn.
- Session không thuộc user trong token.
- Quy tắc Unicode, NUL, surrogate và giữ nguyên dấu cách mật khẩu.
- BFF, cookie, CSRF, giao diện và luồng trình duyệt.
- Hiệu năng endpoint và toàn bộ AC Sprint 2.

Không kết luận hoàn tất Auth hoặc toàn bộ Sprint 2 từ báo cáo này.