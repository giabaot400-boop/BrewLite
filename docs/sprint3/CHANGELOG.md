# Ghi chú thiết kế Sprint 3

Cập nhật ngày 06/11/2026. Các thay đổi trên repository được truy vết bằng commit và pull request.

- Giữ state machine chín cạnh; quản lý trạng thái thuộc phạm vi, giao diện quầy đầy đủ ngoài MVP theo D16. CLI nội bộ gọi service và kiểm tra cạnh để phục vụ demo/test.
- Không có API quote hoặc API đọc payment riêng; chỉ kiểm soát tồn Product. GET Order trả tổng chính thức và latestPayment; phục hồi payment bằng đúng key/body đã lưu.
- Tạo PENDING chưa dọn giỏ; chỉ dọn theo trạng thái đã trả hiện tại và binding còn khớp. Retry không tự đổi chủ, key hoặc payload.
- Quy tắc giảm giá làm tròn xuống; mã đã chuẩn hóa tham gia canonical/hash v2. Canonical v1, ledger cũ và các phiên bản kỹ thuật giữ nguyên.
- A1/A2 chuẩn bị song song; A2 nghiệm thu Task 1→5 riêng. Dùng chung repo/code là phương án nhóm chọn.

Giữ 13 model, 14 UC và 27 AC. Tất cả AC Sprint 3 vẫn CHƯA CHẠY; ghi chú thiết kế không thay bằng chứng code/test hoặc review của nhóm. Hồ sơ Sprint 1–2 không bị sửa trong lượt hiệu đính này.
