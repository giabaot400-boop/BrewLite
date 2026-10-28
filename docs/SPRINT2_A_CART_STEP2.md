# Sprint 2 phần A bước 2 Lưu và khôi phục giỏ

Bổ sung nền lưu giỏ theo P01/P06/P09 của đặc tả Sprint 2 v0.6, tiếp sau
checkpoint A1 `04c43eb` trên nhánh feature/sprint2-cart. Đây là triển khai
phía frontend; chưa nối giao diện, xác thực hoặc tạo đơn.

## Tệp và cấu hình

- cart-envelope.ts: schema nội bộ, kiểm tra và encode/decode envelope.
- cart-storage.ts: đọc và mutation giỏ dưới Web Lock.
- cart-storage.test.mjs: kiểm thử validator, storage và khóa qua các port giả lập.
- frontend/tsconfig.json: thêm allowImportingTsExtensions=true để import
  runtime rõ đuôi .ts khi chạy test bằng Node.js. noEmit=true đã có sẵn.
  Không thay dependency hoặc package-lock.

## Envelope dùng chung

localStorage key: `brewlite.cart.v1`.
Web Lock name: `brewlite:cart-envelope:v1`.
Mọi module ghi envelope sau này phải dùng cùng key và cùng khóa này.

Envelope schemaVersion=1 có đúng bốn trường:

| Trường | Nội dung |
|---|---|
| schemaVersion | Số 1 |
| cart | ownerId, revision, items theo kiểu A1 |
| pendingRequests | Bản đồ ownerId -> PendingCartRequest |
| lastOrderResult | Kết quả tạo đơn đã xác nhận gần nhất hoặc null |

PendingCartRequest gồm ownerId, requestKey UUID v4, payload bất biến,
cartRevision, cartSnapshot, createdAt ISO UTC và phase SUBMITTING/UNKNOWN.
cartSnapshot dùng kiểu Cart của A1; owner và revision phải khớp bản ghi.
Payload dùng đúng năm trường từng món của contract; qty/giá/cấu hình phải
khớp snapshot. Validator không đổi thứ tự dòng/topping trong payload và
kiểm tra giới hạn body 32 KiB UTF-8.

lastOrderResult gồm ownerId, requestKey, order `{ id, status: "PENDING",
total }` và confirmedAt ISO UTC. Đây là kết quả tạo đơn đã nhận, không
phải lịch sử đơn hoặc nguồn cập nhật trạng thái thanh toán.

Các tên trường trong envelope là lựa chọn triển khai frontend của bước này,
không đổi API NestJS/BFF và không ghi là nhóm đã xác nhận riêng từng chi tiết.
Không lưu JWT, mật khẩu hoặc dữ liệu phiên trong envelope. Trường dư hoặc
schema không hỗ trợ bị từ chối; không âm thầm loại bỏ rồi ghi đè bản gốc.

## Đọc và mutation

Đọc khi key chưa tồn tại chỉ trả giỏ rỗng trong bộ nhớ, không setItem.
Đọc bản ghi SUBMITTING trả phase UNKNOWN trong bản khôi phục; không đổi
owner/key/payload hoặc tự ghi lại storage. Không gửi HTTP khi đọc.

Mỗi read/mutation lấy cùng Web Lock exclusive; đợi tối đa 2000 ms bằng
AbortController. Khi lấy được khóa, dọn timer ngay, đọc dữ liệu mới nhất,
kiểm tra rồi thực hiện đồng bộ trong callback. Promise hoàn tất sau khi
khóa được nhả. Không dùng ifAvailable, steal hoặc fallback ghi không khóa.

mutateCart nhận action và expectedOwnerId từ trạng thái phiên của ứng dụng.
Action được chụp trước khi chờ khóa để tránh caller đổi nội dung đang chờ.
Trong khóa phải kiểm tra lại owner; nếu khác thì từ chối, chưa ghi gì.
Có pending của owner đó thì chặn sửa giỏ. Pending của chủ khác và kết quả
đơn cũ được giữ nguyên khi cập nhật giỏ hiện tại.

Mutation thành công chỉ setItem một lần cho cả envelope. Lỗi nghiệp vụ,
thao tác không đổi giỏ, dữ liệu hỏng, hết chỗ, chặn storage, thiếu Web Locks
hoặc timeout không được báo là đã lưu và không tự xóa dữ liệu. Revision
không được vượt Number.MAX_SAFE_INTEGER.

pendingForOwner/resultForOwner chỉ lọc cho owner được truyền vào; caller
phải lấy owner từ backend đã xác thực. Dữ liệu local không chứng minh danh
tính. Provider/UI sau này không được hiển thị toàn bộ pendingRequests hoặc
kết quả của chủ khác. Backend vẫn xác thực lại mọi lần thử tạo đơn.

## Kiểm tra đã chạy

Ngày 28/10/2026 trên môi trường thực thi hỗ trợ, Node.js v24.22.1:
16 bài reducer A1 và 20 bài envelope/storage mới đạt, tổng 36 unit test.
Đây là số bài unit test, không phải 36 AC hoặc 37 ca nghiệm thu Sprint 2.

Ca mới kiểm tra dữ liệu hỏng/phiên bản, giới hạn giá/qty/body UTF-8, snapshot
pending, giữ key/payload, lọc owner, lỗi đọc/ghi, thiếu khóa, timeout 2 giây,
hai client giả lập cùng sửa không mất cập nhật và đổi owner trong lúc chờ.
QueuedLocks và bộ nhớ trong test là port giả lập; chưa là kiểm thử nhiều
tab với localStorage/Web Locks thật trên trình duyệt.

Chạy từ thư mục gốc repository:

```powershell
node --test frontend/src/features/cart/cart-reducer.test.mjs frontend/src/features/cart/cart-storage.test.mjs
npm run typecheck --workspace frontend
npm run lint --workspace frontend
git diff --check
```

Chưa chạy typecheck/lint bằng dependency repository cho bước A2 trên môi
trường thực thi hỗ trợ. Cần đối chiếu kết quả trên máy A sau khi áp dụng.
Không cần build toàn bộ backend hoặc chạy lại migration cho gói này.

## Chặng tiếp theo

A3 nối CartProvider dạng Client Component, hydration, phản hồi lỗi lưu,
storage event và UI thêm món/trang giỏ/badge. Context dùng useReducer theo
P09; không được dispatch giỏ rỗng ban đầu ra storage hoặc ghi lại từ state
cũ của tab. Tab nhận storage event sẽ đọc lại bản mới nhất qua cùng lớp lưu.

Chưa có thao tác bắt đầu đơn, retry HTTP, đổi owner/logout hoặc dọn giỏ sau
kết quả đơn trong A2. Các thao tác đó cần mở rộng cùng transaction envelope
theo P01 khi tích hợp với auth C và orders D; không thực hiện bằng cách ghi
cart/pending ở các key riêng. Chưa đánh dấu các ca kiểm thử kế hoạch là Đạt.

## Nguồn kỹ thuật

- Đặc tả BrewLite Sprint 2 v0.6: P01/P06/P09 và phân công P10.
- https://www.w3.org/TR/web-locks/ mục request(): AbortSignal chỉ hủy yêu
  cầu chưa được cấp khóa; request promise hoàn tất sau khi nhả khóa.
- https://www.typescriptlang.org/tsconfig/allowImportingTsExtensions.html:
  option dùng với noEmit/emitDeclarationOnly và runtime/bundler phù hợp.
