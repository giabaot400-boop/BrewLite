# Sprint 2 — A8b: xác nhận, retry và kết quả đơn trên UI

## Baseline, phạm vi và nguồn

- Baseline: `e47348f` trên nhánh `integration/sprint2-auth-cart-orders`.
- Nguồn yêu cầu: đặc tả Sprint 2 v0.6, ORDER-AC-01/05–10, LOGIN-AC-04/06/08, P01/P02/P03/P09; dùng contract owner UI–BFF đã ghi ở A8a.
- A nối giao diện đặt đơn vào CartProvider/CartPanel. Dùng ConfirmDialog, Button, Card và auth context đã có của B/C; không sửa các component dùng chung hoặc chuyển nghiệp vụ OrdersService/schema của D/E sang frontend.
- Không thêm HTTP field/header mới ngoài A8a; không đổi migration, model hoặc endpoint NestJS. Không thêm payment, lịch sử đơn hay máy trạng thái Sprint 3.

## Luồng giao diện

1. Giỏ khách có món hiển thị liên kết đăng nhập với `next=/cart` theo helper return-to hiện có. Giỏ được giữ qua đăng ký/đăng nhập; không POST đơn khi login/refresh.
2. Tài khoản đã xác thực, giỏ có món và không có pending: nút **Đặt hàng** mở xác nhận chứa món/size/topping/số ly/đơn giá và tổng xem trước đã chụp. Hủy/đóng không ghi storage, sinh key hoặc gọi HTTP.
3. **Xác nhận đặt hàng** mới sinh UUID cho lần đặt mới. Bridge kiểm tra auth hiện tại bên trong Web Lock và lifecycle kiểm tra owner/revision trước khi lưu pending bền. Không lưu được thì không gửi. Chỉ sau nhả khóa mới gọi bounded transport/BFF.
4. Trong lúc chuẩn bị/gửi/lưu kết quả, hiển thị **Đang tạo đơn…**; khóa thao tác đặt/retry của owner đó. Pending bền chặn chỉnh giỏ, kể cả khi tab khác đang gửi. Không giữ Web Lock trong thời gian chờ HTTP.
5. Kết quả đi qua settlement đã có. Khi 200/201 hợp lệ và lưu kết quả thành công: hiện mã đơn, tổng chính thức, **Chờ thanh toán (PENDING)**; dọn đúng giỏ/pending theo owner/revision. Kết quả gần nhất đã lưu được khôi phục sau reload; đây không phải API lịch sử hoặc trạng thái thanh toán hiện tại.
6. Mạng/timeout/5xx/IN_PROGRESS, phản hồi sai, 401/403/413 hoặc conflict giữ pending theo bảng P01. UI hiển thị snapshot của lần đặt, không thay bằng giỏ hiện tại. **Thử lại cùng lần đặt** mở xác nhận snapshot cũ và chỉ gửi khi khách xác nhận; giữ owner/key/payload, có thể tạo đơn đầu tiên nếu lần gửi trước chưa tới server.
7. 400 nghiệp vụ xác định hiển thị lỗi toàn giỏ hoặc từng dòng. Ánh xạ index lỗi theo payload gốc sang khóa cấu hình product/size/topping; không ghép theo vị trí DOM. Không gắn lỗi của request cũ vào một giỏ mới không liên quan. Chỉnh giỏ thành công xóa feedback cũ.
8. PRICE_CHANGED cập nhật giá theo settlement, giữ lựa chọn/số lượng, yêu cầu khách kiểm tra và xác nhận mới. Không tự gửi lại. Lần xác nhận mới dùng key mới; retry chưa rõ kết quả tiếp tục key cũ.

## Phiên, nhiều tab và phản hồi muộn

- Dialog giữ nguyên nội dung đã xem trong lúc kiểm tra lại phiên cùng tài khoản; chỉ nút xác nhận bị khóa, vẫn cho Hủy/Esc. Kiểm tra thành công và giỏ/lần đặt không đổi thì tiếp tục xác nhận cũ. Đăng nhập lại, đăng xuất, đổi tài khoản hoặc thay đổi giỏ/lần đặt làm xác nhận cũ mất hiệu lực; không tự mở lại khi quay về tài khoản trước. Lifecycle tiếp tục kiểm tra checkpoint trước HTTP.
- Review là snapshot được sao chép/đóng băng; controller giữ dữ liệu xác nhận riêng và kiểm tra payload sau chuẩn bị. Không gửi nội dung bị đổi so với phần đã review, kể cả storage bị thay mà không tăng revision.
- Mỗi owner có trạng thái xử lý riêng trong tab. Double click cùng owner không phát thêm POST; owner khác có thể tiếp tục sau chuyển tài khoản mà không bị request cũ khóa giỏ mới.
- Khi nhận phản hồi, luôn settle bằng owner/key đã gửi. Phiên/giỏ hiện tại khác thì không xóa giỏ mới hoặc hiển thị kết quả của owner cũ. Nếu tab khác đã settle cùng key và có kết quả đã xác nhận trong storage, feedback không đổi kết quả đó thành chưa rõ.
- Với 401/403 của owner đang hoạt động, kiểm tra lại `/me`; không tự gửi lại hoặc logout tài khoản khác vì pending cũ. Backend/BFF vẫn là lớp xác thực thực tế; metadata local không quyết định quyền đặt.
- Logout chủ động có thể dọn giỏ theo bridge đã có và giữ pending. Đăng nhập lại đúng owner có thể retry snapshot dù cart rỗng hoặc đã nhận một giỏ khách mới. Retry snapshot cũ không xóa giỏ mới khác revision khi nhận kết quả.
- Nếu lưu kết quả local lỗi sau HTTP: giữ khả năng phục hồi/retry, không sinh key mới để vượt lỗi. SUBMITTING còn trong bytes được đọc lại thành UNKNOWN. Không hiển thị kết quả như đã lưu thành công khi settlement storage thất bại.

## Thành phần thay đổi

- `cart-order-client.ts`: review, xác nhận, chuẩn bị bền, HTTP và settlement; điều phối trạng thái theo owner, không phụ thuộc React.
- `cart-order-feedback.ts`: thông báo theo kết quả và ánh xạ lỗi theo cấu hình món.
- `cart-session-bridge.ts`: bổ sung chuẩn bị BEGIN/RETRY với guard auth/logout ở trong lock; không đổi hành vi cookie/server logout.
- `cart-provider.tsx`: expose pending/result/phase/feedback và hành động review/submit qua Cart Context; vẫn dùng useReducer cho view. Đọc/khôi phục không gửi HTTP tạo đơn.
- `cart-order-panel.tsx`, `cart-panel.tsx`: snapshot xác nhận có vùng cuộn, loading, retry, giá đổi, lỗi theo dòng và kết quả PENDING. Giữ nguyên helper tính giá và Product API Sprint 1.

## Kiểm tra trong môi trường triển khai của trợ lý ngày 03/11/2026

- `npm test --workspace frontend`: **267/267 đạt**, không fail/skip; tăng 29 so với A8a (22 ca controller và 7 ca feedback).
- Ca mới: hủy review, snapshot không alias, lưu trước HTTP/nhả lock, checkpoint cũ, double click, phiên chưa xác định, đổi auth trước/trong/sau chuẩn bị, logout, quota trước/sau HTTP, retry sau logout từ cart rỗng, payload cũ, phản hồi muộn, hai owner cùng có request, giá đổi và lỗi theo dòng.
- Frontend typecheck và lint không báo lỗi/cảnh báo. Production build thành công với nguồn sản phẩm fixture; route `/api/orders` tiếp tục có trong build.
- **12/12 smoke check DOM giả lập** bằng React DOM và Happy DOM 21.0.4, auth/network/storage-lock giả lập: guest login link, hủy/confirm/loading, PENDING + dọn giỏ, remount phục hồi kết quả, PRICE_CHANGED + xác nhận mới, lỗi theo dòng, retry sau logout, phản hồi muộn khác owner, snapshot retry tách giỏ khách mới và đóng dialog cũ khi đổi auth. Không cài thêm dependency vào repo cho lượt smoke này.
- Đây chưa phải kiểm tra trình duyệt thật, focus/bàn phím, responsive hoặc HTTP UI–BFF–NestJS–PostgreSQL thật cho A8b. Bằng chứng A8a 22/22 nằm ở mốc đã ghi riêng; không chuyển thành bằng chứng bấm nút UI của thay đổi mới.
- Không suy ra toàn bộ 37 TC của đặc tả đã đạt từ các số unit/smoke trên.

## Chặng kiểm tra trên máy A

Sau apply: unit test/typecheck/lint/build, whitespace và danh sách file. Sau đó dùng frontend dev 3000 với `NEXT_PUBLIC_AUTH_SOURCE=api`, `NEXT_PUBLIC_PRODUCTS_SOURCE=api`, Product API/BFF cùng trỏ backend test 3002 bằng cấu hình đã dùng, database `brewlite_s2_a_auth_test`.

- Giỏ khách → đăng nhập từ nút trên giỏ → về `/cart`, giữ lựa chọn và không tự đặt.
- Mở xác nhận → Hủy/Esc: không thêm pending/Order. Xác nhận đặt: loading, nút khóa; thành công hiện mã/tổng/PENDING, giỏ và badge cập nhật đúng. Reload phục hồi kết quả mà không POST.
- Tạo lỗi kiểm soát để thử pending/retry cùng key sau reload/logout; giá đổi phải chờ xác nhận; lỗi dòng phải ở đúng món. Kiểm tra account switch/nhiều tab không mất pending hoặc xóa giỏ mới.
- Kiểm tra keyboard/dialog, vùng cuộn khi nhiều món và responsive phù hợp với UI mới. Chỉ ghi các ca thực sự đã chạy, không bắt buộc ảnh riêng cho mỗi AC.

## Kết quả kiểm tra UI trên máy A ngày 03/11/2026

Kết quả dưới đây được ghi nhận theo phản hồi của A sau khi kiểm tra thủ công. `git diff --check` không báo lỗi; danh sách thay đổi gồm 9 file A8b. Các lượt kiểm tra UI chưa kèm bản xuất Network để đối chiếu độc lập.

Cấu hình kiểm tra: frontend dev cổng 3000, nguồn xác thực và sản phẩm là API; BFF và Product API trỏ backend test cổng 3002, dùng PostgreSQL 17 với database `brewlite_s2_a_auth_test`.

| Tình huống | Kết quả ghi nhận |
| --- | --- |
| Đăng nhập từ giỏ khách và hủy xác nhận | Giữ các món đã chọn sau đăng nhập. Hủy xác nhận đặt hàng giữ nguyên giỏ. |
| Tạo đơn thành công và tải lại trang | Hiển thị mã đơn, tổng tiền chính thức và trạng thái PENDING; giỏ và badge cập nhật tương ứng. Sau F5, kết quả đơn được khôi phục. |
| Mất mạng trước khi gửi đơn | Bật Offline trong trình duyệt để mô phỏng mất mạng. UI giữ bản ghi lần đặt chưa rõ kết quả cùng dữ liệu đã chụp và khóa chỉnh sửa giỏ. |
| Kết nối lại và thử lại sau F5 | Khôi phục được lần đặt chưa rõ kết quả; chỉ gửi lại khi người dùng xác nhận. A quan sát hai giá trị `Idempotency-Key` giống nhau. |
| Giá sản phẩm thay đổi | Dùng `BrewLite_S2_A8b_Price_Fixture.cjs` tăng tạm giá cơ sở của `coffee-milk` trong database test sau khi đã thêm món vào giỏ. Lần đặt theo giá cũ nhận 409 `PRICE_CHANGED`; UI cập nhật giá, giữ lựa chọn và số lượng, rồi chờ xác nhận. Sau khi xác nhận theo giá mới, nhận 201 và kết quả PENDING. A quan sát key của lần xác nhận mới khác key bị từ chối do đổi giá. |

Sau ca đổi giá, cần trả giá sản phẩm về mức ban đầu bằng công cụ fixture. Kết quả khôi phục chưa có log riêng trong hồ sơ này; khi đối chiếu, kiểm tra thông báo `RESTORED ORIGINAL PRICE` hoặc trạng thái giá trong database test.

Các kết quả 267/267 unit test, typecheck, lint, build và 12/12 kiểm tra DOM giả lập ở phần trên thuộc môi trường triển khai của trợ lý. Tại mốc ghi nhận, chưa có log riêng của các lệnh này trên máy A để bổ sung vào hồ sơ.

## Phạm vi còn cần kiểm tra

- Lỗi validation theo dòng qua API thật; thao tác bàn phím, Esc, focus, vùng cuộn nhiều món và responsive.
- Hết hạn phiên, đổi tài khoản hoặc đăng xuất khi có lần đặt chưa rõ kết quả; đồng bộ nhiều tab và xử lý phản hồi muộn trên trình duyệt thật.
- Server đã tạo đơn nhưng phản hồi bị mất; timeout và lỗi lưu trữ thực tế. Ca Offline trước khi gửi chưa bao phủ các tình huống này.
- Body của lần gửi lại chưa được đối chiếu trực tiếp qua bản xuất Network; ghi nhận trên máy A hiện xác nhận hai key giống nhau.

Các lượt kiểm tra trên chưa đủ để kết luận toàn bộ 37 ca kiểm thử của đặc tả đều đạt. PR tích hợp tiếp tục được review theo quy trình của nhóm.

ORDER-AC-08 vẫn dọn phần giỏ khớp khi tạo đơn PENDING thành công. Cách giữ/khôi phục các món khi thanh toán thất bại thuộc thiết kế Sprint 3, chưa được bổ sung vào luồng này.

## Sửa hộp xác nhận tự đóng khi trang nhận focus

Baseline sửa lỗi: `cce62c3`. Khi kiểm tra bàn phím, A báo Tab/Shift+Tab đi đến thanh công cụ trình duyệt, sau đó hộp xác nhận tự đóng khi trở lại trang. Việc focus đến thanh công cụ được phép với dialog HTML gốc; nội dung trang phía sau vẫn phải bị khóa. Hiện tượng tự đóng được ghi nhận là lỗi cần sửa, chưa tính lượt kiểm tra đó là đạt.

Nguyên nhân trong code: sự kiện focus gọi kiểm tra lại phiên/giỏ; trạng thái giỏ tạm khôi phục và object auth snapshot mới làm điều kiện mở dialog mất hiệu lực ngay cả khi tài khoản không đổi.

Điều chỉnh:

- Bổ sung phiên bản liên tục của trạng thái đăng nhập trong bộ điều phối auth. `/me` thành công cho cùng tài khoản giữ phiên bản này; đăng nhập chủ động, đăng xuất hoặc đổi trạng thái/tài khoản làm phiên bản thay đổi. Đây là dấu mốc UI, không phải JWT/session ID hay bằng chứng xác thực từ server. Các guard storage vẫn đối chiếu chính xác object auth snapshot như trước.
- Lưu riêng nội dung xác nhận và so sánh lại giỏ, revision và dữ liệu pending bất biến sau khi kiểm tra. Giữ dialog mở trong lúc chờ; chỉ tiếp tục khi có snapshot xác thực mới, phiên bản liên tục không đổi và dữ liệu vẫn khớp. Lỗi mạng chỉ giữ auth cache thì không đủ để mở khóa xác nhận cũ.
- Xác nhận cũ bị hủy hiệu lực khi đổi tài khoản, đăng nhập lại, lỗi đọc giỏ hoặc thay đổi dữ liệu; trở lại tài khoản trước không khôi phục dialog cũ. Không thay nội dung đã xem bằng giỏ mới.
- Hai lần kiểm tra focus/visibility chạy chồng nhau chỉ cho lượt mới nhất công bố kết quả. Chặn thao tác xác nhận bắt đầu trong lúc đọc lại ngay cả trước khi React kịp cập nhật giao diện.
- ConfirmDialog dùng chung có thêm tùy chọn chỉ khóa nút xác nhận và trả focus về nút mở hiện tại sau khi giỏ được dựng lại; hành vi `busy`, Hủy/Esc của các nơi sử dụng khác giữ nguyên. Phần auth/UI dùng chung cần B/C đối chiếu khi review tích hợp.
- Không đổi API, cookie, schema, key/payload, giá hoặc quy tắc retry. Kiểm tra owner ở BFF và guard lifecycle tiếp tục áp dụng trước khi gửi đơn.

Kiểm tra bản sửa trong môi trường triển khai của trợ lý: **284/284 unit test đạt** (thêm 5 ca auth và 12 ca xác nhận); frontend typecheck, lint và production build đạt. Build dùng nguồn sản phẩm fixture. **19/19 kiểm tra DOM giả lập đạt**, gồm 12 ca trước đó và 7 ca giữ dialog, khóa xác nhận khi chờ, kiểm tra chồng nhau, hủy khi chờ, lỗi mạng, đổi owner/giỏ và retry cùng key/payload. Auth/network/storage/Web Locks của lượt DOM được giả lập; chưa thay thế kiểm tra bàn phím trên trình duyệt thật hoặc PostgreSQL.

Ngày 04/11/2026, A xác nhận kiểm tra lại trên trình duyệt: hộp xác nhận giữ nguyên khi Tab lên thanh công cụ rồi quay lại trang; Esc và Hủy đóng hộp, giữ giỏ và không phát sinh POST tạo đơn. A báo các lệnh unit test, typecheck, lint và build đạt. Ca chủ động làm chậm /me chưa được xác nhận riêng trên máy A.
