# Kiến trúc tổng hợp Assignment 1 tại Sprint 3

Ngày đối chiếu: 13/11/2026. Source:
`88b4e12cf909226e9b376041d5da4205765b7649` trên main, sau merge #53, #49, #51.
Code nghiệp vụ kế thừa bản `3959f40`; `f3f0ef7` thêm pretest và cập nhật hồ sơ.
Đây là mô tả source đã hiện thực để review tài liệu, không là xác nhận toàn bộ
AC/DoD hoặc buổi bàn giao đã hoàn thành.

## Đọc hai hình

| Mã | Góc nhìn | Nguồn | SVG |
|---|---|---|---|
| D08 | Bối cảnh, người dùng và ranh giới toàn hệ thống | [PlantUML](../diagrams/sprint3/system-context.puml) | [Hình](../diagrams/sprint3/system-context-sprint3.svg) |
| D09 | Các thành phần phần mềm và kết nối giữa chúng | [PlantUML](../diagrams/sprint3/logical-architecture.puml) | [Hình](../diagrams/sprint3/logical-architecture-sprint3.svg) |

Context xem BrewLite như một khối. Thành viên nhóm chạy CLI là tác nhân vận
hành kỹ thuật ngoài khối, không là một vai trò quản trị/barista đã có giao diện.
Logical mở khối ra để thấy UI, BFF, backend và dữ liệu. Các ô logic không biểu
thị mỗi ô là một container. Compose chỉ có frontend, backend và db.

## Thay đổi cần nhìn thấy so với hình Sprint 1

| Nội dung | Hình Sprint 1 | Bản tích hợp Sprint 3 và nguồn đối chiếu |
|---|---|---|
| Thanh toán | Mock gateway bên ngoài, ghi dự kiến Sprint 3 | `MockPaymentService` là adapter nội bộ NestJS; method WALLET/CARD, kết quả từ cấu hình backend. Không I/O tới gateway ngoài/tiền thật. [Mock](../../apps/api/src/orders/mock-payment.service.ts), [contract](CONTRACTS.md) |
| Web và backend | Frontend gọi Product API | UI gọi BFF cùng origin; BFF xác minh request/phiên/chủ và chuyển REST tới NestJS. Server Components vẫn đọc catalog từ backend. [BFF mutation](../../apps/web/src/lib/server/owner-mutation-handler.ts), [catalog](../../apps/web/src/features/products/api.ts) |
| Phiên | Chưa có trong phạm vi API sản phẩm S1 | Cookie HttpOnly giữa browser/BFF; Bearer giữa server/API; NestJS kiểm token và AuthSession. JWT không lưu trong localStorage. [Auth BFF](../../apps/web/src/app/api/auth/login/route.ts), [guard](../../apps/api/src/auth/auth.guard.ts) |
| Giỏ và phục hồi | Giá xem trước, chưa có checkout thật | localStorage/Web Locks giữ owner, pending key/body, binding và payment recovery. Provider v2 chỉ start sau migration thành công. [Provider](../../apps/web/src/features/cart/cart-provider-v2.tsx), [storage](../../apps/web/src/features/cart/cart-storage.ts) |
| Nghiệp vụ và DB | Product API chỉ đọc, ba model catalog | Auth, tạo/đọc đơn, promotion, workflow payment/cancel/refund; ledger/replay, reservation/CAS Product và điểm dùng transaction. [Module](../../apps/api/src/orders/orders.module.ts), [workflow](../../apps/api/src/orders/order-workflow.service.ts), [schema](../../apps/api/prisma/schema.prisma) |
| Hết hạn | Chưa hiện thực | Service backend quét khi startup và định kỳ 60 giây, batch 50; khóa/kiểm lại từng đơn trước release. Đây không là SLA nhả kho trong 60 giây. [Expiry](../../apps/api/src/orders/order-expiry.service.ts) |
| Pha chế demo | Barista thuộc phần mở rộng | CLI có flag mở application context và gọi workflow cho PAID → PREPARING → READY → COMPLETED. Không có trang barista hoặc endpoint public đổi trạng thái. [CLI](../../apps/api/src/orders/demo-advance.ts) |
| Triển khai | Hình logic chưa mô tả môi trường chạy S3 | [Compose](../../compose.yaml) có ba service; chỉ frontend mở `127.0.0.1:3000`; API/DB dùng mạng nội bộ và DB có named volume. Không suy thành production HTTPS A2 |
| PWA | Không là luồng chính của hình S1 | [Service worker](../../apps/web/public/sw.js) chỉ cache tài nguyên công khai; navigation đi mạng rồi fallback offline; `/api/*` và các mutation không được cache/xếp hàng gửi lại |

## Những quy tắc giữ nguyên

- Bật checkout v2 bằng `CHECKOUT_V2_ENABLED=1`, mặc định tắt. Chuyển storage
  v1 → v2 một chiều, giữ bytes khi lỗi; profile đã migrate tiếp tục dùng v2.
- POST tạo Order PENDING và POST payment là hai xác nhận riêng. Giữ giỏ cho
  tới khi current Order PAID đã đối chiếu đúng binding; không auto-POST sau F5/login.
- Mock đánh giá lần payment mới trong workflow transaction; replay đọc attempt
  đã commit, không gọi mock hoặc tác động kho/điểm lại.
- Giữ canonical V1/V2, ledger lịch sử và policy1 read-only. Policy2 có hold
  15 phút, kho chỉ Product; không thêm tồn Topping, bảng hoặc UC mới.
- Bảy nguồn/mười một SVG gồm bộ D01–D07 ngày 06/11 và hai góc D08/D09 mới.
  Nguồn/hình cũ giữ nguyên; hai hình S1 tiếp tục là mốc lịch sử. Sơ đồ sequence
  và use case S3 đã mô tả mock nội bộ trước đợt bổ sung này.

## Render và kiểm tra

Hai SVG mới được render bằng PlantUML 1.2025.2, Java 21, Graphviz dot 2.42.4
và font DejaVu Sans từ đúng hai nguồn `.puml`, cùng màu/font của bộ hiện có.
Thông tin renderer và lệnh tái tạo đi kèm gói patch. Nên giữ phiên
bản renderer khi cần so hình; không dùng hình xuất từ nguồn khác để thay SVG.

```powershell
java -Djava.awt.headless=true -jar "DUONG_DAN_DEN_PLANTUML_JAR" -charset UTF-8 -tsvg docs/diagrams/sprint3/system-context.puml docs/diagrams/sprint3/logical-architecture.puml
```

Chỉ render hai nguồn mới; không ghi đè ảnh lịch sử. Đợt này kiểm nội dung với
source/contract, cú pháp/render, SVG, bố cục và liên kết. Không sửa code,
migration hoặc cấu hình môi trường, không cần chạy lại test ứng dụng chỉ vì
thêm hai góc kiến trúc. [Bằng chứng ứng dụng](A1_ACCEPTANCE_REVIEW.md) giữ đúng
SHA/image/phạm vi và giới hạn trình duyệt/hiệu năng đã ghi.
