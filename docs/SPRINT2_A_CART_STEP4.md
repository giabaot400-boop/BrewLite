# Sprint 2 phần A bước 4–5 Chủ giỏ và vòng đời lần đặt

Nền đối chiếu: PR #13, commit `067c37155306c76afae0c3b2da5d82adea78d392`
trên nhánh `feature/sprint2-cart`. Theo đặc tả Sprint 2 v0.6,
S2-R03–08 và P01/P05/P06/P09/P10.

Bước 4 bổ sung helper thuần và thao tác storage để A nối auth/orders sau.
Chưa nối vào CartProvider hoặc UI; giao diện hiện tại vẫn là giỏ khách.
Bước 5 mở rộng trên commit `b89aad5a79d758688ab2444e4daa5f68f31380fa`:
kiểm tra phản hồi và xử lý storage khi đã xác nhận tạo đơn hoặc từ chối.
Chưa triển khai auth hoặc gửi HTTP tạo đơn. Hồ sơ này giữ chung hai bước
vì cùng mô tả vòng đời envelope, không thêm một file checkpoint riêng cho A5.

## Tệp và ranh giới

- `cart-lifecycle.ts`: command có kiểu, chuyển trạng thái thuần, checkpoint
  owner/revision và snapshot gửi đơn. Không có HTTP, cookie hoặc React.
- `cart-storage.ts`: thêm `applyLifecycle(command)`, dùng lại Web Lock và
  một lần setItem cho cả envelope. Tách hàm ghi dùng chung với mutateCart.
- `cart-envelope.ts`: bổ sung mã lỗi local; giữ schemaVersion=1 và các trường cũ.
- `cart-lifecycle.test.mjs`: 22 ca mới cho nghiệp vụ, lỗi ghi và hàng đợi khóa.
- A5 thêm `cart-order-response.ts`, `cart-order-settlement.ts` và
  `cart-order-settlement.test.mjs`; storage có thêm `settleOrder(command)`.

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
A4 chưa phân loại phản hồi HTTP; phần phân loại của A5 ở dưới. Cả hai bước
chưa triển khai timer HTTP 15/10 giây vì chưa có lớp gửi request.

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

A đã cung cấp đầu ra typecheck/lint và git diff --check trên Windows cho A4:
không báo lỗi hoặc warning. A4 đã commit/push tại `b89aad5`. Đầu ra unit test
A gửi có các ca đánh dấu đạt và cảnh báo MODULE_TYPELESS_PACKAGE_JSON;
tổng kết 68/68 ở trên là kết quả trên môi trường thực thi hỗ trợ.

## A5 Kiểm tra và lưu kết quả lần đặt

Caller dùng `storage.settleOrder({ ownerId, requestKey, status, body, receivedAt })`.
ownerId/key phải được chụp từ request đã gửi, không lấy tài khoản đang hoạt
động khi response đến. body là JSON đã đọc ngoài khóa; không đọc response
stream hoặc gọi HTTP trong storage. Mất kết nối/body không đọc được dùng
status=null hoặc giữ status đã biết với body=null; kết quả vẫn UNKNOWN.
receivedAt là ISO UTC local cho bản kết quả đã xác nhận, không quyết định phiên.

Helper chụp command trước lúc xếp hàng, lấy cùng khóa, đọc lại envelope và
đối chiếu pending đúng owner/key. Bản ghi mất hoặc key đã khác trả IGNORED
và không ghi. Kết quả gồm envelope, outcome và cartEffect; không trả request
để tự gửi tiếp. Chỉ công bố kết quả lưu sau khi setItem thành công và nhả khóa.

| Phản hồi | Outcome và cập nhật storage |
|---|---|
| 200/201 đúng body | CONFIRMED: ghi kết quả PENDING, xóa pending và xóa cart khớp owner/revision trong một lần ghi. Giữ cart mới hoặc owner khác |
| 400 VALIDATION_ERROR đúng schema | REJECTED: kết thúc pending, giữ cart gốc để sửa; có thể phục hồi snapshot vào cart rỗng cùng owner |
| 409 PRICE_CHANGED đủ details hợp lệ | PRICE_CHANGED: kết thúc pending, cập nhật giá hoặc phục hồi snapshot rồi cập nhật giá; giữ cấu hình/qty và chờ xác nhận mới |
| 401/403/413, conflict/in-progress, 5xx, mạng, body sai hoặc lỗi chưa nhận diện | UNKNOWN: giữ owner/key/payload/snapshot, không xóa cart và không tự đổi key |
| Callback không còn pending khớp | IGNORED: không ghi đè kết quả hoặc pending mới |

Kiểm tra nhất quán frontend theo contract v0.6: body thành công có đúng
id/status/total; id không rỗng, status=PENDING, total là Int không âm và
khớp tổng payload đã xác nhận. Giá chính thức vẫn do NestJS tính. Body thêm
trường hoặc tổng khác được giữ UNKNOWN để đối chiếu, không tự sửa hợp đồng D.

PRICE_CHANGED kiểm tra đủ mọi cấu hình đúng một lần bằng tuple JSON của
productId/size/tập topping; không ghép theo index hoặc dấu phân cách. qty
và expectedUnitPrice khớp request cũ. currentUnitPrice/currentLineTotal/
currentTotal phải đúng kiểu, trong giới hạn Int và tính toán khớp; ít nhất
một giá đổi. Sai hoặc thiếu bất kỳ dòng nào thì không cập nhật một phần.
Chỉ đổi previewUnitPrice, không suy ngược phụ thu size/topping từ giá mới.

fieldErrors của VALIDATION_ERROR giữ nguyên đường dẫn/index request gốc,
không sắp lại theo details giá. Mỗi giá trị là mảng thông báo; index dòng
phải nằm trong payload gốc. Trường global chưa có ô tương ứng cần hiển thị
ở thông báo chung khi nối UI. Body lỗi không nhận diện chắc chắn giữ UNKNOWN.

cartEffect phân biệt CLEARED/REPRICED/RESTORED/UNCHANGED/UNRELATED để caller
không gắn lỗi hoặc giá của snapshot cũ lên giỏ mới. Khi từ chối nghiệp vụ,
chỉ phục hồi nếu cart hiện tại rỗng và cùng owner; dùng revision mới, không
reset revision theo snapshot. Không tự phục hồi cart đã logout về owner=null,
không ghi đè giỏ khác hoặc giỏ mới có món, kể cả giỏ mới cùng tài khoản.
Trong các trường hợp đó, pending đã được xác nhận từ chối vẫn kết thúc;
outcome giữ thông tin để caller hiển thị đúng lần đặt và đúng tài khoản.

Xóa pending, đổi giá/dọn cart và ghi kết quả xác nhận là một lần setItem.
Nếu ghi lỗi hoặc revision tràn: không lưu dở dang; giữ pending/key cũ để
phục hồi. Không diễn đạt lỗi local thành backend chắc chắn chưa tạo đơn.
Callback đến sau khi key đã hoàn tất không đảo kết quả về UNKNOWN.
Kết quả gần nhất chỉ là phản hồi tạo đơn đã nhận; không là trạng thái payment
hoặc lịch sử. Khi hiển thị, vẫn phải lọc owner đã xác thực và đối chiếu key.

Sau giá đổi, helper không tạo pending mới hoặc sinh key. Caller chỉ gọi
BEGIN_ORDER với UUID mới khi khách xác nhận lại. Envelope không thêm sổ
key đã từ chối; caller luôn sinh UUID mới cho lần đặt mới, còn OrderRequest
D/E bảo vệ toàn bộ quy tắc idempotency trên server.

## Kiểm tra A5 và bước tích hợp

Ngày 30/10/2026, Node.js v24.22.1 trên môi trường thực thi hỗ trợ:
91/91 unit test đạt, gồm 68 ca trước và 23 ca settlement mới; không fail
hoặc skip. Kiểm tra gồm atomic write, phản hồi hỏng, giá/index, quota,
late callback, owner/revision, snapshot khôi phục và callback đồng thời.
Các port khóa/storage là giả lập; chưa là HTTP, auth hoặc PostgreSQL thật.

Trên máy A sau khi áp dụng A5:

```powershell
node --test frontend/src/features/cart/cart-reducer.test.mjs frontend/src/features/cart/cart-storage.test.mjs frontend/src/features/cart/cart-view.test.mjs frontend/src/features/cart/cart-lifecycle.test.mjs frontend/src/features/cart/cart-order-settlement.test.mjs
npm run typecheck --workspace frontend
npm run lint --workspace frontend
git diff --check
```

Chưa có kết quả typecheck/lint trên máy A cho A5. Không cần chạy migration
hoặc kiểm tra UI đặt đơn ở bước helper này; chưa đánh dấu các AC/test kế hoạch
đã đạt từ unit test. Bước tiếp theo nối auth state C, UI B và Route Handler
/api/orders A dùng helper cookie/CSRF C, contract orders D. D/E giữ giá chính
thức, OrderRequest và transaction DB. Kiểm tra timer, fetch/body và phản hồi
thật khi có lớp HTTP; không thêm payment/lịch sử đơn Sprint 3.
