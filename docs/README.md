# Tài liệu BrewLite

## Thiết kế đang dùng

- [Sprint 3](sprint3/README.md): phạm vi, contract, phân công và kế hoạch kiểm thử Task 8–10 của Assignment 1.
- [Assignment 2 Task 1–2](assignment2/README.md): phạm vi, SRS, use case, UML và ma trận truy vết.
- [Kiến trúc frontend/BFF/PWA](architecture/frontend-bff-pwa.md): phần đóng góp của A cho Task 3.1; phương án kiến trúc đã có qua PR #31 và PWA đã triển khai qua PR #33; xem [phạm vi kiểm tra PWA](assignment2/PWA.md).
- [Quy trình Git](GIT_WORKFLOW.md): nhánh riêng, PR và review trước merge.

Nền kế thừa là Sprint 2 tại a1a0e4ae92de681deac538685e24407b3190866b. Các hồ sơ Sprint 1–2 và sơ đồ lịch sử giữ nguyên; tài liệu Sprint 3 và Assignment 2 là thiết kế/kế hoạch, không xác nhận code Sprint 3 hoặc mọi AC đã đạt.

Repo giữ nguồn Markdown, PlantUML và SVG để review trực tiếp. Việc dùng chung code A1/A2 là phương án nhóm chọn; A2 nghiệm thu Task 1→5 theo tạo phẩm và lịch sử thật. Hai ứng dụng dùng đường dẫn `apps/web` và `apps/api` theo PR #30; xem [README chạy dự án](../README.md) để thiết lập và chuyển cấu hình local. Đổi layout không tự xác nhận hoàn tất kiến trúc, CI/CD hoặc nghiệm thu Task 4. Đường dẫn trong hồ sơ Sprint 1–2 được giữ theo thời điểm ghi nhận.

## Phân biệt các bộ sơ đồ

- [Sơ đồ Sprint 1](diagrams/README.md) là hồ sơ lịch sử: master có 13 UC ở thời điểm Sprint 1.
- [Master Assignment 2](diagrams/master-use-case.puml) và [master Sprint 3](diagrams/sprint3/master-use-case.puml) cùng giữ **14 UC = UC-01 đến UC-13 và S2-UC-LOGOUT**. UC đăng xuất kế thừa Sprint 2 dùng mã riêng, không đổi thành UC-14.
- Danh mục Sprint 1 không phải mục lục của các sơ đồ hiện hành. Nguồn/hình Assignment 2 nằm tại các liên kết trong [bảng tạo phẩm](assignment2/README.md); nguồn/hình Sprint 3 được liệt kê trong [danh mục Sprint 3](diagrams/sprint3/README.md).
