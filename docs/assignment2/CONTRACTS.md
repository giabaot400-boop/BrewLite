# Contract kế thừa Sprint 3

Ngày cập nhật: 06/11/2026. Chi tiết hiện thực tham chiếu bộ thiết kế Sprint 3; nội dung dưới dùng thống nhất cho các tài liệu, không tạo thêm FR/UC.

- Chỉ năm API nghiệp vụ đơn/thanh toán: `POST /orders`, `GET /orders/:id`, `GET /orders/me`, `POST /payments`, `POST /orders/:id/cancel`. API catalog/auth kế thừa vẫn dùng; không tạo API báo giá hoặc đọc payment riêng.
- `GET /orders/:id` trả `latestPayment` gồm id, version, orderId, method, amount, status, failureCode, createdAt, resolvedAt, refundedAmount, refundedAt hoặc null, chọn createdAt giảm dần rồi id giảm dần. Latest không chứng minh đó là attempt của key đang phục hồi. Mất response phải replay `POST /payments` với đúng owner/key/body đã lưu, rồi đọc Order hiện tại; không gán paymentId/kết quả từ một attempt khác.
- BFF kiểm tra expected owner bằng `/auth/me` với chính token đã capture một lần và sẽ chuyển tiếp cho mutation. Không khớp thì không gửi upstream POST, giữ pending/key/body. NestJS vẫn xác thực và kiểm tra quyền độc lập; UI dùng owner generation/version để bỏ response cũ.
- Retry payment sau FAILED đã xác nhận: key mới, cùng Order, còn hạn; `PAYMENT_FAILED → PENDING → PAID` hoặc `PAYMENT_FAILED → PENDING → PAYMENT_FAILED` trong một transaction, không commit PENDING trung gian. Replay key cũ không chuyển trạng thái hoặc tác động kho/điểm lại.
- Kho chỉ Product: gộp qty theo productId, precheck toàn bộ trước stock write; CAS conflict rollback cả transaction, retry snapshot mới với tối đa ba lượt tổng. `StockReservation.productId` bắt buộc, unique(orderId,productId); không tồn kho Topping/XOR/savepoint/retry lồng.
- DTO/canonical v2 và expectedTotal giữ nguyên; bỏ quote không tạo body v3. Envelope storage 2 chứa pending v1/v2, checkoutBindings/paymentRecoveries; không đổi identity yêu cầu cũ. Legacy policy 1 chỉ đọc khi chưa đủ dữ liệu nâng cấp; rollout phải bảo vệ dữ liệu/tab cũ, không reset hoặc xóa migration đã áp dụng.
- Giữ hold 15 phút, startup catch-up/tick 60 giây/batch 50, hủy PAID trước PREPARING kèm hoàn mock/trả kho/thu hồi điểm. Đây là các phần vẫn trong phạm vi; cấu hình không thay bằng chứng chạy đạt.
- A2 vẫn yêu cầu PaymentService là lifeline riêng **nội bộ NestJS**, class domain theo đề, PWA, CI/CD, health check và production. Không bỏ các đầu ra A2 vì giản lược API của Sprint 3.

## Giá và cấu hình demo

UI preview dùng giá giỏ và một cấu hình DEMO10 tập trung (10%, tối thiểu 50.000đ, trần 20.000đ), ghi rõ chưa kiểm chứng active/window/min ở server. Với mã khác, chưa tự giảm hoặc coi mã hợp lệ. POST /orders backend kiểm tra lại; mã sai/giá thay đổi/expectedTotal lệch bị từ chối rõ, không âm thầm bỏ mã hay sửa body/key. Sau rejection đã xác nhận, khách cập nhật dữ liệu từ API catalog/detail hiện có rồi xác nhận yêu cầu mới. PENDING đã tạo phải được đọc lại để hiển thị tổng chính thức trước thanh toán.

Mock outcome do backend cấu hình SUCCEEDED/FAILED, mặc định success; cấu hình sai phải báo lỗi khởi động. Demo FAIL rồi SUCCESS đổi cấu hình/restart backend; key cũ replay vẫn FAILED, khách xác nhận key mới trên cùng Order còn hạn để thử lần mới. Không nhận mode/amount/failpoint hoặc dữ liệu thẻ thật từ browser.

## Nền Sprint 2 đã chốt — không thiết kế lại khi thêm payment

Mốc kế thừa là main `a1a0e4ae92de681deac538685e24407b3190866b` sau PR #24/#26/#28/#27, hồ sơ `docs/SPRINT2_CLOSEOUT.md`. PO đã chấp nhận phạm vi Sprint 2 đã kiểm tra; các giới hạn bằng chứng vẫn giữ. Không suy ra mọi AC S2 hoặc AC A2 đã PASS. Sprint 3 đã đồng bộ nền này; A2 dùng cùng mốc, không dùng tài liệu hoặc ảnh cũ làm nguồn hiện hành.

### Phiên và logout A9

Login/me trả `X-BrewLite-Session-Binding`; binding giữ trong bộ nhớ auth, không ghi JWT/binding vào giỏ, pending hoặc payment recovery. Logout gửi `X-BrewLite-Expected-Session`; BFF đối chiếu bằng chính token capture một lần dùng cho thao tác thu hồi. Expected owner của orders/payment/cancel phục vụ chủ tài khoản; không thay expected-session vốn còn phân biệt hai phiên cùng owner.

Logout/me không trả Set-Cookie xóa cookie cố định. Sau 204, client kiểm tra /me trong phần còn lại của tổng 15 giây và kiểm tra checkpoint phiên trước cleanup. Còn phiên sống (kể cả cùng owner khác binding) hoặc chưa xác minh được thì giữ dữ liệu, không dọn theo logout cũ. Giữ AuthSnapshot.binding/getSessionVersion và cơ chế bỏ response cũ của nền; pending/recovery luôn giữ theo chủ. Chỉ 401 SESSION_INVALID đúng contract logout được chuyển 204 local; scope local không cam kết đã thu hồi mọi phiên.

### Tạo đơn, retry và tương thích v1

- Giữ `assertSucceededRequest` của PR #28 trước COMMIT: đọc lại dữ liệu Order/OrderRequest đã lưu, đối chiếu owner/key/hash/orderId; sai throw để rollback cả Order/snapshot/ledger và kho mới. C/E helper nhận cùng TransactionClient từ D, không tự commit hoặc retry lồng.
- `pg_try_advisory_xact_lock=false` khi tạo v1/v2 trả `409 ORDER_REQUEST_IN_PROGRESS`, không đưa lỗi key bận đó vào retry kho. Chỉ CAS/serialization/deadlock/unique đúng constraint whitelist mới vào tối đa ba lượt toàn operation, snapshot mới; hết lượt giữ key/body và trả lỗi đúng contract. OUT_OF_STOCK chỉ sau đọc xác nhận thiếu.
- Giữ `413 PAYLOAD_TOO_LARGE`. V1 PRICE_CHANGED giữ details chính xác `{items,currentTotal}`, mỗi item có productId,size,toppingIds,qty,expectedUnitPrice,currentUnitPrice,currentLineTotal; giữ remap fieldErrors theo index request. Không thay bằng schema v2 hoặc đổi payload pending cũ.
- V1 VALIDATION_ERROR được nhận diện hợp lệ theo classifier nền kết thúc pending để khách sửa, kể cả lỗi trước transaction chưa có ledger. Response lạ/sai schema vẫn UNKNOWN; v2 chỉ nhận rejection schema đã định nghĩa. Không coi mọi 4xx là đã lưu REJECTED.
- Nền Node 24, Prisma 7.10.1, PostgreSQL 17; npm ci theo lockfile. Runtime bcrypt native 6.0.0 cost 12, bcryptjs chỉ dev fixture tương thích, không hạ cost hoặc đổi auth để làm payment. Compose/DB test dùng cùng PostgreSQL 17.

### Delta giỏ có chủ đích

Sprint 2 dọn giỏ khi tạo PENDING 200/201 (ORDER-AC-08/P01, S2-ORDER-01/12). Sprint 3/A2 giữ đến khi đọc trạng thái đã trả hiện tại và binding còn khớp. Đây là thay đổi kỳ vọng mới, không sửa kết quả test lịch sử S2. Envelope 2 được rollout dưới Web Lock, giữ pending v1/v2 nguyên identity; backend hỗ trợ trước frontend, bảo vệ hoặc yêu cầu reload có kiểm soát tab cũ trước bật writer mới. Không reset localStorage hay xóa migration để nâng cấp.

### Đầu ra riêng của A2 vẫn bắt buộc

Theo đề A2, Task 5.2 cần **health endpoint** và Task 5.4 cần URL API/health. Việc A1/S3 dùng smoke endpoint hiện có không thay đầu ra này. Task 3 phải mô tả production thật, quản lý cấu hình/log/health/migration; Task 4–5 có CI/CD, PWA, test và minh chứng. Repo nền dùng frontend/backend; đề A2 yêu cầu apps/web và apps/api: phải đối chiếu và xử lý có kiểm soát trước nghiệm thu Task 4, không mặc định khác đường dẫn là đã đáp ứng. Không di chuyển source trong lượt cập nhật tài liệu này.

## Phạm vi use case trọng tâm

Task 1.3 chọn duy nhất UC-09 Thanh toán không tiền mặt; UC-08 tạo đầu vào, hủy/expiry là ngữ cảnh hỗ trợ. Hình payment là sequence chính Task 2.2, activity vẫn end-to-end. Giữ nguyên lead/lịch mục tiêu và toàn bộ contract S3; chưa xác nhận nhận việc hoặc code/test đạt.

### Quy tắc giá và identity v2

Quy tắc demo: khi DEMO10 hợp lệ và subtotal ≥ 50.000 VND, discount = min(floor(subtotal × 10 / 100), 20000), total = subtotal − discount. Tiền là số nguyên VND; total ≥ 1 và giữ các giới hạn số học của contract. Ví dụ subtotal 50.001 → discount 5.000 → total 45.001 VND. Điểm vẫn floor(total / 10000), không làm tròn lên. Đây là chính sách nhóm chọn, không phải con số đề bài ấn định.

Chuẩn hóa promotionCode được định nghĩa tập trung ở contract Sprint 3 mục 1: trim, chuyển chữ ASCII thường thành hoa, rỗng thành null, rồi kiểm tra [A-Z0-9_-]{1,32}. Backend áp dụng cùng một hàm trước tra mã và xây canonical v2; field promotionCode trong canonical/hash là giá trị đã chuẩn hóa. Không chuẩn hóa ID opaque hoặc canonical v1 theo quy tắc này.

UI dùng quy tắc tương đương để preview và lập request mới; BFF chuyển nguyên body/key đã nhận, không tự sửa mã hay tính một hash khác. UI lưu body trước HTTP và retry nguyên body/key đã lưu, không chạy lại bước dựng payload từ giỏ hiện tại. Backend chuẩn hóa lại một cách xác định rồi lập canonical; tương đương mã không tạo conflict giả, còn thay đổi có ý nghĩa ở items/mã/tổng vẫn conflict với key cũ. Không sửa ledger/hash/pending v1 hoặc nâng identity một request v2 đã lưu.

Fixture cần kiểm khi hiện thực: hai body mới giống nhau ngoài promotionCode=" demo10 " và "DEMO10" cho cùng canonical/hash sau chuẩn hóa; replay cùng key trả cùng kết quả nếu toàn bộ nội dung còn lại tương đương. Mã khác hoặc expectedTotal khác phải conflict. BFF không thay body; test riêng chứng minh retry dùng đúng bytes body đã lưu. Những fixture này cụ thể hóa AC hiện có, chưa phải kết quả PASS và không thêm AC mới.

## Quản lý trạng thái và phạm vi quầy

FR-13 và state machine chín cạnh thuộc phạm vi bắt buộc. Ba bước PAID → PREPARING → READY → COMPLETED được thực hiện qua CLI nội bộ gọi cùng service và assertTransition, chỉ bật khi DEMO_WORKFLOW_ENABLED=true; CLI phục vụ vận hành demo/test, không cấp quyền cho khách tự đổi trạng thái và không cập nhật status trực tiếp bằng SQL. D16 của baseline Sprint 1 chỉ đặt Barista UI/giao diện quầy đầy đủ ngoài MVP; không loại chức năng quản lý trạng thái khỏi phạm vi. Master giữ 14 UC; FR-13 được truy vết qua UC-08, UC-09, UC-11 và S3-ORD-01/02, không thêm actor/UC quầy trong lần hiệu đính này. Cơ chế này cần được hiện thực và kiểm thử; tài liệu chưa xác nhận đã chạy đạt.

## Quan hệ A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.
