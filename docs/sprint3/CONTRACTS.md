# BrewLite Sprint 3 contract thực hiện

Cập nhật ngày 06/11/2026. Thiết kế phải hiện thực và test trên nền Sprint 2 main `a1a0e4ae92de681deac538685e24407b3190866b` đã chốt. Kế thừa các bản sửa auth/logout, bcrypt và đối chiếu Order/ledger trong PR #24/#26/#28; hồ sơ nghiệm thu tại PR #27. Các tên helper/script ở đây là giao diện mục tiêu, chưa khẳng định repo đã có. Nếu code nền thay đổi, lead ghi diff có ảnh hưởng trước khi tích hợp. File này được dẫn chiếu bởi bản phạm vi, không mở thêm tính năng.

## 1 Các miền dữ liệu

```ts
type OrderStatus = 'PENDING'|'PAYMENT_FAILED'|'PAID'|'PREPARING'|'READY'|'COMPLETED'|'CANCELLED';
type PaymentStatus = 'FAILED'|'SUCCEEDED';
type Method = 'WALLET'|'CARD';
type Size = 'S'|'M'|'L';
type CartItemInput = {productId:string;size:Size;toppingIds:string[];qty:number};
type OrderItemInput = CartItemInput & {expectedUnitPrice:number};
type OrderV1 = {items:OrderItemInput[]}; // giữ nguyên hình dạng v1
type OrderV2 = {schemaVersion:2;items:OrderItemInput[];promotionCode:string|null;expectedTotal:number};
type PaymentBody = {orderId:string;method:Method};
type CancelBody = Record<string,never>; // JSON {} chính xác
```

ID opaque không trim/coerce. Tiền integer VND 0…2147483647, tổng phải ≥1; qty 1…20 và 1…20 dòng. Không trùng topping/cấu hình dòng. Size/topping phải thuộc Product; unknown body field 400 VALIDATION_ERROR. Nội dung quá byte-limit 413 PAYLOAD_TOO_LARGE. Key là UUID v4 không rỗng, một header hợp lệ; lỗi key dùng baseline VALIDATION_ERROR. Không cho auto-coerce chuỗi số thành số. Mã trim/uppercase ASCII; rỗng=null; [A-Z0-9_-]{1,32}; v2 dùng hàm chuẩn hóa duy nhất ở backend.

V1 không có schemaVersion; chỉ items. Một field schemaVersion khác 2 không được fallback v1. Canonical v1 giữ nguyên file backend/src/orders/order-canonical.ts: topping sort UTF-16, dòng sort productId/size/JSON.stringify(sortedToppingIds), reject trùng cấu hình; thứ tự field item productId,size,toppingIds,qty,expectedUnitPrice. V2 dùng cùng sắp xếp, canonical JSON chính xác thứ tự {version:2,items,promotionCode,expectedTotal}. HTTP schemaVersion không xuất hiện trong canonical JSON, chỉ version. Cùng user/key chung namespace OrderRequest dù v1/v2; so canonicalVersion và hash trước đọc giá/mã/kho. Không sửa ledger v1 đã tồn tại.

Fixture v2 và SHA-256 UTF-8:

```json
{"version":2,"items":[{"productId":"cappuccino","size":"M","toppingIds":[],"qty":2,"expectedUnitPrice":50000}],"promotionCode":"DEMO10","expectedTotal":90000}
```

`a38540a34fa5af8427da8d7e995514f9c62ca3ed8715967800bca388b1b65c01`

Payment canonical {version:1,orderId,method}, đúng thứ tự field đó, SHA-256 UTF-8. Namespace key payment tách OrderRequest. gatewayKey='mock:'+paymentId, duy nhất, lưu cùng attempt; không tạo charge bên ngoài. Replay đọc trước điều kiện trạng thái/deadline, không chạy mock. Payment key đã lưu giữ kết quả dù config đổi, và PaymentView hiện tại có thể bổ sung metadata refund.

Luồng rút gọn: Khách xem giỏ và nhập mã → UI tính tổng dự kiến theo cấu hình DEMO10 → khách bấm Tạo và xem đơn → lưu pending v2 bền rồi POST /orders → backend tính/kiểm tra giá, mã và giữ kho Product → GET /orders/:id → hiển thị subtotal/discountTotal/total chính thức và trạng thái mã → khách chọn Ví/Thẻ, xác nhận số tiền → POST /payments. Không tự gửi payment ngay sau tạo đơn.

Giữ DTO v2, expectedTotal và canonical/hash theo contract; không đổi version của body đã có. UI chỉ tính preview từ giá giỏ và cấu hình cố định DEMO10 (10%, trần20.000, min50.000), ghi rõ là dự kiến, chưa xác nhận hiệu lực mã. Với mã khác, không tự coi là hợp lệ; preview chưa giảm và backend quyết định khi create. Backend vẫn kiểm active/window/min, giá và expectedTotal; sai trả rejection đã ledger, không tự sửa payload/key. Sau từ chối đã xác nhận, khách xem lại giá từ details hoặc catalog API hiện có rồi xác nhận request mới. Khi create thành công, UI GET Order hiển thị tổng chính thức trước nút Xác nhận thanh toán; không chỉ dựa vào preview. Không tạo API báo giá thay thế.

## 2 Response chính xác

```ts
type PaymentView = {
 id:string;version:number;orderId:string;method:Method;amount:number;status:PaymentStatus;
 failureCode:'PAYMENT_DECLINED'|null;
 createdAt:string;resolvedAt:string;refundedAmount:number;refundedAt:string|null;
 serverTime:string;
};
type OrderLine = {
 productId:string;productName:string;size:Size;basePrice:number;sizeExtraPrice:number;
 unitPrice:number;qty:number;lineTotal:number;
 toppings:{toppingId:string;name:string;price:number}[];
};
type OrderDetail = {
 id:string;version:number;status:OrderStatus;createdAt:string;items:OrderLine[];
 subtotal:number;discountTotal:number;total:number;
 promotion:{code:string;discountAmount:number}|null;
 paymentDeadline:string|null;paidAt:string|null;
 cancelReason:'CUSTOMER_REQUEST'|'PAYMENT_WINDOW_EXPIRED'|null;
 latestPayment:Omit<PaymentView,'serverTime'>|null;
 loyaltyPointsEarned:number;loyaltyPointsReversed:number;
 canPay:boolean;canCancel:boolean;serverTime:string;
};
type HistoryItem = Pick<OrderDetail,'id'|'version'|'status'|'createdAt'|'total'|'paymentDeadline'|'canPay'|'canCancel'>
 & {totalItemQuantity:number};
type HistoryView = {items:HistoryItem[];serverTime:string};
```

Đây là shape S3 mới; POST /orders vẫn trả đúng {id,status:'PENDING',total}, 201 mới/200 replay, không mở rộng response đó để tránh v1 classifier hỏng. items OrderDetail theo ID ổn định; toppings sort toppingId. latestPayment chọn createdAt DESC,id DESC, không có activePayment. serverTime UTC tại lượt đọc; OrderDetail và các child trong một RR snapshot. version Order tăng mỗi mutation nghiệp vụ, kể cả attempt FAILED và cancel/refund. Một accepted retry payment tăng Order version một lần dù logic đi qua hai cạnh; replay không tăng. Payment version=0 khi tạo, +1 khi refund, createdAt/resolvedAt gốc giữ nguyên. GET không tăng version hoặc đổi dữ liệu.

canPay=true chỉ Order policy 2, PENDING/PAYMENT_FAILED, chưa tới hạn và dữ liệu reservation hợp lệ. canCancel=true cho policy 2 ở PENDING/PAYMENT_FAILED hoặc PAID trước PREPARING, đủ dữ liệu bù trừ. Legacy thiếu dữ liệu cả hai false. Đây là gợi ý UI, POST luôn recheck. earned đọc entry.points kể cả reversed; reversed=entry.points nếu reversedAt có giá trị, nếu không 0. Lịch sử không query/pagination/filter, createdAt DESC,id DESC. Đăng ký GET /orders/me trước /:id. Dữ liệu trả về không có password/JWT/key/hash/gatewayKey hoặc owner người khác.

GET /orders/:id trả latestPayment đầy đủ id/version/orderId/method/amount/status/failureCode/createdAt/resolvedAt/refundedAmount/refundedAt hoặc null. Đây là lần gần nhất theo createdAt DESC,id DESC, không chứng minh đó là attempt của key đang phục hồi. Mất response payment phải replay POST /payments với đúng key/body đã lưu để tìm chính attempt đó, rồi GET Order hiện tại; không gán paymentId từ latestPayment khi chưa biết identity. Không gọi API đọc payment riêng. Hai attempts liên tiếp trên cùng Order phải có test chứng minh recovery key cũ không nhận nhầm kết quả mới.

## 3 Phiên lỗi và hành vi UI

Error envelope kế thừa {error:{code,message,fieldErrors?,details?}}. BFF P04 chạy trước body/upstream; cookie HttpOnly, Origin allowlist chính xác, X-BrewLite-Request:1, JSON, expected-owner header. BFF đọc token một lần → /auth/me → so owner → chuyển cùng token; không tin header làm auth. Missing/invalid/mismatch owner 403 REQUEST_FORBIDDEN, không upstream POST. /auth/me lỗi schema hoặc kết nối trả 502 UPSTREAM_UNAVAILABLE, hết deadline 504 UPSTREAM_TIMEOUT; nhận 401 đúng schema thì chuyển 401. Backend tự xác thực Bearer và owner.

| HTTP và code | Khi nào | UI |
|---|---|---|
| 400 VALIDATION_ERROR | Shape/key/field/phiên bản sai hoặc business rejection đã xác định | V1 giữ classifier nền: rejection hợp lệ kết thúc pending để khách sửa; body/schema không rõ giữ UNKNOWN. V2 chỉ kết thúc khi nhận đúng contract từ chối của yêu cầu hiện tại |
| 401 baseline auth code | Thiếu/hết hạn/thu hồi phiên | Đề nghị login; giữ recovery theo chủ; không tự gửi sau login |
| 403 REQUEST_FORBIDDEN | P04 hoặc expected owner không khớp | Dừng; đồng bộ phiên; giữ key/body, không đổi chủ recovery |
| 404 RESOURCE_NOT_FOUND | ID không tồn tại/khác chủ | Không lộ dữ liệu; giữ recovery nếu chưa rõ, không coi payment FAILED |
| 409 IDEMPOTENCY_CONFLICT | Cùng user/key khác version/hash/body | Dừng; không sinh key mới để né request cũ; kiểm tra saved request |
| 409 CHECKOUT_CHANGED | V2 giá dòng/tổng thay đổi | Từ chối đã ledger, giữ lựa chọn; khách xem lại giá/mã và xác nhận request mới mới sinh key mới |
| 409 PRICE_CHANGED | V1 expectedUnitPrice lệch | Giữ nguyên details P03, không thay bằng fieldErrors/details v2; khách xem lại rồi xác nhận key mới |
| 409 ORDER_REQUEST_IN_PROGRESS | Chưa lấy được advisory lock tạo đơn | Giữ pending/key/body; khách chủ động retry, không tự đổi key hoặc lồng retry kho |
| 409 PROMOTION_NOT_APPLICABLE | Mã không tồn tại/inactive/chưa tới hạn/hết hạn/min không đạt | Hiện lý do, không âm thầm bỏ mã |
| 409 OUT_OF_STOCK | Snapshot mới xác nhận thiếu nguồn | Giữ món, chờ khách sửa và xác nhận mới; không tự đặt lại |
| 409 ORDER_NOT_PAYABLE | Đã PAID/pha chế/kết thúc | Đọc Order hiện tại, không tạo attempt |
| 409 PAYMENT_WINDOW_EXPIRED | Đơn chưa trả đã tới hạn | Đọc trạng thái, chờ cancel/expiry, không tự release local |
| 409 ORDER_NOT_CANCELLABLE | PREPARING/READY/COMPLETED | Hiện trạng thái mới, giữ kết quả trước |
| 409 LEGACY_ORDER_REQUIRES_REVIEW | Policy 1 hoặc thiếu policy S3 | Chỉ xem; không dựng kho/payment giả hoặc đặt thay tự động |
| 413 PAYLOAD_TOO_LARGE | Body vượt limit | Báo lỗi, không POST tiếp tự động |
| 503 TRANSACTION_RETRY_EXHAUSTED | Hết ba lượt hoặc deadline retry | Giữ key/body, cho kiểm tra/thử lại chính yêu cầu đó |
| 5xx/502/504/mất mạng/body sai | Chưa có kết quả đáng tin | UNKNOWN client; giữ key/body, không báo FAILED cuối |

Lỗi DTO/auth/quyền/key trước transaction không ledger; business rejection tạo đơn (món không tồn tại/topping không cho phép/giá/mã/thiếu kho) giữ chính sách baseline OrderRequest REJECTED, orderId=null, snapshot response gốc, replay cùng HTTP status. Rejection payment/cancel không tạo PaymentAttempt giả; payment FAILED là HTTP 200 kết quả nghiệp vụ chứ không lỗi transport.

details V2 tối thiểu có {reason:string}; CHECKOUT_CHANGED thêm {currentSubtotal,currentDiscountTotal,currentTotal,items:[{productId,size,toppingIds,currentUnitPrice}]} toàn bộ từ server, không tự áp vào pending cũ. OUT_OF_STOCK có {resources:[{kind:'PRODUCT',id,requested,available}]} với số thực đã xác nhận; không gửi SQL/constraint nội bộ. PROMOTION_NOT_APPLICABLE reason thuộc NOT_FOUND|INACTIVE|NOT_STARTED|EXPIRED|MINIMUM_NOT_MET. Không đưa một reason lạ thành lỗi đã xác nhận trong classifier. Response lỗi sai schema vẫn UNKNOWN khi đã gửi mutation.

Điểm tích hợp chưa chốt: danh sách giá trị `reason` của CHECKOUT_CHANGED và OUT_OF_STOCK chưa được liệt kê ở baseline này. C/D cần xác định và ghi danh sách tại đây để A đối chiếu trước khi bật luồng v2 trên UI. Helper frontend mặc định giữ UNKNOWN cho hai lỗi này; chỉ kết thúc pending khi cấu trúc/số liệu khớp yêu cầu đã gửi và reason thuộc danh sách cố định đã thống nhất. Không lấy chính reason trong response để tự bổ sung vào danh sách; tên reason trong fixture unit test không phải hợp đồng backend đã được nhóm chốt.

V1 PRICE_CHANGED giữ đúng details {items,currentTotal}; mỗi item có productId,size,toppingIds,qty,expectedUnitPrice,currentUnitPrice,currentLineTotal. Không thêm field phá exact-key classifier nền hoặc đổi giá snapshot của pending. FieldErrors của validation vẫn theo index request gốc; replay lỗi đảo dòng phải remap như S2.

Auth kế thừa bản sửa A9: login/me trả X-BrewLite-Session-Binding; logout dùng X-BrewLite-Expected-Session và cùng token đã capture. Binding giữ trong bộ nhớ auth, không lưu vào cart/pending/recovery và không thay quyền NestJS. Logout/me không Set-Cookie xóa cookie cố định. Sau 204, kiểm tra /me trong phần còn lại của 15 giây: còn phiên sống (kể cả cùng owner khác binding) hoặc chưa xác minh được thì giữ dữ liệu, không cleanup theo logout cũ. S3 giữ AuthSnapshot.binding/getSessionVersion và cơ chế bỏ phản hồi cũ; expected-owner của payment/cancel không thay expected-session của logout.

## 4 Các transaction do D điều phối

Giữ RepeatableRead, maxWait=1000/timeout=2000 ms. Vòng ngoài tối đa 3 lượt tổng cộng, dùng snapshot mới. Không có helper riêng retry ba lượt nữa. Nếu toàn operation đã quá 8 giây thì không bắt đầu lượt mới; BFF vẫn có thể timeout trước response và UI phải recovery an toàn. Đây là giới hạn cố gắng, không SLA hard 8 giây cho request đang chạy. Đo latency thực và tối ưu truy vấn/lock; không tăng timeout để che deadlock.

Global lock order: advisory purpose/user/key → existing Order row FOR UPDATE → Products sorted ID → User points row. Order creation chưa có Order thì bỏ bước lock Order. Product vẫn update bằng CAS stockVersion, không dùng row lock làm lý do bỏ optimistic locking. Mọi helper dùng cùng tx. Lock namespace Order giữ nguyên SHA-256 JSON ['brewlite:order-request:v1',userId,key] readBigInt64BE(0); payment dùng 'brewlite:payment-request:v1'. Với create v1/v2, pg_try_advisory_xact_lock=false kết thúc lượt và trả 409 ORDER_REQUEST_IN_PROGRESS như nền S2, không retry nội bộ chỉ vì khóa bận. CAS/serialization/deadlock/unique đúng constraint mới dùng vòng retry hữu hạn. Payment dùng namespace riêng; khi chưa lấy được khóa cũng không giả đã FAILED hoặc tạo attempt.

### 4.1 Tạo đơn

1. Xác thực/DTO/canonical trước tx; lấy advisory và đọc ledger trước danh mục. Có ledger thì replay hoặc conflict, không kiểm tra giá/mã/kho lại.
2. Đọc món/topping, giá/khuyến mãi và tính tiền; sai nghiệp vụ ghi REJECTED trước bất kỳ stock write. Snapshot promotion/policy tại đây. V1 không mã.
3. Gộp nhu cầu Product, đọc tất cả stock/reserved/version. Nguồn thiếu: ghi REJECTED OUT_OF_STOCK, COMMIT, chưa Order/reservation/stock write. Snapshot có thể cũ sau đó nhưng đó là từ chối đúng ở lượt đánh giá; không giữ hàng âm.
4. Đủ nguồn: CAS lần lượt Product, tăng reservedStock và stockVersion. CAS count≠1 throw StockConflict: rollback toàn tx, retry từ bước 1. Không lưu REJECTED trong transaction đã abort, không savepoint cần thiết.
5. Tạo Order policy 2 PENDING, version 0, deadlines, items/topping snapshot, ACTIVE reservations và OrderRequest SUCCEEDED cùng tx. Giữ assertSucceededRequest của PR #28: đọc lại dữ liệu đã lưu, đối chiếu owner/key/hash/orderId giữa Order và ledger trước commit; sai thì throw để rollback cả Order/snapshot/ledger/kho. COMMIT rồi response. Unique idempotency conflict rollback rồi fresh lookup. Không gửi HTTP khi chưa commit.

### 4.2 Thanh toán

1. Advisory payment key → tìm attempt theo user/key trước điều kiện nhận mới. Cùng hash trả PaymentView hiện tại (refund metadata nếu có), khác hash conflict. Key mới thì lock Order và kiểm tra owner/policy/state. Không leak Order khác chủ.
2. clock_timestamp sau lock, so deadline; verify ACTIVE reservations bằng đủ nhu cầu snapshot. State PAYMENT_FAILED thử mới phải đi qua PENDING logic, không commit riêng. Đọc backend outcome một lần cho operation để retry DB không làm thay đổi cấu hình giữa các lượt.
3. Tạo final attempt với amount=Order.total, server method, gatewayKey. FAILED: đổi Order PAYMENT_FAILED/version+1, không stock/điểm; SUCCEEDED: consume reservation, stock/reserved trừ, CAS stockVersion; insert unique LoyaltyEntry và update User balance; Order PAID/paidAt/version+1. Một tx chứa tất cả.
4. Bất kỳ lỗi ghi rollback toàn bộ, retry đúng loại; hết lượt 503 giữ key. Partial unique success/order là hàng rào bổ sung; nếu race khác key thắng thì retry fresh Order trả ORDER_NOT_PAYABLE. Không chạy mock ngoài DB hay xử lý tiền thật.

### 4.3 Hủy và expiry

Cancel body {}. Lock Order, check owner/policy; CANCELLED trả hiện tại không ghi lại reason/version. Trước PAID release ACTIVE, reserved−qty, stock giữ nguyên; lý do now≥deadline PAYMENT_WINDOW_EXPIRED, còn lại CUSTOMER_REQUEST. PAID chỉ trước PREPARING: verify SUCCEEDED, CONSUMED và entry chưa reverse; hoàn amount toàn phần, mark refundedAt, tăng payment version; return stock/CAS, entry.reversedAt, User−entry.points; Order CANCELLED/version+1. Missing/inconsistent data lỗi hệ thống rollback, không tự điền số liệu để hủy.

Expiry tìm policy 2 status PENDING/PAYMENT_FAILED và deadline≤DB now; lấy tối đa 50 IDs theo deadline/id. Mỗi ID dùng tx lock/recheck/release giống cancel; một lỗi không dừng toàn batch, lần sau còn được chọn. Startup catch-up và interval 60s; guard một loop đang chạy mỗi process; nhiều instance vẫn an toàn nhờ lock/CAS. Không dùng queue/container thứ tư; clear interval khi shutdown. PREPARING CLI không áp cho legacy và chỉ cho cạnh PAID→PREPARING→READY→COMPLETED, cũng lock và assertTransition. Cờ DEMO_WORKFLOW_ENABLED=false mặc định, không có endpoint public hoặc role admin mới.

## 5 Interface bàn giao nội bộ

Đây là API TypeScript mục tiêu để C/D/E bắt đầu song song, path có thể sắp theo module hiện có nhưng signature/ý nghĩa giữ. Prisma.TransactionClient là type từ generated client hiện có. Tx được inject bởi D; helper throw typed business error trước write hoặc retryable StockConflict cho rollback. Không helper nào commit/HTTP hoặc tự retry.

```ts
type Need={kind:'PRODUCT';id:string;qty:number};
type PriceResult={items:OrderLine[];subtotal:number;discountTotal:number;total:number;
 promotionId:string|null;promotionSnapshot:object|null;promotionEvaluatedAt:Date|null;
 loyaltyPolicySnapshot:{version:1;divisor:10000};loyaltyPointsExpected:number};
// C owns catalog/promotion arithmetic; D decides ledger/error mapping.
priceOrder(tx:Prisma.TransactionClient,input:OrderV1|OrderV2,at:Date):Promise<PriceResult>;
// E owns resource aggregation/CAS; precheck reads every resource before any write.
aggregateNeeds(items:OrderLine[]):Need[];
precheckStock(tx:Prisma.TransactionClient,needs:Need[]):Promise<StockPlan>;
reserveStock(tx:Prisma.TransactionClient,orderId:string,plan:StockPlan,at:Date):Promise<void>;
consumeStock(tx:Prisma.TransactionClient,orderId:string,at:Date):Promise<void>;
releaseStock(tx:Prisma.TransactionClient,orderId:string,at:Date):Promise<void>;
returnStock(tx:Prisma.TransactionClient,orderId:string,at:Date):Promise<void>;
// C owns points; D has already locked Order. Helpers lock User after stock.
awardPoints(tx:Prisma.TransactionClient,orderId:string,userId:string,points:number,at:Date):Promise<void>;
reversePoints(tx:Prisma.TransactionClient,orderId:string,userId:string,at:Date):Promise<void>;
// D owns workflow; mock is a pure internal adapter, not another server.
evaluateMock(method:Method,outcome:PaymentStatus):PaymentStatus;
assertTransition(from:OrderStatus,to:OrderStatus):void;
expireOrder(orderId:string):Promise<void>;
advanceDemoOrder(orderId:string,target:'PREPARING'|'READY'|'COMPLETED'):Promise<void>;
```

StockPlan là needs sắp theo productId tăng dần, mỗi dòng thêm {stock,reservedStock,stockVersion}; thiếu nguồn throw OutOfStock(resources). reserveStock nhận orderId sau khi Order insert trong cùng tx; nếu CAS lỗi Order insert cũng rollback. Tạo Order trước hoặc sau CAS đều không commit sớm; D/E thống nhất thứ tự thực tế theo FK, giữ boundary trên. consume/release/return đọc reservations, verify full set/qty theo snapshot, chỉ mutate từ ACTIVE/CONSUMED phù hợp. Không tự silently skip một resource thiếu. award/reverse kiểm tra đúng chủ, entry original, balance và Int bound; trùng entry trên replay không được che dữ liệu khác.

## 6 Schema delta vật lý mục tiêu

Tên Prisma giữ PascalCase; tên bảng kế thừa từ @map/@@map trong nền. Cột mới dùng snake_case @map; foreign keys Restrict, không Cascade xóa lịch sử. Time mới dùng DateTime @db.Timestamptz(3), API UTC; không tự đổi type cột thời gian cũ chưa kiểm kê. IDs mới String uuid theo convention nền (không tự đổi type các FK sang UUID SQL nếu cột nền là text). Int có CHECK bounds; JSON snapshot validate shape/version trong app và không chứa secret.

| Model | Field thêm hoặc mới và ràng buộc |
|---|---|
| User | loyaltyPoints Int default 0, @map loyalty_points, CHECK 0…2147483647 |
| Product | stock/reservedStock/stockVersion Int default 0; @map stock/reserved_stock/stock_version; CHECK 0≤reserved≤stock≤MAX và stockVersion≥0 |
| Order | version Int default 0; subtotal Int; discountTotal Int default 0; checkoutPolicyVersion Int default 1; paymentDeadline DateTime?; paidAt DateTime?; cancelReason String?; promotionId String?; promotionSnapshot Json?; promotionEvaluatedAt DateTime?; loyaltyPolicySnapshot Json?; loyaltyPointsExpected Int?; snake_case mappings tương ứng |
| Order existing | Giữ total/requestKey/requestHash/userId/createdAt và unique(userId,requestKey); thêm unique(id,userId) để composite ownership FK; CHECK subtotal−discountTotal=total, 0≤discountTotal≤subtotal, total≥1 cho policy 2 (legacy không tự sửa tổng); version≥0, policy IN(1,2) |
| OrderRequest | Không thêm model; canonicalVersion Int đã có, chấp nhận 1 hoặc 2, giữ existing responseJson/httpStatus/state/orderId và unique(userId,requestKey); không rewrite ledger |
| AuthSession, Topping, ProductTopping, OrderItem, OrderItemTopping | Giữ field/PK/FK/snapshot gốc, thêm inverse relation chỉ phục vụ Prisma nếu cần |
| Promotion @@map promotions | id String uuid PK; code String unique; active Boolean default true; startsAt/endsAt DateTime; minimumSubtotal Int; type String chỉ PERCENT; value Int=10; maxDiscountAmount Int?; CHECK startsAt<endsAt, minimumSubtotal≥0, value 1…100, maxDiscountAmount≥0 khi khác null |
| PaymentAttempt @@map payment_attempts | id String uuid PK; userId String; orderId String; requestKey String; requestHash String; canonicalVersion Int default 1; gatewayKey String unique; method enum WALLET/CARD; amount Int; status enum FAILED/SUCCEEDED; version Int default 0; failureCode String?; refundedAmount Int default 0; refundedAt DateTime?; createdAt/updatedAt/resolvedAt DateTime (required); tất cả multiword field @map snake_case |
| StockReservation @@map stock_reservations | id String uuid PK; orderId String FK; productId String NOT NULL FK; qty Int >0; state enum ACTIVE/CONSUMED/RELEASED/RETURNED; createdAt DateTime; resolvedAt DateTime?; unique(orderId,productId), không toppingId/XOR |
| LoyaltyEntry @@map loyalty_entries | id String uuid PK; userId String; orderId String unique; points Int ≥0; reversedAt DateTime?; createdAt DateTime; composite FK(orderId,userId) đúng Order |

Order new nullable fields cho phép legacy policy 1, nhưng policy 2 bắt buộc deadline, loyaltyPolicySnapshot và loyaltyPointsExpected≥0; promotionId/snapshot/evaluatedAt đều null khi không mã, đều có khi có mã. SQL CHECK không thể tự chứng minh tổng child reservation; app kiểm tra và integration test verify cross-row invariant. PAID+ phải có success/consumed/loyalty trong cùng tx; CANCELLED có thể chưa từng paid. Không enforce sai bằng CHECK chỉ nhìn status.

Index/constraint bắt buộc E thêm trong migration SQL khi Prisma schema không thể biểu diễn:

```sql
CREATE UNIQUE INDEX payment_attempts_one_success_per_order
 ON payment_attempts(order_id) WHERE status = 'SUCCEEDED';
-- Prisma @@unique([orderId, productId]) trên StockReservation; cả hai FK NOT NULL.
```

Ngoài partial index một success/order và unique(orderId,productId): PaymentAttempt unique(userId,requestKey), unique(gatewayKey), FK(orderId,userId)→Order(id,userId), User FK; LoyaltyEntry composite FK cùng kiểu và User FK; StockReservation FK Order/Product; Order FK promotion nullable. Payment check amount≥1, version≥0, canonicalVersion=1, 0≤refundedAmount≤amount; FAILED⇒failureCode='PAYMENT_DECLINED' và refund=0/null; SUCCEEDED⇒failureCode=null, refund hoặc 0/null hoặc amount/non-null. Reservation ACTIVE⇒resolvedAt=null; CONSUMED/RELEASED/RETURNED⇒resolvedAt có giá trị (RETURNED cập nhật mốc trả kho). UNIQUE success vẫn áp sau refund, status success không đổi. Không có unique active attempt.

Indexes đọc: Order(userId,createdAt,id), Order(checkoutPolicyVersion,status,paymentDeadline,id), PaymentAttempt(orderId,createdAt,id), StockReservation(orderId,state), LoyaltyEntry(userId). Giữ indices auth hiện có. C/D kiểm tra execution plan trước thêm index khác. E ghi tên constraint thực tế cho retry classifier; retry P2002/23505 chỉ whitelist idempotency hoặc one-success. Duplicate PK, missing FK, check violation và sai data là lỗi cần sửa, không retry bừa.

Migration: backup/kiểm kê target trước; thêm enum/cột nullable/bảng/index; backfill Order subtotal=total, discountTotal=0/version=0/policy1, giữ deadline/promotion/loyalty null; sau đó đặt NOT NULL cho field có backfill, thêm CHECK legacy-aware và regenerate Prisma. Không sửa migration 20261030152601_sprint2_auth_orders. Dry-run trên DB sạch và bản sao fixture v1 gồm SUCCEEDED/REJECTED ledger, PENDING legacy; so rowcount,hash,responseJson trước/sau, FK/index và query. Nếu có tổng legacy ngoài miền kỳ vọng, báo lỗi/kiểm kê trước thêm constraint, không chữa dữ liệu âm thầm.

Seed demo có guard môi trường riêng, upsert catalog/promotion; stock khởi tạo 10 mỗi Product chỉ khi fixture demo mới/explicit setup được xác nhận; seed chạy lại không reset stock/reserved của đơn đang có hoặc tạo thêm points. Không giả định con số đó là tồn thực ở DB cũ. Không seed password/token public vào git;.env.example chỉ placeholder. Tách database URL/profile browser demo; không mang pending khác môi trường vào DB demo.

Thiết kế 1.3 áp dụng từ nền S2 chưa triển khai S3. Nếu đã có migration/rows S3 khác ngoài snapshot nền, dừng rollout để kiểm kê; không tự drop field hoặc xóa reservation topping. Giữ Topping/giá/liên kết và snapshot đơn; không thêm field stock hoặc reservation cho Topping.

## 7 Storage và các mốc phục hồi

Envelope, migration và writer v1 tuân mục 8 bản phạm vi. A giữ root schema exact 6 keys: schemaVersion,cart,pendingRequests,lastOrderResult,checkoutBindings,paymentRecoveries. Cart/lastOrderResult giữ shape nền; lastOrderResult vẫn chỉ là response tạo PENDING lịch sử, không dùng làm trạng thái hiện tại. Pending payload union v1/v2, phase SUBMITTING/UNKNOWN client. Trước mỗi mutation đọc owner/revision dưới cùng Web Lock, ghi pending/recovery rồi nhả lock trước HTTP; lock fail/storage fail thì không gửi. Map phải dùng own property, không tin __proto__/constructor từ JSON.

Crash sau create commit trước binding: replay cùng saved key/body rồi GET Order và bind đúng snapshot nếu còn khớp. Payment response hợp lệ nhưng GET Order lỗi: recovery còn UNRESOLVED; không payment key mới. Sau FAILED đã đối chiếu Order hiện tại còn hạn: đánh dấu resolved; khách bấm retry mới sinh key mới cùng orderId. Sau paid đọc Order mới hơn CANCELLED: không dọn hoặc dựng giỏ. Hai tab owner cookie đổi trước gửi: BFF captured-token guard chặn nhầm owner; response guard UI bảo vệ mọi local write sau đó.

Luồng tạo đơn v2 dùng `cart-checkout-client-v2.ts`: xác nhận chủ động, kiểm `/me` đúng owner/binding và `getSessionVersion`, lưu pending bền trước POST, lưu phản hồi tạo đơn trước GET current Order rồi mới bind. `readOrder` là interface nội bộ chờ tích hợp với phần đọc của B/C: adapter phải bảo vệ owner phía server, kiểm đầy đủ OrderDetail và phiên/version trước khi trả projection `CartCurrentOrder`. Checkpoint trả từ adapter là dữ liệu cục bộ, không phải DTO/header HTTP mới hoặc bằng chứng xác thực. Chưa nối adapter đã kiểm chứng thì chưa bật UI v2; khởi tạo helper không tự migrate, gửi request, nhận chủ giỏ hay thanh toán. Lỗi GET giữ pending/key/body và giỏ để người dùng chủ động thử lại.

Luồng thanh toán dùng `cart-payment-client-v2.ts` và cùng interface đọc đơn: lấy tổng chính thức trước xác nhận, kiểm lại phiên và Order trước khi lưu lần mới; thay đổi trạng thái/version/tổng/điều kiện thì yêu cầu mở lại xác nhận. Recovery chỉ replay POST đúng owner/key/body đã lưu, không dùng trạng thái hiện tại để chặn replay trước khi server tra key. Phản hồi PaymentView hợp lệ được lưu paymentId trước GET; GET lỗi vẫn UNRESOLVED và không mở lần thanh toán mới. Một số lỗi nghiệp vụ yêu cầu đọc trạng thái đơn nhưng việc đọc đó không tự giải quyết attempt chưa xác định. Chỉ kết quả POST đã đối chiếu với current Order mới được chuyển recovery sang RESOLVED; giỏ chỉ dọn khi current Order xác nhận đã thanh toán và binding còn khớp, CANCELLED không dọn hoặc dựng lại giỏ. Không dùng latestPayment thay cho kết quả của key đã gửi. Chưa nối UI hoặc tự gửi sau đăng nhập/kết nối lại.

Luồng hủy dùng `cart-cancel-client-v2.ts`: đọc Order cho xác nhận và đọc lại trước POST `{}`; thay đổi trạng thái/version/tổng/điều kiện yêu cầu xác nhận mới. Response 200 đi qua parser OrderDetail đầy đủ của B rồi GET current Order trước khi tháo binding còn khớp. Không có payment key hoặc record cancel mới trong envelope. Mất phản hồi giữ dữ liệu; người dùng chủ động đọc lại bằng `check`, không tự POST lại. Chỉ CANCELLED policy 2 tháo binding, không sửa các dòng giỏ hoặc kết thúc payment recovery. Đọc PAID trong luồng hủy cũng không tự dọn giỏ. Parser/reader là interface chờ tích hợp B/C; test giả lập chưa chứng minh refund, kho hoặc điểm trên backend.

Điểm tích hợp cần A/C/D chốt trước bật UI v2: khi payment chưa tới server nhưng Order đã CANCELLED (hoặc một key khác đã thanh toán), replay key cũ có thể trả 409 ORDER_NOT_PAYABLE mà không có PaymentAttempt. Baseline quy định tra key trước trạng thái và không dựng attempt giả, nhưng chưa nói rõ cách kết thúc recovery trong nhánh này. Code hiện giữ UNRESOLVED, nên vẫn chặn lần mới của owner; cancel/check không tự xóa hoặc giải quyết record. Cần xác định bằng chứng phản hồi đủ để kết thúc đúng key khi không có attempt, ghi hợp đồng và thêm kiểm thử tích hợp; không lấy riêng GET/latestPayment hoặc timeout làm bằng chứng.

### 7.1 Đầu vào bàn giao cho phần đọc đơn

`CartProviderV2` và `createCartControllerV2` nối bridge v2 vào auth subscription, thao tác giỏ và chuẩn bị logout. Menu/nút thêm, badge và thông báo giỏ dùng `CartEditingContext` chung; CartProvider v1 cũng cấp context này để giữ luồng hiện tại. Provider v2 cấp `checkoutEnvironment` từ `createCartCheckoutRuntimeV2`: ba coordinator dùng chung storage, auth, HTTP reader và cổng `runCheckout` của controller. Cổng này loại thao tác chồng nhau với sửa giỏ/logout, giữ busy qua HTTP và đọc lại storage trong finally, không giữ Web Lock qua HTTP; pending/recovery vẫn được công bố khi request chưa rõ kết quả. Reader và `/me` luôn dùng HTTP client, không thay bằng fixture theo biến môi trường; cancel response qua full parser của B trước projection. Reason tùy chọn phải được đóng băng theo backend, runtime không tự nhận các giá trị đề xuất ở mục 7.2 là đã thống nhất.

Layout vẫn chọn v1; chưa mount v2, chưa migrate hoặc nối panel checkout vào trang chính. Khi kích hoạt phải chọn đúng một provider/writer, không bọc hai provider đồng thời. Controller chặn phản hồi cũ theo phiên/lượt đọc, tuần tự hóa read/adoption, vô hiệu thao tác trong lúc refresh/lưu/logout; storage/focus/visibility/pageshow chỉ xác minh lại rồi đọc, không gửi POST. Nội dung logout phân biệt pending tạo đơn, binding đơn đã tạo và payment UNRESOLVED; cả ba được giữ sau khi dọn giỏ.

Bridge cho provider: `createCartSessionBridgeV2` chỉ dùng reader/writer v2 và trả giỏ, pending, kết quả, binding, recoveries theo đúng owner đã xác minh. Chỉ snapshot mới nhận từ login hoặc `/me` được cấp quyền nhận giỏ; thông báo storage/focus không tự cấp quyền này. Kiểm checkpoint phiên trước/sau await và trong khóa ghi; refresh cùng owner/binding không làm mất quyền thao tác, login mới vẫn làm vô hiệu checkpoint. Pending/binding/payment UNRESOLVED chặn sửa giỏ qua writer v2. Logout chuẩn bị checkpoint trước HTTP, chờ auth coordinator xác nhận scope và công bố anonymous đúng thế hệ rồi mới dọn giỏ trong khóa; giữ toàn bộ pending/binding/recovery của mọi owner, không xóa theo phản hồi logout cũ sau login mới. Bridge không tự migrate, không gọi HTTP/checkout, chưa gắn vào CartProvider hiện tại.

Ba coordinator dùng chung type `CheckoutOrderReaderV2` export từ `apps/web/src/features/cart/cart-checkout-client-v2.ts`. Input gồm `orderId`, checkpoint `{ownerId,binding,sessionVersion}` và `signal?`; output gồm checkpoint của lượt đã xác minh và projection `CartCurrentOrder`. Adapter `createCartOrderReaderV2` ở `cart-order-reader-v2.ts` dùng HTTP client/parser OrderDetail của B (PR #32, `ee15c75`), không dùng fixture theo biến môi trường. Runtime đã khởi tạo một adapter dùng chung cho ba coordinator trong CartProviderV2; chưa bật UI v2.

- B/C đối chiếu đầy đủ OrderDetail trước khi trả projection; parser dùng cho response cancel cũng tái sử dụng parser OrderDetail của B. Không dựng parser DTO thứ hai trong module giỏ.
- Lượt đọc dùng cơ chế của B đã sửa theo review: `X-BrewLite-Expected-Session` là binding từ phiên UI đã xác minh, BFF so với binding của token cookie capture một lần rồi GET bằng chính token đó. Không khớp trả 403 và chưa gọi backend; không cần thêm `/auth/me` ở BFF đọc. Binding không thay quyền NestJS. Giữ deadline chung 10 giây BFF và 15 giây client, no-store; không tự xóa cookie. Đây là cách triển khai thay cho đề xuất expected-owner trước đó ở mục này; các POST tạo đơn/payment/cancel vẫn giữ expected-owner và xác minh `/auth/me` hiện có.
- UI đối chiếu binding/getSessionVersion trước và sau HTTP, loại response phiên cũ kể cả cùng owner; version Order/Payment không được thấp hơn đã hiển thị. Chỉ gán lại checkpoint vào response ở client không chứng minh đã xác minh owner phía server.
- Adapter kiểm tra ID và đầy đủ OrderDetail qua parser B trước projection, chuyển AbortSignal cho fetch và không trả kết quả sau hủy. Trong cùng checkpoint, bỏ version thấp hơn đã đọc (cùng version bỏ serverTime cũ hơn); storage/coordinator vẫn kiểm tra version đã lưu. Adapter không ghi storage, tạo key, gọi POST, suy paymentId từ latestPayment hoặc tự refresh auth.
- Trước bật UI v2 cần test UI A + cookie B không nhận dữ liệu B; response A về sau login B hoặc login lại A bị bỏ; GET version cũ không ghi đè; ID chứa `%` chỉ encode một lần. UI dựng bằng fixture không chứng minh các điều kiện HTTP này.

### 7.2 Đề xuất chờ A/C/D đối chiếu

Phần này bổ sung phương án cho các điểm baseline còn mở, **chưa là hợp đồng đã chốt**. Runtime hiện chưa dùng các reason/nhánh kết thúc recovery dưới đây; không sửa enum hoặc tự mở fallback theo response. Khi có thống nhất, chuyển nội dung đã chốt vào mục 3/7, ghi PR/SHA xác nhận và thêm fixture/test tương ứng trước kích hoạt.

| Nhánh | Reason đề xuất | Người đối chiếu |
|---|---|---|
| 409 CHECKOUT_CHANGED | `PRICE_OR_TOTAL_CHANGED`, dùng cho giá dòng hoặc tổng chính thức không khớp expected*; giữ nguyên details đã thiết kế | C pricing, D workflow, A classifier |
| 409 OUT_OF_STOCK | `INSUFFICIENT_PRODUCT_STOCK`; resources chỉ gồm Product thiếu, requested là tổng qty qua mọi cấu hình | E stock, D workflow, A classifier |

Hai reason trên không đổi HTTP status, thứ tự validation, canonical/hash hoặc request body. Frontend vẫn kiểm toàn bộ details với saved request trước khi kết thúc pending; không lấy số liệu server để sửa body/key cũ. Lỗi chưa thống nhất hoặc dữ liệu sai giữ UNKNOWN.

Đề xuất nhánh payment không có attempt: sau khi lấy đúng khóa user/key, tra replay và khóa/đối chiếu Order bằng snapshot đủ mới, D chỉ bổ sung marker dưới đây vào 409 ORDER_NOT_PAYABLE khi đã chứng minh không có attempt của chính user/key và Order thuộc PAID/PREPARING/READY/COMPLETED/CANCELLED:

```json
{"error":{"code":"ORDER_NOT_PAYABLE","message":"Đơn không nhận lần thanh toán mới.","details":{"reason":"NO_ATTEMPT_TERMINAL_ORDER","orderId":"order-example","orderVersion":1,"orderStatus":"CANCELLED"}}}
```

- Có attempt thì replay PaymentView của chính key, kể cả FAILED cũ khi latestPayment là K2 hoặc Order đã đổi trạng thái/refund. Không phát marker nếu lookup lỗi, khóa bận, snapshot chưa chắc chắn; không dựng PaymentAttempt giả, đổi isolation hoặc đổi key để né lỗi.
- A chỉ được kết thúc recovery đúng owner/key/body khi record còn UNRESOLVED, chưa pin paymentId, POST cùng key/body trả đúng marker đã thống nhất, rồi GET đã xác minh đúng Order terminal và version không thấp hơn marker. GET lỗi hoặc thiếu một bằng chứng vẫn giữ UNRESOLVED. Marker không áp cho riêng PAYMENT_WINDOW_EXPIRED khi Order chưa terminal.
- Nếu được chốt, ghi RESOLVED với paymentId=null theo shape hiện có; UI diễn đạt yêu cầu này bị từ chối, không gọi đó là PaymentAttempt FAILED hoặc tạo payment giả. Chưa tự gửi key mới; giỏ vẫn theo binding/current Order, CANCELLED không dọn hoặc dựng lại.
- Ca tích hợp bắt buộc cho đề xuất: K1 chưa tới server rồi cancel/expiry; K2 đã thanh toán khi K1 chưa có attempt; K1 FAILED đã tồn tại phải replay FAILED thay vì marker; recovery đã pin ID không nhận marker; GET sau marker lỗi/khác owner/version cũ giữ record. A/C/D cần xác nhận tính khả thi và bằng chứng DB trước khi đổi runtime.

## 8 Chạy triển khai và demo

Nền dùng Node 24, Prisma 7.10.1, PostgreSQL 17 và bcrypt native 6.0.0 cost 12. npm ci theo lockfile; bcryptjs còn ở devDependencies phục vụ fixture tương thích hash cũ, không đổi runtime auth về bcryptjs. Bằng chứng S2 không thay test S3 sau tích hợp.

E thêm Compose ba service frontend/backend/db, pin PostgreSQL 17 theo README/nền Sprint 2 cho môi trường demo, named volume, DB healthcheck; backend chờ DB healthy, frontend gọi backend qua service URL nội bộ, browser chỉ /api. Đặt DATABASE_URL và BACKEND_URL đúng network; không dùng localhost của container để chỉ service khác. Build Prisma generate và Nest/Next theo lockfile; không đổi stack/version để làm Sprint 3. Migrations/seed chạy một lần rõ trong README trước app ready, không mỗi container tự migrate đồng thời. Không cần thêm endpoint public health: DB dùng pg_isready, backend smoke endpoint hiện có, FE HTTP check.

Lệnh đang có trên commit nền: backend npm run build, npm run typecheck, npm run db:generate, npm run db:validate, npm run db:migrate (Prisma migrate dev), npm run db:seed; frontend npm run build, npm run lint, npm run typecheck, npm test. Chạy npm ci từ directory có lockfile tương ứng. Chưa thấy test script backend hay Compose ở nguồn đã kiểm tra.

Đầu ra E/D phải thêm rồi mới dùng: compose.yaml; backend script db:deploy='prisma migrate deploy' cho demo/deploy; test:integration kết nối DB test riêng, test backend unit nếu cần; demo:advance script dùng OrdersService với DEMO_WORKFLOW_ENABLED. README phải ghi command thật sau khi PR thêm script, không copy tên này như lệnh đã tồn tại. Test DB riêng cấm trỏ DB cũ. Không docker compose down -v hoặc migrate reset trên dữ liệu cần giữ.

Demo: (1) seed demo và login → 2 cappuccino M/DEMO10 → PENDING giữ giỏ/kho; (2) WALLET success PAID9 điểm/dọn giỏ; (3) đơn khác CARD success; (4) config FAILED restart backend, đơn mới FAILED giữ giỏ/hold; (5) config SUCCEEDED restart, replay key cũ vẫn FAILED, khách retry key mới cùng đơn thành công; (6) mất response sau commit, replay không thêm order/attempt/kho/điểm; (7) cancel trước/ sau PAID, lặp không thêm bù trừ; (8) nội bộ chuyển pha chế và chặn cancel muộn/cạnh sai; (9) expiry fixture hết hạn/browser đóng; (10) a/b/c trên DB test + rollback failure injection và lịch sử. Test hook chỉ test build/fixture, không browser gửi failpoint/mode. Ghi SHA, config, command, expected/actual và log; không trình diễn ở DB có dữ liệu cần bảo toàn.

## 9 Đặc tả use case kế thừa và hoàn thiện

Actor chính trên master là Khách hàng; các thao tác tài khoản/đơn cần phiên đã xác thực. Đăng nhập là tiền điều kiện, không include login lại mỗi lần. UC-08 là create PENDING kế thừa, nay giữ kho/giỏ và nhận v2; UC-09 là payment cho Order đã có. Retry/hủy/expiry là luồng thay thế/quy tắc trong phạm vi đơn/payment, không thêm mã UC.

### UC09 Thanh toán không tiền mặt

Tiền điều kiện: khách có phiên đúng chủ, Order policy2 PENDING hoặc PAYMENT_FAILED còn hạn, reservation ACTIVE hợp lệ và chưa có payment recovery chưa giải quyết. Trigger: khách chọn WALLET/CARD và xác nhận. Luồng chính: UI đọc và hiện tổng current Order cho khách xác nhận; lưu recovery owner/key/body; BFF xác thực owner bằng cùng token chuyển tiếp; NestJS tra key trước trạng thái và khóa Order; mock success; commit attempt/PAID/consume/points nguyên tử; UI đọc current Order, hiện mã đơn và dọn đúng giỏ. Hậu điều kiện success: đúng một payment success, không giữ thừa kho/điểm hoặc xóa giỏ khác.

Luồng thay thế: mock FAILED → PAYMENT_FAILED, giữ giỏ/kho trong hạn; lần mới do khách xác nhận dùng key mới cùng đơn, qua PENDING logic. Response mất → giữ key/body, khách replay; không autoPOST sau login. Hết hạn/đã trả/khác chủ chặn mới; cancel trước trả release, PAID trước pha chế bù trừ một lần, muộn từ chối. Lỗi DB rollback, không giả FAILED. Extension point xử lý success trước commit gọi UC13; không có request cộng điểm độc lập.

### UC10 Xem xác nhận đơn

Tiền điều kiện: có phiên và biết orderId thuộc chủ, từ tạo/payment hoặc mở lại lịch sử. Trigger: mở màn hình xác nhận. Luồng chính: GET current Order; kiểm owner/thế hệ phiên/version; hiện id làm mã đơn, trạng thái hiện tại, tổng/snapshot và khả năng tiếp tục/hủy. Hậu điều kiện: chỉ đọc, không tạo đơn/payment hoặc tự đổi trạng thái. Đơn PENDING chưa được ghi 'đã thanh toán'. Lỗi đọc giữ recovery/giỏ; 404 không lộ đơn chủ khác. Replay create PENDING cũ không đè Order PAID/CANCELLED hiện tại.

### UC11 Xem lịch sử và trạng thái đơn

Tiền điều kiện: phiên hợp lệ. Trigger: mở lịch sử. Luồng chính: GET /orders/me; server lọc theo user phiên, snapshot, sort createdAt DESC/id DESC; UI loading rồi items hoặc empty, chọn một đơn để GET detail. Hậu điều kiện: không mutation. Lỗi có thử đọc lại chủ động; logout/đổi chủ xóa dữ liệu hiển thị của phiên trước và bỏ response cũ. Không pagination/filter/polling trong MVP.

### UC12 Áp mã giảm giá

Mở rộng UC08 khi khách có mã. Tiền điều kiện: giỏ hợp lệ, phiên đúng chủ, chưa pending chưa rõ hoặc checkout đang khóa. Khách nhập mã, UI tính preview theo cấu hình DEMO10 và ghi rõ dự kiến. Khách bấm Tạo và xem đơn; lưu body/key v2 bền rồi server kiểm active/window/min, giá và expectedTotal khi create. Thành công snapshot mã/giá vào Order. UI GET current Order hiển thị subtotal/discount/total chính thức trước nút Xác nhận thanh toán; chưa tự POST payment. Mã không áp được từ chối rõ, giữ lựa chọn, không âm thầm bỏ mã. Pending chưa rõ replay nguyên body/key, không sửa theo preview mới.

### UC13 Tích lũy điểm thưởng

Hành vi tự động mở rộng UC09 khi payment success, không cần nút của khách. Tiền điều kiện: Order chưa được cộng điểm, total/policy snapshot hợp lệ, cùng tx payment. Luồng chính: floor(total/10000), ghi một LoyaltyEntry/order (kể cả 0) và cộng User balance; commit cùng attempt/Order/kho. Hậu điều kiện: PAID có entry gốc duy nhất. FAILED không cộng; replay không cộng thêm; lỗi ghi rollback payment/kho/điểm. Cancel PAID trước PREPARING thu hồi đúng entry.points một lần và giữ entry/reversedAt, không xóa lịch sử.

## 10 Lưu kết quả và phạm vi kiểm chứng

MVP không xóa OrderRequest/PaymentAttempt/LoyaltyEntry hoặc recovery UNRESOLVED theo TTL. Replay dùng dữ liệu đã commit, không tạo key thay thế khi ledger tạm không đọc được. Record recovery RESOLVED giữ trong phạm vi demo, không thêm job dọn mới. Không ghi JWT/card data/secret vào ledger/log/browser. Các snapshot nghiệp vụ không đổi sau create; refund/reversal chỉ bổ sung metadata có version.

Test giao diện gồm loading/empty/error và các trình duyệt trong yêu cầu môn; ghi tên/version thực khi chạy. Không đồng nhất render SVG, validate JSON hoặc tính đúng ví dụ với test app. Toàn bộ 27 AC vẫn CHƯA CHẠY cho đến khi có evidence từ implementation.

## 11 Làm rõ giá và canonical

### Quy tắc giá và identity v2

Quy tắc demo: khi DEMO10 hợp lệ và subtotal ≥ 50.000 VND, discount = min(floor(subtotal × 10 / 100), 20000), total = subtotal − discount. Tiền là số nguyên VND; total ≥ 1 và giữ các giới hạn số học của contract. Ví dụ subtotal 50.001 → discount 5.000 → total 45.001 VND. Điểm vẫn floor(total / 10000), không làm tròn lên. Đây là chính sách nhóm chọn, không phải con số đề bài ấn định.

Chuẩn hóa promotionCode được định nghĩa tập trung ở contract Sprint 3 mục 1: trim, chuyển chữ ASCII thường thành hoa, rỗng thành null, rồi kiểm tra [A-Z0-9_-]{1,32}. Backend áp dụng cùng một hàm trước tra mã và xây canonical v2; field promotionCode trong canonical/hash là giá trị đã chuẩn hóa. Không chuẩn hóa ID opaque hoặc canonical v1 theo quy tắc này.

UI dùng quy tắc tương đương để preview và lập request mới; BFF chuyển nguyên body/key đã nhận, không tự sửa mã hay tính một hash khác. UI lưu body trước HTTP và retry nguyên body/key đã lưu, không chạy lại bước dựng payload từ giỏ hiện tại. Backend chuẩn hóa lại một cách xác định rồi lập canonical; tương đương mã không tạo conflict giả, còn thay đổi có ý nghĩa ở items/mã/tổng vẫn conflict với key cũ. Không sửa ledger/hash/pending v1 hoặc nâng identity một request v2 đã lưu.

Fixture cần kiểm khi hiện thực: hai body mới giống nhau ngoài promotionCode=" demo10 " và "DEMO10" cho cùng canonical/hash sau chuẩn hóa; replay cùng key trả cùng kết quả nếu toàn bộ nội dung còn lại tương đương. Mã khác hoặc expectedTotal khác phải conflict. BFF không thay body; test riêng chứng minh retry dùng đúng bytes body đã lưu. Những fixture này cụ thể hóa AC hiện có, chưa phải kết quả PASS và không thêm AC mới.

## 12 Quản lý trạng thái và phạm vi giao diện quầy

FR-13 và state machine chín cạnh thuộc phạm vi bắt buộc. Ba bước PAID → PREPARING → READY → COMPLETED được thực hiện qua CLI nội bộ gọi cùng service và assertTransition, chỉ bật khi DEMO_WORKFLOW_ENABLED=true; CLI phục vụ vận hành demo/test, không cấp quyền cho khách tự đổi trạng thái và không cập nhật status trực tiếp bằng SQL. D16 của baseline Sprint 1 chỉ đặt Barista UI/giao diện quầy đầy đủ ngoài MVP; không loại chức năng quản lý trạng thái khỏi phạm vi. Master giữ 14 UC; FR-13 được truy vết qua UC-08, UC-09, UC-11 và S3-ORD-01/02, không thêm actor/UC quầy trong lần hiệu đính này. Cơ chế này cần được hiện thực và kiểm thử; tài liệu chưa xác nhận đã chạy đạt.
