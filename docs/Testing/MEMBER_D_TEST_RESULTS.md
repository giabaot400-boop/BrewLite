BÁO CÁO KẾT QUẢ KIỂM THỬ SPRINT 1
Người thực hiện: ĐỖ GIA PHÚ
Dự án: BrewLite — Website bán đồ uống
Sprint: Sprint 1
Ngày báo cáo: 25/10/2026
Môi trường kiểm thử: Windows, Chrome, môi trường local
Frontend: http://localhost:3000
Backend: http://localhost:3001

1. Mục tiêu kiểm thử
   Kiểm tra các chức năng thuộc nhiệm vụ của thành viên D trong Sprint 1:
   Kiểm thử API sản phẩm.
   Kiểm thử giao diện khi danh sách sản phẩm rỗng.
   Kiểm thử xử lý lỗi khi tải dữ liệu.
   Kiểm thử trang 404.
   Kiểm thử lựa chọn size, topping và tính toán giá sản phẩm.

   Tổng số: 6 test case
   PASS: 5
   BLOCKED: 1
   FAIL: 0
   Lưu ý: Kết quả kiểm thử xử lý lỗi khi tải dữ liệu mới xác nhận việc hiển thị lỗi và nút Thử lại; chưa xác nhận đầy đủ hành vi gửi lại yêu cầu sau khi nhấn nút.

2. Chi tiết kết quả kiểm thử
   Kiểm thử Health API
   Mục tiêu: Xác định backend BrewLite đã khởi động và phản hồi HTTP.Mục tiêu: Xác định backend BrewLite đã khởi động và phản hồi HTTP.
   Các bước thực hiện:
   1. Khởi động BrewLite bằng npm.cmd run dev.
   2. Truy cập http://localhost:3001/health.
   3. Kiểm tra dữ liệu phản hồi.
      Kết quả thực tế:
      {
      "status": "ok",
      "service": "brewlite-api"
      }
      Đánh giá: PASS.

   Kiểm thử Products API
   Mục tiêu: Kiểm tra endpoint lấy danh sách sản phẩm.
   Các bước thực hiện:
   1. Khởi động backend.
   2. Truy cập http://localhost:3001/products.
   3. Kiểm tra phản hồi API.
      Kết quả thực tế:
      {
      "message": "Cannot GET /products",
      "error": "Not Found",
      "statusCode": 404
      }
      Kết quả mong đợi theo API Contract: HTTP 200 với một mảng JSON sản phẩm.
      Đánh giá: BLOCKED.

   Kiểm thử size, topping và tính giá
   Sản phẩm: Cà phê sữa
   Giá gốc: 35.000 VNĐ
   1. Chọn size S : 35.000đ PASS
   2. Chọn size M : 40.000đ PASS
   3. Chọn size L : 45.000đ PASS
   4. Size M + Kem: 47.000đ PASS
   5. Size L + Kem + Trân châu: 57.000đ PASS
   6. Size L + Trân châu, bỏ Kem: 50.000đ PASS
      Đánh giá: PASS (6/6)

   Kiểm thử trang 404
   Mục tiêu: Kiểm tra giao diện khi người dùng truy cập đường dẫn không tồn tại.
   Đường dẫn kiểm thử: http://localhost:3000/trang-khong-ton-tai
   Kết quả thực tế: Giao diện hiển thị trang 404/Page Not Found.
   Đánh giá: PASS.

   Kiểm thử danh sách sản phẩm rỗng
   Mục tiêu: Kiểm tra cách giao diện xử lý khi không có sản phẩm.
   Các bước thực hiện:
   1. Mở frontend/src/features/products/fixtures.ts.
   2. Tạm thời thay danh sách productFixtures thành [].
   3. Lưu file và tải lại frontend.
   4. Quan sát giao diện.
   5. Khôi phục dữ liệu mẫu.
      Kết quả thực tế:
      Giao diện hiển thị thông báo:
      Hiện chưa có sản phẩm.
      Sau khi khôi phục dữ liệu, bốn sản phẩm xuất hiện trở lại.
      Đánh giá: PASS.

   Kiểm thử xử lý lỗi khi tải dữ liệu
   Mục tiêu: Kiểm tra cách frontend hiển thị lỗi khi API sản phẩm không hoạt động.
   Các bước thực hiện:
   1. Mở frontend/.env.local
   2. Thay NEXT_PUBLIC_PRODUCTS_SOURCE=fixture thành NEXT_PUBLIC_PRODUCTS_SOURCE=api.
   3. Khởi động lại ứng dụng.
   4. Truy cập http://localhost:3000.
   5. Quan sát giao diện khi API sản phẩm trả về lỗi.
      Kết quả thực tế:
      - Hiển thị thông báo không tải được thực đơn.
      - Hiển thị nút Thử lại.
      - Giao diện hiển thị trạng thái lỗi thay vì danh sách sản phẩm.

      Đánh giá: PASS đối với chức năng hiển thị lỗi.
      Chưa xác nhận: Hành vi thực tế của nút Thử lại và khả năng phục hồi sau khi API hoạt động trở lại.

3. Vấn đề còn tồn tại
   Vấn đề 1 — Products API chưa sẵn sàng
   Vấn đề 2 — Chưa kiểm thử API với PostgreSQL thật
   Vấn đề 3 — Chưa xác nhận đầy đủ chức năng Thử lại

4. Kết luận
   Đã thực hiện 6 test case thuộc phạm vi kiểm thử Sprint 1.
   Trong đó:
   - 5 test case đạt yêu cầu trong phạm vi đã kiểm tra.
   - 1 test case bị BLOCKED do Product API chưa hoạt động.
   - Chưa ghi nhận test case FAIL trong các trường hợp đã thực hiện.

   Các chức năng giao diện sử dụng dữ liệu mẫu gồm tính giá, xử lý danh sách rỗng, hiển thị lỗi và trang 404 đã hoạt động đúng theo kết quả kiểm thử.
   Tuy nhiên, chưa thể kết luận Sprint 1 đã hoàn thành nghiệm thu, vì các endpoint Product API và quá trình tích hợp database thật vẫn cần được hoàn thiện và kiểm thử lại.
