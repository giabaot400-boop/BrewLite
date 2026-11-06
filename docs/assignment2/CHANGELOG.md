# Assignment 2 v0.6 đồng bộ Sprint 3 v1.3

Ngày 06/11/2026. Hiệu đính từ v0.5 ngày 05/11/2026; giữ 17 FR, 12 NFR, 59 AC, 14 UC và 10 lớp domain. Chưa chạy code/test hoặc xác nhận Task 1–5 đã nghiệm thu.

- FR-13 trong phạm vi: state machine chín cạnh, CLI nội bộ qua service để vận hành demo/test; D16 chỉ loại giao diện quầy đầy đủ. Không thêm actor/UC/AC hoặc mở API quầy.
- Sequence chính thêm ngữ cảnh UC-08 gồm guard, transaction tạo Order/giữ Product, optimistic locking, ledger và rollback; phân ranh giới trước UC-09. Tạo và payment vẫn là hai lượt xác nhận/transaction riêng, retry không tạo đơn mới.
- Đồng bộ công thức floor giảm giá, ví dụ tiền lẻ và mã đã chuẩn hóa trong canonical/hash v2. BFF chuyển nguyên request; giữ pending/key/body khi retry; không đổi canonical v1 hay ledger cũ.
- Phân biệt đề A2 với lựa chọn dùng chung repo/code; chuẩn bị A1/A2 song song, nghiệm thu A2 tuần tự Task 1→5. Sửa lịch/nhãn và không ghi mốc kế hoạch thành kết quả.
- Cập nhật nguồn/ảnh sơ đồ và các tham chiếu hiện hành; giữ lịch sử phiên bản cũ dưới đây. Không sửa hồ sơ S1/S2 hoặc code ứng dụng.

## Lịch sử v0.5 và v0.3 giữ nguyên để đối chiếu

Các từ “hiện hành” trong phần lưu lịch sử dưới đây chỉ có hiệu lực tại thời điểm phiên bản đó; bản đang dùng là v0.6.

# Assignment 2 v0.5 — đồng bộ Sprint 3 v1.2

Ngày 05/11/2026. Bản giao nhóm; Task 1–2 cần review/commit, Task 3–5 chưa hoàn thành từ gói này.

| Nội dung | v0.3 | v0.5 hiện hành |
|---|---|---|
| Mốc nền | Tham chiếu Sprint 3 v1.1, chưa gắn nền S2 chốt | Sprint 3 v1.2 + S2 a1a0e4a; giữ giới hạn nghiệm thu S2 |
| Logout | Dọn sau 204 scope hợp lệ | Session binding/expected-session, /me sau 204 trong ngân sách còn lại, bảo vệ phiên mới cùng owner; không Set-Cookie xóa cookie |
| Create atomicity | Transaction nguyên tử tổng quát | Giữ assertSucceededRequest đọc lại owner/key/hash/orderId trước commit, sai rollback cả kho mới |
| Bận khóa/lỗi | Chưa phân biệt đầy đủ | Create busy key 409 không retry kho; giữ 413/details giá/classifier v1 và remap index |
| Môi trường | Kế thừa tổng quát | Node24/Prisma7.10.1/PG17/bcrypt native6 cost12/lockfile |
| Tiến độ | Hạn và lead A2 còn mở | Hạn 15/11 do PO cung cấp, kế hoạch đề xuất/lead/reviewer/cổng nghiệm thu/buffer 13–14/11 |
| Truy vết | Mapping rải trong sáu tài liệu | Bổ sung docs/traceability-matrix.md, đủ FR/NFR; code/test chưa xác minh ghi chờ, không tạo kết quả PASS |
| Đầu ra A2 | Giữ PWA/CI/CD/production | Làm rõ health endpoint bắt buộc và chênh lệch layout apps/web–apps/api trước Task4 |

Giữ 17 FR, 12 NFR, 59 AC, 14 UC, hai extend, 10 lớp domain, năm API checkout. Năm nguồn sơ đồ/tám SVG tăng nhãn 0.5; activity/sequence tạo đơn bổ sung guard bận khóa/assert, không thêm sơ đồ, bảng hoặc dịch vụ. Không sửa Sprint 1/2/Sprint 3 hay code, không tạo PR hoặc giao việc thay các bạn.

## Lịch sử v0.3 — tham chiếu, không phải bản hiện hành

# Assignment 2 — Đồng bộ Sprint 3 v1.1

Ngày 05/11/2026 · gói nháp 0.3 · chưa là báo cáo nghiệm thu/code/test.

| Nội dung | Bản cũ | Bản hiện tại | Tệp ảnh hưởng |
|---|---|---|---|
| Giá checkout | API quote trước tạo đơn | Preview dự kiến → POST tạo PENDING → GET tổng chính thức → khách xác nhận payment riêng | Phạm vi, SRS BR-06/FR-07, UC M-02…06, activity, sequence, master legend |
| Kho | Product + Topping, reservation XOR | Chỉ Product theo ly; Topping vẫn cấu hình/giá/snapshot; productId bắt buộc/unique order-product | IN-09/OUT-02, BR-02/FR-14, UC, activity/sequence/class |
| Đọc payment | Contract bản cũ chưa đồng bộ | GET Order có latestPayment/null; không API đọc payment riêng; recovery replay đúng key/body trước GET Order | SRS, UC, activity/sequence, ghi chú contract |
| Thanh toán lại | Chưa nêu đầy đủ cạnh retry | PAYMENT_FAILED → PENDING → kết quả cuối cùng tx, không commit giữa/replay không tạo cạnh | AC-FR-13-1, UC A-06, activity/sequence |
| Transaction kho | Có savepoint minh họa | Precheck trước stock write, CAS conflict rollback whole tx/snapshot mới, tối đa 3 lượt tổng | Activity/sequence/class và contract |
| Owner | Guard phiên tổng quát | Expected owner được BFF so bằng chính token chuyển tiếp; API vẫn kiểm quyền | SRS NFR-03 và UC/sequence/contract |
| Expiry/pha chế | Chu kỳ/cách demo còn mở | Startup catch-up, tick60s/batch50; CLI cờ false mặc định; kiểm chứng còn chờ | Phạm vi, SRS O-03/FR-17, UC/activity/sequence |

Không cắt thêm hold15 phút, hủy PAID trước PREPARING kèm bù trừ, ưu đãi/điểm, idempotency, bảo vệ giỏ/owner, schema/canonical v2 hoặc chuyển tiếp legacy.

Giữ 17 FR, 12 NFR, 14 UC, hai extend, 10 lớp domain; mapping Payment→PaymentAttempt và LoyaltyTransaction→LoyaltyEntry. Tên lớp theo đề không tạo thêm bảng. Không sửa hồ sơ Sprint 1/2 hoặc code.

## Kiểm tra tài liệu và giới hạn

Các liên kết nội bộ, mã truy vết, nguồn sơ đồ và SVG được kiểm tra trong gói. Kết xuất sơ đồ là kiểm tra tài liệu; không thay test nghiệp vụ/HTTP/PostgreSQL hoặc nghiệm thu Task 1–2. Các tạo phẩm Task 3–5 và các điểm mở PWA/performance/production vẫn theo đề A2.

## Hiệu chỉnh 0.5 — 05/11/2026

- Chọn duy nhất UC-09 cho Task 1.3; không còn nhóm UC-08/09 đồng trọng tâm.
- Luồng thanh toán mới M-01…M-05: M-01 đọc Order; M-07…M-10 của v0.4 tương ứng M-02…M-05. Tạo đơn M-01…M-06 của v0.4 chuyển C-01…C-06 trong checkout-supporting-flows.md. Mã nhánh payment A-/E- còn áp dụng được giữ để truy vết.
- Nhánh tạo đơn A-02/03/04/07, E-03 chuyển C-A02/03/04/07, C-E03; hủy A-08 chuyển C-A08; tác vụ expiry C-X01. Thanh toán giữ A-01/05/06/07/09/10 và E-01/02/04/05/06/07.
- Đồng bộ SRS, scope, use-case source/SVG, nhãn sequence chính/bổ trợ, diễn giải activity/class, ma trận truy vết, README và kế hoạch/contract.
- Không đổi FR/NFR/AC/UC, API, dữ liệu, hold, recovery hay thiết kế S3 v1.2. Code/test vẫn CHỜ.

Các nhãn bước/nhánh M-/A-/E- ở bảng thay đổi lịch sử phía trên mô tả bản cũ; ánh xạ hiện hành dùng bảng này.
