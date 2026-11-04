# Sprint 2 — A7b: nối auth với giao diện giỏ

## Phạm vi và baseline

- Baseline: `c2de5b8ceebc42a35a2b50b55bcf0d1f900ff229`, nhánh `integration/sprint2-auth-cart-orders`.
- Nguồn yêu cầu: đặc tả Sprint 2 v0.6, quy tắc tài khoản/giỏ, S2-UC-LOGOUT, P01/P05/P09; dùng bridge A7a đã có.
- Đây là phần tích hợp của A. Có thay đổi interface auth dùng chung với B, liệt kê bên dưới để review trong PR tích hợp.
- Không thay đổi HTTP API, cookie, schema hay migration. Chưa nối gửi đơn/thử lại/kết quả đơn vào UI; không thêm payment.

## Hành vi được nối

- CartProvider vẫn dùng Context/useReducer. Đọc, nhận chủ giỏ và chỉnh sửa đi qua bridge; không lấy `ownerId` trong localStorage làm bằng chứng đăng nhập.
- Đăng nhập lần đầu nhận giỏ khách, giữ lựa chọn/số lượng. Cùng tài khoản giữ giỏ; đổi tài khoản nhận giỏ rỗng, giữ bản ghi pending/result riêng theo owner.
- Khi auth snapshot đổi, ẩn snapshot giỏ cũ ngay trong render; chỉ hiển thị lại sau khi đọc/xác minh xong. Phiên loading/unknown không được chỉnh giỏ. Phiên hết hạn không tự xóa bytes giỏ hoặc pending.
- Focus, storage, visibility và khôi phục trang kiểm tra `/me` rồi đọc bytes hiện tại. Chỉ kết quả xác thực mới thành công mới cho phép nhận chủ giỏ; `/me` lỗi mạng giữ snapshot cũ không cấp quyền nhận một giỏ khác chủ.
- Các lượt đọc/nhận chủ giỏ được xếp hàng; lượt cũ chưa bắt đầu bị bỏ khi đã có lượt mới. Không có Web Lock trong lúc chờ `/me` hoặc logout HTTP.
- Pending của đúng owner chặn chỉnh giỏ và có thông báo. Bước này không tự gửi hoặc thử lại đơn sau đăng nhập.

## Thay đổi interface auth dùng chung

`AuthProvider` giữ API cũ và thêm:

- `sessionSnapshot`, `getSessionSnapshot()`: tham chiếu snapshot ổn định do auth coordinator quản lý; bridge dùng để phát hiện auth đã đổi khi đang đợi storage lock.
- `prepareSignOut(handler)`: đăng ký bước chuẩn bị trước HTTP. Handler trả `complete(scope)` bất đồng bộ và `cancel()`. Hủy đăng ký trả về như các hook cũ.
- `setLogoutInfoSource` chấp nhận nguồn trả `null` khi thông tin giỏ chưa xác minh; hộp thoại dùng lời xác nhận chung trong trường hợp này.

Thứ tự logout:

1. Chụp owner/revision của giỏ đã lưu, chặn thao tác chỉnh giỏ trong tab đang logout, rồi giải phóng Web Lock.
2. Gửi logout qua HTTP client hiện có. Client tiếp tục yêu cầu đúng `204` và scope `session` hoặc `local`.
3. Nếu chưa nhận xác nhận hợp lệ: cancel phần chuẩn bị, giữ auth và giỏ; không gọi cleanup.
4. Khi đã xác nhận: chuyển auth sang anonymous, await cleanup giỏ theo checkpoint. Giữ pending/result; cập nhật badge/tổng sau đọc lại.
5. Nếu cleanup lỗi quota/storage hoặc checkpoint đã cũ: giữ dữ liệu, phát `ConfirmedLogoutError(scope, "cart")`. UI nói rõ đã logout theo scope nhưng chưa dọn được giỏ, đưa về `/cart`; không báo server logout thất bại hoặc hứa giỏ đã xóa.
6. Nếu login khác hoặc `/me` phát hiện owner khác xen vào: không cleanup giỏ theo phiên cũ, không ghi đè auth mới; phát `ConfirmedLogoutError(scope, "session-changed")` nếu HTTP đã xác nhận, và UI kiểm tra lại phiên thực tế.

`onSignedOut` cũ chạy sau cleanup hoàn tất. Lượt `/me` cũ bị bỏ nếu có `/me` mới hơn hoặc login/logout thành công xen vào; cần thiết vì provider giờ refresh theo nhiều sự kiện trình duyệt.

Lỗi đọc checkpoint xảy ra trước HTTP thì logout chưa được gửi. Khi storage bị chặn, cần khôi phục quyền đọc/lưu và thử lại. Sau logout đã xác nhận nhưng dọn giỏ thất bại, đọc lại không tự xóa giỏ cũ; đăng nhập lại đúng owner để kiểm tra và chủ động xử lý tiếp.

## Kiểm tra tự động ngày 03/11/2026

Trong môi trường triển khai của trợ lý:

- `npm test --workspace frontend`: **190/190 đạt**, không fail/skip; tăng 18 ca so với baseline 172.
- 14 ca mới dùng auth coordinator, bridge và storage thật với network/storage/Web Locks giả lập: nhận giỏ khách, hai scope logout, pending, lỗi mạng, checkpoint không đọc được, quota, thay đổi giỏ/tài khoản giữa HTTP, hủy chuẩn bị và phiên hết hạn.
- Hai ca reducer kiểm tra owner đã xác thực; hai ca auth coordinator kiểm tra `/me` đồng thời trả sai thứ tự.
- Frontend typecheck và lint không lỗi/cảnh báo; production build thành công với nguồn sản phẩm fixture, không nối database trong lần build này.
- Chưa kiểm tra thao tác giao diện bằng trình duyệt thật ở bước A7b. Việc khởi chạy trình duyệt trong môi trường triển khai bị giới hạn; không dùng kết quả build để suy ra UI đã đạt.
- Chưa chạy lại HTTP/PostgreSQL cho A7b. Bằng chứng 9 + 22 kiểm tra backend trước đó thuộc mốc đã ghi riêng, không chuyển thành bằng chứng cho luồng UI này.

## Kiểm tra tiếp trên máy A

Sau khi áp dụng patch, chạy test/typecheck/lint/build và kiểm tra diff. Sau đó dùng BFF thật trỏ backend test đã cấu hình trên cổng 3002, database `brewlite_s2_a_auth_test`, để thử theo từng chặng:

- Giỏ khách có món → đăng nhập → giỏ giữ món/số lượng; tải lại cùng tài khoản vẫn giữ.
- Giỏ có món → mở xác nhận logout → Ở lại giữ nguyên; xác nhận logout thì giỏ/badge về 0 khi đã lưu thành công.
- Giỏ rỗng và không có pending → logout trực tiếp, thông báo đúng scope.
- Lỗi mạng logout → giữ phiên/giỏ; kết nối lại cho thử lại. Không dùng sự cố này để suy ra phiên server chưa bị thu hồi.
- Hai tab: chỉnh giỏ cập nhật tab còn lại; đổi tài khoản không hiển thị dữ liệu owner cũ; hết hạn không tự xóa giỏ đã lưu.

Kết quả đã được A xác nhận được ghi riêng bên dưới; các biến thể chưa có kết quả vẫn chưa được đánh dấu đạt. Không sửa bảng 37 TC thành đạt chỉ vì 190 unit test thành công.

## Kết quả kiểm tra trên máy A ngày 03/11/2026

Nguồn bằng chứng: log lệnh A gửi và xác nhận thao tác thủ công trong trao đổi triển khai; trợ lý không trực tiếp quan sát trình duyệt trên máy A.

| Nội dung | Kết quả ghi nhận |
| --- | --- |
| Production build frontend | Log hoàn tất thành công; có các route auth BFF, cart, login và register. |
| Kiểm tra whitespace | `git diff --check` không báo lỗi. |
| Giỏ khách 2 ly → đăng nhập → tải lại | A xác nhận giữ đúng món, số lượng và badge 2 ly. |
| Hai tab trong cùng cửa sổ ẩn danh | A xác nhận hai tab cùng hiển thị giỏ 2 ly. |
| Giỏ có món → Đăng xuất → Ở lại | A xác nhận vẫn đăng nhập, giỏ ở cả hai tab được giữ nguyên. |
| Giỏ có món → xác nhận Đăng xuất | A xác nhận tab hiện tại chuyển về chưa đăng nhập, badge về 0. |
| Tab còn lại sau logout → tải lại | A xác nhận trạng thái chưa đăng nhập, giỏ trống và badge 0 được giữ sau tải lại. |

Chặng được hướng dẫn dùng frontend cổng 3000, BFF trỏ backend test cổng 3002 và database `brewlite_s2_a_auth_test`. Chưa ghi nhận kiểm tra HTTP header scope trong lượt UI này; không suy ra đã thử cả hai scope từ thông báo logout thông thường.

Chưa có xác nhận thao tác UI cho logout giỏ rỗng, lỗi mạng/quota, pending, hết hạn hoặc đổi tài khoản giữa request. Các kết quả unit test tương ứng ở trên dùng giả lập; không thay thế bằng chứng UI/backend thật cho các biến thể này. Kết quả 190 unit test/typecheck/lint trên máy A chưa có trong phần log A đã gửi ở mốc ghi nhận này.

## Điểm còn chờ hợp đồng tích hợp đơn

Owner/key/payload pending phải gắn với phiên thực tế khi gửi qua cookie HttpOnly, kể cả tab khác đổi tài khoản giữa lúc gửi. Một `/me` trước POST chưa đủ chứng minh việc này. A7b không thêm header/field mới và không tuyên bố đã giải quyết ràng buộc owner của request phía server. Cần ghi quyết định A/C/D vào tài liệu/PR trước khi kích hoạt POST đơn thật; đây cũng là giới hạn cần giữ rõ khi kiểm tra logout nhiều tab dùng cookie chung.

## A9 — đề xuất hiệu đính logout khi các tab dùng chung cookie (04/11/2026)

Mục này bổ sung cho trình tự A7b ở trên, baseline code `fcb473a` trên nhánh tích hợp. Đây là đề xuất hiệu đính P04/P05 cần PO chốt khi áp bản sửa; chưa ghi nhận nhóm đã đồng ý từng chi tiết.

### Lỗi và ảnh hưởng

A chạy `BrewLite_S2_A9_Logout_Owner_Check.cjs` với Next BFF, NestJS cổng 3002 và PostgreSQL `brewlite_s2_a_auth_test`: **0/2 ca an toàn**, tái hiện cả hai lỗi. Báo cáo console ghi file `BrewLite_S2_A9_Logout_Result_1793757009084.json`; chưa nhận nội dung JSON để kiểm tra độc lập.

- `LOGOUT-OWNER-01`: UI còn xác nhận tài khoản A nhưng cookie chung đã là B; logout có thể thu hồi nhầm phiên B.
- `LOGOUT-OWNER-02`: logout A đang xử lý, B đăng nhập thành công; phản hồi logout A đến muộn có thể xóa cookie B.

Script dùng cookie jar, auth coordinator và storage/khóa được cung cấp trong Node; đây là kiểm tra HTTP/PostgreSQL, chưa phải thao tác trình duyệt thật. Cảnh báo `MODULE_TYPELESS_PACKAGE_JSON` không phải nguyên nhân lỗi.

### Hợp đồng đề xuất và khác biệt với v0.6

1. BFF login và `/me` thành công thêm header `X-BrewLite-Session-Binding`, là SHA-256 của đúng JWT được BFF nhận/đọc. Body xác thực không đổi. Đây là mã đối chiếu công khai, không phải token hay bằng chứng cho phép truy cập; NestJS vẫn kiểm tra JWT/AuthSession. HTTP client yêu cầu header hợp lệ, giữ binding trong bộ nhớ, không lưu JWT hoặc binding này vào giỏ/pending.
2. Logout gửi JSON `{}` cùng header `X-BrewLite-Expected-Session` của snapshot đã xác minh khi bắt đầu. BFF đọc cookie một lần. Binding khớp mới chuyển POST logout bằng chính token đó. Binding khác hoặc thiếu: chỉ hỏi Nest `/me`; phiên còn hiệu lực hoặc hết hạn thì trả `403 REQUEST_FORBIDDEN`, không thu hồi nhầm phiên. Thiếu cookie hoặc Nest xác nhận `SESSION_INVALID` vẫn có thể trả `204 scope=local`. Lỗi mạng/database vẫn trả lỗi. Phiên hết hạn khớp binding tiếp tục dùng guard logout riêng để thu hồi theo P05.
3. **Thay đổi chủ ý so với câu “Next.js xóa cookie” trong P04/P05:** logout và `/me` không gửi `Set-Cookie` xóa cookie `brewlite_session`. Với cookie tên cố định, phản hồi cũ không thể yêu cầu trình duyệt chỉ xóa nếu cookie vẫn bằng giá trị cũ. Phiên được thu hồi ở NestJS; cookie đã thu hồi hoặc không hợp lệ có thể còn trên thiết bị đến khi hết hạn hoặc lần đăng nhập tiếp ghi đè. Cookie này không cấp lại quyền truy cập vì API bảo vệ luôn kiểm tra phiên server. `scope=local` ở bản hiệu đính chỉ xác nhận dọn trạng thái ứng dụng, không xác nhận xóa vật lý cookie hoặc thu hồi server.
4. Sau `204`, coordinator kiểm tra lại cookie qua `/me` trong **phần còn lại của tổng ngân sách 15 giây**. Nếu có phiên sống (kể cả cùng tài khoản nhưng phiên mới), giữ phiên đó và không chạy cleanup theo logout cũ. Nếu xác nhận chưa đăng nhập thì chuyển anonymous, dọn đúng checkpoint owner/revision, giữ pending. Nếu kiểm tra lại lỗi mạng/5xx hoặc hết ngân sách: đánh dấu unknown, giữ dữ liệu, thông báo đã có xác nhận logout nhưng cần kiểm tra lại phiên; không báo dọn giỏ thành công.
5. Lỗi `403` do phiên khác khiến UI kiểm tra lại auth. `sessionVersion` đổi khi binding đổi, kể cả cùng owner; xác nhận đặt đơn cũ không được dùng lại. Không tự gửi đơn, không đổi owner/key/payload của pending, không giữ Web Lock qua HTTP.

Không đổi Nest API, schema, migration, cookie name/thuộc tính hay quy tắc idempotency đơn. Hiệu đính chỉ áp dụng phần BFF/browser và cần được nêu trong PR tích hợp để các chat đối chiếu.

### Kiểm tra bản sửa

- Môi trường trợ lý: frontend unit test **315/315 đạt**, typecheck, lint và production build đạt. Có thêm 31 ca so với baseline 284: binding, sai/thiếu binding, cùng owner khác phiên, token hỏng/hết hạn, lỗi hệ thống, deadline và cleanup giữ pending.
- Chạy lại cùng script A9 qua Next production HTTP và AuthService thật: **2/2 ca an toàn**. Ở lượt này database/SQL, cookie jar và storage/khóa được giả lập; không ghi nhận là PostgreSQL thật.
- Máy A sau áp bản sửa: console xác nhận **315/315 unit test đạt**, không fail/skip; production build thành công. Không suy từ build ra kết quả kiểm thử chức năng.
- A chạy lại script A9 với Next BFF, NestJS cổng 3002 và PostgreSQL `brewlite_s2_a_auth_test`: `SAFE` cho cả `LOGOUT-OWNER-01` và `LOGOUT-OWNER-02`, **LOGOUT SAFETY CHECKS: 2/2 PASSED**. Console ghi báo cáo `BrewLite_S2_A9_Logout_Result_1793759848952.json`; chưa nhận nội dung JSON để kiểm tra độc lập. Đây là kết quả HTTP/PostgreSQL với cookie jar/coordinator/storage/khóa trong Node, chưa phải kiểm tra trình duyệt thật.
- Hai ca A9 đã chuyển từ **0/2 trước sửa** sang **2/2 sau sửa** theo log A cung cấp. Không dùng kết quả này để tự đánh dấu toàn bộ 37 ca nghiệm thu Sprint 2 đạt.
