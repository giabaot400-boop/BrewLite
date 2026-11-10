# Kiến trúc frontend, BFF và PWA

Ngày cập nhật: 10/11/2026. Đây là phần đóng góp của A cho Task 3.1 Assignment 2,
đã được đưa vào main qua PR #31. PWA được triển khai qua PR #33; chưa xác nhận
hoàn tất kiến trúc tổng thể/ADR, Task 3 hoặc production HTTPS.

Nền tài liệu và layout: main `82c7675` sau khi merge PR #29 và #30.
PR #30 chốt tại `694b49f`, đã chuyển `frontend` → `apps/web`, `backend` → `apps/api`.
Các đường dẫn `apps/*` dưới đây là đường dẫn hiện hành; hồ sơ Sprint 1–2 giữ
đường dẫn lịch sử. Cập nhật trạng thái PWA đối chiếu main `84374c8` sau PR #33;
giữ `82c7675` làm mốc layout, không dùng nó làm HEAD hiện tại. Kết quả và giới hạn
kiểm tra được ghi trong [hướng dẫn PWA](../assignment2/PWA.md).

## 1. Ranh giới thành phần

| Thành phần | Trách nhiệm | Code đối chiếu trong PR #30 |
|---|---|---|
| Next.js server | Layout, chi tiết sản phẩm, Route Handlers BFF; giữ thao tác đọc/ghi cookie phiên ở server | `apps/web/src/app/layout.tsx`, `app/products/[id]/page.tsx`, `app/api/` |
| Client Components | Tương tác menu, size/topping, form, trạng thái phiên và giỏ; giá chỉ là xem trước | `apps/web/src/features/products/components/`, `features/auth/`, `features/cart/` |
| Product API client | Chọn nguồn fixture/api, validate response; menu gọi từ browser, chi tiết gọi ở Next.js server | `apps/web/src/features/products/api.ts` |
| Auth BFF | Cầu nối đăng ký/đăng nhập/me/logout; cookie, kiểm tra nguồn POST và binding phiên | `apps/web/src/app/api/auth/`, `lib/server/auth/` |
| Orders BFF | Kiểm tra owner kỳ vọng bằng token đã capture, chuyển nguyên body/key đến NestJS trong deadline chung | `apps/web/src/app/api/orders/route.ts`, `lib/server/orders/order-handler.ts` |
| NestJS và PostgreSQL | Xác thực phiên/quyền, validate nghiệp vụ, giá chính thức, transaction và dữ liệu bền vững | `apps/api/src/auth/`, `orders/`, `database/`, `prisma/` |

Các đường dẫn rút gọn trong cùng ô đều tính từ `apps/web/src/`.
Next.js BFF dùng Node.js runtime theo code hiện có, bao gồm helper binding dùng
`node:crypto`. Không đưa truy vấn Prisma hoặc quy tắc kho/giá/điểm vào frontend.

## 2. Luồng đang có và phần kế thừa Sprint 3

**Danh mục:** browser tải menu từ NestJS qua `NEXT_PUBLIC_API_URL`; Next.js server
cũng dùng cấu hình đó để tải chi tiết. Product request dùng `cache: no-store`.
Fixture là lựa chọn phát triển riêng, không thay bằng chứng tích hợp API/PostgreSQL.

**Phiên:** browser gọi BFF cùng origin. JWT được lưu bằng cookie HttpOnly,
SameSite=Lax, Secure khi production; không đưa bearer token cho JavaScript.
Binding phiên không thay xác thực: NestJS vẫn kiểm JWT/AuthSession. POST BFF giữ
kiểm tra JSON, marker và Origin theo `assertSameOriginPost`; logout giữ cơ chế
binding và kiểm tra phản hồi muộn A9. Service worker không can thiệp các bước này.

**Giỏ và tạo đơn:** Context/useReducer cùng storage/Web Locks hiện có tiếp tục
quản lý snapshot, revision và pending theo owner đã xác thực. Pending chỉ được
gửi/thử lại chủ động với cùng owner, key và payload bất biến. BFF capture token
một lần, gọi `/auth/me`, đối chiếu owner của pending rồi chuyển `/orders` bằng
chính token ấy; sai owner hoặc chưa xác thực được thì chưa chuyển POST.
Giữ giới hạn body tạo đơn 32 KiB, deadline orders BFF 10 giây và UI transport
15 giây bao gồm đọc response. Không giữ Web Lock trong thời gian chờ HTTP.

Code Sprint 2 hiện tạo và hiển thị PENDING; phần payment/read/cancel mới chưa có
trong code đối chiếu. Sprint 3 kế thừa kiến trúc BFF và bổ sung nghiệp vụ theo
[contract Sprint 3](../sprint3/CONTRACTS.md); giữ giỏ đến khi đọc trạng thái đã trả
hiện tại và binding còn khớp theo [delta giỏ](../assignment2/CONTRACTS.md#delta-giỏ-có-chủ-đích).
Không âm thầm đổi hành vi dọn giỏ Sprint 2 trong PR PWA.

## 3. PWA tối thiểu đã triển khai

PR #33 triển khai manifest của Next.js và service worker nhỏ theo phương án này,
không bổ sung thư viện PWA. Phạm vi phục vụ [NFR-07](../requirements/srs.md#nfr-07-pwa),
không thêm push notification, background sync hoặc chức năng nghiệp vụ offline.

| Hạng mục | Phương án đã triển khai | Trạng thái |
|---|---|---|
| Manifest | `apps/web/src/app/manifest.ts`: tên BrewLite, icon 192/512, start URL `/`, scope `/`, display standalone | Đã merge PR #33 |
| Icon | PNG 192/512 trong `apps/web/public/icons/`; không chứa thông tin người dùng | Đã merge PR #33 |
| Đăng ký worker | `PwaSupport` đăng ký cùng origin, scope `/`; bật cho bản production hỗ trợ secure context | Đã merge PR #33 |
| Worker | `apps/web/public/sw.js`; cache có tên/phiên bản riêng của BrewLite | Đã merge PR #33 |
| Trang offline | `apps/web/public/offline.html`, nội dung chung, không dựng thông tin phiên/đơn | Đã merge PR #33 |

**Chính sách cache đã triển khai:** allowlist chỉ gồm trang offline và icon công khai.
Navigation GET thử mạng trước; chỉ dùng trang offline khi fetch gặp lỗi mạng.
HTTP 401/403/500 không được tự chuyển thành nội dung thành công hoặc kết quả đặt đơn.
Không cache HTML ứng dụng, RSC, response API, dữ liệu catalog/giá hoặc dữ liệu cá nhân.
Các request `/api/*`, request ngoài origin và phương thức khác GET đi theo mạng,
không được ghi Cache Storage hoặc xếp hàng để tự gửi lại. Khi nâng version, worker
chỉ dọn cache do chính tính năng PWA này sở hữu, không xóa localStorage/pending.

Sự kiện online/offline chỉ giúp hiển thị trạng thái, không chứng minh server đã
nhận hoặc chưa nhận request. Request đang gửi mà mất phản hồi vẫn đi theo cơ chế
UNKNOWN/pending hiện có; có mạng lại không tự tạo giao dịch hoặc thay key/payload.
Cache của worker không cung cấp bản sao màn hình riêng tư cho tài khoản khác.
Quy tắc hiển thị/ẩn dữ liệu trong giỏ vẫn do auth/cart bridge hiện có đảm nhiệm.

Trade-off: cache ít giúp kiểm soát dữ liệu riêng tư và tránh giá cũ, nhưng không
cho phép duyệt toàn bộ menu/chi tiết khi offline. Cài/mở app và trang báo offline
đã được kiểm tra local theo [hướng dẫn PWA](../assignment2/PWA.md); chưa xác nhận
hoàn tất AC trên production HTTPS. Nếu mở rộng cache sau này, cần review chính sách riêng.

## 4. Cấu hình và điểm phối hợp deployment

| Cấu hình | Nơi dùng | Điều kiện |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser và Next.js khi đọc Product API | URL public cho catalog, HTTPS khi production; không chứa secret |
| `NEXT_PUBLIC_PRODUCTS_SOURCE` | Product API client | Dùng `api` trong lượt chứng minh tích hợp thật |
| `BACKEND_INTERNAL_URL` | BFF phía server | URL NestJS tin cậy; code còn hỗ trợ `BACKEND_URL`/mặc định local. Production phải đặt rõ, không dùng biến public để chứa secret |
| `APP_ORIGIN` | Kiểm tra nguồn POST BFF | Origin UI chính xác, gồm scheme/host/port, không thêm đường dẫn |
| `FRONTEND_ORIGIN` | CORS tại NestJS | Khớp origin UI cho lượt gọi catalog từ browser |
| Database/JWT secret | Chỉ NestJS/server hoặc secret của nền tảng | Không đưa vào manifest, worker, bundle public hoặc log |

E cần chọn nền tảng/URL thật trước khi chốt deployment diagram. Với code hiện
tại, không thể giả định toàn bộ NestJS chỉ có địa chỉ private vì browser gọi
catalog trực tiếp. Nếu chọn API chỉ private, nhóm phải thiết kế/review cầu nối
catalog riêng; tài liệu này chưa tạo endpoint đó. PostgreSQL production vẫn cần
kết nối private và persistent storage theo đề. Nền tảng và chi phí cần được chốt
theo tài nguyên thực tế của nhóm trước khi hoàn tất thiết kế deployment.

HTTPS production là điều kiện kiểm chứng PWA; localhost phục vụ kiểm tra local.
Lượt local đã dùng Chrome 156.0.8078.80 trên Windows, profile thường; kết quả
cài/mở app nằm trong [hướng dẫn PWA](../assignment2/PWA.md#kết-quả-local-ngày-07112026).
Viewport chưa được lưu kèm; môi trường O-01 và các AC còn phải đối chiếu trên
bản tích hợp/production. Cách cài đặt phụ thuộc hỗ trợ của browser.

## 5. Kiểm tra và bàn giao

| Phạm vi | Kiểm tra | Kết quả hiện có và phần còn chờ |
|---|---|---|
| AC-NFR-07-1 | Manifest/icon/worker, cài và mở app; dùng luồng sản phẩm online | Đã có quan sát local trên máy A; chưa kiểm chứng production HTTPS hoặc kết luận toàn AC đạt |
| AC-NFR-07-2 | Offline, kết nối lại, cache và đổi chủ | Đã có kiểm tra local; nhánh đã gửi mutation rồi mất phản hồi dưới worker và race phiên còn chờ |
| AC-NFR-06-1/2 | UI ở viewport trong SRS; loading/error/offline | Có quan sát offline local nhưng chưa ghi viewport; chưa kết luận đạt các AC này |
| Hồi quy | Unit, typecheck/lint/build và luồng online có worker | PWA.md ghi 346/346 unit test, typecheck/lint/build và luồng cơ bản tới PENDING; không thay kiểm thử tích hợp Sprint 3 hoặc production |

Chi tiết môi trường, phiên bản và giới hạn bằng chứng nằm trong [hướng dẫn PWA](../assignment2/PWA.md).
Các kết quả trên thuộc lượt PWA đã ghi nhận, không phải một lượt chạy mới tại HEAD
hoặc xác nhận mọi AC đã đạt.

A thực hiện phần frontend/BFF/PWA; B đối chiếu component dùng chung và review.
D dẫn kiến trúc tổng thể/ADR, C đối chiếu security/health, E đối chiếu môi trường
và deployment theo kế hoạch nhóm; chưa ghi nhận các bạn đã nhận việc hoặc duyệt
từng phương án trong tài liệu này. Phần độc lập có thể chuẩn bị song song, nhưng
không ghi nghiệm thu Task 3–5 trước các cổng bắt buộc của đề.

Nguồn đối chiếu: [SRS](../requirements/srs.md), [kế hoạch nhóm](../assignment2/TEAM_PLAN.md),
[contract A2](../assignment2/CONTRACTS.md), PR [#29](https://github.com/giabaot400-boop/BrewLite/pull/29),
PR [#30](https://github.com/giabaot400-boop/BrewLite/pull/30),
PR [#31](https://github.com/giabaot400-boop/BrewLite/pull/31),
PR [#33](https://github.com/giabaot400-boop/BrewLite/pull/33) và guide PWA đi kèm
Next.js 16.4.2 tại `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
Guide kỹ thuật không thay yêu cầu đề; chỉ các phần PWA nêu trên nằm trong phương án này.
