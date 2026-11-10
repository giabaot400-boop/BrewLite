# BrewLite — Ma trận truy vết Assignment 2

**Quy ước:** M-01…M-05 và A-/E- là nhánh của [UC-09](requirements/use-case-checkout.md); các mã C- thuộc [ngữ cảnh hỗ trợ](requirements/checkout-supporting-flows.md). Tạo đơn và hủy/expiry không là đặc tả trọng tâm thứ hai.

Cập nhật 10/11/2026 · Thiết kế kế thừa Sprint 3 / nền S2 a1a0e4a. Đây là mapping thiết kế và đích tích hợp, **chưa phải kết quả kiểm thử**. Tài liệu mã nguồn/test/commit cụ thể chưa được rà trong lượt này nên để CHỜ; API ghi ở cột dưới là contract mục tiêu hoặc nền kế thừa, không chứng minh route S3 đã có trên main.

Truy vết được đồng bộ với hiệu đính Task 1 ở PR #42; giữ nguyên 59 mã AC và nội dung tiêu chí trong SRS. CHỜ ở cột code/test nghĩa là chưa hoàn tất đối chiếu và gắn bằng chứng theo AC trong ma trận này, không khẳng định tính năng chưa có code hoặc chưa từng được kiểm thử.

Nguồn: [SRS](requirements/srs.md), [use case](requirements/use-case-checkout.md), [activity](diagrams/activity-checkout.md), [sequence](diagrams/sequence-checkout.md), [class](diagrams/class-domain.md), [contract](assignment2/CONTRACTS.md). Mỗi nhóm liệt kê toàn bộ AC đã định danh trong SRS; khi có evidence, lead điền path/PR/SHA/command/expected-actual thay CHỜ và tách dòng theo AC nếu kết quả khác nhau.

Master giữ **14 UC = UC-01 đến UC-13 và S2-UC-LOGOUT**. Các mã UC trong cột truy vết được ghi đầy đủ; nhiều UC có thể cùng tham chiếu một FR.

| Mã yêu cầu / AC | UC/story hoặc phạm vi | Thiết kế | Code/API đích (chưa xác minh) | Test/evidence |
|---|---|---|---|---|
| FR-01: AC-FR-01-1, AC-FR-01-2 | UC-01 | Menu/API và UI | GET /products; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-02: AC-FR-02-1, AC-FR-02-2 | UC-02, UC-03, UC-04 | Class Product/Topping; chọn cấu hình | GET /products/:id; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-03: AC-FR-03-1, AC-FR-03-2, AC-FR-03-3 | UC-05 | Activity/sequence tạo đơn; BR-01 | Giỏ/envelope/BFF; không API giỏ mới; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-04: AC-FR-04-1, AC-FR-04-2 | UC-06 | SRS FR-04, contract auth nền | Auth register kế thừa; đối chiếu path code; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-05: AC-FR-05-1, AC-FR-05-2 | UC-07 | SRS FR-05/NFR-02, contract session | Auth login/me kế thừa; đối chiếu path code; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-06: AC-FR-06-1, AC-FR-06-2 | S2-UC-LOGOUT | SRS FR-06, contract A9/session binding | BFF logout/me và auth coordinator kế thừa; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-07: AC-FR-07-1, AC-FR-07-2 | UC-08 | Activity/sequence tạo đơn; ngữ cảnh C-02…C-06 | POST /orders; GET /orders/:id; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-08: AC-FR-08-1, AC-FR-08-2 | UC-08 | Sequence tạo đơn; ngữ cảnh C-A07/C-E03/C-X02 | POST /orders + OrderRequest/assert; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-09: AC-FR-09-1, AC-FR-09-2 | UC-09 | Activity/sequence payment; UC M-02…M-05 | POST /payments; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-10: AC-FR-10-1, AC-FR-10-2 | UC-09 | Sequence payment; UC A-06/A-07/E-04 | POST /payments replay + GET Order; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-11: AC-FR-11-1, AC-FR-11-2 | UC-10 | Sequence payment/kết quả; UC M-05 | GET /orders/:id; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-12: AC-FR-12-1, AC-FR-12-2 | UC-11 | SRS FR-12; UC A-10 | GET /orders/me; GET /orders/:id; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-13: AC-FR-13-1, AC-FR-13-2 | UC-08, UC-09, UC-11 | UC-09 A-06/A-09; ngữ cảnh C-A08/C-X01; sequence hủy/expiry; state machine S3 chín cạnh | Workflow Order; CLI nội bộ theo S3/D16 (UI quầy đầy đủ ngoài MVP, state machine trong phạm vi); path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-14: AC-FR-14-1, AC-FR-14-2 | UC-08, UC-09 | Class Product/Reservation; sequence tạo/payment/hủy; ngữ cảnh C-05/C-A04/C-X02 | Transaction/CAS; không API kho mới; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-15: AC-FR-15-1, AC-FR-15-2 | UC-12 mở rộng UC-08 | Class Promotion; BR-05; UC C-A02 | POST /orders pricing/promo snapshot; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-16: AC-FR-16-1, AC-FR-16-2 | UC-13 mở rộng UC-09 | Class LoyaltyTransaction; BR-04/05 | POST /payments; cancel reversal; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| FR-17: AC-FR-17-1, AC-FR-17-2 | Luồng thay thế UC-08, UC-09; UC-11 đọc | Sequence hủy/expiry; ngữ cảnh C-A08/C-X01; UC-09 A-09 | POST /orders/:id/cancel; expiry task; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-01: AC-NFR-01-1, AC-NFR-01-2 | API liên quan | SRS NFR-01, O-02 | Benchmark auth/catalog/orders/payment; chưa đủ evidence A2; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-02: AC-NFR-02-1, AC-NFR-02-2 | UC-06, UC-07, S2-UC-LOGOUT và route bảo vệ | Contract auth/CSRF; SRS NFR-02 | Auth/BFF/guard/logs; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-03: AC-NFR-03-1, AC-NFR-03-2 | Giỏ/đơn/payment của khách | Contract owner/session; sequence guard | BFF/ownership/no-store; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-04: AC-NFR-04-1, AC-NFR-04-2 | UC-08, UC-09 và hủy/expiry | Sequence transaction; class invariants; ngữ cảnh C-X02 và UC-09 E-05 | PostgreSQL nhiều kết nối, failure injection; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-05: AC-NFR-05-1, AC-NFR-05-2 | Luồng end-to-end | ngữ cảnh C-E03 và UC-09 E-04…E-06; contract timeout | UI 15 giây / BFF 10 giây / recovery; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-06: AC-NFR-06-1, AC-NFR-06-2 | Màn hình người dùng | SRS NFR-06 | UI responsive/loading/empty/error; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-07: AC-NFR-07-1, AC-NFR-07-2 | PWA/luồng offline | SRS NFR-07, O-01 | Manifest/service worker; không ghi offline; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-08: AC-NFR-08-1, AC-NFR-08-2 | Quản lý dự án/CI | Task 3 ADR và cổng Task 4; trạng thái thực tế xem kế hoạch nhóm | Repo layout/PR/CI quality gate; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-09: AC-NFR-09-1, AC-NFR-09-2 | Triển khai/vận hành | Task3 deployment và Task5 còn chờ | Compose/health/HTTPS/CD/rollback; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-10: AC-NFR-10-1, AC-NFR-10-2 | Kiểm thử/truy vết | SRS NFR-10; ma trận này | Unit/integration/E2E; PR/log thật; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-11: AC-NFR-11-1, AC-NFR-11-2 | Pending/legacy/migration | Contract v1/v2/rollout; class policy | Envelope2, canonical/ledger, migration; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |
| NFR-12: AC-NFR-12-1, AC-NFR-12-2 | Màn hình/đối thoại | SRS NFR-12 (Should) | Bàn phím/focus/nhãn; giới hạn ghi rõ; path/PR/SHA: CHỜ | CHỜ đối chiếu/chạy và gắn evidence |

## Cách dùng khi nhận việc

- Review Task 1–2 từ tài liệu, ghi commit nguồn được dùng. Các nhánh kiến trúc/production cần Task 3 tương ứng trước khi ghi hoàn thành truy vết.
- Có thể dùng lại code/evidence A1/S2/S3 nếu đúng AC, phiên bản/môi trường và có link cụ thể; không đổi nhãn toàn bộ sang PASS từ một demo success.
- Task4 cần test MVP và CI success/failure; Task5 cần unit/integration/E2E, URL production/health, log deploy/smoke và cách rollback. Sơ đồ không thay các bằng chứng đó.
