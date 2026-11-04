# Sprint 2 — tổng hợp tích hợp và đối chiếu nghiệm thu

Ngày tổng hợp: 04/11/2026. Trạng thái: **nền Sprint 2 đã tích hợp; bản sửa hiệu năng auth ở PR #26 đang chờ review/merge; đang chốt nghiệm thu với PO**.

## Mốc và phạm vi

- Code được xét: `d5712ded88d2be58a58f4a999145038e5baafae5`; PR [#24](https://github.com/giabaot400-boop/BrewLite/pull/24) được B merge bằng merge commit `ec042b54776febd8e3779c07073f3c317dcc2a01` ngày 04/11/2026. Hai tree giống nhau; không phát sinh thay đổi code do merge.
- A cung cấp log local `main...origin/main`, HEAD `ec042b5`, cây làm việc sạch. Trên nhánh tài liệu `docs/sprint2-closeout`, A nhận báo cáo E từ `029319c` thành `4ef5e4f` (cherry-pick, 1 file/50 dòng, cây sạch).
- Bản sửa hiệu năng auth: commit `38cecc5a72264658e7b19842d3e1b8e0b3869d83`, PR [#26](https://github.com/giabaot400-boop/BrewLite/pull/26), base `main`. Tại thời điểm cập nhật, PR đang mở, chưa có review; main vẫn là `ec042b5`. Không gọi bản sửa đã được tích hợp.
- Baseline yêu cầu: `BrewLite_Sprint2_Phan_Tich_Thiet_Ke_v0.6(2).docx` và bộ sơ đồ v0.6; giữ 4 story, 36 AC, 37 mã TC. Mốc main cũ trong đặc tả chỉ là lịch sử, không phải HEAD hiện tại.
- Phạm vi: Task 5–7 — giỏ, đăng ký/login/logout, JWT, tạo đơn và kết quả PENDING. Giá frontend là xem trước; backend tính chính thức. Giữ Product API và migration Sprint 1; không mở lại nghiệm thu Sprint 1.
- Nguồn đóng góp giữ trong lịch sử PR #24: nền schema/lock của E; Auth của C; Orders của D; UI dùng chung của B; phần A nối giỏ–phiên–orders và sửa lỗi tích hợp. Không quy toàn bộ backend/schema thành phần A.
- Lịch 28/10–03/11/2026 là lịch đề xuất, không tự diễn giải thành mọi thành viên đã cam kết. Mốc tích hợp thực tế là 04/11/2026.

## Quy tắc đọc bằng chứng

- **Có kết quả**: có kết quả chạy hỗ trợ phần mô tả, theo phương pháp ghi tại dòng đó. Không tự đồng nghĩa mọi biến thể đều đã chạy hoặc PO đã nghiệm thu.
- **Có kết quả unit/giả lập**: code được thực thi với I/O được thay thế. Có giá trị cho logic và điều kiện lỗi; không ghi thành PostgreSQL/trình duyệt thật.
- **Một phần**: đã có bằng chứng nhưng còn biến thể hoặc lớp tích hợp chưa được xác nhận. **Đối chiếu UI/code** là review, không phải tự động một ca test động đã chạy.
- Các số 315, 34, 21, 22… là bộ kiểm tra ở các mốc/phạm vi khác nhau; không cộng thành số TC nghiệm thu và không lấy thời gian build làm thời gian API.
- Các dòng dưới đây tổng hợp bằng chứng đã có, chưa phải bảng “37/37 PASS”. Không sửa hồi tố các mục “chưa chạy” trong thiết kế thành kết quả thực tế.

## Danh mục bằng chứng

| Mã | Nguồn, mốc và kết quả | Giới hạn |
|---|---|---|
| V01 | [A3 giỏ](SPRINT2_A_CART_STEP3.md): A xác nhận thêm/gộp cà phê sữa M + kem, 2 ly, 47.000đ/ly, tổng 94.000đ; đồng bộ hai tab và Xem menu. | Một số thao tác xóa/khác cấu hình chưa có ghi nhận UI riêng; không yêu cầu ảnh cho từng AC. |
| V02 | Frontend **315/315** tại `d5712de`; trợ lý typecheck/lint/build đạt, source khớp main merge. A gửi 315/315 và build; B xác nhận 315/315, typecheck/lint/build. Backend 34/34 trong lượt review trước A9: auth 21 + canonical 6 + OrdersService 7. Nguồn: các `*.test.mjs`, `backend/src/auth/*test.ts`, `backend/src/orders/*spec.ts`. | Unit dùng I/O/Prisma giả; A9 không đổi backend. DOM **21/21** thuộc mốc `11d0da7`, auth/network/storage giả lập; không phải kết quả DOM chạy lại sau A9. |
| V03 | Log A: HTTP cơ bản **9/9**, biên phiên **22/22** trên NestJS test 3002/PostgreSQL `brewlite_s2_a_auth_test`: register/login/me/create/replay/logout, DB expiry, JWT expiry, thiếu session, sai owner. | Script dùng tài khoản/phiên test. Lượt expiry đầu sai múi giờ SQL đã sửa fixture UTC rồi chạy 22/22; không tính lượt đầu là đạt. |
| V04 | [A8a owner BFF](SPRINT2_A_ORDERS_BFF_OWNER_CONTRACT.md): A báo **22/22** BFF–NestJS–PostgreSQL thật, mismatch owner không POST; retry 201, replay 200, một Order/ledger. | Cookie jar và storage/locks được script điều khiển; chưa nhận JSON gốc để đối chiếu độc lập. |
| V05 | [A8b UI](SPRINT2_A_ORDER_UI_STEP1.md): A xác nhận tạo đơn/PENDING/reload, offline trước gửi và retry key cũ, đổi giá thật và key mới, lỗi topping đúng dòng, pending qua logout/login, nhiều tab, retest dialog/focus/bố cục. | A quan sát key; chưa có HAR chứng minh body từng lượt. Offline trước gửi không phải mất phản hồi sau server commit. |
| V06 | [E retest auth](SPRINT2_E_AUTH_SESSION_FIX_VERIFICATION.md), PR [#25](https://github.com/giabaot400-boop/BrewLite/pull/25), code `fe1cce2`: E báo auth 21/21 và HTTP PostgreSQL phiên thu hồi/thiếu/hết hạn DB/sai owner; AUTH-E-01 retest đạt. | Theo báo cáo E; trợ lý chưa độc lập tái hiện lượt chạy này. JWT tự hết hạn HTTP, BFF/UI và hiệu năng không thuộc báo cáo. Có ghi lần đăng ký nhầm DB và loại khỏi bằng chứng test. |
| V07 | Báo cáo E ở PR [#19](https://github.com/giabaot400-boop/BrewLite/pull/19) (`b5ddecc`, Orders `fecea6b`): service/PostgreSQL 11/11, replay/conflict/REJECTED/rollback/đồng thời; retry thật SUCCEEDED/REJECTED. PR [#22](https://github.com/giabaot400-boop/BrewLite/pull/22) (`3ea59f2`, code `3bfa4fb`): HTTP auth/orders, tổng 94.000đ, cặp Order/ledger đúng, ASCII password bounds và lỗi AUTH-E-01 cũ. | Hai báo cáo này được tham chiếu theo PR, chưa có trong main này. 11/11 gọi trực tiếp service; IT-D11 giả P2034; retry thật tăng timeout A lên 10s. Không dùng làm bằng chứng timeout vận hành 2s. AUTH-E-01 trong #22 được thay bằng kết quả retest V06, không xóa lịch sử phát hiện lỗi. |
| V08 | [B review APPROVED](https://github.com/giabaot400-boop/BrewLite/pull/24#pullrequestreview-5763029365) đúng `d5712de`: Windows, Node 24.17.0, Docker PostgreSQL 17, backend 3001/FE 3000; migrate/seed/dev, UI register/login, F5 giữ giỏ/phiên, logout/hủy, PENDING, keyboard/responsive và 315 test/typecheck/lint/build. | Đây là kết quả B báo trong review. Chưa chạy trình đọc màn hình thật và kiểm thử backend chuyên sâu; Header 360 px Đăng ký xuống dòng là góp ý không chặn. |
| V09 | [A9](SPRINT2_A_AUTH_CART_BRIDGE_STEP2.md): A gửi console trước sửa **0/2** (`BrewLite_S2_A9_Logout_Result_1793757009084.json`) và sau sửa **2/2** (`BrewLite_S2_A9_Logout_Result_1793759848952.json`), BFF/Nest/PG thật. Sau đó A xác nhận 4 bước UI login/thêm, hủy logout, logout dọn giỏ, F5/login lại không khôi phục món. | Hai JSON vẫn ở máy A, chưa trực tiếp đọc/đính kèm trong hồ sơ; cookie jar/coordinator/storage-lock của script chạy trong Node. Không đồng nhất với mọi biến thể multi-tab trình duyệt thật. |
| V10 | [B auth UI ban đầu](SPRINT2_B_AUTH_UI.md): B báo 45 test và Playwright mock đăng ký/login/next, focus lỗi, dialog và responsive. | Báo cáo ở mốc trước tích hợp; phần “chưa backend thật” của mốc đó không phủ nhận review mới V08. |
| V11 | A chạy `BrewLite_S2_Closeout_Check.cjs`: **9/9 chức năng đạt**, 40 mẫu thời gian (8 nhóm × 5), HTTP trực tiếp NestJS 3002 và đối chiếu PostgreSQL test. Ba ca bổ sung: cùng key/hai owner, replay giá cũ sau đổi danh mục, mất response sau xử lý rồi retry cùng đơn. Kiểm tra hash đã lưu có cost 12. | Đã đọc JSON gốc `BrewLite_S2_Closeout_Result_1793781471823.json`: 9 kiểm tra đạt, 40 mẫu; register 1/5 và login 2/5 vượt ngưỡng. Source HEAD ghi trong JSON là `4ef5e4f`, trước bản sửa native. Không qua BFF/UI; dữ liệu fixture được giữ trong DB test. Kết quả sau sửa xem V12. |

| V12 | Bản sửa [PR #26](https://github.com/giabaot400-boop/BrewLite/pull/26), `38cecc5`: runtime bcrypt native 6.0.0, giữ cost 12 và hash cũ. A gửi **37/37 test auth**, typecheck/build/diff check đạt; HTTP/PostgreSQL **5/5 kiểm tra chức năng**, **20/20 mẫu auth dưới 500ms**, gồm login hash bcryptjs cost 12 không rewrite. | Theo console A, báo cáo `BrewLite_S2_Auth_Performance_Result_1793784786074.json` chưa được trực tiếp đọc. Không qua BFF/UI, không thử tải; không đo lại sáu nhóm khác của V11. PR đang chờ review/merge, không sửa hồi tố kết quả V11. |

## Đối chiếu 36 AC

Bảng nêu kết quả, phương pháp và phần còn thiếu; PO quyết định nghiệm thu theo từng phạm vi. “Một phần” không đồng nghĩa đã tìm thấy lỗi code.

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
| REG-AC-01 | Ba ô bắt buộc, mật khẩu che ký tự | Đối chiếu UI/code | V08 review form thật; components/register-form.tsx. Chưa có log riêng từng thuộc tính. |
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
| ORDER-AC-02 | Validate món/size/topping/qty, sai không tạo | Có kết quả | V05 lỗi topping đúng dòng qua API; V07 món sai; V02 backend/unit. Không suy mọi biến thể DTO đã có HTTP riêng. |
| ORDER-AC-03 | Backend tính tiền chính thức | Có kết quả | V07 tổng 94.000đ; V05 đổi giá thật; V02 OrdersService. |
| ORDER-AC-04 | Order đủ món, đúng user, PENDING, atomic | Một phần | V04/V07 đúng owner/ledger/snapshot; E báo rollback PostgreSQL. Chưa có bằng chứng chi tiết cố ghi cặp sai owner/key/hash. |
| ORDER-AC-05 | Đang tạo đơn và khóa đặt hàng | Có kết quả | V05 UI theo A; V02 controller double-click/phase; V08 dialog/create order. |
| ORDER-AC-06 | Mã đơn, tổng chính thức, Chờ thanh toán | Có kết quả | V05/V08 UI PENDING và reload; V04/V07 response/DB. |
| ORDER-AC-07 | Thất bại xác định: báo lỗi, giữ giỏ | Có kết quả | V05 validation theo dòng thật; V02 phản hồi/settlement. |
| ORDER-AC-08 | Chỉ dọn giỏ khớp khi thành công | Có kết quả | V05 thành công/giá đổi/offline; V02 settlement owner/revision và phản hồi muộn. |
| ORDER-AC-09 | Giá đổi: chưa tạo, cập nhật, xác nhận mới | Có kết quả | V05 PRICE_CHANGED → xác nhận key mới → PENDING; V02 settlement. |
| ORDER-AC-10 | Mất mạng/timeout: UNKNOWN, retry cùng key/payload, một đơn | Có kết quả HTTP và giả lập | V11 chủ động ngắt response sau backend 201, retry cùng key/body trả 200 đúng một Order/ledger; V05 offline/retry UI; V02 timeout/payload bất biến. Chưa coi proxy Node là UI mất response sau commit. |

## Đối chiếu 37 ca dự kiến

Giữ nguyên mã của v0.6. Các biến thể được gộp đúng mã gốc, không tạo thêm hàng để làm tăng số ca đạt.

| TC | Nội dung rút gọn | Kết quả hiện có | Đối chiếu/biến thể còn thiếu |
|---|---|---|---|
| S2-CART-01 | Thêm một ly khách | Có kết quả | V01/V02: thêm, cấu hình, thông báo và badge. |
| S2-CART-02 | Gộp và đảo topping | Có kết quả | V01 UI gộp; V02 đảo topping. |
| S2-CART-03 | Khác cấu hình | Có kết quả unit | V02; không yêu cầu ảnh riêng, nhưng chưa có log UI từng biến thể. |
| S2-CART-04 | Cộng/trừ, disabled tại 1 | Một phần | V02 logic đạt; phần disabled UI chưa ghi riêng. |
| S2-CART-05 | Xóa dòng/món cuối và trạng thái rỗng | Một phần | V02 logic đạt, V01 Xem menu hoạt động; chưa có mô tả đủ riêng lượt xóa cuối trên UI. |
| S2-CART-06 | Giá nhiều dòng/VND | Có kết quả | V01 2 × 47.000đ; V02 công thức nhiều dòng. |
| S2-CART-07 | Điều hướng/reload, storage lỗi, nhiều tab | Một phần | V08 F5; V01/V05 nhiều tab; V02 lỗi storage/lock giả lập. Không có đủ lượt trình duyệt thật cho mọi lỗi storage. |
| S2-CART-08 | Qua đăng ký/login từ giỏ | Có kết quả | V05/V10 + V02 return-to và guest adoption. |
| S2-CART-09 | Logout/hủy/hết hạn/đổi owner/pending | Một phần | V05/V08/V09 logout/hủy/pending; V03 expiry API, V02 owner transition. Chưa đủ mọi biến thể UI thật. |
| S2-AUTH-01 | Register hợp lệ, busy/hash/redirect | Chức năng có kết quả; NFR đạt trong mẫu sau sửa | V08/V10 UI; V11 có mẫu vượt ngưỡng. V12 register 5/5 dưới 500ms, max 385,749 ms, hash DB cost 12. Busy/redirect khi chậm mới có báo cáo mock. Bản sửa chờ merge #26. |
| S2-AUTH-02 | Input sai, API sai, masked fields | Một phần | V02 validation; V10 form; chưa có bảng HTTP từng sai kiểu/field. |
| S2-AUTH-03 | Biên ký tự/byte/Unicode/dấu cách | Có kết quả unit backend/frontend; HTTP một phần | V07 HTTP ASCII; V02 frontend; V12 test AuthService với Prisma giả thực thi các biên ASCII/Unicode/emoji/dấu cách, NUL/surrogate và tương thích hash. Chưa coi bộ unit này là HTTP/PostgreSQL cho mọi biến thể. |
| S2-AUTH-04 | Email trùng | Có kết quả HTTP | V07 E báo 409 sau normalize; không thêm tài khoản. |
| S2-AUTH-05 | Login, phiên 1h, HttpOnly, không JWT ở JSON UI | Chức năng một phần; NFR đạt trong mẫu sau sửa | V11 có mẫu vượt ngưỡng. V12 login 5/5 dưới 500ms, max 387,496 ms; TTL 3600s và hash cũ hoạt động. V04/V08 BFF login thật; policy HttpOnly đọc code, chưa có log riêng thuộc tính cookie trong trình duyệt. Bản sửa chờ merge #26. |
| S2-AUTH-06 | Sai thông tin, không cấp phiên, giữ giỏ | Có kết quả | V07 HTTP sai password; V02 client/error/bridge; chưa có log UI riêng mọi biến thể. |
| S2-AUTH-07 | Reload/me, expiresAt không đổi | Có kết quả | V08 F5 giữ phiên/giỏ; V07 me giữ expiresAt; V02 stale /me. |
| S2-AUTH-08 | Phiên hết hạn, giữ giỏ, không auto-order | Một phần | V03 HTTP JWT và DB expiry; V02 bridge/owner. Chuỗi UI đầy đủ chưa ghi riêng. |
| S2-AUTH-09 | Orders thiếu/sửa token/thu hồi | Có kết quả HTTP | V03/V06/V07; AUTH-E-01 cũ đã sửa và E retest. |
| S2-AUTH-10 | Logout có món, hủy, giỏ rỗng | Một phần | V08/V09 có món/hủy; V02 nhánh rỗng. Chưa có ghi nhận riêng UI giỏ rỗng đăng xuất trực tiếp. |
| S2-AUTH-11 | Logout hết hạn/thu hồi/thiếu/hỏng token/đổi secret | Một phần; có hiệu đính | V03 JWT expiry/revoke; V02 handler/session. Chưa có đủ HTTP mọi biến thể; yêu cầu xóa cookie vật lý đã được PO hiệu đính tại V09. |
| S2-AUTH-12 | Login lại cùng/khác owner và điều hướng | Một phần | V05/V08 cùng owner/pending; V02 khác owner; V04 cookie mismatch. Chưa coi Node cookie jar là đổi account trên nhiều tab thật. |
| S2-AUTH-13 | Mạng/DB/timeout của auth, scope | Có kết quả giả lập | V02 deadlines/body/network/DB errors và giữ dữ liệu. Chưa có đầy đủ lỗi hệ thống HTTP/browser thật. |
| S2-AUTH-14 | CSRF | Có kết quả | V04 Origin sai bị 403 trước POST orders; V02 marker/media type/origin. Lỗi APP_ORIGIN local đã khắc phục, không tính là ca CSRF đủ mọi biến thể. |
| S2-ORDER-01 | 2 ly M + kem = 94.000đ, busy | Có kết quả | V07 E HTTP 201/tổng 94.000đ; V01 giá cart; V05/V08 UI PENDING; V02 busy. |
| S2-ORDER-02 | Nhiều cấu hình, có dòng không topping | Một phần | V02 backend/reducer; V05 giỏ hai món dùng kiểm tra lỗi. Chưa có đối chiếu DB đầy đủ đơn nhiều cấu hình/no-topping. |
| S2-ORDER-03 | Giỏ rỗng, qty 0/âm/lẻ | Có kết quả logic; HTTP một phần | V02 chặn giỏ và qty; chưa có log API thật đầy đủ từng qty. |
| S2-ORDER-04 | Món sai + giá đổi, index lỗi | Một phần | V05 lỗi topping đúng dòng thật; E báo replay index; code validate trước price. Chưa có log rõ ca đồng thời món sai và giá đổi. |
| S2-ORDER-05 | Giá đổi trước đặt | Có kết quả HTTP/UI | V05 fixture đổi giá thật, giữ cấu hình, xác nhận key mới. |
| S2-ORDER-06 | Giá client thấp | Có kết quả | V07 service PRICE_CHANGED/REJECTED; V02 backend không lấy expectedUnitPrice làm giá chính thức. |
| S2-ORDER-07 | Thiếu/hết hạn/thu hồi auth | Có kết quả HTTP; UI một phần | V03/V06; giữ giỏ ở V02/V05. Chuỗi UI hết hạn chưa đủ. |
| S2-ORDER-08 | Rollback và cố ghi cặp Order/ledger sai | Một phần | E báo rollback PostgreSQL; V04/V07 xác nhận cặp đúng. Chưa có log thử cặp sai owner/key/hash riêng. |
| S2-ORDER-09 | Replay SUCCEEDED | Có kết quả HTTP/DB | V03/V04/V07: cùng mã đơn, một Order/ledger. |
| S2-ORDER-10 | Đồng thời/snapshot cũ tại try-lock | Một phần | E báo 11/11 và retry thật SUCCEEDED/REJECTED nhưng tăng timeout A 10s; chưa xác nhận mọi điều kiện vận hành 2s và vị trí snapshot đúng tại try-lock từ log gốc. |
| S2-ORDER-11 | Conflict và replay lỗi đảo dòng | Có kết quả service; HTTP một phần | E báo conflict và replay index; V02 canonical/unit; chưa có bộ HTTP từng biến thể. |
| S2-ORDER-12 | Mất phản hồi/403/413/5xx/timeout/body sai | Có kết quả HTTP và giả lập | V11 mất response sau backend success, DB có đơn/ledger, explicit retry trả 200 cùng mã; V04 403/413 thật; V05 offline/retry UI; V02 giả lập 5xx/timeout/body. Không tuyên bố mọi lỗi đã chạy trên browser thật. |
| S2-ORDER-13 | Giá đổi sau tạo, replay giá cũ | Có kết quả HTTP/DB | V11 tạo đơn 35.000đ với sản phẩm fixture riêng, tăng giá danh mục lên 40.000đ, retry body/key cũ trả cùng đơn/tổng 35.000đ; DB snapshot unit_price vẫn 35.000đ. |
| S2-ORDER-14 | Hai owner cùng key, phục hồi pending | Có kết quả HTTP và UI/giả lập | V11 hai owner đều tạo thành công bằng cùng UUID, hai mã đơn khác nhau và ledger khớp từng owner; V04 mismatch; V05 phục hồi pending owner cũ. |


## Kết quả bổ sung V11 — HTTP/PostgreSQL trên máy A

Đã đọc JSON gốc `BrewLite_S2_Closeout_Result_1793781471823.json`, khớp console A: **FUNCTIONAL CHECKS PASSED: 9/9**, **NFR <500ms: NOT MET IN ALL MEASURED SAMPLES**. Source HEAD là `4ef5e4f`; Windows 10 x64, Intel i5-6200U @ 2.30GHz, 4 CPU logic, RAM 19,87 GiB, Node 24.16.0, ban đầu 4 sản phẩm. Trong 40 mẫu, register có 1/5 và login có 2/5 vượt 500ms. Đây là baseline trước bản sửa native, không thay bằng kết quả V12.

Phép đo: 5 request thành công nối tiếp mỗi nhóm, từ bắt đầu fetch đến đọc hết body; không thử tải đồng thời. Endpoint trực tiếp NestJS `http://127.0.0.1:3002`; không phải thời gian BFF, UI hay môi trường triển khai production. Bước chuẩn bị fixture/kiểm tra biên không nằm trong 40 mẫu thời gian. Script kiểm tra database `brewlite_s2_a_auth_test` và backend dùng cùng phiên test trước các HTTP ghi; không sửa bốn sản phẩm mẫu, nhưng giữ thêm một sản phẩm `[S2 test] Replay price`, user/đơn test do script tạo.

| Nhóm API | n | Min (ms) | Mean (ms) | Max (ms) | Kết quả mẫu <500ms |
|---|---|---|---|---|---|
| GET /products | 5 | 4,549 | 12,899 | 44,551 | Đạt trong mẫu đo |
| GET /products/coffee-milk | 5 | 5,880 | 10,344 | 26,879 | Đạt trong mẫu đo |
| POST /auth/register | 5 | 421,736 | 480,295 | 660,450 | Chưa đạt mọi mẫu |
| POST /auth/login | 5 | 448,087 | 498,598 | 545,187 | Chưa đạt mọi mẫu |
| GET /auth/me | 5 | 4,622 | 5,142 | 5,683 | Đạt trong mẫu đo |
| POST /orders — create | 5 | 15,911 | 39,024 | 128,862 | Đạt trong mẫu đo |
| POST /orders — replay | 5 | 7,481 | 8,978 | 12,212 | Đạt trong mẫu đo |
| POST /auth/logout | 5 | 3,915 | 5,837 | 11,802 | Đạt trong mẫu đo |

9 nhóm chức năng được console và JSON xác nhận: backend và DB test thống nhất; Product API; register lưu hash cost 12; login TTL và me không gia hạn; 5 cặp create/replay với mỗi key một Order/ledger; hai owner cùng UUID; replay giữ snapshot giá cũ; mất phản hồi sau server 201 rồi retry đúng đơn; logout thu hồi các phiên đo. Đây không phải 9 mã TC mới và không nâng kết luận thành 37/37 PASS.

Proxy ở ca mất phản hồi đọc hết response 201 từ NestJS rồi đóng kết nối trước khi client nhận headers; script đối chiếu DB đã có cặp Order/ledger, sau đó POST lại cùng key/body nhận 200 và cùng mã đơn. Không sử dụng UI hoặc thay đổi timeout transaction cho ca này. Ca replay giá cũ sửa riêng sản phẩm fixture của lượt chạy, không tăng giá món mẫu dùng demo.


## Kết quả bổ sung V12 — auth sau sửa hiệu năng

Giữ bcrypt cost 12, chuyển implementation runtime sang bcrypt native 6.0.0. Không đổi validation, API, TTL, schema/migration; không rewrite hash cũ. Quyết định, kiểm thử tương thích và kết quả đo nằm trong `docs/SPRINT2_AUTH_PERFORMANCE.md` của PR #26; tài liệu đó chưa có trong main tại mốc tổng hợp này.

A đã chạy 37/37 test auth, typecheck/build backend và diff check đạt. Sau khi khởi động lại bản build backend test, A cung cấp console cho `BrewLite_S2_Auth_Performance_Result_1793784786074.json`: **5/5 kiểm tra chức năng đạt; 20/20 mẫu auth dưới 500ms**. Chưa trực tiếp đọc JSON này; không suy source HEAD hoặc thông tin máy từ tên báo cáo.

| API | n | Min (ms) | Mean (ms) | Max (ms) | Kết quả mẫu <500ms |
|---|---|---|---|---|---|
| POST /auth/register | 5 | 340,349 | 350,860 | 385,749 | 5/5 đạt |
| POST /auth/login | 5 | 339,869 | 359,898 | 387,496 | 5/5 đạt |
| GET /auth/me | 5 | 3,561 | 4,037 | 4,416 | 5/5 đạt |
| POST /auth/logout | 5 | 4,211 | 6,361 | 13,011 | 5/5 đạt |

Năm kiểm tra chức năng gồm: backend và DB test khớp phiên; register lưu hash cost 12; login được bằng hash bcryptjs cost 12 cũ mà không rewrite; TTL và thời điểm hết hạn không đổi khi gọi /me; logout thu hồi các phiên đã đo. Phép đo trực tiếp NestJS 3002/PostgreSQL test, tuần tự, bao gồm đọc hết response, không qua BFF/UI hoặc thử tải.

Kết luận: vấn đề độ trễ auth được khắc phục trong lượt đo V12; bản sửa còn chờ review/merge #26. Sáu nhóm API khác dưới ngưỡng trong V11 không được chạy lại ở V12; không gộp hai lượt thành một bộ 40 mẫu sau sửa, không cam kết mọi request trên mọi máy đều dưới ngưỡng.

## Quyết định hợp đồng đã được ghi nhận

- **P04/P05:** [PO chấp nhận tại PR #24](https://github.com/giabaot400-boop/BrewLite/pull/24#issuecomment-6622283966). Logout gửi expected-session binding; BFF đọc token một lần, không thu hồi phiên khác. Logout/me không gửi Set-Cookie xóa cookie tên cố định; cookie đã thu hồi có thể còn đến hết hạn hoặc login tiếp nhưng Nest từ chối phiên. Sau 204 kiểm tra lại cookie trong ngân sách còn lại của tổng 15s trước cleanup; giữ pending và giỏ mới khi phiên thay đổi/không xác minh được. Xem V09 để đọc đầy đủ hiệu đính; các câu xóa cookie vật lý ở tài liệu cũ là baseline trước hiệu đính, không còn là kỳ vọng cho AUTH-11 hiện tại.
- **Owner tạo đơn:** expected owner lấy từ pending; BFF xác thực /me và chuyển /orders bằng cùng token, cùng ngân sách 10s; mismatch giữ pending/key/payload. Không lấy metadata local làm xác thực.
- **ORDER-AC-08:** vẫn dọn đúng món khi xác nhận tạo đơn PENDING. Cách giữ/khôi phục món nếu thanh toán thất bại và retry trên chính đơn thuộc thiết kế Sprint 3; chưa triển khai payment ở Sprint 2.
- Không giữ Web Lock qua HTTP, không tự POST sau login/reload, không dùng idempotency tạo đơn thay toàn bộ idempotency thanh toán.

## Điểm cần chốt, không mặc định thêm yêu cầu

1. **Bản sửa hiệu năng chờ tích hợp:** V11 đã được đối chiếu JSON và ghi nhận 3/40 mẫu vượt ngưỡng. PR #26 giữ cost 12, dùng bcrypt native; V12 có 20/20 mẫu auth dưới 500ms, chức năng 5/5 đạt. Chờ review và merge #26 rồi cập nhật mốc main; không cần chạy lại toàn bộ chỉ vì merge nếu tree khớp bản đã kiểm tra. NFR chỉ kết luận trong các mẫu/môi trường đã ghi.
2. **Các biến thể chưa đủ bằng chứng:** xem chính hàng TC (nhất là ORDER-08/10 và AUTH-03; ORDER-12 còn các biến thể browser/timeout đã phân biệt trong hàng tương ứng). Có thể dùng lại script/log E đã chạy nếu đáp ứng đúng điều kiện; không yêu cầu chạy lại toàn bộ. Ca logic phù hợp có thể được chấp nhận bằng unit/giả lập; các kiểm tra atomicity/snapshot phải có PostgreSQL thật như v0.6.
3. **Góp ý không chặn từ B:** Header 360 px xuống dòng, helper clearSessionCookie không còn nơi gọi, chưa xem JSON A9. Chưa có thay đổi code xử lý ba góp ý trong bản tổng hợp; PO đã chốt hiệu đính cookie, Node version trong review đã được B bổ sung. Có thể bổ sung JSON sẵn có thay vì chạy lại A9.
4. Các log/hash fixture và giới hạn đã nêu là bằng chứng theo người chạy; không biến chúng thành báo cáo audit độc lập hoặc yêu cầu ảnh riêng từng AC.

## Review, bài học và quyết định PO

- B review và approve `d5712de` trước khi merge PR #24; chưa có CI check tự động ở mốc merge, không diễn đạt “CI xanh”. Không cần lặp test chỉ vì merge có tree giống bản đã thử hoặc vì nhận thêm tài liệu E.
- Các lỗi đã sửa có retest: mã lỗi phiên AUTH-E-01; dialog tự đóng khi focus trở lại; bố cục đổi khi refresh; logout nhầm phiên và phản hồi cũ xóa cookie mới. Chi tiết kết quả theo V03/V05/V06/V09, không suy từ build.
- Lỗi thiết lập UI trên máy A: Product API chưa trỏ cùng backend test 3002; APP_ORIGIN chưa khớp localhost:3000 dẫn tới login 403. Sau đặt cấu hình và restart, A xác nhận menu/login/logout hoạt động. B chạy môi trường riêng backend 3001 bằng cấu hình của B.
- Bài học rút từ các lượt triển khai: ghi đủ cấu hình public/BFF/origin trước demo; tách unit, HTTP/DB và UI; đặt checkpoint trước HTTP; giữ rõ source commit và giới hạn mỗi lượt thử. Đây là tổng hợp triển khai, **không phải biên bản một cuộc họp Retrospective đã diễn ra**.
- **PO mới chấp nhận hiệu đính P04/P05, chưa có quyết định nghiệm thu toàn bộ Sprint 2 trong bản này.** Sau đối chiếu, PO ghi một trong các kết luận: chấp nhận phạm vi chức năng đã kiểm tra kèm ngoại lệ/điểm chưa xác nhận; hoặc yêu cầu bổ sung đúng các mục cần thiết rồi chốt. Không tự ghi mọi AC/DoD đạt hoặc Sprint 2 hoàn tất chỉ từ approve PR.
- Việc đóng PR nền đã được tích hợp chỉ thực hiện sau đối chiếu lịch sử/nội dung và quyết định của người phụ trách; bản này không tự đóng PR hoặc xóa nhánh của thành viên.

## Các bước chốt hồ sơ

1. B review PR #26; khi đạt, merge và ghi commit main thực tế. Nếu có thay đổi code khi review, chỉ kiểm tra lại phần liên quan.
2. Hoàn thiện quyết định PO: chấp nhận phạm vi chức năng đã kiểm tra kèm các giới hạn trong bảng, hoặc chỉ định đúng biến thể bắt buộc bổ sung. ORDER-08/10 chưa đủ bằng chứng PostgreSQL cho toàn bộ biến thể của v0.6; không tự chuyển thành đạt hoặc coi việc này đã được PO miễn trừ.
3. Review/merge nhánh `docs/sprint2-closeout`, gồm báo cáo E đã cherry-pick và bản tổng hợp này. Sau khi có quyết định PO và mốc tích hợp thực tế mới đổi trạng thái chốt Sprint 2; không thêm tính năng Sprint 3 vào nhánh này.
