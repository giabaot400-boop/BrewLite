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
