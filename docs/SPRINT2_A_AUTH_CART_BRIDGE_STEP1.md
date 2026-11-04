# A — Cầu nối auth/cart, bước 1

Baseline: integration/sprint2-auth-cart-orders, commit da953fb.
Đối chiếu Sprint 2 v0.6, P01/P05/P09/P10.

## Phạm vi

Bổ sung createCartSessionBridge giữa auth coordinator và storage/lifecycle đã có.
Chưa nối helper vào CartProvider hoặc hook logout; UI tại bước này vẫn giữ hành vi trước patch.
Không thêm endpoint, header HTTP, JWT hoặc model/migration.

- Identity lấy từ AuthSnapshot hiện tại của auth coordinator; ownerId lưu local không chứng minh đăng nhập.
- read(true) chỉ dành cho kết quả đăng nhập hoặc /me vừa được xác nhận.
  Sự kiện storage/focus với snapshot cũ chỉ được đọc bằng read(false), không tự chuyển chủ giỏ.
- Đăng nhập lần đầu nhận lựa chọn giỏ khách; đổi tài khoản dọn lựa chọn cũ, giữ pending/result theo owner.
- Snapshot auth thay đổi khi chờ khóa phải bị phát hiện ngay trong callback lưu.
  Cùng owner nhưng snapshot xác thực mới cũng làm thao tác đã xếp hàng cần thử lại.
- prepareLogout() lấy checkpoint owner/revision trước HTTP, nhả khóa sau đọc và tạm chặn sửa giỏ qua bridge.
- Chỉ gọi complete(scope) sau khi BFF xác nhận 204 và scope session/local hợp lệ.
  Lỗi HTTP hoặc hủy trước khi xác nhận phải gọi cancel(); không dọn giỏ.
- complete() dùng CAS của lifecycle: phản hồi muộn không xóa giỏ đã sửa hoặc giỏ tài khoản khác.
  Giữ pending/result; không giữ Web Lock trong thời gian chờ HTTP.
- Lỗi lưu cục bộ không được coi là đã dọn giỏ thành công. Adapter UI ở bước sau phải phân biệt
  server logout đã xác nhận với dọn giỏ cục bộ thất bại, thay vì đổi thành logout server thất bại.
- getSnapshot() phải trả đúng object snapshot hiện hành, bất biến, do auth coordinator quản lý.

## Kiểm tra

Bổ sung 18 unit test dùng storage/lock giả lập: identity, nhận giỏ khách,
đổi tài khoản, queued write, checkpoint logout, stale response, scope và quota.
Không dùng kết quả unit để xác nhận các AC trình duyệt hoặc luồng auth/orders thật.

Lệnh tại root:

    node --test frontend/src/features/cart/cart-session-bridge.test.mjs
    npm test --workspace frontend
    npm run typecheck --workspace frontend
    npm run lint --workspace frontend

## Bước tích hợp tiếp

CartProvider cần nhận snapshot hiện hành và đăng ký bước chuẩn bị logout trước HTTP với auth coordinator.
Giữ API onSignedOut hiện có cho thành phần đang dùng; thay đổi interface chung phải ghi trong PR.
Chưa nối POST /api/orders. Việc ràng buộc owner của pending với cookie thực tế khi tab khác
đổi tài khoản trong lúc gửi đơn vẫn là điểm cần chốt contract và kiểm thử trước khi bật luồng đặt đơn.
