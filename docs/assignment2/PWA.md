# PWA tối thiểu — hướng dẫn kiểm tra

Ngày cập nhật: 07/11/2026. Nền code: main `82c7675` sau PR #30.
Phần này triển khai phía A cho NFR-07; không xác nhận hoàn tất Task 3–5 A2.
Phương án frontend/BFF/PWA nằm trong PR #31; kết quả implementation được ghi riêng dưới đây.

## Phạm vi

- Manifest `/manifest.webmanifest`, icon PNG 192/512 (nguồn vector tại `apps/web/public/icons/icon.svg`).
- `PwaSupport` đăng ký `/sw.js` trong bản production có secure context; thông báo offline là gợi ý trạng thái kết nối.
- Cache Storage chỉ có `/offline.html` và hai PNG trong cache `brewlite-pwa-static-v1`.
- Navigation cùng origin thử mạng với `no-store`; lỗi mạng dùng trang offline chung. HTTP 401/403/404/500 giữ nguyên response.
- Worker không xử lý `/api/*`, POST hoặc phương thức khác GET, request khác origin, RSC hay tài nguyên Next.js. Không lưu HTML ứng dụng hoặc dữ liệu API, không background sync, tự retry, sửa pending/key/body hoặc thao tác localStorage.
- Bản worker mới không gọi `skipWaiting` hoặc tự reload tab đang thao tác; khi activate chỉ xóa cache phiên bản cũ có tiền tố `brewlite-pwa-static-`. Sửa nội dung tài nguyên precache phải tăng phiên bản cache.
- Không thay auth, Order API, nghiệp vụ giỏ, schema, migration hoặc dependency. Hành vi dọn giỏ hiện vẫn theo Sprint 2; phần đổi sang giữ giỏ đến paid-current thuộc tích hợp Sprint 3 riêng.

Trade-off: trang offline chung giúp tránh giữ dữ liệu cá nhân/giá cũ, nhưng không hỗ trợ duyệt menu hoặc đặt hàng offline. Không thêm push notification hoặc thư viện PWA.

## Kiểm tra tự động đã chạy trong môi trường trợ lý

Node 24.22.1, npm 11.9.0, Linux:

| Kiểm tra | Kết quả |
|---|---|
| `npm ci` theo lockfile | Đạt; không sửa dependency |
| `npm test --workspace apps/web` | 346/346 đạt, không fail/skip: 315 ca nền và 31 ca service worker |
| Frontend typecheck/lint/build | Đạt; build có route `/manifest.webmanifest` |
| `node --check apps/web/public/sw.js` | Đạt |
| HTTP trên build production local | Sáu nhóm đạt: worker/header, manifest, hai icon, trang offline, link manifest ở trang chủ và auth chưa đăng nhập vẫn 401 JSON/no-store |
| Icon PNG | Đã kiểm tra kích thước 192/512 và xem icon nguồn kết xuất |

Test worker chạy mã worker trong VM với fetch/cache/event giả, kiểm allowlist,
cookie-less precache, dọn đúng cache sở hữu, giữ HTTP error, fallback khi lỗi mạng
và bypass mutation/API/RSC. Chúng không thay bằng chứng browser thật.
Đã thử khởi chạy Chromium nhưng môi trường chặn thao tác hệ thống; chưa chạy
thành công kiểm tra browser, cài app, PostgreSQL hoặc production HTTPS cho PWA.

## Kiểm tra trên máy A

Dùng Chrome trên Windows, **profile thường** có hỗ trợ cài web app; ghi phiên bản
tại `chrome://version`. Chọn viewport từ SRS và ghi kích thước đã thử.
Production HTTPS còn cần kiểm chứng trên hạ tầng triển khai thực tế; localhost
được dùng cho lượt kiểm tra local, không thay chứng cứ deployment production.

Dừng các server BrewLite đang chạy. Terminal backend test:

```powershell
Set-Location D:\cnpm\brewlite\apps\api
$env:PORT = "3002"
node --env-file=.env.test dist/main.js
```

Lệnh trên dùng backend đã build và database test hiện có. Nếu chưa build sau khi
cài dependency, chạy `npm run build --workspace apps/api` từ gốc repo trước.
Không reset/migrate/seed chỉ vì thêm PWA.

Terminal frontend, đặt biến **trước build** vì `NEXT_PUBLIC_*` được đưa vào bundle:

```powershell
Set-Location D:\cnpm\brewlite
$env:NEXT_PUBLIC_API_URL = "http://localhost:3002"
$env:NEXT_PUBLIC_PRODUCTS_SOURCE = "api"
$env:BACKEND_INTERNAL_URL = "http://localhost:3002"
$env:APP_ORIGIN = "http://localhost:3000"
npm run build --workspace apps/web
npm run start --workspace apps/web
```

Mở đúng `http://localhost:3000`. `npm run dev` không đăng ký worker mới để tránh
lẫn cache PWA với quá trình phát triển. Sau lần đầu cài worker, cần chờ trạng thái
activated/controller hoặc tải lại một lần; browser mới chưa từng online không
có sẵn trang offline. Bản cập nhật worker có thể chờ các tab cũ đóng.

### Kết quả local ngày 07/11/2026

A thực hiện thủ công trên Windows, Chrome **156.0.8078.80 Stable, 64 bit**,
profile thường; Node 24.16.0, npm 11.13.0. Frontend dùng bản production tại
`http://localhost:3000`, Product API/BFF kết nối backend test cổng 3002 với
PostgreSQL test đã thiết lập. Nhánh `feature/a2-pwa`, nền `82c7675`; khi chạy,
thay đổi PWA chưa commit. Đây là kết quả trên working tree, không gán cho SHA
phát hành hoặc môi trường HTTPS production.

A báo 346/346 unit test đạt, typecheck/lint không báo lỗi và build hoàn tất.
Các quan sát browser dưới đây do A báo lại trong phiên hướng dẫn; chưa có
log browser/ảnh hoặc kích thước viewport được lưu kèm trong repository.

| Bước | Quan sát thực tế trên máy A | Kết quả và giới hạn |
|---|---|---|
| Manifest và service worker | Tên/icon đúng, worker activated; trang offline hoạt động khi thử mất mạng | Đạt local theo A. Header `/sw.js` đã kiểm bằng HTTP trong môi trường trợ lý, chưa ghi lượt kiểm header riêng trên browser A |
| Cài và mở app | Cài bằng giao diện Chrome, có biểu tượng BrewLite trên desktop; mở lại từ biểu tượng vào cửa sổ riêng, menu và chi tiết món tải được khi online | Đạt local trên phiên bản Chrome nêu trên |
| Cache sau menu/auth/giỏ/tạo đơn | Cache `brewlite-pwa-static-v1` chỉ có `/offline.html`, `/icons/icon-192.png`, `/icons/icon-512.png` | Đạt cho danh sách tài nguyên đã quan sát; không thêm HTML ứng dụng hoặc API |
| Offline rồi tải lại `/cart` | Trang “Đang ngoại tuyến”, không hiện màn hình tài khoản/đơn từ cache; chuyển online và mở lại menu được | Đạt local |
| Mất mạng trước khi xác nhận đặt đơn | Hiện “Chưa xác minh lại được phiên. Vui lòng kiểm tra kết nối và mở lại xác nhận.”; không báo tạo đơn thành công mới | Đạt cho nhánh chặn trước khi gửi. Chưa kiểm nhánh đã gửi rồi mất phản hồi trong lượt PWA này |
| Kết nối trở lại | Sau khi bật lại mạng và chưa bấm thử lại, A không thấy request tự phát trong Network | Không quan sát thấy POST tạo đơn tự gửi lại trong tình huống vừa thử. Payment chưa được triển khai ở bản này |
| Đổi tài khoản A → đăng xuất → B | Giỏ/kết quả riêng của A không hiện cho B; cache vẫn chỉ ba tài nguyên public; offline và tải lại `/cart` chỉ hiện trang offline chung | Đạt cho trình tự đổi tài khoản đã thử; không thay các test race cookie/response muộn |
| Hồi quy online | Menu → đăng nhập → giỏ → chủ động xác nhận tạo đơn nhận mã đơn/PENDING và dọn giỏ theo Sprint 2 | Đạt cho luồng cơ bản trên bản có worker; chưa chứng minh payment hoặc delta giữ giỏ Sprint 3 |

Hai quan sát bổ sung: khi chưa đăng nhập nhưng storage còn giỏ đã có chủ,
badge hiện “…” và giỏ bị khóa; đăng nhập lại thì mở được giỏ. Nút “Thử đọc lại
giỏ” không xóa hay đặt lại storage. Có một lần quay lại trang rồi bấm Đặt hàng
chưa mở hộp ở lần đầu; thử lại sau khi đưa focus về trang, chờ kiểm tra phiên/giỏ
kết thúc thì một lần bấm mở được. Chưa tái hiện ổn định hiện tượng cần hai lần
bấm; chưa kết luận nguyên nhân hoặc ghi là đã sửa lỗi.

Network → Offline của DevTools hoặc tắt mạng hệ điều hành phải được áp dụng rồi
kiểm tra thực tế; không suy ra mất mạng chỉ từ biểu tượng. Khi trở lại online,
giữ Network log để kiểm tra không có POST tự phát. Chỉ ghi đạt ca đã thực hiện.
Kết quả lỗi/bằng chứng mất response không cho phép tự đổi key của pending.

Để trở lại kiểm thử một bản chưa có PWA, vào Application → Service Workers →
Unregister; chỉ xóa cache `brewlite-pwa-static-*` khi cần làm sạch worker. Không
dùng Clear site data để dọn worker vì thao tác đó còn xóa giỏ/pending/cookie.

## Điểm còn chờ

Các bước local đã ghi kết quả theo phạm vi thực tế ở trên; chưa xác nhận hoàn
tất AC-NFR-07-1/2 hoặc Task 3–5 A2. Còn kiểm chứng HTTPS production và cài/mở
app trên hạ tầng triển khai, các viewport NFR-06 chưa ghi nhận, nhánh đã gửi
mutation rồi mất phản hồi dưới worker và các tình huống phiên đổi đồng thời.
Kết quả nền Sprint 2 không tự thay bằng chứng cho bản tích hợp Sprint 3.
Giữ các giới hạn này khi review PR và bổ sung kết quả tại mốc triển khai thật.
