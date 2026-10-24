# Tiến độ Sprint 1

Mốc code đã tích hợp: ec8e2f9, gồm phần UI dùng chung qua PR #4 ngày 23/10/2026.
Kết quả kiểm tra frontend được bổ sung đến ngày 24/10/2026.
Giao diện hiện dùng dữ liệu mẫu (fixture).
Sprint 1 chưa được nghiệm thu hoàn tất.

## Đã hoàn thành với dữ liệu mẫu

- [x] A triển khai Menu và điều hướng đến trang chi tiết.
- [x] A triển khai chi tiết sản phẩm, mặc định size S,
      chọn một size, chọn/bỏ nhiều topping và cập nhật giá xem trước.
- [x] A bổ sung kiểm tra dữ liệu giá không hợp lệ.
- [x] A chạy thử đổi size, chọn/bỏ topping và đối chiếu tổng giá.
- [x] A chạy thử giá cơ bản âm và NaN.
- [x] Frontend chạy thành công typecheck, lint và build trên máy A.
- [x] Code được push và tích hợp vào main qua PR #1.
- [x] A kiểm tra TC-09: không có topping vẫn chọn size và tính giá đúng.
- [x] A kiểm tra bảo vệ giá ở component với giá âm, NaN,
      thiếu giá và giá dạng chuỗi qua các đợt kiểm tra.
- [x] A kiểm tra ảnh lỗi chuyển sang ảnh thay thế ở trang chi tiết.
- [x] A kiểm tra Menu loading, empty, error và thử lại,
      gồm phục hồi thành công bằng dữ liệu giả lập.
- [x] B triển khai layout và component dùng chung;
      A review và kiểm tra trên máy A tại commit 914e4ab.
- [x] Kiểm tra responsive ở 390/768/1280 px, bàn phím,
      focus, skip-link và giao diện 404 trên Chrome.

## Còn phải hoàn thành hoặc xác nhận

- [ ] E xác nhận repo chung và cấu hình môi trường cho từng máy.
- [ ] C/E chạy migration và seed thành công trên PostgreSQL thật.
- [ ] C hoàn thành GET /products và GET /products/:id từ database.
- [ ] A tích hợp giao diện với Product API thật.
- [ ] A kiểm tra lại loading/empty/error, điều hướng và 404
      khi dùng API thật.
- [ ] A kiểm tra lại size, topping và giá với dữ liệu từ API thật.
- [ ] D kiểm thử API, dữ liệu rỗng, lỗi, 404 và các phép tính giá.
- [ ] Review các PR backend và phần tích hợp còn lại.
- [ ] Nhóm kiểm tra cài đặt và build trên máy thành viên khác.
- [ ] A nghiệm thu theo 24 AC trong hồ sơ v1.1;
      B hỗ trợ Sprint Review, Retrospective và lưu bằng chứng.

Thời gian toàn đồ án:
- Sprint 1: Tuần 1.
- Sprint 2: Tuần 2 và 3.
- Sprint 3: Tuần 4 và 5, bao gồm chuẩn bị nộp.

Ngày cụ thể bổ sung theo nhóm.
