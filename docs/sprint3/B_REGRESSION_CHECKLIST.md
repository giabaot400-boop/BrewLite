# S3-B-02: Checklist hồi quy Sprint 1–2 và lệnh kiểm tra phát hành

## Kết quả bổ sung trên bản tích hợp

Source 3959f40: A chạy frontend 960/960, lint/typecheck/build mã 0; Docker frontend được build/recreate riêng và ba service healthy. Legacy/session đạt 9/9 nhóm, gồm 7 nhóm browser mới và runner hồi quy 9 bước; cleanup và kho có trước giữ nguyên. Xem [đối chiếu AC](A1_ACCEPTANCE_REVIEW.md) và [JSON/log gốc](testing/a1-final-qa-2026-11-12/README.md).

Các bảng và câu CHƯA CHẠY/CHƯA CÓ bên dưới giữ snapshot checklist ban đầu; backend hiện đã có `npm test --workspace apps/api`, `workflow-postgres.integration.ts`, `prisma/check-workflow-http.ts` và các script E. Kết quả backend/PG/HTTP được ghi theo đúng mốc tại handover, không suy từ build web. Chrome/Chromium và mobile viewport đã được thử; các dòng Safari/Firefox/screen reader thật tiếp tục chưa có bằng chứng.


Phiên bản 1.0 ngày 06/11/2026. Nguồn: `TEST_MATRIX.md` v1.3 mục 3 và `TEAM_PLAN.md` mục 6.
**Tất cả mục dưới đây đang `CHƯA CHẠY`.** Chỉ đổi sang PASS/FAIL khi có SHA + lệnh + actual + log.
Hồi quy là chạy lại phần Sprint 3 chạm tới; không mở lại lỗi Sprint 2 đã sửa và không sửa lịch sử test cũ thành "đã PASS".

## 1. Lệnh kiểm tra thật trong repository

Chạy từ thư mục gốc, Node ≥ 24.15.0 < 25 (theo `engines` và `.nvmrc`). Ghi version Node/npm và SHA khi chạy.

| # | Lệnh | Phạm vi | Ghi chú | Trạng thái | SHA | Log |
|---|---|---|---|---|---|---|
| 1 | `npm ci` | cả repo | Cài đúng lockfile | CHƯA CHẠY |  |  |
| 2 | `npm run lint` | frontend | | CHƯA CHẠY |  |  |
| 3 | `npm run typecheck` | frontend + backend | Backend cần `npm run db:generate` trước | CHƯA CHẠY |  |  |
| 4 | `npm test --workspace apps/web` | frontend | Hiện chạy `node --test` trên `src/**/*.test.mjs` | CHƯA CHẠY |  |  |
| 5 | `npm run build` | frontend + backend | | CHƯA CHẠY |  |  |
| 6 | `npm run db:validate` | backend | Cần `DATABASE_URL` hợp lệ | CHƯA CHẠY |  |  |
| 7 | Backend integration (D/E) | backend | **Chưa có script**: D/E phải thêm harness trước khi ghi lệnh vào kết quả | CHƯA CÓ |  |  |

Không ghi lệnh nào chưa tồn tại trong `package.json` như đã chạy.

## 2. Hồi quy Sprint 1

| Mục | Cách kiểm tra | Trạng thái | Bằng chứng |
|---|---|---|---|
| Menu hiển thị từ backend | Mở `/`, có ảnh/tên/giá | CHƯA CHẠY | |
| Chi tiết sản phẩm | Mở `/products/[id]`, size mặc định, giá cập nhật | CHƯA CHẠY | |
| Size/topping và tính giá | Ví dụ M + Kem 47.000; L + hai topping 57.000 | CHƯA CHẠY | |
| Chỉ topping gắn với Product | Chọn topping ngoài danh sách bị từ chối ở backend | CHƯA CHẠY | |
| Lỗi và thử lại | Tắt backend, menu/chi tiết hiện lỗi và phục hồi bằng "Thử lại" | CHƯA CHẠY | |

## 3. Hồi quy Sprint 2

| Mục | Cách kiểm tra | AC S3 liên quan | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| Đăng ký, đăng nhập, đăng xuất | Luồng cơ bản, thông báo lỗi đúng | S3-CART-02, S3-SEC-01 | CHƯA CHẠY | |
| 401 hết hạn / thu hồi phiên | Đề nghị đăng nhập, giữ giỏ theo chủ | S3-SEC-01 | CHƯA CHẠY | |
| 403 REQUEST_FORBIDDEN / P04 Origin | Sai Origin hoặc sai owner: không POST upstream | S3-SEC-01 | CHƯA CHẠY | |
| Logout A9 | 204 + scope; cookie không bị xóa bởi logout/me; giữ dữ liệu khi còn phiên sống | S3-SEC-01 | CHƯA CHẠY | |
| Giỏ hàng, qty, multi-tab | Hai tab cùng chủ, Web Lock, revision | S3-CART-01 | CHƯA CHẠY | |
| Pending v1/hash/ledger/price error | Replay cùng key, PRICE_CHANGED giữ details v1 | S3-PAY-04, S3-MIG-01 | CHƯA CHẠY | |
| Không tự POST sau login | Đăng nhập lại không tự gửi pending | S3-CART-02 | CHƯA CHẠY | |
| Schema lạ fail-closed | Envelope không rõ không bị ghi đè | S3-MIG-01 | CHƯA CHẠY | |
| ORDER-AC-08, S2-ORDER-01/12 | Chạy lại với kỳ vọng mới "giữ tới PAID", ghi **delta Sprint 3**, không sửa lịch sử cũ | S3-CART-01/03 | CHƯA CHẠY | |
| 409 ORDER_REQUEST_IN_PROGRESS | Khóa create bận: giữ pending/key/body, khách tự thử lại | S3-PAY-04 | CHƯA CHẠY | |

## 4. Kiểm tra giao diện phần B (S3-B-01)

Kiểm tra trên fixture (`NEXT_PUBLIC_ORDERS_SOURCE=mock`) và lặp lại với backend thật khi C/D/E tích hợp. Fixture không thay E2E.

| Mục | Cách kiểm tra | Trạng thái | Bằng chứng |
|---|---|---|---|
| Bảy trạng thái đều có nhãn/mô tả | Mở `/orders/ord-pending`, `ord-failed`, `ord-paid`, `ord-preparing`, `ord-ready`, `ord-done`, `ord-expired`, `ord-refunded` | Đã chạy trên fixture bằng Playwright (Chromium, 360 và 1280 px), chưa có backend thật | Script `docs/sprint3/scripts/b-orders-e2e.cjs` (hướng dẫn chạy ở đầu file); 44/44 PASS trên Node 22.22 ngày 08/11/2026; chạy lại trên Node 24 + ghi SHA trước khi ghi PASS chính thức |
| Đơn cũ (policy 1) chỉ xem | `/orders/ord-legacy` | Đã chạy trên fixture bằng Playwright (Chromium, Node 22.22 môi trường hỗ trợ của B, 08/11/2026); chưa chạy trên Node 24, chưa có backend thật | Script `docs/sprint3/scripts/b-orders-e2e.cjs`, ca tương ứng PASS (Node 22.22, 08/11/2026) |
| Chưa đăng nhập | `/orders` hiện lời mời đăng nhập có `next` và `reason=required` | Đã chạy trên fixture bằng Playwright (Chromium, Node 22.22 môi trường hỗ trợ của B, 08/11/2026); chưa chạy trên Node 24, chưa có backend thật | Script `docs/sprint3/scripts/b-orders-e2e.cjs`, ca tương ứng PASS (Node 22.22, 08/11/2026) |
| 404 không lộ dữ liệu | `/orders/id-la` | Đã chạy trên fixture bằng Playwright (Chromium, Node 22.22 môi trường hỗ trợ của B, 08/11/2026); chưa chạy trên Node 24, chưa có backend thật | Script `docs/sprint3/scripts/b-orders-e2e.cjs`, ca tương ứng PASS (Node 22.22, 08/11/2026) |
| Không cuộn ngang ở 360 px | Tất cả trang trên | Đã chạy trên fixture bằng Playwright (Chromium, Node 22.22 môi trường hỗ trợ của B, 08/11/2026); chưa chạy trên Node 24, chưa có backend thật | Script `docs/sprint3/scripts/b-orders-e2e.cjs`, ca tương ứng PASS (Node 22.22, 08/11/2026) |
| Replay create không đè trạng thái mới (S3-ORD-03) | Test đơn vị `order-version.test.mjs` | Test đơn vị PASS; **AC chưa chạy** với backend thật | |
| Đơn cũ không nói "đã giữ hàng" | `/orders/ord-legacy` không có câu giữ hàng/thanh toán trước hạn | Script như trên PASS (08/11) | |
| ID có `%` không đổi identity | `/orders/a%252Fb` hiện không tìm thấy; test đơn vị round-trip `orderPath` | Script + test đơn vị PASS; chưa E2E tới backend | |
| Lệch tài khoản: UI A, cookie B | Test BFF: binding không khớp → 403, không gọi backend | Test đơn vị PASS; **chưa chạy với auth thật hai tab** | |
| 401 khi đọc → đăng nhập lại | Nút "Đăng nhập lại" có `next`; `refresh()` đồng bộ auth | Phần link/`needsSessionResync` có test; **luồng với backend thật CHƯA CHẠY** | |
| Trình đọc màn hình thật | NVDA/VoiceOver | CHƯA CHẠY | |
| Safari / Firefox | | CHƯA CHẠY | |

## 5. Phát hành (TEAM_PLAN mục 6) — điều kiện, không phải kết quả

- build/typecheck/lint/test phù hợp chạy trên SHA phát hành;
- a/b/c và 27 AC có evidence (xem `B_AC_LINKS.md`);
- không lỗi quyền/kho/nhân giao dịch;
- Compose chạy trên máy khác; README có env/migrate/seed/demo;
- PR đã review; Review/Retro/backlog thật (xem `B_REVIEW_RETRO_SPRINT3.md`);
- mục chưa đạt ghi rõ trạng thái và ảnh hưởng.
