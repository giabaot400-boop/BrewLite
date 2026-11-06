# BrewLite Sprint 3 ma trận kiểm thử

Cập nhật ngày 06/11/2026, nền Sprint 2 main a1a0e4a đã chốt. Có 27 AC, mỗi AC một lead. **Tất cả CHƯA CHẠY**; bảng là kế hoạch kiểm thử, không phải báo cáo PASS. Ca cạnh tranh và rollback chạy PostgreSQL test riêng, tối thiểu hai connection; unit mock không thay test DB. Không trỏ test/reset vào DB cũ. Test clock/failpoint chỉ trong test fixture, không public header/browser mode.

## 1 Cách ghi bằng chứng

Mỗi AC tạo record: AC / ticket / lead / reviewer / SHA / môi trường và fixture / lệnh / expected / actual / PASS hoặc FAIL hoặc BLOCKED / link log hoặc ảnh / lỗi còn lại. Có thể một test hỗ trợ nhiều AC nhưng mỗi assertion phải chỉ ra invariant tương ứng. Khi rerun sau sửa ghi SHA mới, giữ lỗi cũ để truy vết. Ghi số thử/latency và lỗi, không cherry-pick một lượt tranh kho đẹp.

## 2 Các ca thực hiện

### S3-PAY-01

Lead A; 8 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Order policy2 PENDING còn hạn, đủ ACTIVE; mock SUCCEEDED.
- Thao tác: Lần lượt WALLET và CARD trên hai đơn riêng.
- Kỳ vọng: 200 amount=Order.total; PAID, một success, đúng mã đơn; chỉ server quyết giá.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-02

Lead D; 8,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: PENDING còn hạn; backend FAILED.
- Thao tác: Gửi payment hợp lệ.
- Kỳ vọng: HTTP200 attempt FAILED; Order PAYMENT_FAILED, stock không giảm, reserved giữ; điểm 0.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-03

Lead A; 8,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Payment recovery key K1 đã lưu; response bị mất sau commit; test riêng K2 là latest trên cùng Order.
- Thao tác: Reload, chủ động replay K1; GET Order có thể latest=K2.
- Kỳ vọng: Nhận đúng attempt K1 từ replay; không gán ID/kết quả K2 vào recovery K1; giữ giỏ tới current Order hợp lệ.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-04

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: DB test sạch; cùng user, body và key cho create/payment.
- Thao tác: Promise.all hai create cùng key rồi hai payment cùng key; lặp sau restart.
- Kỳ vọng: COUNT Order=1, attempt success=1, cùng IDs; stock/điểm áp một lần; canonical/ledger không đổi. Ca khóa create còn bận giữ 409 ORDER_REQUEST_IN_PROGRESS; retry chủ động sau đó hội tụ, không bắt mọi response concurrent đều 200/201 ngay.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-05

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Đã có payment key K.
- Thao tác: K đổi method hoặc orderId; kể cả Order cũ đã CANCELLED.
- Kỳ vọng: 409 conflict, attempt count/kho/điểm không đổi.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-06

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Cùng đơn, hai key; SUCCEEDED hoặc FAILED config.
- Thao tác: Gửi đồng thời hai key; rồi đọc DB.
- Kỳ vọng: Success tối đa1, loser không thêm charge; nếu failure trước thì attempt mới còn hạn có thể hợp lệ.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-07

Lead A; 8,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Đơn FAILED còn hạn.
- Thao tác: Đổi config/restart; replay key cũ; khách bấm retry key mới.
- Kỳ vọng: Replay vẫn FAILED; key mới cùng Order áp hai cạnh logic đúng, deadline/hold không tăng.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PAY-08

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Clock test sát deadline; expiry và payment tranh cùng Order.
- Thao tác: Gửi trước/sau deadline và chạy expiry; browser đóng.
- Kỳ vọng: Một kết quả tuần tự hợp lệ; không payment mới khi now≥deadline; policy1 không tự đổi.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-ORD-01

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Bảng 7 trạng thái/chín cạnh; script demo enabled trong test.
- Thao tác: Table-driven cạnh đúng/sai, retry qua PENDING; khách thử field status.
- Kỳ vọng: Chỉ chín cạnh, terminal không đi tiếp; field dư400; FAILED→PAID trực tiếp bị chặn (a).
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-ORD-02

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Đơn trước PAID, sau PAID và PREPARING riêng.
- Thao tác: Cancel lặp; race cancel/payment/expiry/PREPARING; failure injection.
- Kỳ vọng: Release hoặc fullrefund/return/reverse một lần, reason giữ, muộn409; lỗi rollback toàn bộ.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-ORD-03

Lead B; 9 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Đơn đã PAID/CANCELLED nhưng ledger create lưu PENDING.
- Thao tác: Replay create, mở confirm/detail/history; đảo thứ tự response version.
- Kỳ vọng: UI đọc current Order; không giảm version/ghi trạng thái lịch sử đè hiện tại.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-ORD-04

Lead C; 9 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: UserA có ≥3 đơn cùng/khác createdAt, B có đơn riêng.
- Thao tác: GET history A/B và user rỗng; query lạ.
- Kỳ vọng: Đúng chủ, createdAt/id DESC, items=[] khi rỗng, {items,serverTime}; query lạ400.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-STK-01

Lead E; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: PostgreSQL thật, hai user/hai connection, Product stock1/reserved0.
- Thao tác: Barrier hai create khác key cùng Product; replay loser sau xung đột.
- Kỳ vọng: Tối đa một giữ thành công, reserved≤stock, không âm; loser409 thiếu thật hoặc503 hữu hạn; replay hội tụ, không có kho Topping.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-STK-02

Lead E; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Hai dòng coffee-milk khác size/topping; ca riêng hai Product, nguồn thứ hai thiếu; test topping có qty nhiều nhưng không tồn.
- Thao tác: Create qty gộp; ép CAS conflict giữa đọc/ghi; thiếu Product thứ hai.
- Kỳ vọng: Chỉ aggregate Product, rollback mọi giữ dở; retry max3 không9; topping validate/giá/snapshot vẫn đúng và không có stock writes.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-STK-03

Lead D; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: PAID transaction với failpoint chỉ test ở từng bước attempt/stock/loyalty/order.
- Thao tác: Lần lượt throw trước commit, rồi replay cùng key; chặn response sau commit.
- Kỳ vọng: Rollback toàn bộ trước commit; sau commit replay không thêm; không external mock side effect. Hồi quy PR28: ép lệch owner/key/hash/orderId trong cặp Order–ledger lúc create phải rollback cả snapshot/reservation/kho, không bỏ assert trước commit khi thêm S3.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PRO-01

Lead C; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: DEMO10 active, biên min/cap/window; giỏ client có giá cũ.
- Thao tác: UI preview rồi create v2; thay giá trước create; gửi field dư; kiểm tra trước payment.
- Kỳ vọng: Backend kiểm/tính lại, lỗi ledger rõ; success GET Order hiện tổng chính thức; không payment tự động hoặc endpoint quote.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-PRO-02

Lead C; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Order tạo lúc mã hợp lệ.
- Thao tác: Làm promotion hết hạn rồi FAILED/retry cùng order; tạo đơn mới.
- Kỳ vọng: Order cũ giữ snapshot/total; order mới đánh giá lại và bị từ chối mã hết hạn.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-LOY-01

Lead C; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Các total cho0/9/28 điểm, User balance hợp lệ.
- Thao tác: FAILED, PAID/replay, PAID cancel/repeat và rollback reversal.
- Kỳ vọng: Chỉ PAID một entry kể cả0; balance+floor(total/10000); reverse đúng entry một lần không âm.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-CART-01

Lead A; 8 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Cart owner/revision và v2 pending bền.
- Thao tác: Create201, đọc PENDING rồi payment FAILED.
- Kỳ vọng: Giỏ giữ toàn bộ cấu hình; binding đúng Order, khóa sửa; không clear theo S2 cũ.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-CART-02

Lead A; 8,9 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Pending/recovery chưa rõ A; auth logout/login.
- Thao tác: Reload/login A rồi B, mở current Order.
- Kỳ vọng: Không autoPOST sau login; A recover đúng; B không thấy/gửi pending A.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-CART-03

Lead A; 8 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Binding A order O revision R; response cũ và giỏ mới R+1.
- Thao tác: Đảo paid/cancel/currentGET; đổi owner/phiên trước response.
- Kỳ vọng: Chỉ clear paid-current và đúng tuple; CANCELLED không resurrect; giỏ khác không đổi.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-CART-04

Lead A; 8,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Saved payment UNRESOLVED rồi FAILED resolved.
- Thao tác: Reload/retry; đổi phương thức; thử bấm kép.
- Kỳ vọng: UNRESOLVED giữ key/body; chỉ confirmed FAILED + thao tác mới có key mới, OrderId không đổi.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-CART-05

Lead A; 8,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Order hết hạn, cart cũ hoặc cart mới đã có.
- Thao tác: Tick expiry; khách bấm đặt lại, xem lại giá/mã và tạo đơn mới chủ động.
- Kỳ vọng: Trước confirm không POST; kiểm kho Product; hiển thị tổng current Order trước payment; không ghi đè giỏ mới.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-SEC-01

Lead C; 8,9,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: A/B accounts, cookie đổi tab, response chậm; Origin xấu/header thiếu.
- Thao tác: GET ID chéo chủ; header expected A với token B; swap cookie sau capture; race401/403. Hồi quy logout A9: thiếu/sai expected-session, phản hồi logout/me cũ sau login mới và cùng owner khác binding; kiểm tra lại phiên sau 204 trong ngân sách còn lại.
- Kỳ vọng: 404 chéo chủ; mismatch403 upstreamPOST0; cùng captured token; UI cũ không ghi chủ/phiên mới, no-store. Logout/me không xóa cookie mới; chỉ cleanup sau xác nhận anonymous đúng checkpoint, giữ pending/recovery và dữ liệu khi chưa xác minh được.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-MIG-01

Lead E; 10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: DB fixture v1 SUCCEEDED/REJECTED/PENDING legacy; storage v1 pending/result; tab writer cũ.
- Thao tác: Migration DB và envelope2; replayv1/v2conflict; quota/badJSON; hai tab.
- Kỳ vọng: Giữ row/hash/response/payload/key; no reset/hủy legacy/stock giả; policy1 read-only, writer cũ failclosed. V1 giữ 413 PAYLOAD_TOO_LARGE, VALIDATION_ERROR/PRICE_CHANGED đúng schema/classifier nền và remap index replay lỗi; lỗi không nhận diện vẫn UNKNOWN.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-DEL-01

Lead E; 9 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Máy/profile khác, PostgreSQL 17 theo nền S2, demo DB riêng và.env.example.
- Thao tác: Theo README Compose/migrate/seed và demo kịch bản CONTRACTS.
- Kỳ vọng: Ba service hoạt động, FE→BFF→BE→DB, WALLET/CARD/fail/retry/recovery/history; seed lại không reset kho.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

### S3-DEL-02

Lead B; 8,9,10 thuộc Task đề. Trạng thái CHƯA CHẠY.

- Fixture: Commit release và evidence từng lead.
- Thao tác: Chạy checks thật, PR review; Review/Retro/backlog và packaging.
- Kỳ vọng: Ghi SHA/command/actual/log, remaining bug; không PASS chỉ do đọc tài liệu; file/link chạy được.
- Bằng chứng cần: command/SHA, response và DB/local-storage assertions liên quan; ghi expected/actual và reviewer.

## 3 Ba tiêu chí đề và hồi quy

(a) S3-ORD-01: table-driven toàn cặp trạng thái, assertion từng cạnh và side effect, không chỉ trả HTTP. (b) S3-PAY-04 + DEP-02: tách create idempotency và payment idempotency; hai POST /orders cùng key → một Order; hai POST /payments cùng key → một PaymentAttempt/tác động và vẫn một Order. Không dùng câu 'payment không tạo Order' để bỏ test một đơn. (c) S3-STK-01/02: Product cuối và nhiều cấu hình dùng chung Product, distinct user/key, barrier cạnh tranh thật; kiểm tra tổng reservation và kho trước/sau, replay sau xung đột. Lặp thêm nhiều request để đo lỗi hữu hạn; an toàn kho phải luôn giữ.

Hồi quy Sprint 1: menu/detail/size/topping/tính giá, chỉ cho topping gắn Product. Sprint 2: register/login/logout/401/403, P04 Origin, giỏ/qty/multi-tab, pending v1/hash/ledger/price error, không autoPOST sau login, unknown schema failclosed. ORDER-AC-08 và S2-ORDER-01/12 chạy lại với kỳ vọng mới 'giữ tới PAID' được ghi delta Sprint3; không sửa lịch sử test cũ thành đã PASS.

Build/check: dùng scripts thật trong package. Backend hiện có build/typecheck/db:validate, frontend build/lint/typecheck/test; D/E phải thêm backend integration harness/script trước khi ghi lệnh test ấy vào kết quả. Compose/migration/seed cần máy khác chạy thật. NFR <500ms đo endpoint mẫu sau warmup, ghi môi trường/dataset/percentile và tất cả failures; UI15s/BFF10s là timeout bảo vệ, không bằng đáp ứng hiệu năng.

## 4 Phạm vi và fixture bổ sung

FR-13 và state machine chín cạnh thuộc phạm vi bắt buộc. Ba bước PAID → PREPARING → READY → COMPLETED được thực hiện qua CLI nội bộ gọi cùng service và assertTransition, chỉ bật khi DEMO_WORKFLOW_ENABLED=true; CLI phục vụ vận hành demo/test, không cấp quyền cho khách tự đổi trạng thái và không cập nhật status trực tiếp bằng SQL. D16 của baseline Sprint 1 chỉ đặt Barista UI/giao diện quầy đầy đủ ngoài MVP; không loại chức năng quản lý trạng thái khỏi phạm vi. Master giữ 14 UC; FR-13 được truy vết qua UC-08, UC-09, UC-11 và S3-ORD-01/02, không thêm actor/UC quầy trong lần hiệu đính này. Cơ chế này cần được hiện thực và kiểm thử; tài liệu chưa xác nhận đã chạy đạt.

S3-PRO-01 bổ sung assertion subtotal 50.001 → giảm 5.000 → total 45.001; S3-MIG-01/S3-PAY-04 đối chiếu canonical v2 với mã tương đương sau chuẩn hóa, giữ pending đã lưu bất biến khi retry. Đây là fixture chi tiết cho AC hiện có; tất cả 27 AC vẫn CHƯA CHẠY.
