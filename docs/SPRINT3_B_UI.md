# Sprint 3 phần B: UI đơn hàng dùng chung (S3-B-01)

Phiên bản 1.1 ngày 08/11/2026 (sửa theo review PR #32). Nền: main `82c7675` (sau PR #29 và #30; thiết kế Sprint 3 gốc đồng bộ với Sprint 2 `a1a0e4a`). Contract nguồn:
`docs/sprint3/CONTRACTS.md` v1.3 mục 2 (response) và mục 3 (lỗi và hành vi UI).

Phạm vi ticket S3-B-01: UI tiền/trạng thái/lỗi dùng chung, trang xác nhận/chi tiết/lịch sử đơn, trạng thái loading/empty/error.
**Không** thuộc B: nút Thanh toán/Hủy, BFF thanh toán/hủy, giỏ hàng/envelope (S3-A-01/02), API đọc phía backend (S3-C-02).

## 1. Đã làm

| Hạng mục | Vị trí | Ghi chú |
|---|---|---|
| Kiểu dữ liệu theo contract | `apps/web/src/features/orders/types.ts` | `OrderDetail`, `HistoryView`, `PaymentView`... đúng CONTRACTS mục 2 |
| Nhãn/mô tả bảy trạng thái, lý do hủy | `order-status.ts` | Chỉ nói điều server đã xác nhận |
| Định dạng tiền VND, giờ Việt Nam, đếm ngược theo đồng hồ server | `order-format.ts` | Tiền là số nguyên; giá trị lạ hiện "—" |
| Bảng lỗi dùng chung (mục 3) | `order-error.ts` | `guidanceForOrderError`: thông báo + việc tiếp theo + "chưa rõ kết quả". Dùng lại được cho tạo/thanh toán/hủy (A) |
| Kiểm tra phản hồi chặt, bỏ trường lạ | `order-parse.ts` | 2xx sai hình dạng là `INVALID_RESPONSE`, không hiện một phần |
| Chống ghi đè trạng thái mới bằng dữ liệu cũ | `order-version.ts`, `order-view-state.ts` | AC S3-ORD-03 (phần UI) |
| Client đọc đơn, deadline 15 giây phủ cả body | `order-read-client.ts` | Cùng quy tắc với `auth-client` |
| Fixture đúng contract (9 đơn, 7 trạng thái) | `order-fixtures.ts` | `NEXT_PUBLIC_ORDERS_SOURCE=mock`; **không phải E2E** |
| Hook đọc có chốt phiên | `use-order-reads.ts`, `components/require-session.tsx` | Mỗi lượt đọc gắn với phiên + binding lúc bắt đầu; phản hồi đến sau khi đổi phiên/chủ bị bỏ; màn hình tách theo `key` chủ + phiên |
| Trang | `app/orders/page.tsx` (lịch sử), `app/orders/[id]/page.tsx` (xác nhận/chi tiết) | Một giao diện cho xác nhận và chi tiết |
| BFF chỉ-đọc | `app/api/orders/me`, `app/api/orders/[id]`, `lib/server/orders/order-read-handler.ts` | Bearer từ cookie, đối chiếu binding phiên (mục 2), 10 giây, không xóa cookie, `no-store` |
| Liên kết "Đơn hàng" | `auth-nav.tsx` | Chỉ hiện khi đã đăng nhập |

## 2. Cách nối với phần của người khác

**A (S3-A-02)**

- Sau tạo đơn thành công điều hướng `/orders/<id>?placed=1`: hiện thông báo xác nhận nhưng nội dung luôn là **đơn hiện tại** do server trả.
- Nút Thanh toán/Hủy gắn qua prop `renderActions({ canPay, canCancel })` của `OrderDetailView` / `OrderDetailPage`. `canPay`/`canCancel` chỉ là gợi ý; POST luôn kiểm tra lại.
- Mã lỗi tạo/thanh toán/hủy dùng chung `guidanceForOrderError` để thông báo nhất quán.

**C (S3-C-02)** cần cung cấp đúng hình dạng sau, nếu không UI hiện lỗi "Phản hồi không đúng định dạng":

- `GET /orders/me` → `{ items: HistoryItem[], serverTime }`, đăng ký **trước** `/:id`.
- `GET /orders/:id` → `OrderDetail` (có `latestPayment`, `canPay`, `canCancel`, `serverTime`).

**BFF đọc (ràng buộc tài khoản, sửa theo review P1)**: backend vẫn tự xác thực Bearer và lọc theo chủ (404 cho đơn của người khác).
Thêm vào đó, tab đang hiển thị tài khoản A có thể còn sống khi cookie đã chuyển sang B (đăng nhập ở tab khác). Để dữ liệu của B không hiện trong giao diện của A:

- UI gửi header `X-BrewLite-Expected-Session` = binding của phiên UI đang hiển thị (lấy từ `/api/auth/me` hoặc đăng nhập, chụp cùng lúc với phiên bản phiên). Thiếu hoặc sai dạng thì client **không gửi yêu cầu** (`SESSION_INVALID`, fail-closed).
- BFF đọc cookie **một lần**, tính binding từ chính token đó (cùng hàm với `/api/auth/me`), so với header. Không khớp: `403 REQUEST_FORBIDDEN`, **không gọi backend**, không xóa cookie. Cùng token đó dùng cho Bearer.
- Binding chỉ là giá trị đối chiếu, không cấp quyền; backend vẫn là nơi quyết định quyền.
- Khi UI nhận lỗi phiên (401/403 hoặc `SESSION_*`), hook gọi `refresh()` (`/api/auth/me`, chỉ đọc) để đồng bộ lại: không còn phiên → cổng đăng nhập; tài khoản đã đổi → `key` đổi và đọc lại đúng chủ. Không tự thử lại yêu cầu đọc.
- Đây là thay đổi so với bản 1.0 (BFF đọc không so owner). Hợp đồng ghi (payment/cancel của A) vẫn do S3-A-02; nếu A dùng cùng header thì thống nhất tên header này (`EXPECTED_SESSION_HEADER` đã có sẵn từ logout A9).

## 3. Hành vi cần biết

- **Không tự gọi lại sau lỗi**: lỗi mạng/timeout/body sai/5xx không bao giờ hiện là "thất bại cuối"; khách bấm "Thử lại". Khi làm mới lỗi, dữ liệu đang hiển thị được giữ.
- **Version**: dữ liệu có `version` thấp hơn bản đang hiển thị bị bỏ; cùng version thì nhận lượt đọc mới hơn.
- **Đếm ngược**: tính theo `serverTime` + thời gian trôi kể từ lúc nhận. Chỉ để hiển thị; hết giờ không tự hủy hay chặn nút. Server quyết định.
- **Đơn cũ (policy 1)**: `PENDING` + không có hạn + `canPay=canCancel=false` → hiện "chỉ xem" bằng mô tả riêng (`isLegacyViewOnly`, `LEGACY_DESCRIPTION`). Không hiện "đã giữ hàng" hay hướng dẫn thanh toán trước hạn vì đơn không có dữ liệu giữ kho/thanh toán S3.
- **401 / hết phiên khi đọc**: lỗi hiện kèm nút "Đăng nhập lại" có `next` quay về đúng trang (đơn hoặc lịch sử) và `reason=required`; đồng thời auth được đồng bộ lại như mục 2.
- **ID đơn là opaque**: trang chi tiết nhận `id` từ Next.js (đã giải mã đúng một lần) và truyền thẳng, không giải mã thêm. `/orders/a%252Fb` hỏi đúng id `a%2Fb`; client mã hóa lại đúng một lần khi gọi BFF.
- **Lịch sử không phân trang/lọc** (CONTRACTS mục 2).

## 4. Kiểm tra đã chạy

Mỗi dòng ghi đúng môi trường đã chạy. Không gộp kết quả giữa các môi trường.

| Lệnh / cách | Môi trường | Kết quả |
|---|---|---|
| lint, typecheck, `npm test` (frontend) trên bản trước khi sửa review | Máy B, Node 24, 06–07/11/2026 | Đạt; 378/378 test |
| lint, `npm run typecheck --workspace apps/web`, `npm test --workspace apps/web` sau khi sửa review PR #32 | Môi trường hỗ trợ của B, Node 22.22 (repo yêu cầu ≥ 24.15 < 25), 08/11/2026 | Không lỗi lint/typecheck; 388/388 test (thêm 10 test: binding client/BFF, `needsSessionResync`, đơn cũ, ID có `%`) |
| `npm run build` với `NEXT_PUBLIC_AUTH_SOURCE=mock NEXT_PUBLIC_ORDERS_SOURCE=mock` | Như trên | Thành công; có route `/orders`, `/orders/[id]`, `/api/orders/me`, `/api/orders/[id]` |
| `docs/sprint3/scripts/b-orders-e2e.cjs` (Playwright/Chromium, mock auth + mock orders, 360 px và 1280 px) | Như trên | 44/44 PASS, gồm đơn cũ không có câu "giữ hàng/thanh toán trước hạn" và URL `/orders/a%252Fb` |

**Việc còn lại trước khi ghi PASS chính thức**: chạy lại ba lệnh đầu và script Playwright trên **Node 24** ở máy B, ghi SHA commit. Kết quả Node 22.22 chỉ là tham khảo.

**Chưa kiểm tra tự động**: luồng hook `refresh()` khi GET trả 401/403 (cần backend hoặc auth HTTP thật; hiện chỉ có test đơn vị cho `needsSessionResync` và test BFF trả 403 không gọi backend), và ID có `%` đi hết chuỗi UI → BFF → backend (hiện có test round-trip `orderPath` và test BFF mã hóa ID, chưa có E2E).

## 5. Chưa làm / chưa kiểm tra

- Chưa chạy với backend C/D/E thật (DEP-05/06 chưa đạt); fixture không phải bằng chứng E2E.
- Chưa có nút Thanh toán/Hủy (thuộc A).
- Chưa thử trình đọc màn hình thật, Safari, Firefox.
- Tổng thanh toán hiển thị theo `total` server trả; UI không tự tính lại giá. Không kiểm tra `subtotal − discountTotal = total` ở client (đơn cũ có thể không thỏa).
