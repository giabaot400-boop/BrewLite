# Tiến độ Sprint 1

Mốc code bàn giao để đối chiếu: 7df9f61.
Product API và migration PostgreSQL đã tích hợp vào main qua PR #6 và #7.

Bản tích hợp kiểm thử trên máy A: 5d6e058,
ghép main da5c861 với commit sửa API d82837b.
Nội dung code của bản merge 7df9f61 khớp bản ghép đã kiểm tra.

Các kết quả dưới đây phân biệt kiểm thử bằng fixture và bằng API thật.
Mục được đánh dấu hoàn thành phản ánh kết quả đã ghi nhận;
bằng chứng và đối chiếu đủ 24 AC/DoD được hoàn thiện trước nghiệm thu.

Sprint 1 chưa được xác nhận nghiệm thu hoàn tất.

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

## Kết quả tích hợp API và PostgreSQL đã ghi nhận trên máy A

- [x] Áp dụng migration của E thành công trên PostgreSQL 17.
- [x] Seed tạo đúng 4 sản phẩm, 2 topping và 2 liên kết.
- [x] Đối chiếu giá sản phẩm, giá topping và liên kết đúng dữ liệu mẫu.
- [x] Chạy lại seed không tạo thêm dòng trùng; số lượng vẫn là 4 / 2 / 2.
- [x] Backend khởi động thành công với ProductsModule và PrismaModule.
- [x] GET /products trả HTTP 200, raw JSON array và đúng 4 sản phẩm.
- [x] GET /products/coffee-milk trả HTTP 200,
      đúng mô tả, giá cơ bản, sizes và toppings.
- [x] GET /products/khong-ton-tai trả HTTP 404,
      thông báo Product not found.
- [x] Chạy tích hợp với DEMO_MODE=false.
- [x] Đo mỗi API danh sách và chi tiết 3 lần bằng curl:
      cả 6 lần trả HTTP 200 và dưới 500 ms.
      Danh sách: 4,008–54,361 ms; chi tiết: 5,723–11,998 ms.
- [x] Frontend dùng NEXT_PUBLIC_PRODUCTS_SOURCE=api,
      menu hiển thị sản phẩm và điều hướng đến trang chi tiết.
- [x] Xác nhận request menu tới http://localhost:3001/products;
      thời gian Total trên trình duyệt được A ghi nhận là 18,05 ms.
- [x] Đối chiếu giá cà phê sữa:
      S = 35.000đ; M = 40.000đ; L = 45.000đ;
      M + Kem = 47.000đ;
      L + Kem + Trân châu = 57.000đ;
      L + Trân châu, bỏ Kem = 50.000đ.
- [x] Dừng backend và tải lại menu: frontend hiển thị trạng thái lỗi.
- [x] Khởi động lại backend, bấm Thử lại mà không reload:
      danh sách 4 sản phẩm được khôi phục.
- [x] Truy cập /products/khong-ton-tai trên frontend:
      hiển thị không tìm thấy và quay về menu được.
- [x] PR #6 và PR #7 đã được review, kiểm tra và merge vào main.

Các kết quả thời gian chỉ mô tả những lần đo local đã thực hiện,
không phải cam kết mọi lần gọi đều có cùng thời gian phản hồi.

## Kiểm tra bổ sung ngày 26/10/2026 trên máy A

- [x] Menu dùng API: hiển thị loading khi mô phỏng mạng chậm,
      sau đó hiển thị đủ 4 sản phẩm.
- [x] Menu hiển thị “Hiện chưa có sản phẩm.” khi phản hồi GET
      /products được ghi đè thành [] bằng Chrome Local Overrides.
      Đây là phản hồi API giả lập, không phải kiểm thử database rỗng.
      Sau khi tắt Overrides, menu hiển thị lại 4 sản phẩm.
- [x] Trang chi tiết hiển thị “Đang tải chi tiết sản phẩm…”
      khi mô phỏng mạng chậm, sau đó hiển thị sản phẩm.
- [x] Dừng backend và reload trang chi tiết:
      hiển thị “Không tải được sản phẩm”; lỗi kết nối ECONNREFUSED.
- [x] Phát hiện lỗi phục hồi: backend đã trả HTTP 200 nhưng
      nút Thử lại không phục hồi trang; F5 phục hồi được.
- [x] Sửa reset() thành retry() tại commit 2ed30b3.
      Kiểm thử lại: khởi động lại backend, bấm Thử lại
      và tải được chi tiết sản phẩm mà không cần F5.
- [x] Frontend typecheck, lint và build thành công
      với phần sửa tại commit 2ed30b3.
- [x] Backend typecheck và build thành công tại commit 4cbfb28
      trên nhánh docs/sprint1-closeout, dùng Prisma 7.10.1.
- [x] Git chỉ theo dõi backend/.env.example
      và frontend/.env.local.example trong nhóm file .env*.
- [x] git check-ignore xác nhận backend/.env
      và frontend/.env.local được .gitignore bỏ qua.
- [x] Kiểm tra lịch sử đường dẫn .env* trên các Git refs
      hiện có chỉ thấy hai file mẫu, không thấy file env thật.

Phần sửa lỗi được gửi trong PR #10, chưa tích hợp vào main.
Bằng chứng ảnh/video và log cần được liên kết trước nghiệm thu.

## Còn phải hoàn thành hoặc xác nhận trước nghiệm thu

- [ ] Hoàn thiện README đúng với code và kiểm tra lại hướng dẫn chạy
      bằng kết quả thiết lập trên máy thành viên khác đã có.
- [ ] Gom và liên kết bằng chứng migration, seed, API,
      thời gian phản hồi và các ca giao diện đã kiểm tra.
- [ ] D cập nhật báo cáo kiểm thử trong PR #8:
      giữ kết quả lần đầu, ghi rõ lỗi và kết quả kiểm thử lại,
      commit được kiểm thử, nguồn dữ liệu và bằng chứng.
- [ ] A đối chiếu đủ 24 AC trong hồ sơ Sprint 1 v1.1:
      ghi rõ kết quả, bằng chứng và mục còn thiếu xác nhận.
- [ ] Cập nhật board/backlog theo tiến độ thực tế;
      công việc chưa đạt được ghi nhận để nhóm quyết định xử lý.
- [ ] Nhóm thực hiện Sprint Review, ghi kết quả nghiệm thu của PO.
- [ ] B hỗ trợ Retrospective, ghi vấn đề và hành động cải thiện.
- [ ] Đồng bộ báo cáo Assignment 1 với kết quả cuối Sprint.

Kết quả kiểm thử trên máy A không tự thay thế cho kết quả D trực tiếp
thực hiện. Báo cáo phải phân biệt người kiểm thử và người tổng hợp.

Chỉ xác nhận Sprint 1 hoàn thành khi nhóm đã đối chiếu AC/DoD
và ghi nhận kết quả Sprint Review.

Thời gian toàn đồ án:
- Sprint 1: Tuần 1.
- Sprint 2: Tuần 2 và 3.
- Sprint 3: Tuần 4 và 5, bao gồm chuẩn bị nộp.

Ngày cụ thể bổ sung theo nhóm.
