# Sprint 2 phần A bước 4 Chủ giỏ và chuẩn bị lần đặt

Nền đối chiếu: PR #13, commit `067c37155306c76afae0c3b2da5d82adea78d392`
trên nhánh `feature/sprint2-cart`. Theo đặc tả Sprint 2 v0.6,
S2-R03–08 và P01/P05/P06/P09/P10.

Gói này bổ sung helper thuần và thao tác storage để A nối auth/orders sau.
Chưa nối vào CartProvider hoặc UI; giao diện hiện tại vẫn là giỏ khách.
Chưa triển khai auth, gửi HTTP tạo đơn, xử lý thành công/PRICE_CHANGED
hoặc kết thúc pending khi có từ chối nghiệp vụ xác định.

## Tệp và ranh giới

- `cart-lifecycle.ts`: command có kiểu, chuyển trạng thái thuần, checkpoint
  owner/revision và snapshot gửi đơn. Không có HTTP, cookie hoặc React.
- `cart-storage.ts`: thêm `applyLifecycle(command)`, dùng lại Web Lock và
  một lần setItem cho cả envelope. Tách hàm ghi dùng chung với mutateCart.
- `cart-envelope.ts`: bổ sung mã lỗi local; giữ schemaVersion=1 và các trường cũ.
- `cart-lifecycle.test.mjs`: 22 ca mới cho nghiệp vụ, lỗi ghi và hàng đợi khóa.

Không sửa backend, migration, Product API, BFF auth, cookie/CSRF, UI của B,
dependency, tsconfig hoặc .env. Chỉ sửa module TypeScript thuần; chưa thêm
API Next.js. Provider của A3 tiếp tục dùng giao diện storage cũ bình thường.

## Giao diện helper để tích hợp

Caller sử dụng `createCartStorage().applyLifecycle(command)` và await kết quả.
Mỗi command được chụp trước khi chờ khóa. Bên trong khóa: đọc/validate bản
lưu mới nhất, áp dụng chuyển trạng thái, validate và ghi nếu có thay đổi.
Promise chỉ trả về sau khi ghi thành công và khóa đã nhả. Không gọi HTTP
hoặc chờ thao tác khách trong callback khóa.

Kết quả gồm `envelope` và `request`. Chỉ BEGIN_ORDER/RETRY_ORDER trả request
khác null; request là bản sao độc lập của dữ liệu đã lưu. Caller không được
sửa payload/key hoặc lấy payload từ cart hiện tại khi thử lại. Các command
khác không tạo chỉ dẫn gửi đơn. Không dùng hàm thuần applyCartLifecycle
để gửi HTTP trước khi qua lớp storage.

| Command | Điều kiện và hành vi |
|---|---|
| ADOPT_OWNER | Nhận user.id từ backend đã xác thực và expectedCart. Giỏ khách giữ món/qty/giá; giỏ cùng owner giữ nguyên; chuyển owner khác xóa món cũ. Giữ mọi pending/result, không gửi lại đơn |
| LOGOUT_CONFIRMED | Chỉ gọi sau BFF 204 với scope session/local hợp lệ. Đối chiếu expectedCart, xóa cart về guest rỗng; giữ pending/result. Không suy ra scope local đã thu hồi phiên server |
| BEGIN_ORDER | Cần owner hiện tại trùng user.id đã xác thực, checkpoint khớp, cart có món và chưa có pending của owner. Lưu UUID v4, thời điểm local, payload và snapshot với phase SUBMITTING trước khi trả request |
| RETRY_ORDER | Cần backend xác thực đúng owner hiện tại, checkpoint và key khớp pending. Giữ nguyên key/payload/snapshot/createdAt; chỉ chuyển phase SUBMITTING. Không phụ thuộc cart hiện tại có món |
| MARK_ORDER_UNKNOWN | Dùng owner/key đã chụp của lần gửi. Chỉ cập nhật pending khớp sang UNKNOWN; không đổi cart. Nếu bản ghi đã mất hoặc key khác thì không ghi, không chạm lần đặt mới |

`expectedCart` chỉ chứa ownerId và revision lấy từ bản giỏ đã quan sát.
Nó là điều kiện chống ghi đè local, không phải bằng chứng đăng nhập.
Helper không xác thực user.id hoặc scope HTTP; caller phải lấy chúng từ
auth/BFF thật và xử lý phản hồi cũ theo vòng đời phiên do C cung cấp.
Không lấy owner từ localStorage làm auth state.

Lựa chọn triển khai frontend: nhận/chuyển owner hoặc xóa cart khi logout
làm revision tăng một, không reset về 0. Cùng owner không đổi, logout guest
đã rỗng và callback UNKNOWN không còn key khớp là no-op. Điều này bảo vệ
checkpoint cũ; không thay DTO/backend hoặc ghi nhận là nhóm đã xác nhận
riêng tên command. Quy tắc khóa/key/envelope vẫn theo v0.6.

## Bắt đầu và thử lại

Ở lần xác nhận mới, caller sinh `crypto.randomUUID()` một lần và thời điểm
`new Date().toISOString()`; đây không phải thời gian quyết định hiệu lực phiên.
BEGIN_ORDER chụp payload từ bản storage mới nhất dưới khóa sau khi checkpoint
khớp, chỉ gồm productId/size/toppingIds/qty/expectedUnitPrice. Validator kiểm
UUID v4, các giới hạn và body tối đa 32 KiB UTF-8 trước khi ghi.

Hai tab cùng bắt đầu: tab đầu lưu pending; tab sau nhận PENDING_REQUEST,
không thay pending bằng key mới. Caller đọc lại và hiển thị cách thử lại
chính lần đặt đang có; không tự gửi ngay hoặc đổi key để vượt lỗi.

RETRY_ORDER trả lại snapshot đã lưu kể cả sau logout/đổi tài khoản rồi chủ
cũ trở lại với cart rỗng. Nếu chủ đó đã nhận một giỏ khách mới, retry vẫn
dùng snapshot cũ và không sửa giỏ mới. Pending tiếp tục chặn mutateCart
của owner cho tới bước xử lý kết quả; không xóa pending để mở khóa giỏ.

Kết quả HTTP chưa rõ theo bảng P01 sẽ gọi MARK_ORDER_UNKNOWN với owner/key
của request, kể cả khi người dùng đã đổi tài khoản. Reload vẫn phục hồi
SUBMITTING thành UNKNOWN trong bộ nhớ như A2, không tự POST hoặc sinh key.
Gói này chưa phân loại phản hồi HTTP hoặc triển khai timer 15/10 giây.

## Lỗi và nối phiên

- CART_CHANGED: revision khác; đọc lại và cho khách xem lại. Không tự tạo
  đơn từ bản giỏ mới thay cho nội dung khách vừa xác nhận.
- OWNER_MISMATCH: owner đã khác; kiểm tra lại auth state và bản giỏ mới.
  Không tự chuyển owner chỉ để làm command cũ chạy được.
- PENDING_REQUEST: có lần đặt cũ; giữ nguyên và dùng luồng retry chủ động.
- PENDING_NOT_FOUND: key retry đã mất/đổi; đọc lại, không tạo key thay thế.
- REQUEST_KEY_REUSED: chặn dùng lại key của kết quả gần nhất cùng owner
  cho một lần đặt mới. Đây chỉ là kiểm tra local bổ sung, không thay sổ
  OrderRequest hoặc việc caller luôn sinh UUID mới cho lần xác nhận mới.
- EMPTY_CART: chặn đặt mới; pending có snapshot vẫn có thể retry đúng owner.
- Lỗi đọc/ghi, khóa, dữ liệu hỏng hoặc tràn revision: giữ bản lưu, không
  trả thành công hoặc cho phép gửi khi pending chưa được lưu bền.

Hết hạn phiên và lỗi mạng/DB của auth không gọi LOGOUT_CONFIRMED. Giữ owner
và cart trong storage; UI sẽ ẩn/khóa theo auth state trong bước tích hợp.
Xác nhận logout có món thuộc UI của B. Khi nhận 204, caller còn phải kiểm
tra phản hồi thuộc vòng đời phiên hiện tại trước khi dọn local. Nếu helper
báo checkpoint cũ sau khi server đã xác nhận logout, cần đối chiếu lại trạng
thái để dọn đúng cart; không diễn đạt thành server chắc chắn chưa logout
hoặc gửi lại một command cũ để xóa giỏ mới.

Việc hiển thị envelope vẫn phải lọc pending/result theo owner đã xác thực;
không đưa toàn bộ pendingRequests vào Context hiển thị.

## Kiểm tra đã chạy và điểm dừng

Ngày 30/10/2026, Node.js v24.22.1 trên môi trường thực thi hỗ trợ:
68/68 unit test đạt, gồm 46 ca cũ và 22 ca lifecycle mới; không fail hoặc skip.
Các ca mới dùng port storage/khóa giả lập, không phải auth/backend, browser
hoặc PostgreSQL thật. Không quy đổi số unit test thành 36 AC/37 test kế hoạch.

Chạy từ repository gốc trên máy A sau khi áp dụng:

```powershell
node --test frontend/src/features/cart/cart-reducer.test.mjs frontend/src/features/cart/cart-storage.test.mjs frontend/src/features/cart/cart-view.test.mjs frontend/src/features/cart/cart-lifecycle.test.mjs
npm run typecheck --workspace frontend
npm run lint --workspace frontend
git diff --check
```

Chưa có kết quả typecheck/lint trên máy A cho A4. Không ghi đạt trước khi
có đầu ra thực tế. Chưa cần build toàn bộ, chạy migration hoặc kiểm tra UI
đăng nhập/đặt đơn vì các luồng đó chưa được nối trong gói này.

Bước sau: hoàn tất storage khi nhận xác nhận tạo đơn hoặc từ chối nghiệp vụ
theo P01/P02; rồi nối auth state C, UI B và Route Handler /api/orders A dùng
helper cookie/CSRF C, contract orders D. D/E giữ phần giá chính thức,
OrderRequest và transaction DB. Không thêm payment/lịch sử đơn Sprint 3.
