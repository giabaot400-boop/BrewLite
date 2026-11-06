# BrewLite Assignment 2 — Task 1–2 v0.6

**Bản giao nhóm · 06/11/2026 · Đồng bộ Sprint 3 v1.3 / Sprint 2 a1a0e4a.** Dùng gói này thay Task 1–2 v0.5. Có thể dùng để chia việc ngay; chưa ghi nhận nhóm đã review/commit, code đã đạt AC hoặc production đã triển khai.

## Đọc trước

1. [Kế hoạch giao nhóm](TEAM_PLAN.md): một lead/reviewer mỗi mục, lịch mục tiêu tới 15/11 và cổng nghiệm thu Task 1→5.
2. [Contract đồng bộ](CONTRACTS.md): năm API checkout, kế thừa session/logout, invariant Order–ledger, lỗi/retry v1 và môi trường nền.
3. [Changelog v0.6 và lịch sử](CHANGELOG.md): v0.6 hiện hành ở đầu; giữ nguyên nội dung lịch sử v0.5/v0.3 bên dưới.

## Tạo phẩm theo đề

| Task | Tài liệu | Nguồn/hình |
|---|---|---|
| 1.1 | [Bối cảnh và phạm vi](../requirements/context-and-scope.md) | Stakeholder, IN/OUT, giả định/ràng buộc/rủi ro |
| 1.2 | [SRS](../requirements/srs.md) | [Master SVG](../diagrams/master-use-case.svg) / [nguồn](../diagrams/master-use-case.puml) |
| 1.3 | [UC-09 Thanh toán không tiền mặt](../requirements/use-case-checkout.md) | [SVG](../diagrams/use-case-checkout.svg) / [nguồn](../diagrams/use-case-checkout.puml) |
| 2.1 | [Activity](../diagrams/activity-checkout.md) | [Tạo đơn](../diagrams/activity-checkout-order.svg), [payment](../diagrams/activity-checkout-payment.svg) / [nguồn](../diagrams/activity-checkout.puml) |
| 2.2 | [Sequence](../diagrams/sequence-checkout.md) | [CHÍNH: UC-09 thanh toán](../diagrams/sequence-checkout-payment.svg), bổ trợ: [tạo đơn](../diagrams/sequence-checkout-order.svg), [hủy/hết hạn](../diagrams/sequence-checkout-cancel-expiry.svg) / [nguồn](../diagrams/sequence-checkout.puml) |
| 2.3 | [Domain class](../diagrams/class-domain.md) | [SVG](../diagrams/class-domain.svg) / [nguồn](../diagrams/class-domain.puml) |
| Truy vết | [Ma trận FR/NFR→UC→thiết kế→API→test](../traceability-matrix.md) | Code/test chưa xác minh ghi CHỜ |

Trong repo, đọc trực tiếp các liên kết bên dưới docs; mở SVG bằng trình duyệt và chỉnh qua nguồn PlantUML. Các tệp được bố trí theo đường dẫn tạo phẩm của đề, không commit gói ZIP. Bảy tài liệu nội dung (gồm ngữ cảnh hỗ trợ), năm nguồn và tám SVG cùng nhãn 0.6. Mục lịch sử 0.1–0.5 mô tả phiên bản cũ, không phải bản hiện hành.

## Phạm vi và trạng thái

Giữ nguyên **17 FR, 12 NFR, 59 AC, 14 UC, 10 lớp domain**. Payment↔PaymentAttempt, LoyaltyTransaction↔LoyaltyEntry chỉ ánh xạ tên, không thêm bảng. Mock PaymentService có lifeline riêng bên trong NestJS. Giữ ba giản lược S3: không API quote, không API đọc payment riêng, chỉ kho Product; Topping vẫn chọn/tính giá/snapshot.

Task 1–2 đã có bản soạn đồng bộ để review/commit. Bước kế tiếp là Task 3.1 kiến trúc/module/ADR và Task 3.2 deployment theo nền tảng thật. Gói chưa soạn thay Task 3, chưa di chuyển source hoặc triển khai production. A2 vẫn bắt buộc health endpoint, PWA, CI/CD, kiểm thử/truy vết và production HTTPS; Compose A1 không thay các đầu ra này.

Hạn **15/11/2026** do PO cung cấp; giờ LMS cần xác nhận. Lịch mục tiêu: 05/11 Task 1–2 trên repo, 06/11 Task 3, 07–08/11 cổng Task 4, 09–12/11 Task 5, 13–14/11 dự phòng/đóng gói. Lead và lịch là đề xuất nhận việc, chưa là capacity cam kết. Không chờ hoàn thành A1 mới chuẩn bị toàn bộ A2.

Nguồn: Assignment2-BrewLite.pdf, hồ sơ S1/S2 lịch sử, Sprint 3 v1.3 và nền S2 a1a0e4a, hồ sơ docs/SPRINT2_CLOSEOUT.md sau PR #24/#26/#28/#27. Tái sử dụng evidence S2 cần đối chiếu đúng AC/môi trường/commit; không tự ghi toàn bộ S2 hoặc A2 PASS. Lượt này chỉnh tài liệu/render UML, chưa chạy test ứng dụng, tạo PR hoặc gửi tin cho nhóm.

## Hiệu chỉnh trọng tâm v0.6

Task 1.3 chỉ chọn **UC-09 Thanh toán không tiền mặt**. UC-08 và các UC khác vẫn thuộc master/SRS; các bước tạo đơn, hủy và expiry chuyển sang [ngữ cảnh hỗ trợ](../requirements/checkout-supporting-flows.md), không bị bỏ khỏi sản phẩm. Activity Task 2.1 vẫn end-to-end. Hình sequence payment là hình chính Task 2.2 với đủ Customer/UI/API/Database/PaymentService, có ngữ cảnh tạo Order/transaction/CAS trước ranh giới UC-09; hình tạo đơn chi tiết hóa ngữ cảnh ấy; hình hủy/expiry bổ trợ cạnh tranh trạng thái. Không đổi nghiệp vụ S3 v1.3 hoặc yêu cầu Task 3–5.

## Kiểm tra gói v0.6

Đối chiếu tập 17 FR/12 NFR/59 AC và 14 mã UC với v0.5; kiểm tra liên kết, nguồn PlantUML và tám SVG. Khung ngữ cảnh trong sequence chính bổ sung nội dung tạo đơn/giữ kho, giữ UC-09 là trọng tâm. Đây là kiểm tra tài liệu, không phải test ứng dụng, PR review hoặc nghiệm thu Task 1–5.

## Quan hệ A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.
