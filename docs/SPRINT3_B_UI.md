# Sprint 3 phần B: UI đơn hàng dùng chung (S3-B-01)

Phiên bản 1.0 ngày 06/11/2026. Nền: main `a1a0e4ae92de681deac538685e24407b3190866b`. Contract nguồn:
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
| Hook đọc có chốt phiên | `use-order-reads.ts`, `components/require-session.tsx` | Phản hồi đến sau khi đổi phiên/chủ bị bỏ; màn hình tách theo `key` chủ + phiên |
| Trang | `app/orders/page.tsx` (lịch sử), `app/orders/[id]/page.tsx` (xác nhận/chi tiết) | Một giao diện cho xác nhận và chi tiết |
| BFF chỉ-đọc | `app/api/orders/me`, `app/api/orders/[id]`, `lib/server/orders/order-read-handler.ts` | Bearer từ cookie, 10 giây, không xóa cookie, `no-store` |
| Liên kết "Đơn hàng" | `auth-nav.tsx` | Chỉ hiện khi đã đăng nhập |

## 2. Cách nối với phần của người khác

**A (S3-A-02)**

- Sau tạo đơn thành công điều hướng `/orders/<id>?placed=1`: hiện thông báo xác nhận nhưng nội dung luôn là **đơn hiện tại** do server trả.
- Nút Thanh toán/Hủy gắn qua prop `renderActions({ canPay, canCancel })` của `OrderDetailView` / `OrderDetailPage`. `canPay`/`canCancel` chỉ là gợi ý; POST luôn kiểm tra lại.
- Mã lỗi tạo/thanh toán/hủy dùng chung `guidanceForOrderError` để thông báo nhất quán.

**C (S3-C-02)** cần cung cấp đúng hình dạng sau, nếu không UI hiện lỗi "Phản hồi không đúng định dạng":

- `GET /orders/me` → `{ items: HistoryItem[], serverTime }`, đăng ký **trước** `/:id`.
- `GET /orders/:id` → `OrderDetail` (có `latestPayment`, `canPay`, `canCancel`, `serverTime`).

**BFF đọc**: backend tự xác thực Bearer và lọc theo chủ (404 cho đơn của người khác). BFF đọc **không** gọi `/auth/me` và không so owner như BFF POST
vì không có thao tác ghi; quy tắc "mismatch owner 403" áp dụng cho payment/cancel (S3-A-02). Nếu nhóm muốn BFF đọc cũng so owner, đó là thay đổi contract cần xác nhận.

## 3. Hành vi cần biết

- **Không tự gọi lại sau lỗi**: lỗi mạng/timeout/body sai/5xx không bao giờ hiện là "thất bại cuối"; khách bấm "Thử lại". Khi làm mới lỗi, dữ liệu đang hiển thị được giữ.
- **Version**: dữ liệu có `version` thấp hơn bản đang hiển thị bị bỏ; cùng version thì nhận lượt đọc mới hơn.
- **Đếm ngược**: tính theo `serverTime` + thời gian trôi kể từ lúc nhận. Chỉ để hiển thị; hết giờ không tự hủy hay chặn nút. Server quyết định.
- **Đơn cũ (policy 1)**: `canPay=canCancel=false` và không có hạn → hiện "chỉ xem".
- **Lịch sử không phân trang/lọc** (CONTRACTS mục 2).

## 4. Kiểm tra đã chạy (máy B, 06/11/2026)

| Lệnh / cách | Kết quả |
|---|---|
| `npm run typecheck` (frontend) | Không lỗi |
| `npm run lint` (frontend) | Không lỗi |
| `npm test` (frontend) | 378 test, 378 đạt (trong đó thêm cho phần B: format, status, error, parse, version, view-state, read-client, read-handler) |
| `npm run build` (frontend, `NEXT_PUBLIC_ORDERS_SOURCE=mock`) | Thành công; có route `/orders`, `/orders/[id]`, `/api/orders/me`, `/api/orders/[id]` |
| Playwright (Chromium) với mock auth + mock orders, 360 px và 1280 px | Các kịch bản ở `B_REGRESSION_CHECKLIST.md` mục 4 đạt; ảnh chụp xem bằng mắt |

Môi trường: Node 22.22 (repo yêu cầu Node ≥ 24.15 < 25), nên nên chạy lại trên Node 24 trước khi ghi PASS chính thức.

## 5. Chưa làm / chưa kiểm tra

- Chưa chạy với backend C/D/E thật (DEP-05/06 chưa đạt); fixture không phải bằng chứng E2E.
- Chưa có nút Thanh toán/Hủy (thuộc A).
- Chưa thử trình đọc màn hình thật, Safari, Firefox.
- Tổng thanh toán hiển thị theo `total` server trả; UI không tự tính lại giá. Không kiểm tra `subtotal − discountTotal = total` ở client (đơn cũ có thể không thỏa).
