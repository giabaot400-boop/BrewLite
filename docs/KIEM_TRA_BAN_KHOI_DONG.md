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

## Còn phải kiểm tra và hoàn thiện

- Migration, seed và kết nối PostgreSQL thực tế trên môi trường của C/E.
- `GET /products` và `GET /products/:id` thật, kể cả dữ liệu rỗng và lỗi.
- Chọn size, nhiều topping và tính giá: chưa được triển khai trong bản này.
- Review của thành viên khác, chạy trên máy nhóm và nghiệm thu theo AC v1.0.

Không dùng `/health` làm bằng chứng database đã hoạt động. Các commit khởi tạo
là bộ khung hỗ trợ nhóm bắt đầu; nhóm cần đọc, hiểu và kiểm tra trước khi bàn giao.
