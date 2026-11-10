# BrewLite Sprint 3 rà soát bản rút gọn

Cập nhật ngày 06/11/2026. Bản hiện hành áp dụng ba thay đổi PO đã đồng ý sau review. Lượt này đồng bộ tài liệu/thiết kế với main `a1a0e4ae92de681deac538685e24407b3190866b` đã chốt sau PR #24/#26/#28/#27; không sửa repo, chạy app, áp migration hoặc xác nhận kết quả kiểm thử S3. Đã đọc source/hồ sơ nền và diff từ fcb473a tới a1a0e4a. Các giới hạn bằng chứng S2 giữ theo SPRINT2_CLOSEOUT.md.

## 1 Ba thay đổi đã áp dụng

| Phần | Phạm vi đã chọn | Đồng bộ ở đâu |
|---|---|---|
| Quote riêng | Bỏ POST /orders/quote và các DTO/response/nhánh UI gọi quote. UI preview theo DEMO10 cố định; NestJS tính/kiểm tra lại khi create. GET Order hiện tổng chính thức trước khách xác nhận payment | Scope5/6, CONTRACTS1/2/UC12, D02A/D03, ticket A02, PRO01 |
| Đọc payment riêng | Bỏ GET /payments/:id. GET /orders/:id giữ latestPayment đầy đủ; recovery từng attempt dùng replay POST /payments đúng key/body rồi đọc Order hiện tại | CONTRACTS2/7, D02B/D04, C02, PAY03/CART02 và test hai attempt |
| Kho Topping | Chỉ Product có stock/reservedStock/stockVersion. Reservation chỉ productId NOT NULL và unique(orderId,productId). Bỏ toppingId/XOR/partial index topping khỏi reservation. Topping vẫn có menu/giá/liên kết/snapshot | Scope4/9, CONTRACTS4/5/6, ERD, E01/E02, STK01/02 |

Năm API còn lại là POST /orders, GET /orders/:id, GET /orders/me, POST /payments và POST /orders/:id/cancel. Chưa thêm endpoint thay thế quote. Đọc payment qua latestPayment không thay được replay chính key: đó là payment gần nhất của đơn, có thể khác attempt đang phục hồi. Ca test dùng key K1 cũ và K2 latest để chứng minh không nhận nhầm paymentId/kết quả.

## 2 Tiền khách xác nhận và key cũ

Giữ DTO/canonical/hash v1/v2, gồm expectedTotal trong v2, để không phát sinh một version chuyển đổi request mới. Bỏ quote endpoint không đồng nghĩa bỏ kiểm tra giá. UI dùng giá giỏ và cấu hình DEMO10 cố định để tính preview, ghi rõ dự kiến/chưa xác nhận hiệu lực mã; NestJS kiểm active/window/min, giá và tổng khi create. Mã không hợp lệ không bị âm thầm bỏ. Rejection đã ledger yêu cầu khách xem lại/confirm request mới; pending chưa rõ luôn replay nguyên key/body. Sau create, GET current Order hiện subtotal/discount/total trước payment; không tự POST payment. Ví dụ cappuccino M×2/DEMO10 vẫn total90.000/9điểm; canonical fixture/SHA giữ nguyên byte.

## 3 Phần bắt buộc và phần đã chọn còn giữ

Task8–9 giữ WALLET/CARD mock, PAID/PAYMENT_FAILED, giỏ khi lỗi, xác nhận/lịch sử, Compose/README/demo. Task10 vẫn bốn ý state/idempotency/transaction+optimistic locking Product/promo+points. Test(a) chặn cạnh sai, (b) hai create cùng key→mộtOrder và payment cùng key→mộtattempt/tác động, (c) đặt đồng thời không vượt kho Product. Đề Task10 dùng 'nguyên liệu/sản phẩm', không bắt buộc tồn kho riêng Topping; mô tả giới hạn MVP này phải nhất quán trong demo/báo cáo.

Chưa cắt hold15phút/expiry backend, PAID-cancel trước PREPARING kèm hoàn mock/trả Product/thu hồi điểm, request v2/storage2, các guard owner và hồi quy v1. Sơ đồ đề có cạnh PAID→CANCELLED nên không tự xóa để giảm việc. Giữ13model=9nền+4mới,14mãUC,27AC; việc giảm ở endpoint/nhánh xử lý/field/constraint và test topping, không ép giảm số bảng. 27AC giữ ID để truy vết; sáu AC được làm rõ theo phạm vi mới, toàn bộ CHƯA CHẠY.

## 4 Rollout và giới hạn kiểm chứng

Schema Sprint 3 được thiết kế trên nền Sprint2 chưa có S3. Nếu phát hiện schema/code S3 khác đã chạy ngoài snapshot, kiểm kê trước rollout, không tự drop cột/xóa reservation Topping hoặc sửa ledger. Đơn legacy/pending v1 bảo toàn theo contract; demo/testDB riêng không thay thế ca tương thích. Các migration đã áp và hồ sơ Sprint1–2 giữ nguyên. A2 được đồng bộ cùng đợt và chuẩn bị song song; nghiệm thu A2 vẫn theo Task 1→5.

Auth/logout và invariant Order/ledger đã có sửa/evidence ở nền S2 chốt; DEP01…04 dùng để nhận bàn giao và hồi quy chịu ảnh hưởng. DEP05…07 cùng mọi AC S3 vẫn cần evidence thực. Không biến các mục S2 bằng chứng một phần thành PASS toàn bộ. Lịch mục tiêu trước hạn15/11 giữ nguyên; estimate mới50–70h tập trung chưa buffer/capacity, không hứa tiết kiệm đúng số giờ. D/E vẫn là đường găng, từng lead tự test phần mình. Việc chỉ xem tài liệu không nghiệm thu ứng dụng.

## 5 Kiểm tra tạo phẩm

Đã đối chiếu năm endpoint; DTO/hash giữ fixture v2;27AC/mộtlead cùng nội dung giữa Word và Markdown;13model/14mãUC/haiextend/chíncạnhstate. Render và xem đầy đủ Word cùng chín hình; kiểm cấu trúc/CRC và byte tham chiếu haiZIP. Đây là kiểm tra tài liệu. Chưa chạy unit/integration/E2E, DB hoặc migration của ứng dụng.

Nguồn: đề BrewLite-CongNghePhanMem Task8–10/sơ đồ9.1; Sprint1 v1.1, Sprint2 v0.6 và diagram v0.6; nền triển khai hiện hành https://github.com/giabaot400-boop/BrewLite/tree/a1a0e4ae92de681deac538685e24407b3190866b và docs/sprint2/SPRINT2_CLOSEOUT.md; snapshot fcb473a là nguồn lịch sử trước khi chốt S2. Các quyết định nghiệp vụ được trình bày trong DESIGN.md và CONTRACTS.md.

## 6 Đồng bộ nền Sprint 2 đã chốt ngày 04/11/2026

| Nhóm | Nội dung đã cập nhật | Vị trí |
|---|---|---|
| Mốc nền | Thay nhận định PR24 đang mở/nền fcb473a bằng main a1a0e4a; dẫn closeout/PO acceptance và giới hạn chứng cứ | Scope, Word, README, TEAM_PLAN, CONTRACTS |
| Auth/logout | Giữ session binding/expected-session, không Set-Cookie xóa cookie cố định; sau204 kiểm tra lại phiên trong ngân sách15s trước cleanup, kể cả cùng owner khác phiên | Scope7/8, Word6/7/10, CONTRACTS3, DEP01, SEC01 |
| Create và lỗi v1 | Giữ assert Order/ledger trước commit của PR28; busy advisory trả409 ORDER_REQUEST_IN_PROGRESS; thống nhất413 PAYLOAD_TOO_LARGE, details PRICE_CHANGED và classifier VALIDATION_ERROR nền | Scope9, Word6/8, CONTRACTS1/3/4, DEP02, PAY04/STK03/MIG01 |
| Môi trường | Compose dùng PostgreSQL17 theo README; Node24/Prisma7.10.1/bcrypt native6.0.0 cost12 kế thừa lockfile | Scope9, Word10, CONTRACTS8, DEL01 |

Đây là cập nhật thông tin nền và contract kế thừa; không thay ba lựa chọn giản lược, state machine, mô hình dữ liệu, AC/lead, ticket hoặc topology sơ đồ. Nguồn/hình sơ đồ giữ nguyên byte; các ghi chú bàn giao được đồng bộ cùng gói. Không tuyên bố kiểm thử S3 đạt từ việc cập nhật tài liệu.
