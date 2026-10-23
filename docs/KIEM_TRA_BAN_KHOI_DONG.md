# Kiểm tra bản khởi động

Nhánh được kiểm tra: `feature/menu`. Đây là bản khởi động, chưa nghiệm thu Sprint 1.

## Đã kiểm tra thành công

- `npm run db:validate` và `npm run db:generate`.
- `npm run lint`, `npm run typecheck`, `npm run build` cho bộ khung hiện có.
- Backend chạy thực tế: `GET /health` trả status `ok`; CORS cho origin frontend.
- Trình duyệt: Menu có bốn món và giá VND; mở chi tiết rồi quay lại Menu.
- Màn hình 1280 px và 390 px: bố cục bốn cột/một cột, không tràn ngang trên mobile.
- ID sản phẩm không tồn tại hiển thị trang không tìm thấy.
- Với API giả lập trong kiểm thử: loading, danh sách rỗng, lỗi 500, thử lại thành
  công, mã hóa ID trong link, ảnh hỏng chuyển sang ảnh dự phòng.
- Với API giả lập: từ chối response bọc sai contract hoặc giá ở dạng chuỗi.

Các response API trong kiểm thử giao diện được chặn và trả dữ liệu giả lập;
chưa phải hai endpoint sản phẩm từ database thật. Kiểm tra giao diện thực hiện
trên Chromium, chưa đại diện cho tất cả trình duyệt hay thiết bị.

## Cập nhật ngày 20/10/2026 — giao diện dùng fixture

Code tại commit `78b28f4`, đã tích hợp vào main qua PR #1.

A đã triển khai:
- Chọn một size, mặc định S.
- Chọn hoặc bỏ nhiều topping.
- Cập nhật giá xem trước theo giá cơ bản, phụ thu size và topping.
- Kiểm tra dữ liệu giá và hiển thị thông báo khi không thể tính giá hợp lệ.

Kết quả A đã chạy và cung cấp:
- Frontend typecheck, lint và build thành công.
- Đổi size, chọn/bỏ topping và đối chiếu tổng giá.
- Thử giá cơ bản âm và NaN; giao diện hiển thị thông báo phù hợp.

Các kết quả trên dùng dữ liệu mẫu trên máy A.
Chưa xác nhận tích hợp Product API, PostgreSQL thật
hoặc nghiệm thu đầy đủ Sprint 1.

## Còn phải kiểm tra và hoàn thiện

- Migration, seed và kết nối PostgreSQL thực tế trên môi trường của C/E.
- `GET /products` và `GET /products/:id` thật, kể cả dữ liệu rỗng và lỗi.
- Kiểm tra lại chọn size, nhiều topping và tính giá khi tích hợp Product API thật.
- Review của thành viên khác, chạy trên máy nhóm và nghiệm thu theo 24 AC trong hồ sơ v1.1.

Không dùng `/health` làm bằng chứng database đã hoạt động. Các commit khởi tạo
là bộ khung hỗ trợ nhóm bắt đầu; nhóm cần đọc, hiểu và kiểm tra trước khi bàn giao.
