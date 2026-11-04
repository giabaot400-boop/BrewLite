# Sprint 2 — kết quả tích hợp và kiểm thử

Cập nhật ngày 04/11/2026. Phạm vi: giỏ hàng, đăng ký/đăng nhập/đăng xuất, phiên JWT và tạo đơn PENDING (Task 5–7).

## Trạng thái và mốc triển khai

| Hạng mục | Phiên bản | Trạng thái tại thời điểm tổng hợp |
|---|---|---|
| Nền Sprint 2 | PR [#24](https://github.com/giabaot400-boop/BrewLite/pull/24), merge `ec042b5` | Đã tích hợp vào main sau review của B. Tree trùng bản được review `d5712de`. |
| Hiệu năng auth | PR [#26](https://github.com/giabaot400-boop/BrewLite/pull/26), `38cecc5` | Đã kiểm tra; đang chờ review/merge. |
| Nhất quán Order/ledger | Nhánh `fix/sprint2-orders-invariant`, `0c37393` | Đã push; ORDER-08/10 đạt trên PostgreSQL thật. Chưa có PR trong danh sách PR mở tại thời điểm tổng hợp. |
| Hồ sơ Sprint 2 | Nhánh `docs/sprint2-closeout` | Đang hoàn thiện để review và ghi quyết định nghiệm thu của PO. |

Yêu cầu đối chiếu là đặc tả Sprint 2 v0.6 và bộ sơ đồ đi kèm: 4 user story, 36 AC, 37 mã kiểm thử. File thiết kế được giữ làm baseline; kết quả chạy được ghi trong hồ sơ này. Product API, dữ liệu danh mục và migration Sprint 1 tiếp tục được sử dụng.

Lịch 28/10–03/11/2026 là lịch đề xuất đã được A duyệt để nhóm xác nhận khả năng đáp ứng. Mốc tích hợp thực tế là 04/11/2026. Lịch sử đóng góp được giữ trong các PR: E phụ trách schema/lock, C xác thực, D tạo đơn, B UI dùng chung, A giỏ hàng và tích hợp các luồng.

## Phương pháp và nguồn kết quả

Bằng chứng gồm unit test với I/O giả lập, kiểm tra service/HTTP với PostgreSQL thật và thao tác giao diện. Mỗi dòng AC/TC ghi phương pháp và phần bao phủ tương ứng. Số test tự động thuộc các bộ khác nhau, không cộng thành số ca nghiệm thu. Các nhãn “Có kết quả”, “Một phần” và “Đối chiếu UI/code” thể hiện mức bằng chứng, không thay quyết định nghiệm thu của PO.

| Mã | Nguồn và kết quả | Phương pháp, phạm vi |
|---|---|---|
| V01 | [Giỏ hàng A3](SPRINT2_A_CART_STEP3.md): thêm/gộp cà phê sữa M + kem, 2 ly, 47.000đ/ly, tổng 94.000đ; hai tab đồng bộ; liên kết Xem menu hoạt động. | Thao tác giao diện do A thực hiện. Các biến thể khác cấu hình và xóa dòng còn theo bảng AC/TC. |
| V02 | Frontend 315/315 tại `d5712de`; A ghi nhận test/build đạt, B ghi nhận test/typecheck/lint/build đạt. Backend tại mốc trước A9: 34/34 (auth 21, canonical 6, OrdersService 7). | Unit dùng I/O/Prisma giả. Bộ DOM 21/21 thuộc mốc `11d0da7`, dùng auth/network/storage giả lập. |
| V03 | HTTP cơ bản 9/9 và biên phiên 22/22: register/login/me/create/replay/logout; JWT/DB hết hạn, thiếu session, sai owner. | NestJS 3002/PostgreSQL `brewlite_s2_a_auth_test`, A thực hiện. Fixture hết hạn được sửa sang UTC trước lượt 22/22. |
| V04 | [BFF owner](SPRINT2_A_ORDERS_BFF_OWNER_CONTRACT.md): 22/22; owner không khớp bị chặn trước POST; tạo 201/replay 200, một Order/ledger. | BFF–NestJS–PostgreSQL thật; script điều khiển cookie jar và storage/locks. Kết quả theo log A. |
| V05 | [UI đặt đơn](SPRINT2_A_ORDER_UI_STEP1.md): PENDING/reload; offline trước gửi và retry key cũ; đổi giá và xác nhận key mới; lỗi topping đúng dòng; pending qua logout/login; nhiều tab; dialog/focus/bố cục. | A thực hiện thao tác UI, quan sát key. Luồng mất response sau commit được kiểm tra riêng tại V11. |
| V06 | [E kiểm tra lại auth](SPRINT2_E_AUTH_SESSION_FIX_VERIFICATION.md), PR [#25](https://github.com/giabaot400-boop/BrewLite/pull/25), code `fe1cce2`: auth 21/21; HTTP PostgreSQL với phiên thu hồi/thiếu/hết hạn DB/sai owner; AUTH-E-01 đạt. | Báo cáo của E đã cherry-pick thành `4ef5e4f` trên nhánh docs. JWT tự hết hạn qua HTTP và BFF/UI nằm ngoài báo cáo này. Lần đăng ký nhầm DB đã được loại khỏi kết quả. |
| V07 | Báo cáo E ở PR [#19](https://github.com/giabaot400-boop/BrewLite/pull/19), `b5ddecc`: service/PG 11/11 tại Orders `fecea6b`. PR [#22](https://github.com/giabaot400-boop/BrewLite/pull/22), `3ea59f2`: HTTP auth/orders tại `3bfa4fb`, tổng 94.000đ, đối chiếu Order/ledger và biên ASCII password. | Tham chiếu báo cáo theo PR. IT-D11 dùng P2034 giả lập; ca retry thật dùng timeout 10s. V13 bổ sung ca tại try-lock với timeout 2s. AUTH-E-01 cũ được cập nhật bằng V06. |
| V08 | [B review APPROVED](https://github.com/giabaot400-boop/BrewLite/pull/24#pullrequestreview-5763029365) tại `d5712de`: migrate/seed/dev, register/login, F5 giữ giỏ/phiên, hủy/logout, PENDING, bàn phím/responsive; 315 test và typecheck/lint/build đạt. | Windows, Node 24.17.0, Docker PostgreSQL 17, backend 3001/frontend 3000. Chưa dùng trình đọc màn hình. Header 360px xuống dòng là góp ý không chặn merge. |
| V09 | [Logout A9](SPRINT2_A_AUTH_CART_BRIDGE_STEP2.md): trước sửa 0/2, sau sửa 2/2; UI hủy logout, dọn giỏ sau logout và F5/login lại không khôi phục món. | BFF/NestJS/PG thật; script Node điều khiển cookie jar/coordinator/storage. Báo cáo: `BrewLite_S2_A9_Logout_Result_1793757009084.json` và `BrewLite_S2_A9_Logout_Result_1793759848952.json`; kết quả theo console A. |
| V10 | [Auth UI ban đầu](SPRINT2_B_AUTH_UI.md): B ghi nhận 45 test và Playwright mock cho register/login/next, focus lỗi, dialog và responsive. | Mốc trước tích hợp backend thật; kết quả tích hợp sau đó nằm ở V08. |
| V11 | `BrewLite_S2_Closeout_Result_1793781471823.json`: 9/9 kiểm tra chức năng; 40 mẫu thời gian. Cùng key/hai owner, replay giá cũ và retry sau mất response đều đạt. | Đã đối chiếu JSON gốc; HTTP trực tiếp NestJS/PostgreSQL. Trước sửa hiệu năng, 3/40 mẫu vượt 500ms. |
| V12 | `BrewLite_S2_Auth_Performance_Result_1793784786074.json`: 5/5 chức năng, 20/20 mẫu auth dưới 500ms; login hash bcryptjs cost 12 cũ không ghi lại hash. A ghi nhận 37/37 test auth, typecheck/build/diff check đạt. | Đã đối chiếu JSON gốc; Windows/Node 24.16.0, NestJS 3002/PostgreSQL test. Đo tuần tự trực tiếp NestJS. |
| V13 | `BrewLite_S2_Orders_Closeout_Result_1793788614915.json`: 10/10 kiểm tra thuộc ORDER-08/10. Nhánh sửa lưu tại `0c37393`. | Đã đối chiếu JSON gốc; OrdersService/Prisma/PostgreSQL 17.11 thật, Windows/Node 24.16.0. Không qua HTTP/UI. Bộ canonical/service 19/19 và backend typecheck/build cũng đạt trong môi trường triển khai Linux; cùng công cụ đạt 10/10 trên PostgreSQL 17.6. |

## Đối chiếu 36 AC

| AC | Nội dung rút gọn | Mức bằng chứng | Đối chiếu/giới hạn |
|---|---|---|---|
| CART-AC-01 | Khách thêm món, hiển thị cấu hình/dòng | Có kết quả | V01/V05/V08: thêm món và giỏ; unit xác thực draft. |
| CART-AC-02 | Gộp theo product/size/tập topping | Có kết quả | V01: UI 2 ly cùng cấu hình; V02: đảo thứ tự topping. |
| CART-AC-03 | Khác cấu hình tạo dòng riêng | Có kết quả unit | V02 reducer; V01 còn thiếu ghi nhận UI riêng cho từng biến thể. |
| CART-AC-04 | Cộng/trừ từng 1, tối thiểu 1 | Một phần | V02 reducer đạt; chưa có ghi nhận riêng nút trừ disabled tại 1 trên UI thật. |
| CART-AC-05 | Xóa đúng dòng, giữ dòng khác | Có kết quả unit | V02 reducer; chưa có ghi nhận UI riêng đủ chi tiết về xóa từng dòng. |
| CART-AC-06 | Đơn giá/thành tiền/tổng VND | Có kết quả | V01: 47.000đ/ly, 2 ly = 94.000đ; V02 kiểm tra công thức nhiều dòng. |
| CART-AC-07 | Badge tổng ly, rỗng bằng 0 | Có kết quả | V01/V08/V09: thêm/đồng bộ/logout; V02 tổng ly khác số dòng. |
| CART-AC-08 | Giữ giỏ qua điều hướng/reload | Có kết quả | V08 F5 giữ phiên và giỏ; V02 storage và owner. |
| CART-AC-09 | Thêm mỗi lần 1 ly, thông báo, ở lại chi tiết | Có kết quả | V01 UI thêm/gộp; V02 draft/reducer. |
| CART-AC-10 | Giỏ rỗng chặn đặt mới, retry pending cũ | Có kết quả | V01 nút Xem menu; V05 retry sau logout từ giỏ rỗng; V02 chặn đặt mới. |
| REG-AC-01 | Ba ô bắt buộc, mật khẩu che ký tự | Đối chiếu UI/code | V08 review form thật; components/register-form.tsx. Chưa có kết quả riêng từng thuộc tính. |
| REG-AC-02 | Lỗi nhập liệu chặn gửi ở frontend | Có kết quả | V02 validation; V10 báo kiểm tra form/focus bằng trình duyệt mock. |
| REG-AC-03 | Backend kiểm tra, email trùng không tạo thêm | Có kết quả | V07 HTTP email trùng; V02 backend register; V08 đăng ký thật. |
| REG-AC-04 | Đang xử lý, khóa nút đăng ký | Một phần | Code form có busy/disabled; V10 mock. Chưa ghi riêng lượt request chậm trên UI thật. |
| REG-AC-05 | Thành công chuyển login, không tự login/đặt | Có kết quả | V08 UI đăng ký/login; V02 register không cấp phiên; V10 luồng chuyển trang. |
| REG-AC-06 | Thất bại/mạng: giữ form, báo lỗi và thử lại | Có kết quả giả lập | V02 auth-client/auth-error; V10 form; chưa có đủ biến thể mạng trên UI thật. |
| REG-AC-07 | Giữ giỏ và đích quay lại qua register/login | Có kết quả | V05 giỏ khách/login; V02 return-to/owner; V10 mock next. Riêng thất bại đăng ký giữ giỏ chưa có log UI thật. |
| REG-AC-08 | 15 code point, tối đa 72 byte, không trim | Có kết quả unit backend/frontend; HTTP một phần | V02 frontend; V07 HTTP biên ASCII. V12 bổ sung test AuthService thật với Prisma giả cho ASCII/Unicode/emoji 72 byte, dấu cách, NUL và surrogate; HTTP xác nhận hash cost 12. Chưa có HTTP riêng cho mọi biến thể Unicode. Bản sửa ở PR #26. |
| LOGIN-AC-01 | Hai ô bắt buộc, mật khẩu che | Đối chiếu UI/code | V08 form thật; components/login-form.tsx. |
| LOGIN-AC-02 | Thiếu/sai email bị chặn trước HTTP | Có kết quả | V02 validateLogin; V10 form mock. |
| LOGIN-AC-03 | Sai thông tin: lỗi chung, có thể thử lại | Có kết quả | V07 HTTP INVALID_CREDENTIALS; V02 ánh xạ thông báo. |
| LOGIN-AC-04 | Đang xử lý, khóa nút login | Một phần | Code form + V10 mock; chưa có log riêng thao tác bấm liên tục khi request chậm trên UI thật. |
| LOGIN-AC-05 | Từ đặt hàng về giỏ, không auto-order | Có kết quả | V05 UI guest/login; V02 coordinator/return-to, không POST khi read/login. |
| LOGIN-AC-06 | Thất bại/mạng: giữ trang và giỏ | Có kết quả giả lập | V02 auth-client/auth-session/bridge; V07 sai mật khẩu. Chưa có đầy đủ biến thể UI thật. |
| LOGIN-AC-07 | Login trực tiếp về menu, từ giỏ về giỏ | Có kết quả | V05/V08 thao tác UI và V02 return-to; V10 mock next. |
| LOGIN-AC-08 | Đơn gặp phiên hết hạn: giữ giỏ, login lại, không auto-send | Một phần | V03 HTTP JWT/DB expiry chặn orders; V02 client/bridge giữ pending. Chưa có lượt UI thật đầy đủ riêng cho chuỗi hết hạn → login → xác nhận. |
| ORDER-AC-01 | Xác thực; mới từ giỏ có món, retry đúng owner/snapshot | Có kết quả | V04 A cookie B bị chặn; V05 retry giỏ rỗng; V02 điều kiện đặt. |
| ORDER-AC-02 | Validate món/size/topping/qty, sai không tạo | Có kết quả | V05 lỗi topping đúng dòng qua API; V07 món sai; V02 backend/unit. HTTP từng biến thể DTO chưa được kiểm tra riêng. |
| ORDER-AC-03 | Backend tính tiền chính thức | Có kết quả | V07 tổng 94.000đ; V05 đổi giá thật; V02 OrdersService. |
| ORDER-AC-04 | Order đủ món, đúng user, PENDING, atomic | Có kết quả HTTP/DB | V04/V07 đối chiếu owner, ledger và snapshot; V13 kiểm tra rollback khi lỗi giữa các bước và khi cố ghi lệch owner/key/hash. |
| ORDER-AC-05 | Đang tạo đơn và khóa đặt hàng | Có kết quả | V05 UI theo A; V02 controller double-click/phase; V08 dialog/create order. |
| ORDER-AC-06 | Mã đơn, tổng chính thức, Chờ thanh toán | Có kết quả | V05/V08 UI PENDING và reload; V04/V07 response/DB. |
| ORDER-AC-07 | Thất bại xác định: báo lỗi, giữ giỏ | Có kết quả | V05 validation theo dòng thật; V02 phản hồi/settlement. |
| ORDER-AC-08 | Chỉ dọn giỏ khớp khi thành công | Có kết quả | V05 thành công/giá đổi/offline; V02 settlement owner/revision và phản hồi muộn. |
| ORDER-AC-09 | Giá đổi: chưa tạo, cập nhật, xác nhận mới | Có kết quả | V05 PRICE_CHANGED → xác nhận key mới → PENDING; V02 settlement. |
| ORDER-AC-10 | Mất mạng/timeout: UNKNOWN, retry cùng key/payload, một đơn | Có kết quả HTTP và giả lập | V11 chủ động ngắt response sau backend 201, retry cùng key/body trả 200 đúng một Order/ledger; V05 offline/retry UI; V02 timeout/payload bất biến. Ca mất response sau commit được thực hiện bằng proxy Node. |

## Đối chiếu 37 ca kiểm thử

Giữ nguyên 37 mã của v0.6. Các biến thể được tổng hợp trong mã tương ứng.

| TC | Nội dung rút gọn | Kết quả hiện có | Đối chiếu/biến thể còn thiếu |
|---|---|---|---|
| S2-CART-01 | Thêm một ly khách | Có kết quả | V01/V02: thêm, cấu hình, thông báo và badge. |
| S2-CART-02 | Gộp và đảo topping | Có kết quả | V01 UI gộp; V02 đảo topping. |
| S2-CART-03 | Khác cấu hình | Có kết quả unit | V02; UI từng biến thể chưa có kết quả riêng. |
| S2-CART-04 | Cộng/trừ, disabled tại 1 | Một phần | V02 logic đạt; phần disabled UI chưa ghi riêng. |
| S2-CART-05 | Xóa dòng/món cuối và trạng thái rỗng | Một phần | V02 logic đạt, V01 Xem menu hoạt động; chưa có mô tả đủ riêng lượt xóa cuối trên UI. |
| S2-CART-06 | Giá nhiều dòng/VND | Có kết quả | V01 2 × 47.000đ; V02 công thức nhiều dòng. |
| S2-CART-07 | Điều hướng/reload, storage lỗi, nhiều tab | Một phần | V08 F5; V01/V05 nhiều tab; V02 lỗi storage/lock giả lập. Không có đủ lượt trình duyệt thật cho mọi lỗi storage. |
| S2-CART-08 | Qua đăng ký/login từ giỏ | Có kết quả | V05/V10 + V02 return-to và guest adoption. |
| S2-CART-09 | Logout/hủy/hết hạn/đổi owner/pending | Một phần | V05/V08/V09 logout/hủy/pending; V03 expiry API, V02 owner transition. Chưa đủ mọi biến thể UI thật. |
| S2-AUTH-01 | Register hợp lệ, busy/hash/redirect | Chức năng có kết quả; NFR đạt trong mẫu sau sửa | V08/V10 UI; V11 có mẫu vượt ngưỡng. V12 register 5/5 dưới 500ms, max 385,749 ms, hash DB cost 12. Busy/redirect khi chậm mới có báo cáo mock. Bản sửa chờ merge #26. |
| S2-AUTH-02 | Input sai, API sai, masked fields | Một phần | V02 validation; V10 form; chưa có bảng HTTP từng sai kiểu/field. |
| S2-AUTH-03 | Biên ký tự/byte/Unicode/dấu cách | Có kết quả unit backend/frontend; HTTP một phần | V07 HTTP ASCII; V02 frontend; V12 test AuthService với Prisma giả thực thi các biên ASCII/Unicode/emoji/dấu cách, NUL/surrogate và tương thích hash. HTTP/PostgreSQL chưa bao phủ riêng mọi biến thể. |
| S2-AUTH-04 | Email trùng | Có kết quả HTTP | V07 E báo 409 sau normalize; không thêm tài khoản. |
| S2-AUTH-05 | Login, phiên 1h, HttpOnly, không JWT ở JSON UI | Chức năng một phần; NFR đạt trong mẫu sau sửa | V11 có mẫu vượt ngưỡng. V12 login 5/5 dưới 500ms, max 387,496 ms; TTL 3600s và hash cũ hoạt động. V04/V08 BFF login thật; policy HttpOnly đọc code, chưa có log riêng thuộc tính cookie trong trình duyệt. Bản sửa chờ merge #26. |
| S2-AUTH-06 | Sai thông tin, không cấp phiên, giữ giỏ | Có kết quả | V07 HTTP sai password; V02 client/error/bridge; chưa có log UI riêng mọi biến thể. |
| S2-AUTH-07 | Reload/me, expiresAt không đổi | Có kết quả | V08 F5 giữ phiên/giỏ; V07 me giữ expiresAt; V02 stale /me. |
| S2-AUTH-08 | Phiên hết hạn, giữ giỏ, không auto-order | Một phần | V03 HTTP JWT và DB expiry; V02 bridge/owner. Chuỗi UI đầy đủ chưa ghi riêng. |
| S2-AUTH-09 | Orders thiếu/sửa token/thu hồi | Có kết quả HTTP | V03/V06/V07; AUTH-E-01 cũ đã sửa và E retest. |
| S2-AUTH-10 | Logout có món, hủy, giỏ rỗng | Một phần | V08/V09 có món/hủy; V02 nhánh rỗng. Chưa có ghi nhận riêng UI giỏ rỗng đăng xuất trực tiếp. |
| S2-AUTH-11 | Logout hết hạn/thu hồi/thiếu/hỏng token/đổi secret | Một phần; có hiệu đính | V03 JWT expiry/revoke; V02 handler/session. Chưa có đủ HTTP mọi biến thể; yêu cầu xóa cookie vật lý đã được PO hiệu đính tại V09. |
| S2-AUTH-12 | Login lại cùng/khác owner và điều hướng | Một phần | V05/V08 cùng owner/pending; V02 khác owner; V04 cookie mismatch. Ca nhiều tab trình duyệt thật chưa được kiểm tra riêng. |
| S2-AUTH-13 | Mạng/DB/timeout của auth, scope | Có kết quả giả lập | V02 deadlines/body/network/DB errors và giữ dữ liệu. Chưa có đầy đủ lỗi hệ thống HTTP/browser thật. |
| S2-AUTH-14 | CSRF | Có kết quả | V04 Origin sai bị 403 trước POST orders; V02 marker/media type/origin. Lỗi APP_ORIGIN local đã khắc phục, không tính là ca CSRF đủ mọi biến thể. |
| S2-ORDER-01 | 2 ly M + kem = 94.000đ, busy | Có kết quả | V07 E HTTP 201/tổng 94.000đ; V01 giá cart; V05/V08 UI PENDING; V02 busy. |
| S2-ORDER-02 | Nhiều cấu hình, có dòng không topping | Một phần | V02 backend/reducer; V05 giỏ hai món dùng kiểm tra lỗi. Chưa có đối chiếu DB đầy đủ đơn nhiều cấu hình/no-topping. |
| S2-ORDER-03 | Giỏ rỗng, qty 0/âm/lẻ | Có kết quả logic; HTTP một phần | V02 chặn giỏ và qty; chưa có log API thật đầy đủ từng qty. |
| S2-ORDER-04 | Món sai + giá đổi, index lỗi | Một phần | V05 lỗi topping đúng dòng thật; E báo replay index; code validate trước price. Chưa có log rõ ca đồng thời món sai và giá đổi. |
| S2-ORDER-05 | Giá đổi trước đặt | Có kết quả HTTP/UI | V05 fixture đổi giá thật, giữ cấu hình, xác nhận key mới. |
| S2-ORDER-06 | Giá client thấp | Có kết quả | V07 service PRICE_CHANGED/REJECTED; V02 backend không lấy expectedUnitPrice làm giá chính thức. |
| S2-ORDER-07 | Thiếu/hết hạn/thu hồi auth | Có kết quả HTTP; UI một phần | V03/V06; giữ giỏ ở V02/V05. Chuỗi UI hết hạn chưa đủ. |
| S2-ORDER-08 | Rollback và cố ghi cặp Order/ledger sai | Có kết quả service/PostgreSQL | V13: lỗi giữa hai bước ghi và sáu trường hợp lệch owner/key/hash ở Order hoặc ledger đều rollback cả Order, snapshot và ledger. Cặp hợp lệ tạo và replay thành công. |
| S2-ORDER-09 | Replay SUCCEEDED | Có kết quả HTTP/DB | V03/V04/V07: cùng mã đơn, một Order/ledger. |
| S2-ORDER-10 | Đồng thời/snapshot cũ tại try-lock | Có kết quả service/PostgreSQL | V13 tái hiện snapshot cũ ở statement try-lock đầu tiên: đã lấy được lock nhưng chưa thấy ledger; P2002/23505 thật buộc mở transaction mới. SUCCEEDED và REJECTED đều hoàn tất sau 2 lượt, timeout 2s/maxWait 1s. Nhánh P2034 giả lập theo V07. |
| S2-ORDER-11 | Conflict và replay lỗi đảo dòng | Có kết quả service; HTTP một phần | E báo conflict và replay index; V02 canonical/unit; chưa có bộ HTTP từng biến thể. |
| S2-ORDER-12 | Mất phản hồi/403/413/5xx/timeout/body sai | Có kết quả HTTP và giả lập | V11 mất response sau backend success, DB có đơn/ledger, explicit retry trả 200 cùng mã; V04 403/413 thật; V05 offline/retry UI; V02 giả lập 5xx/timeout/body. Các biến thể browser thật còn theo phạm vi V05/V08. |
| S2-ORDER-13 | Giá đổi sau tạo, replay giá cũ | Có kết quả HTTP/DB | V11 tạo đơn 35.000đ với sản phẩm fixture riêng, tăng giá danh mục lên 40.000đ, retry body/key cũ trả cùng đơn/tổng 35.000đ; DB snapshot unit_price vẫn 35.000đ. |
| S2-ORDER-14 | Hai owner cùng key, phục hồi pending | Có kết quả HTTP và UI/giả lập | V11 hai owner đều tạo thành công bằng cùng UUID, hai mã đơn khác nhau và ledger khớp từng owner; V04 mismatch; V05 phục hồi pending owner cũ. |

## Đo hiệu năng API

Máy A: Windows 10 x64, Intel i5-6200U @ 2.30GHz, 4 CPU logic, RAM 19,87 GiB, Node 24.16.0. Database test `brewlite_s2_a_auth_test`; endpoint NestJS `http://127.0.0.1:3002`. Thời gian tính từ lúc bắt đầu fetch đến khi đọc hết response; mỗi nhóm gồm 5 request tuần tự. Các bước chuẩn bị dữ liệu và kiểm tra biên nằm ngoài mẫu đo.

### Trước sửa hiệu năng auth — V11

JSON ghi source HEAD `4ef5e4f`, ban đầu 4 sản phẩm mẫu. Kiểm tra chức năng 9/9 đạt; hiệu năng có 3/40 mẫu vượt ngưỡng: register 1/5 và login 2/5.

| Nhóm API | n | Min (ms) | Mean (ms) | Max (ms) | Kết quả mẫu <500ms |
|---|---|---|---|---|---|
| GET /products | 5 | 4,549 | 12,899 | 44,551 | Đạt |
| GET /products/coffee-milk | 5 | 5,880 | 10,344 | 26,879 | Đạt |
| POST /auth/register | 5 | 421,736 | 480,295 | 660,450 | 4/5 đạt |
| POST /auth/login | 5 | 448,087 | 498,598 | 545,187 | 3/5 đạt |
| GET /auth/me | 5 | 4,622 | 5,142 | 5,683 | Đạt |
| POST /orders — create | 5 | 15,911 | 39,024 | 128,862 | Đạt |
| POST /orders — replay | 5 | 7,481 | 8,978 | 12,212 | Đạt |
| POST /auth/logout | 5 | 3,915 | 5,837 | 11,802 | Đạt |

Chín kiểm tra chức năng xác nhận backend và DB test khớp phiên; Product API; hash đăng ký cost 12; TTL và /me không gia hạn; 5 cặp create/replay, mỗi key một Order/ledger; hai owner dùng cùng UUID nhưng nhận hai đơn khác nhau; replay giữ giá và snapshot ban đầu; retry sau mất response trả cùng đơn; logout thu hồi phiên.

Ca mất response dùng proxy đọc hết response 201 từ NestJS rồi đóng kết nối trước khi client nhận header. Client thử lại cùng key/body nhận 200 và cùng mã đơn; DB có một cặp Order/ledger. Ca thay giá dùng riêng sản phẩm fixture `[S2 test] Replay price`, từ 35.000đ lên 40.000đ; replay vẫn trả đơn và snapshot 35.000đ. Script giữ dữ liệu test và không thay bốn sản phẩm dùng demo.

### Sau sửa hiệu năng auth — V12

Runtime chuyển sang bcrypt native 6.0.0, giữ cost 12. JSON ghi thời điểm bắt đầu 16:33:01 ngày 04/11/2026 (UTC+7). Kiểm tra chức năng 5/5 đạt; 20/20 mẫu auth dưới 500ms.

| API | n | Min (ms) | Mean (ms) | Max (ms) | Kết quả mẫu <500ms |
|---|---|---|---|---|---|
| POST /auth/register | 5 | 340,349 | 350,860 | 385,749 | 5/5 đạt |
| POST /auth/login | 5 | 339,869 | 359,898 | 387,496 | 5/5 đạt |
| GET /auth/me | 5 | 3,561 | 4,037 | 4,416 | 5/5 đạt |
| POST /auth/logout | 5 | 4,211 | 6,361 | 13,011 | 5/5 đạt |

V12 xác nhận đăng ký lưu hash cost 12, hash cũ vẫn đăng nhập được mà không ghi lại, TTL/expiration giữ nguyên qua /me và logout thu hồi phiên. Chi tiết số đo từng lần được ghi trong `docs/SPRINT2_AUTH_PERFORMANCE.md` của PR #26.

V11 và V12 là hai lượt đo riêng; kết quả sau sửa áp dụng cho 20 mẫu auth của V12. Các số đo Product API và Orders ở bảng V11 thuộc phiên bản trước bản sửa nhất quán Order/ledger. Hai lượt đo không phải kiểm thử tải hoặc thời gian BFF/UI.

## Kiểm tra nhất quán dữ liệu và retry — V13

V0.6 P07 yêu cầu Order và OrderRequest có cùng owner/key/hash trước commit. Code trước sửa ghi các giá trị từ cùng đầu vào nhưng thiếu bước đối chiếu dữ liệu đã lưu. Bản sửa đọc lại cặp bản ghi trong cùng transaction và phát sinh lỗi để rollback nếu lệch; API, schema và thời hạn transaction được giữ nguyên.

Báo cáo V13 bắt đầu lúc 17:36:53 ngày 04/11/2026 (UTC+7), PostgreSQL 17.11. Có 10 kiểm tra đạt:

- Một cặp hợp lệ tạo và replay đúng một Order.
- Lỗi giữa bước ghi Order và ledger rollback cả Order, các snapshot và ledger.
- Sáu trường hợp cố ghi lệch owner/key/hash ở một trong hai bản ghi đều rollback.
- Hai ca snapshot cũ tại statement try-lock đầu tiên, với kết quả SUCCEEDED và REJECTED, đều retry thành công.

Ca snapshot sử dụng hai kết nối Prisma và một kết nối điều khiển khóa advisory riêng. Sau khi kết nối khác commit, statement try-lock được cấp khóa nhưng snapshot cũ vẫn chưa thấy ledger. PostgreSQL phát sinh lỗi unique thật P2002/SQLSTATE 23505; service mở transaction mới và hoàn tất sau 2 lượt ở cả hai ca. Giữ RepeatableRead, timeout 2000ms/maxWait 1000ms; giới hạn tối đa của service là 3 lượt.

V12/V13 chạy khi patch còn trong cây làm việc trên nền `ec042b5`, nên trường sourceHead trong JSON vẫn ghi commit nền. Bản auth sau đó được lưu tại `38cecc5`; bản Orders tại `0c37393`. Với V13, SHA-256 source OrdersService là `c93136623b62500afe01d2b0ea93bccde0f991a456cd9bab81adf5a7c9eb9e73`, dist là `9601bd7a8374ea8010ac5d0e8b4dab7eed5f2d1a82f09781da96b669cdb28c2e`.

## Quyết định hợp đồng và phạm vi chuyển tiếp

- **P04/P05:** [PO đã chấp nhận hiệu đính tại PR #24](https://github.com/giabaot400-boop/BrewLite/pull/24#issuecomment-6622283966). Logout gửi expected-session binding; BFF dùng một token xuyên suốt. Logout/me không gửi Set-Cookie xóa cookie tên cố định. Cookie đã thu hồi có thể còn tới hết hạn hoặc lần login tiếp, nhưng NestJS từ chối phiên. Sau 204, client kiểm tra lại phiên trong ngân sách còn lại của tổng 15s trước cleanup; giữ pending và giỏ mới nếu phiên thay đổi hoặc chưa xác minh được. Các kỳ vọng xóa cookie vật lý trong AUTH-11 được đọc theo hiệu đính này.
- **Owner tạo đơn:** lấy từ pending; BFF xác thực /me và chuyển /orders bằng cùng token, cùng ngân sách 10s. Không khớp owner thì giữ pending/key/payload.
- **Giỏ và lần đặt:** frontend chỉ tính giá xem trước; NestJS tính giá chính thức. Web Lock được thả trước HTTP. Retry giữ owner/key/payload; đăng nhập hoặc reload không tự gửi đơn.
- **ORDER-AC-08:** dọn đúng món khi xác nhận tạo đơn PENDING. Cách giữ/khôi phục món khi thanh toán thất bại và retry trên chính đơn được giải quyết ở Sprint 3. Thanh toán, lịch sử đơn, tồn kho, khuyến mãi/điểm thưởng và quên mật khẩu nằm ngoài phạm vi triển khai Sprint 2.

## Giới hạn và trạng thái nghiệm thu

- Một số biến thể UI, lỗi storage/network và lỗi hệ thống được kiểm chứng bằng unit hoặc công cụ giả lập; phần đã chạy với browser/HTTP/DB thật được phân biệt trong ma trận. Kiểm tra atomicity và snapshot tại ORDER-08/10 đã có PostgreSQL thật ở V13.
- Hiệu năng auth sau sửa đạt trong mẫu V12. Product API/Orders có số đo V11; V13 kiểm tra tính đúng đắn transaction, không đo lại thời gian API sau bổ sung đối chiếu dữ liệu.
- Góp ý không chặn từ B gồm Header 360px xuống dòng và helper clearSessionCookie không còn nơi gọi. Các JSON A9 chưa nằm trong bộ báo cáo gốc đã đối chiếu; kết quả A9 được dẫn theo log và thao tác UI đã ghi nhận.
- PO đã chấp nhận hiệu đính P04/P05. Quyết định nghiệm thu phạm vi chức năng Sprint 2 sẽ được ghi sau khi các bản sửa hoàn tất review/merge. Bảng này không đánh dấu toàn bộ 37 TC hoặc mọi AC/DoD đều đạt.

## Review và bài học triển khai

B đã approve `d5712de` trước khi merge PR #24. Mốc đó không có CI check tự động; bằng chứng kiểm tra nằm ở log và review. Review này chưa thay review cho các commit sửa sau tích hợp.

Các lỗi đã có retest gồm mã lỗi phiên AUTH-E-01, dialog đóng khi focus trở lại, bố cục đổi khi refresh, logout nhầm phiên/phản hồi cũ ảnh hưởng cookie mới, độ trễ bcrypt và thiếu đối chiếu Order/ledger. Lỗi thiết lập demo trên máy A được khắc phục bằng cách trỏ Product API về backend test 3002 và đặt APP_ORIGIN khớp localhost:3000; môi trường B dùng backend 3001.

Bài học triển khai: ghi đủ cấu hình public/BFF/origin trước demo; phân biệt unit, HTTP/DB và UI; kiểm tra owner/revision trước HTTP; ghi source commit, hash và phương pháp của từng lượt chạy. Phần này tổng hợp từ quá trình làm việc, không ghi nhận một cuộc họp Retrospective riêng.

Việc còn lại để chốt: review/merge bản sửa hiệu năng và nhất quán dữ liệu, hoàn thiện quyết định PO theo phạm vi đã kiểm tra, rồi review/merge nhánh tài liệu. Các PR nền đã tích hợp được xử lý theo quyết định của người phụ trách sau đối chiếu lịch sử.
