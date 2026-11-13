# Tài liệu BrewLite — Assignment 1

Repository này phục vụ Assignment 1 với ba Sprint BrewLite. Assignment 2 có
[bộ source và tài liệu riêng](https://github.com/giabaot400-boop/BrewLite-Assignment2).
Các tạo phẩm Task 1–5 A2 được duy trì tại repo A2; bản sao không còn nằm trong
cây tài liệu A1 hiện hành. Lịch sử commit trước khi tách vẫn được giữ.

## Bắt đầu theo nhu cầu

| Nhóm | Đọc từ đâu | Phạm vi |
|---|---|---|
| Sprint 1 | [Mục lục Sprint 1](sprint1/README.md) | Menu, chi tiết, size/topping, Product API và hồ sơ kiểm thử/Review/Retro |
| Sprint 2 | [Mục lục Sprint 2](sprint2/README.md) | Giỏ, auth/session, tạo đơn PENDING và hồ sơ closeout |
| Sprint 3 | [Thiết kế và phân công](sprint3/README.md) | Task 8–10, contract, AC/test, board và phần việc đang tích hợp |
| Hướng dẫn kỹ thuật | [API sản phẩm](guides/API_CONTRACT.md), [UI dùng chung](guides/UI_SHARED_COMPONENTS.md), [Git](guides/GIT_WORKFLOW.md) | Hướng dẫn phục vụ code A1; kết quả lịch sử có giới hạn riêng |
| Sơ đồ | [Sprint 1](diagrams/README.md), [Sprint 2](diagrams/sprint2/README.md), [Sprint 3](diagrams/sprint3/README.md) | Nguồn PlantUML/SVG theo phạm vi từng mốc |
| Chạy source | [README gốc](../README.md) | apps/web, apps/api, cấu hình và lệnh chạy |

## Cách hiểu hồ sơ

Việc chuyển file vào thư mục sprint chỉ thay đường dẫn và liên kết, không đổi
kết quả, ngày kiểm thử, quyết định PO hay tiêu chí nghiệm thu đã ghi. Đường dẫn
frontend/backend trong log và lệnh lịch sử giữ ý nghĩa ở thời điểm đó; code hiện
ở apps/web và apps/api. Liên kết code Sprint 1 dùng commit nguồn khi đường dẫn
cũ không còn trong cây hiện hành.

Giữ đường dẫn các file trong `docs/sprint3/` đang được PR code tham chiếu.
Không suy ra Sprint 3 đã đạt AC từ việc có thiết kế hoặc từ kết quả Sprint 2.
Master Sprint 1 có 13 UC tại mốc đó; master Sprint 3 có 14 mã gồm S2-UC-LOGOUT.
Không sửa hình lịch sử để làm chúng giống nhau.
