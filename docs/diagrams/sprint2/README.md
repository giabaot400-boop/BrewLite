# Sơ đồ BrewLite Sprint 2

> **Cách đọc hồ sơ lịch sử:** Bộ này ghi thiết kế Sprint 2 tại thời điểm
> bàn giao ngày 27/10/2026, được bổ sung vào repository ngày 10/11/2026.
> Các câu “Chưa chạy”, “chưa triển khai” và lịch đề xuất bên dưới phản ánh
> thời điểm soạn thiết kế, không phải trạng thái hiện tại của Sprint 2.
> Kết quả thực tế và giới hạn nghiệm thu xem [hồ sơ đóng Sprint 2](../../sprint2/SPRINT2_CLOSEOUT.md).
> Những hiệu đính khi triển khai, gồm bảo vệ owner/phiên ở BFF và logout,
> xem [mục lục hồ sơ Sprint 2](../../sprint2/README.md).
> Bộ hình là baseline thiết kế, không mô tả lại mọi chi tiết của code cuối sprint.

Bộ sơ đồ đã rà cùng hồ sơ Sprint 2 v0.6 ngày 27/10/2026 cho Assignment 1. Theo cập nhật của A, nhóm đã đồng ý P01–P10 và phân công; lịch 28/10–03/11 là phương án A duyệt để nhóm chốt. Chưa xác nhận code, migration hay kiểm thử đã hoàn thành.

## Danh mục

| Nhóm | Mã nguồn | Ảnh SVG |
|---|---|---|
| Master use case toàn hệ thống | [master-use-case.puml](master-use-case.puml) | [master-use-case.svg](master-use-case.svg) |
| Activity giỏ đến kết quả tạo đơn | [activity-cart-order.puml](activity-cart-order.puml) | [activity-cart-order.svg](activity-cart-order.svg) |
| Sequence đăng nhập và khôi phục phiên | [sequence-auth-session.puml](sequence-auth-session.puml) | [sequence-auth-session.svg](sequence-auth-session.svg); [sequence-auth-session_001.svg](sequence-auth-session_001.svg) |
| Sequence đăng xuất | [sequence-logout.puml](sequence-logout.puml) | [sequence-logout.svg](sequence-logout.svg) |
| Sequence tạo đơn và replay | [sequence-create-order.puml](sequence-create-order.puml) | [sequence-create-order.svg](sequence-create-order.svg); [sequence-create-order-transaction.svg](sequence-create-order-transaction.svg) |
| ERD Sprint 2 | [erd-sprint2.puml](erd-sprint2.puml) | [erd-sprint2.svg](erd-sprint2.svg) |

Có 6 nguồn PlantUML, kết xuất thành 8 hình. Sequence dài được chia thành hai phần để đọc rõ. Hai khối @startuml có tên trong sequence-create-order.puml tạo hai ảnh riêng. Mở file SVG để phóng to chữ.

## Phạm vi

- Giữ nguyên 4 user story, 36 AC, 37 mã kiểm thử dự kiến từ hồ sơ v0.2; v0.6 chỉ thêm câu làm rõ cho CART-AC-10 và ORDER-AC-01.
- Giữ UC-01 đến UC-13; thêm S2-UC-LOGOUT, không đánh lại mã và không tạo thêm một use case diagram riêng cho Sprint 2.
- Master là góc nhìn toàn hệ thống; màu Sprint 3 biểu diễn kế hoạch, chưa là phần triển khai Sprint 2. Quan hệ extend tương lai phải được rà tiếp khi lập Sprint 3.
- Thanh toán tách khỏi tạo đơn PENDING. Không thêm quên mật khẩu, tồn kho, khuyến mãi hoặc điểm thưởng trong Sprint 2.
- Ba model danh mục Sprint 1 được giữ lại; sáu model mới trong ERD thuộc thiết kế Sprint 2 đã chọn, chưa là migration đã chạy. ERD không thay thế class diagram nếu một bài nộp khác yêu cầu class diagram.
- Không thay hoặc xóa bộ sơ đồ lịch sử trong docs/diagrams/sprint1.

## Kết xuất lại

Bộ hình đã kết xuất với PlantUML 1.2025.2 và Graphviz. Cài Java và Graphviz, tải JAR chính thức của PlantUML rồi chạy tại thư mục gốc repository:

```powershell
java -Djava.awt.headless=true -jar "DUONG_DAN_TOI_PLANTUML.jar" -charset UTF-8 -tsvg "docs/diagrams/sprint2/*.puml"
```

Master dùng Graphviz mặc định. Activity/ERD dùng Smetana nhúng trong nguồn; sequence dùng bộ bố cục sequence của PlantUML. Sau sửa nguồn, kết xuất và review lại cả SVG tương ứng trong cùng PR.

## Đối chiếu

Xem [CONSISTENCY.md](CONSISTENCY.md) để nối sơ đồ với AC, quyết định P01–P10 và nhóm kiểm thử. Việc kết xuất sơ đồ chỉ xác minh cú pháp/hình; 37 test nghiệp vụ vẫn Chưa chạy cho tới khi có implementation và kết quả thực tế.

## Hiệu đính v0.6

Đã đồng bộ pending khi cart rỗng, logout scope local/session, timeout UI 15 s /
BFF 10 s, Web Lock không giữ qua HTTP, thứ tự validation trước giá đổi,
snapshot RepeatableRead và ràng buộc Order/OrderRequest. Xem CONSISTENCY.md
và phần P01/P05/P06/P07/P09 của Word để triển khai chi tiết.
Không thêm chức năng, thay lead hoặc ghi test Đạt từ lần rà tài liệu này.

## Nguồn lưu trữ

Nguồn: `BrewLite_Sprint2_Diagrams_v0.6.zip` trong bộ bàn giao Sprint 2.
Hậu tố `(1)` trong tên tệp tải xuống chỉ phân biệt bản tải về.
Giữ nguyên byte của sáu nguồn PlantUML và tám SVG; hai file Markdown
được thêm hướng dẫn đọc hồ sơ lịch sử và liên kết điều hướng.
Việc bổ sung này không thay đổi yêu cầu, API, code hoặc kết quả kiểm thử.

SHA-256 của ZIP nguồn đã đối chiếu: `aa7d4878caf1b8057cde136e5e067b8f4a369b5e4fe9d58c75af63e6eeb31dc9`.
