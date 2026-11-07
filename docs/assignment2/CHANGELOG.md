# Ghi chú thiết kế Assignment 2

Cập nhật ngày 06/11/2026. Các thay đổi trên repository được truy vết bằng commit và pull request; không dùng lịch sử các gói soạn thảo bên ngoài Git làm lịch sử phát hành của repo.

- Task 1.3 chọn duy nhất UC-09 Thanh toán không tiền mặt. Các bước M-01…M-05 thuộc UC-09; các bước C- thuộc ngữ cảnh tạo đơn/hủy/hết hạn, không phải trọng tâm thứ hai.
- Sequence chính có khung tạo Order/giữ Product trong transaction và optimistic locking trước ranh giới UC-09. Tạo đơn và thanh toán vẫn là hai lượt xác nhận/transaction riêng; retry payment không tạo đơn mới.
- FR-13 và state machine thuộc phạm vi. D16 chỉ đặt giao diện quầy đầy đủ ngoài MVP; cơ chế CLI phục vụ demo/test cần được hiện thực và kiểm chứng. Không thêm actor/UC quầy.
- Công thức giá, chuẩn hóa mã và canonical/hash được đối chiếu theo contract. BFF chuyển nguyên request; pending/key/body bất biến khi retry.
- A1/A2 có thể chuẩn bị song song; A2 nghiệm thu tuần tự Task 1→5. PWA, health endpoint, CI/CD và production HTTPS vẫn là đầu ra bắt buộc khi đến task tương ứng.

Giữ 17 FR, 12 NFR, 59 AC, 14 UC và 10 lớp domain. Code/test chưa xác minh tiếp tục ghi CHỜ; tài liệu chưa xác nhận Task 1–5 đã nghiệm thu.
