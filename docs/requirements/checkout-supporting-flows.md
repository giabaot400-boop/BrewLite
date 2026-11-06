# Ngữ cảnh hỗ trợ checkout — A2 v0.6

**06/11/2026 · Thiết kế kế thừa Sprint 3 v1.3.** Tài liệu hỗ trợ SRS và activity end-to-end, không phải đặc tả trọng tâm thứ hai của Task 1.3. [Đặc tả trọng tâm duy nhất: UC-09 Thanh toán không tiền mặt](use-case-checkout.md).

## 1. Tạo đơn làm đầu vào cho UC-09

UC-08 vẫn là use case trong master; không gộp hoặc đánh lại mã. Các bước C-01…C-06 dưới đây giữ nội dung tạo đơn của v0.4, đổi tiền tố để không bị nhầm với luồng chính thanh toán. Khi bắt đầu UC-09, đơn phải đã tồn tại; không gọi POST /orders lần nữa để thử lại payment.

| Bước ngữ cảnh | Khách hàng | Hệ thống và kết quả quan sát được | FR |
|---|---|---|---|
| C-01 | Mở giỏ và chọn tiếp tục đặt | Hiển thị món/tùy chọn/số lượng/tổng xem trước; xác nhận phiên/chủ, không bỏ qua pending chưa rõ | FR-03, FR-05 |
| C-02 | Xem giá dự kiến, tùy chọn nhập mã | UI tính preview từ giá giỏ và cấu hình DEMO10 cố định; ghi rõ dự kiến/chưa xác nhận hiệu lực mã. Không gọi API báo giá; backend sẽ kiểm tra khi tạo đơn | FR-07, FR-15 |
| C-03 | Chủ động chọn Tạo và xem đơn | Kiểm tra owner/cart revision/nội dung preview; lưu bền pending v2 bất biến gồm owner/key/body và expectedTotal trước POST. Nếu lưu không an toàn, dừng ở E-02 | FR-03, FR-07, FR-08 |
| C-04 | Chờ kết quả tạo đơn | Backend xác thực/validate, phân xử key và tra kết quả đã lưu trước việc tính lại giá/mã/kho. Với key mới, tính giá chính thức và đối chiếu xác nhận; kiểm tra/gộp số ly theo Product; Topping chỉ kiểm tra cấu hình/giá | FR-07, FR-08, FR-14, FR-15 |
| C-05 | — | Trong một transaction, giữ kho có kiểm soát đồng thời, tạo Order PENDING/snapshot/policy/hạn và ledger. Trước commit đọc lại owner/key/hash/orderId qua assertSucceededRequest; lệch thì rollback cả đơn/ledger/kho. Chỉ báo thành công sau commit | FR-07, FR-08, FR-13, FR-14 |
| C-06 | Xem đơn vừa tạo | UI ghi nhận kết quả đúng identity, gắn giỏ với orderId nhưng chưa dọn; GET /orders/:id để hiển thị mã/subtotal/discountTotal/total chính thức/hạn/hành động được phép trước khách xác nhận thanh toán | FR-03, FR-11 |

Giỏ không rỗng/hợp lệ, phiên đúng chủ, không pending chưa rõ hoặc binding chặn đặt mới và khả năng lưu an toàn là điều kiện của tạo mới. Backend vẫn kiểm tra lại giá/kho. Thành công là Order PENDING cùng snapshot/policy/hạn, giữ kho và ledger; giỏ vẫn giữ. Không commit tác động một phần khi lỗi. Chưa rõ kết quả phải giữ nguyên owner/key/body v1/v2 và replay chủ động; không dựng request từ giỏ mới.

## 2. Nhánh ngữ cảnh và tác vụ liên quan

Các mã C-Axx/C-Exx là mã nhánh hỗ trợ, không phải UC mới. Tham chiếu A-01/A-05…A-10, E-01/E-02/E-04…E-07 còn lại trong bảng thuộc đặc tả UC-09; C-A07 là replay tạo đơn mô tả ngay dưới bảng.

| Nhánh | Điều kiện và hành vi | Điểm tiếp tục/kết thúc | FR |
|---|---|---|---|
| C-A02 — C-04 | Khách nhập mã: backend kiểm tra hiệu lực/điều kiện và tính tổng. Mã không hợp lệ bị từ chối rõ, không âm thầm bỏ mã; sau tạo đơn, payment dùng snapshot ưu đãi đã chốt | Mã hợp lệ đi C-03/C-05; bị từ chối thì sửa/xem lại preview rồi chủ động xác nhận yêu cầu mới | FR-07, FR-15 |
| C-A03 — C-04 | Giá/tổng hoặc nội dung yêu cầu không còn khớp: chưa tạo đơn theo giá mới. Hiển thị thay đổi; nếu POST đã có từ chối hợp lệ đúng phiên bản, kết thúc pending đúng key trước khi chuẩn bị yêu cầu khác | Xem lại C-02 và xác nhận C-03 với key mới; request cũ chưa rõ đi C-E03 | FR-03, FR-07, FR-08 |
| C-A04 — C-04/C-05 | Hàng khả dụng không đủ: báo nguồn thiếu phù hợp; không commit phần giữ của nguồn khác. Không tự giảm số lượng hoặc bỏ topping để đặt | Khách sửa giỏ sau từ chối được xác nhận, rồi C-02; hoặc dừng | FR-07, FR-14 |
| C-A08 — Sau C-06 hoặc A-05/M-05 của UC-09 | Khách yêu cầu hủy: PENDING/PAYMENT_FAILED đủ điều kiện thì CANCELLED + release; PAID trước PREPARING thì hoàn mô phỏng toàn phần, return kho và reversal điểm nguyên tử. Giữ attempt SUCCEEDED gốc cùng metadata hoàn; từ PREPARING trở đi từ chối | Đọc Order hiện tại; CANCELLED chỉ mở khóa phần giỏ còn khớp, không chèn lại giỏ đã dọn. Hủy lặp không bù trừ thêm | FR-03, FR-13, FR-14, FR-16, FR-17 |
| C-E03 — C-03…C-06 | Timeout, mất response, response sai schema/không khớp identity hoặc 5xx: chưa rõ đã commit hay chưa. 409 ORDER_REQUEST_IN_PROGRESS cũng giữ pending/key/body để retry chủ động, không lồng retry kho vì key bận | Giữ đúng owner/key/body v1/v2; khách chủ động retry nguyên yêu cầu, không tính preview mới để sửa payload. Đã commit thì replay; chưa commit thì xử lý cùng key theo contract | FR-03/08; NFR-05/11 |

**C-A07 — Replay tạo đơn:** cùng chủ/key/body trả kết quả ledger gốc, không tính lại danh mục/giá/mã hoặc giữ kho lần hai. Khác body conflict; không sửa key/body để vượt conflict. Replay hợp lệ đi C-06; khi chưa rõ đi C-E03. Các nhánh C-A02/C-A03/C-A04 quay lại C-02/C-03 chỉ sau từ chối đã xác nhận. Auth/DTO/storage/rollback/owner tuân E-01/E-02/E-05/E-06 của UC-09 và contract theo operation, không có quyền bỏ guard cho tạo đơn.

**C-X01 — Hết hạn:** backend startup catch-up/tick60s/batch50, mỗi Order một transaction, lock/recheck policy2/status/deadline theo DB. Đơn chưa trả đủ điều kiện đến hạn thì release ACTIVE + CANCELLED/PAYMENT_WINDOW_EXPIRED nguyên tử; lỗi rollback/log và xử lý lại. GET chỉ đọc, browser đếm về 0 không tự release. Payment/expiry/cancel/advance PREPARING cùng Order lock, retry không gia hạn. Replay payment đã commit vẫn được phân xử theo key, không bị chặn bằng điều kiện lần mới.

**C-X02 — Lỗi ghi:** Order/ledger/kho tạo mới cùng transaction; assertSucceededRequest đối chiếu owner/key/hash/orderId trước commit. CAS/serialization/deadlock/unique đúng whitelist retry cả operation tối đa ba lượt trên snapshot mới, tra ledger lại; invariant lỗi không retry bừa. Bận advisory tạo đơn trả 409 ORDER_REQUEST_IN_PROGRESS và giữ identity; không là retry kho. Không chắp tác động legacy thiếu policy/reservation.

## 3. Nguồn và truy vết

FR-07/08/14/15: C-01…C-06, C-A02/03/04/07 và C-E03; FR-17/16: C-A08 và C-X01. Nguồn/hình bổ trợ ở [sequence tạo đơn và hủy/expiry](../diagrams/sequence-checkout.md); activity vẫn mô tả end-to-end. Các con số, API và helper tuân [contract S3 v1.3](../assignment2/CONTRACTS.md). Đây là thiết kế, chưa phải evidence code/test đã đạt.
