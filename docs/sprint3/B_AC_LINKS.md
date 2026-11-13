# S3-B-02: Liên kết 27 AC với ticket, lead, reviewer và bằng chứng

## Đối chiếu kỹ thuật cập nhật 12/11/2026

[A1_ACCEPTANCE_REVIEW.md](A1_ACCEPTANCE_REVIEW.md) nối đủ 27 AC với source và bằng chứng: 26 AC chức năng/triển khai có kết quả theo assertion được liệt kê; S3-DEL-02 còn review/phát hành. Boundary 7/7 trên d42deb5; source 3959f40 có frontend 960/960, legacy/session 9/9 nhóm và browser hồi quy 9 bước; JSON/log gốc được lưu riêng.

Bảng CHƯA CHẠY bên dưới là snapshot lập kế hoạch ngày 06/11, không phải kết luận hiện tại rằng chưa có test. Bảng rà mới phân biệt kết quả kỹ thuật và nghiệm thu nhóm; chưa ghi thay approval của các reviewer trong TEAM_PLAN. Dùng báo cáo mới khi review bản tích hợp; không đổi kết quả lịch sử thành đã PASS ở ngày cũ.


Cập nhật ngày 12/11/2026: [hồ sơ tích hợp](A1_WORKFLOW_HANDOVER.md), [báo cáo Windows](A1_WORKFLOW_WINDOWS_QA.md) và [báo cáo Compose/hiệu năng](A1_COMPOSE_PERFORMANCE_QA.md) bổ sung source, lệnh kiểm tra và bằng chứng thật. Compose đạt 8/8 nhóm, browser 9/9 bước; 330/330 mẫu API sau warmup dưới 500 ms trên `88f5f35`. Các kết quả này cần được nối với từng assertion/fixture của AC khi review; không chuyển cả 27 dòng sang PASS từ một lượt tổng hợp.

Bảng trạng thái bên dưới giữ snapshot khi lập hồ sơ, chưa cập nhật thành kết quả nghiệm thu mới. Các dòng CHƯA CHẠY không phủ nhận những lượt test đã được ghi trong báo cáo tổng hợp; việc cập nhật từng dòng cần SHA, bằng chứng và kết quả review tương ứng.


Phiên bản 1.0 ngày 06/11/2026. Nguồn: `docs/sprint3/TEST_MATRIX.md` v1.3 (lead của từng AC) và
`docs/sprint3/TEAM_PLAN.md` v1.3 (ticket, reviewer). **Cột ticket là gợi ý của B để nối AC với ticket;
lead xác nhận hoặc sửa trên PR đầu tiên chạm vào AC đó.** Reviewer lấy theo ticket gợi ý trong TEAM_PLAN mục 1 (reviewer gắn với ticket, không gắn với lead).

Quy tắc ghi (TEST_MATRIX mục 1, TEAM_PLAN mục 5–6):

- Mỗi AC một dòng. Trạng thái chỉ là `CHƯA CHẠY`, `PASS`, `FAIL` hoặc `BLOCKED`. **Tất cả đang `CHƯA CHẠY`.**
- Chuyển `PASS` chỉ khi có SHA + lệnh + expected/actual + link log/ảnh và reviewer đã ghi kết quả.
- Không đổi hàng loạt dựa trên một demo đường thành công. Chạy lại sau sửa thì thêm dòng mới (SHA mới), giữ dòng `FAIL` cũ.
- Cột `Task đề` là số Task 8/9/10 của đề mà AC thuộc về (theo TEST_MATRIX).

**Ghi nhận lịch sử 12/11/2026 (B), chỉ tại `ff9bb73`:** chưa đổi trạng thái AC nào. Bản này của #53 chỉ có `POST /orders`, `GET /orders/me`, `GET /orders/:id`; chưa có `POST /payments` và hủy đơn, nên B chưa kiểm được các AC thanh toán/hủy/hết hạn. Phần tạo/đọc đơn có test đơn vị (web 945/945; API 50/54, 4 spec cần Prisma client). Ghi nhận này không mô tả bản workflow đã merge; xem cập nhật 13/11 bên dưới.

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

## Đối chiếu cập nhật 13/11/2026

Workflow payment/cancel/refund/expiry/CLI đã có tại `88f5f35`; provider v2
được sửa tại `3959f40`. [Đối chiếu 27 AC trên main](https://github.com/giabaot400-boop/BrewLite/blob/88b4e12cf909226e9b376041d5da4205765b7649/docs/sprint3/A1_ACCEPTANCE_REVIEW.md)
ghi 26 AC chức năng/triển khai có bằng chứng trong phạm vi assertion đã nêu;
S3-DEL-02 còn hồ sơ/phát hành. Bảng CHƯA CHẠY ở trên giữ snapshot lập kế hoạch,
không phủ nhận các lượt QA đã có hoặc tự thay chữ ký reviewer từng ticket.

B review `a08152c` ở trạng thái COMMENTED: tự chạy web typecheck/lint và
960/960 test. Sau sửa, B [approve `f3f0ef7`](https://github.com/giabaot400-boop/BrewLite/pull/53#pullrequestreview-5884511329):
web lint/typecheck/960 test/build đạt; API 89/94, năm spec còn vướng Prisma
Client. Backend/PG/UI thật dựa vào hồ sơ A; không gán 181 backend hoặc 28 PG
thành các lượt B đã tự chạy. Approval `ff9bb73` chỉ thuộc bản cũ.

PR #53 đã merge `6f38fcb`; main sau #49/#51 là `88b4e12`. Không đổi hàng loạt
27 AC sang PASS từ approval PR hoặc một lượt demo; giữ SHA/image và giới hạn
của từng bằng chứng. Bản cập nhật tài liệu này không là một lượt chạy lại test.

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
