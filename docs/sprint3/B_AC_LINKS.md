# S3-B-02: Liên kết 27 AC với ticket, lead, reviewer và bằng chứng

Phiên bản 1.0 ngày 06/11/2026. Nguồn: `docs/sprint3/TEST_MATRIX.md` v1.3 (lead của từng AC) và
`docs/sprint3/TEAM_PLAN.md` v1.3 (ticket, reviewer). **Cột ticket là gợi ý của B để nối AC với ticket;
lead xác nhận hoặc sửa trên PR đầu tiên chạm vào AC đó.** Reviewer lấy theo ticket gợi ý trong TEAM_PLAN mục 1 (reviewer gắn với ticket, không gắn với lead).

Quy tắc ghi (TEST_MATRIX mục 1, TEAM_PLAN mục 5–6):

- Mỗi AC một dòng. Trạng thái chỉ là `CHƯA CHẠY`, `PASS`, `FAIL` hoặc `BLOCKED`. **Tất cả đang `CHƯA CHẠY`.**
- Chuyển `PASS` chỉ khi có SHA + lệnh + expected/actual + link log/ảnh và reviewer đã ghi kết quả.
- Không đổi hàng loạt dựa trên một demo đường thành công. Chạy lại sau sửa thì thêm dòng mới (SHA mới), giữ dòng `FAIL` cũ.
- Cột `Task đề` là số Task 8/9/10 của đề mà AC thuộc về (theo TEST_MATRIX).

**Cập nhật 12/11/2026 (B):** chưa đổi trạng thái AC nào. Bản tích hợp #53 (`ff9bb73`) chỉ có `POST /orders`, `GET /orders/me`, `GET /orders/:id`; chưa có `POST /payments` và hủy đơn, nên các AC thanh toán/hủy/hết hạn chưa kiểm được. Phần tạo/đọc đơn có test đơn vị (web 945/945; API 50/54, 4 spec cần Prisma client), nhưng AC chỉ chuyển `PASS` khi có SHA, lệnh, expected/actual và log theo quy tắc trên.

| AC | Nội dung | Lead | Reviewer | Ticket (gợi ý) | Task đề | Trạng thái | SHA | Lệnh / log | Ghi chú lỗi còn lại |
|---|---|---|---|---|---|---|---|---|---|
| S3-PAY-01 | Thanh toán WALLET/CARD thành công, amount=Order.total | A | D | S3-A-02 | 8 | CHƯA CHẠY |  |  |  |
| S3-PAY-02 | Payment FAILED: Order PAYMENT_FAILED, kho/điểm không đổi | D | E | S3-D-01 | 8,10 | CHƯA CHẠY |  |  |  |
| S3-PAY-03 | Recovery key K1 không nhận nhầm kết quả K2 | A | D | S3-A-02 | 8,10 | CHƯA CHẠY |  |  |  |
| S3-PAY-04 | Idempotency create và payment đồng thời cùng key | D | E | S3-D-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-PAY-05 | Key payment đổi method/orderId → 409 | D | E | S3-D-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-PAY-06 | Hai key đồng thời: tối đa một success | D | E | S3-D-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-PAY-07 | Replay FAILED, key mới cùng Order, hạn không tăng | A | D | S3-A-02 | 8,10 | CHƯA CHẠY |  |  |  |
| S3-PAY-08 | Thanh toán sau hạn bị chặn, policy 1 không tự đổi | D | E | S3-D-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-ORD-01 | Chín cạnh trạng thái, terminal không đi tiếp | D | C | S3-D-02 | 10 | CHƯA CHẠY |  |  |  |
| S3-ORD-02 | Hủy/hoàn tiền/trả kho/thu hồi điểm một lần | D | C | S3-D-02 | 10 | CHƯA CHẠY |  |  |  |
| S3-ORD-03 | UI đọc Order hiện tại, không hạ version | B | A | S3-B-01 | 9 | CHƯA CHẠY |  |  |  |
| S3-ORD-04 | GET /orders/me đúng chủ, sắp xếp, rỗng | C | E | S3-C-02 | 9 | CHƯA CHẠY |  |  |  |
| S3-STK-01 | Hai create tranh Product cuối: tối đa một giữ được | E | D | S3-E-02 | 10 | CHƯA CHẠY |  |  |  |
| S3-STK-02 | Chỉ aggregate Product, rollback giữ dở, retry tối đa 3 | E | D | S3-E-02 | 10 | CHƯA CHẠY |  |  |  |
| S3-STK-03 | Rollback trước commit, sau commit replay không thêm | D | E | S3-D-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-PRO-01 | DEMO10: backend tính lại, 50.001 → giảm 5.000 → 45.001 | C | D | S3-C-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-PRO-02 | Đơn cũ giữ snapshot mã, đơn mới đánh giá lại | C | D | S3-C-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-LOY-01 | Điểm chỉ khi PAID một lần, hủy thu hồi đúng entry | C | D | S3-C-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-CART-01 | Giỏ giữ cấu hình, binding giữ tới PAID | A | B | S3-A-01 | 8 | CHƯA CHẠY |  |  |  |
| S3-CART-02 | Không tự POST sau login, recovery đúng chủ | A | B | S3-A-01 | 8,9 | CHƯA CHẠY |  |  |  |
| S3-CART-03 | Chỉ clear khi paid-current đúng tuple | A | B | S3-A-01 | 8 | CHƯA CHẠY |  |  |  |
| S3-CART-04 | UNRESOLVED giữ key/body, key mới chỉ sau FAILED xác nhận | A | B | S3-A-01 | 8,10 | CHƯA CHẠY |  |  |  |
| S3-CART-05 | Preview, kiểm kho, hiện tổng chính thức trước payment | A | D | S3-A-02 | 8,10 | CHƯA CHẠY |  |  |  |
| S3-SEC-01 | 404 chéo chủ, 403 mismatch không POST upstream | C | E | S3-C-02 | 8,9,10 | CHƯA CHẠY |  |  |  |
| S3-MIG-01 | Migration giữ dữ liệu legacy, policy 1 chỉ đọc | E | D | S3-E-01 | 10 | CHƯA CHẠY |  |  |  |
| S3-DEL-01 | Compose ba service, chạy máy khác, seed không reset kho | E | C | S3-E-03 | 9 | CHƯA CHẠY |  |  |  |
| S3-DEL-02 | SHA/command/actual/log, Review/Retro/backlog thật | B | D | S3-B-02 | 8,9,10 | CHƯA CHẠY |  |  |  |

## Tổng hợp theo lead

| Lead | Số AC | AC |
|---|---|---|
| A | 8 | S3-PAY-01, S3-PAY-03, S3-PAY-07, S3-CART-01, S3-CART-02, S3-CART-03, S3-CART-04, S3-CART-05 |
| B | 2 | S3-ORD-03, S3-DEL-02 |
| C | 5 | S3-ORD-04, S3-PRO-01, S3-PRO-02, S3-LOY-01, S3-SEC-01 |
| D | 8 | S3-PAY-02, S3-PAY-04, S3-PAY-05, S3-PAY-06, S3-PAY-08, S3-ORD-01, S3-ORD-02, S3-STK-03 |
| E | 4 | S3-STK-01, S3-STK-02, S3-MIG-01, S3-DEL-01 |

Tổng: 27 AC. Đối chiếu số lượng này mỗi lần cập nhật bảng để không sót AC.

## Hai AC của B

- **S3-ORD-03** (Task 9): giao diện đọc Order hiện tại, không hạ version. Phần UI có kiểm thử đơn vị trong `apps/web/src/features/orders/order-version.test.mjs` và `order-view-state.test.mjs`. Đó là test đơn vị với dữ liệu mẫu, **chưa phải bằng chứng PASS**: AC cần fixture thật (ledger lưu PENDING, đơn đã PAID/CANCELLED) qua backend C/D, chạy lại khi DEP-05/06 đạt.
- **S3-DEL-02** (Task 8, 9, 10): hồ sơ phát hành. Chỉ PASS khi các lệnh kiểm tra chạy thật trên SHA phát hành, PR đã review và Review/Retro/backlog được ghi từ sự việc thật (xem `B_REVIEW_RETRO_SPRINT3.md`).
