# Ghi chú thiết kế Sprint 3

## 13/11/2026 — bổ sung kiến trúc bản tích hợp

- Bổ sung D08 system context và D09 logical architecture theo source main
  `88b4e12`, sau merge #53/#49/#51. Mock payment nằm trong NestJS; mô tả
  Next.js UI/BFF, auth, giỏ/recovery, workflow, expiry và CLI nội bộ có flag.
  Compose vẫn có ba service.
- Giữ nguyên năm nguồn/chín SVG của D01–D07 và hình Sprint 1–2; thêm hai
  nguồn/hai SVG D08/D09, tổng cộng bảy nguồn/mười một SVG Sprint 3.
- Đồng bộ số lượng trong README, làm rõ cách đếm nguồn/hình và giữ hướng dẫn
  render ngay trong repo theo góp ý [review PR #55](https://github.com/giabaot400-boop/BrewLite/pull/55#pullrequestreview-5885448223).
- Chỉ cập nhật tài liệu; không đổi code ứng dụng, API, schema, contract hoặc
  số model/UC/AC. Không chạy lại test ứng dụng trong đợt này; bằng chứng QA
  tiếp tục gắn với SHA/image và phạm vi của từng lượt chạy đã ghi.

Xem [bảng đối chiếu kiến trúc](A1_ARCHITECTURE_UPDATE.md). Nhật ký ngày 06/11
bên dưới giữ theo thời điểm thiết kế, không thay trạng thái nghiệm thu hiện tại.

## 06/11/2026 — hiệu đính thiết kế

Cập nhật ngày 06/11/2026. Các thay đổi trên repository được truy vết bằng commit và pull request.

- Giữ state machine chín cạnh; quản lý trạng thái thuộc phạm vi, giao diện quầy đầy đủ ngoài MVP theo D16. CLI nội bộ gọi service và kiểm tra cạnh để phục vụ demo/test.
- Không có API quote hoặc API đọc payment riêng; chỉ kiểm soát tồn Product. GET Order trả tổng chính thức và latestPayment; phục hồi payment bằng đúng key/body đã lưu.
- Tạo PENDING chưa dọn giỏ; chỉ dọn theo trạng thái đã trả hiện tại và binding còn khớp. Retry không tự đổi chủ, key hoặc payload.
- Quy tắc giảm giá làm tròn xuống; mã đã chuẩn hóa tham gia canonical/hash v2. Canonical v1, ledger cũ và các phiên bản kỹ thuật giữ nguyên.
- A1/A2 chuẩn bị song song; A2 nghiệm thu Task 1→5 riêng. Dùng chung repo/code là phương án nhóm chọn.

Giữ 13 model, 14 UC và 27 AC. Tất cả AC Sprint 3 vẫn CHƯA CHẠY; ghi chú thiết kế không thay bằng chứng code/test hoặc review của nhóm. Hồ sơ Sprint 1–2 không bị sửa trong lượt hiệu đính này.
