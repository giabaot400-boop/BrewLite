# Sprint 2 — A8a: BFF tạo đơn và ràng buộc owner

## Baseline và quyết định bổ sung

- Baseline triển khai: `8ffdb1e1478ad800daa1e976dbe61516eb9f4bc6`, nhánh `integration/sprint2-auth-cart-orders`.
- Ngày 03/11/2026, A cho phép triển khai cách cụ thể hóa P01: owner lấy từ pending, BFF xác thực và gửi đơn bằng cùng token, chặn khi không khớp và giữ chung ngân sách timeout. Đây không phải xác nhận riêng của mọi thành viên C/D về từng chi tiết trong tài liệu này.
- V0.6 đã yêu cầu pending chỉ gửi dưới đúng owner, nhưng chưa quy định cách đối chiếu khi cookie dùng chung đổi tài khoản giữa các tab. Chỉ gọi `/api/auth/me` trước POST ở trình duyệt chưa bảo đảm điều đó.
- Phần bổ sung là header **UI → BFF** và bước kiểm tra phiên tại BFF. HTTP body v1, NestJS `/orders`, model, migration, transaction, ledger và quy tắc giá giữ nguyên. Chủ đơn vẫn do NestJS quyết định từ JWT/AuthSession đã xác thực.

## Contract UI → BFF

`POST /api/orders` tiếp tục yêu cầu P04: exact `Origin` theo `APP_ORIGIN`, JSON và `X-BrewLite-Request: 1`. Bổ sung:

| Thành phần | Quy tắc |
| --- | --- |
| `X-BrewLite-Expected-Owner` | Bắt buộc. Giá trị `encodeURIComponent(pending.ownerId)` lấy từ bản pending đã lưu và chụp bất biến cho lần gửi. UUID/ASCII thông thường vẫn là chính chuỗi ID. |
| Giải mã header | Giải mã UTF-8 URI component; yêu cầu giá trị không rỗng và dạng encode canonical khớp chính xác. Không trim, đổi chữ hoa/thường hoặc lấy email làm owner. Header thiếu/hỏng/ghép nhiều giá trị bị từ chối. |
| `Idempotency-Key` | Key gốc trong pending, không sinh lại khi retry. NestJS tiếp tục validate UUID v4 và xử lý idempotency theo userId/key. |
| Body | Giữ nguyên JSON v1 chỉ `items`; transport không thêm owner/userId/JWT vào body. BFF giữ nguyên văn bản JSON hợp lệ khi chuyển tiếp; NestJS validate DTO/nghiệp vụ. |

Header owner là thông tin để đối chiếu ý định, không phải bằng chứng xác thực hoặc cách chọn tài khoản được quyền đặt. Không thay owner của pending bằng user đang hiển thị. Client Authorization không được chuyển tiếp; BFF lấy token từ helper cookie hiện có của C.

## Thứ tự tại BFF

1. Dùng helper P04 hiện có. Không đạt thì chưa đọc cookie/chuyển tiếp.
2. Kiểm tra JSON và giới hạn 32 KiB theo **byte UTF-8 thực tế khi đọc stream**, kể cả Content-Length thiếu/sai. Vượt trả 413; không cắt hoặc sửa payload để gửi tiếp. JSON/UTF-8 hỏng trả 400 trước gọi backend.
3. Đọc/giải mã owner kỳ vọng. Thiếu/hỏng trả `403 REQUEST_FORBIDDEN`.
4. Đọc cookie token **một lần**. Không có token trả `401 AUTH_REQUIRED`.
5. Gọi NestJS `/auth/me` bằng Bearer token vừa chụp, không đọc `sub` bằng giải mã JWT để thay việc xác thực. Chỉ chấp nhận phản hồi 200 đúng cấu trúc phiên.
6. So sánh chính xác `user.id` đã xác thực với owner kỳ vọng. Không khớp trả `403 REQUEST_FORBIDDEN`, **không gọi POST `/orders`**.
7. Khớp thì chuyển body/key tới NestJS `/orders` bằng **chính token ở bước 5**, không đọc cookie lần hai, không chuyển header owner xuống NestJS.
8. NestJS vẫn xác thực lại JWT và AuthSession trước tạo đơn; ví dụ token bị thu hồi sau `/me` thì `/orders` có thể từ chối. BFF trả status/JSON nghiệp vụ cho helper settlement hiện có.

Không xóa/thiết lập cookie tại route orders, kể cả mismatch hoặc 401. Không logout tài khoản B vì pending thuộc A. Bước này không bổ sung cơ chế ràng buộc owner cho route logout; giới hạn cookie dùng chung của logout vẫn phải được ghi nhận riêng.

## Timeout và trạng thái pending

- Một deadline **10.000 ms** bao phủ xử lý body, đọc token, `/auth/me`, POST `/orders` và đọc cả hai response body. Cùng một AbortSignal; không khởi động lại 10 giây cho POST sau `/me`.
- UI transport vẫn có deadline 15.000 ms. Không giữ Web Lock khi gọi BFF/upstream; không tự retry POST tại BFF.
- Timeout trả `504 UPSTREAM_TIMEOUT`; lỗi kết nối/phản hồi xác thực không đủ tin cậy trả `502 UPSTREAM_UNAVAILABLE`. Auth 401 có code hợp lệ từ `/me` được giữ theo contract. Lỗi hệ thống không được đổi thành hết hạn phiên hoặc logout thành công.
- Abort/timeout không chứng minh backend đã hủy transaction. `/me` hoàn tất muộn sau deadline không được phép bắt đầu POST mới.
- `403 REQUEST_FORBIDDEN` đi qua settlement hiện có: giữ pending ở UNKNOWN cùng owner/key/payload và giữ cart. Không coi đó là lỗi xác thực của tài khoản đang hoạt động hoặc kết luận lần đặt trước chưa được tạo.
- Khi owner gốc đăng nhập lại, chỉ thao tác retry chủ động mới gửi lại đúng key/payload cũ. Một retry có thể tạo Order đầu tiên nếu lần gửi trước chưa tới backend; không có auto-send sau login.

## Ranh giới file/module

- A thêm Route Handler `/api/orders`, helper đối chiếu/deadline/giới hạn body và nối header vào bounded transport đã có.
- Dùng nguyên helper cookie, URL cấu hình nội bộ và CSRF của C; không sửa auth routes, AuthGuard, OrdersService hoặc phần schema của D/E.
- Header dùng chung được khai báo trong `frontend/src/lib/order-owner.ts`; helper orchestration nhận I/O qua injection để unit test. Không đọc env/token trong module client dùng chung.
- Chưa thêm nút xác nhận, retry hoặc màn hình kết quả vào UI ở A8a. Không thể coi việc build có route orders là đã chạy thành công luồng tạo đơn từ giao diện.

## Kiểm tra tự động ngày 03/11/2026

Trong môi trường triển khai của trợ lý:

- `npm test --workspace frontend`: **238/238 đạt**, không fail/skip, tăng 48 so với baseline 190.
- 45 test handler dùng Request/Response thật, helper CSRF hiện có và upstream/timer giả lập: owner mismatch, cookie thay giữa `/me`/POST, header opaque, CSRF, thiếu/hỏng token response, 32 KiB UTF-8, DTO/key chuyển tiếp, lỗi nghiệp vụ, body/network timeout và không tự retry.
- 3 test phối hợp transport → handler → settlement/storage: pending A + cookie B không POST và không mất identity/payload/cart; về A không tự gửi, retry chủ động giữ nguyên nội dung; owner Unicode chỉ encode ở header.
- Typecheck và lint frontend không báo lỗi/cảnh báo. Production build thành công với nguồn sản phẩm fixture; có thêm `/api/orders`.
- Thêm **12/12 smoke check HTTP** qua bản build Next.js đang chạy thật, dùng upstream HTTP giả lập trong cùng môi trường: route mismatch chặn POST, phiên B vẫn dùng được qua `/api/auth/me`, 201/replay 200, thiếu owner/cookie, CSRF, body lớn/JSON hỏng và lỗi upstream. Phần ledger/replay ở upstream là giả lập; đây chưa phải bằng chứng NestJS/PostgreSQL hoặc UI thật.
- Chưa kiểm tra HTTP BFF → NestJS → PostgreSQL thật hoặc thao tác UI cho A8a trong môi trường triển khai. Không chuyển các kết quả giả lập thành PASS cho toàn bộ 37 TC dự kiến.

## Kết quả kiểm tra trên máy A ngày 03/11/2026

Nguồn bằng chứng: A gửi log frontend **238/238 unit test đạt**, `git diff --check` sạch, danh sách file đúng phạm vi; sau đó báo kết quả **BFF + POSTGRESQL CHECKS PASSED: 22/22** từ `BrewLite_S2_A8a_BFF_PG_Check_v2.cjs`. Trợ lý chưa trực tiếp đọc file JSON kết quả trên máy A.

Lượt chạy dùng database PostgreSQL 17 `brewlite_s2_a_auth_test`, backend test đang chạy cổng 3002. Script mở riêng một Next.js production server và HTTP proxy đếm request trên các cổng loopback tạm; không dùng frontend dev 3000 cho lượt này. Token/mật khẩu giữ trong bộ nhớ, không đưa vào báo cáo. Storage/Web Locks phía client được inject bằng bộ nhớ giả lập; HTTP BFF/proxy/NestJS và đối chiếu database là thật.

| Nhóm kiểm tra | Kết quả theo lượt 22/22 A báo |
| --- | --- |
| Hai tài khoản fixture A/B | Đăng ký và đăng nhập qua BFF; đối chiếu user tồn tại trong database test. A/B ở đây là tài khoản test. |
| Pending A + cookie B | BFF trả 403 REQUEST_FORBIDDEN; proxy đếm 0 POST `/orders` cho key bị chặn; database có 0 Order và 0 OrderRequest cho key đó. |
| Trạng thái pending/cart | Settlement giữ UNKNOWN, nguyên owner/key/payload/snapshot của A và cart; không chuyển pending sang B. |
| Phiên B sau mismatch | `/api/auth/me` vẫn trả đúng B; AuthSession của B chưa bị thu hồi trong database. |
| Đổi cookie test về A và retry helper chủ động | Không phát POST chỉ vì gán lại cookie; retry giữ nguyên owner/key/body và nhận 201 PENDING. Chưa phải kiểm tra sự kiện login trong React/UI. |
| Order/ledger | Có đúng Order thuộc A, đúng key/total/PENDING; OrderRequest SUCCEEDED trỏ đúng Order. |
| Settlement thành công | Ghi kết quả và dọn pending/phần giỏ khớp trong storage giả lập. |
| Replay cùng key/body | Nhận 200 cùng mã đơn; database vẫn chỉ có 1 Order và 1 OrderRequest. |
| Thiếu owner, thiếu cookie, Origin sai, body quá giới hạn | Trả đúng 403/401/403/413, không chuyển thêm POST hoặc đổi cookie. |
| Tài khoản B | Không có Order/OrderRequest của B cho key kiểm tra. |

Script tự lưu báo cáo `BrewLite_S2_A8a_BFF_PG_Result_<timestamp>.json` cạnh script ở thư mục tải xuống. Giữ báo cáo này cùng log để đối chiếu khi review; không cần đưa token/mật khẩu vào Git.

Lượt script đầu dừng sau đăng ký fixture A vì phần sinh email dùng hậu tố chữ hoa còn backend chuẩn hóa chữ thường. Đây là lỗi fixture/so sánh của script; đã sửa v2 cho A/B, không đổi code sản phẩm hoặc reset database. Chỉ lượt v2 hoàn tất được ghi nhận 22/22; không tính lượt đầu là đạt.

## Giới hạn bằng chứng và bước tiếp theo

- Chưa có thao tác UI tạo đơn, retry hoặc màn hình kết quả ở A8a. Hai tài khoản và cookie ở lượt HTTP do script quản lý; không suy ra đã kiểm tra đầy đủ việc người dùng đổi tài khoản giữa các tab trình duyệt.
- Timeout, body đọc chậm, phản hồi tới muộn và lỗi mạng/backend hiện có bằng chứng giả lập trong unit test; lượt 22/22 không bổ sung thử nghiệm lỗi mạng/timeout thật.
- 238 unit test và 22 kiểm tra HTTP/database không tự thay trạng thái toàn bộ 37 mã TC dự kiến trong đặc tả.
- Tài liệu/PR tích hợp phải giữ rõ phần contract bổ sung để A/C/D đối chiếu trước merge. Bước tiếp theo của A là nối xác nhận/retry/kết quả PENDING vào UI theo contract đã ghi.
