# Kiểm tra bản khởi động

Nhánh được kiểm tra: `feature/menu`. Đây là bản khởi động, chưa nghiệm thu Sprint 1.

> Tài liệu giữ lịch sử kiểm thử bản khởi động và các đợt kiểm tra bổ sung.
> Các nhận xét “chưa tích hợp API/database” thuộc thời điểm ghi nhận.
> Kết quả tích hợp sau PR #6 và #7 cùng trạng thái cần xác nhận hiện tại
> được tổng hợp trong SPRINT1_CHECKLIST.md.

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

## Kiểm tra bổ sung ngày 23/10/2026 — dữ liệu fixture

A thực hiện kiểm tra thủ công trên Chrome ở môi trường local:

- Americano không có topping: hiển thị thông báo phù hợp,
  vẫn chọn được size S/M/L. Đổi S → M → L → S cho giá lần lượt
  40.000 → 45.000 → 50.000 → 40.000 đồng.
- Menu và chi tiết sản phẩm: kiểm tra ở chiều rộng 390 px,
  visualViewport.scale bằng 1; không ghi nhận tràn ngang
  hoặc nội dung bị cắt trong các trang đã kiểm tra.
- Bàn phím: Tab di chuyển có viền focus nhận biết;
  phím mũi tên đổi size; Space chọn/bỏ topping.
- Cà phê sữa size M: giá 40.000 đồng; chọn Kem và Trân châu
  thành 52.000 đồng; bỏ cả hai trở về 40.000 đồng.

Bổ sung grid-cols-1 cho khung chi tiết sản phẩm để khai báo
rõ bố cục một cột trên màn hình nhỏ.

Trong quá trình kiểm tra, phát hiện mức pinch-zoom khoảng 1,287.
Sau khi mở tab mới, mức zoom trở về 1 và không còn hiện tượng
kéo ngang. Chưa tách riêng ảnh hưởng của thay đổi CSS và zoom.

Kết quả này chưa đại diện cho thiết bị di động thật,
kiểm tra accessibility đầy đủ hoặc tích hợp Product API thật.

- Sau thay đổi, frontend typecheck, lint và production build đều thành công trên máy A.

## Kiểm tra bổ sung ngày 24/10/2026 — giả lập trên frontend

Mốc code: ec8e2f9, đã tích hợp phần UI dùng chung của B.
A kiểm tra thủ công trên Chrome, chạy frontend ở chế độ dev.

| Ca | Cách thử | Kết quả |
|---|---|---|
| TC-13 — thiếu giá | Tạm truyền undefined vào basePrice của ProductOptions | Hiện thông báo không thể tính giá; không hiện NaN; vẫn đổi size/topping được |
| TC-13 — giá dạng chuỗi | Tạm truyền chuỗi "35000" vào basePrice | Chặn preview giá sai, hiện thông báo phù hợp; trang vẫn hoạt động |
| TC-12 — ảnh lỗi | Trang chi tiết dùng đường dẫn ảnh không tồn tại | Hiện placeholder.svg, bố cục và tùy chọn vẫn hoạt động |
| Loading Menu | getProducts chờ giả lập 3 giây rồi trả fixture | Hiện thông báo loading và skeleton, sau đó hiện 4 sản phẩm |
| TC-03 — danh sách rỗng | getProducts trả mảng rỗng sau độ trễ | Dừng loading, hiện "Hiện chưa có sản phẩm." |
| TC-04 — lỗi và thử lại | getProducts ném lỗi giả lập | Hiện lỗi và nút Thử lại; bấm lại có loading rồi hiện lỗi khi nguyên nhân vẫn còn |
| TC-04 — phục hồi | Bật điều kiện thành công bằng hash thử nghiệm, không tải lại trang, rồi bấm Thử lại | Sau loading, hiện 4 sản phẩm và thông báo lỗi biến mất |

Các phép thử trên kiểm tra hành vi frontend bằng đầu vào giả lập,
chưa chứng minh Product API hoặc PostgreSQL thật hoạt động.

Đã gỡ toàn bộ thay đổi giả lập. Git diff không còn thay đổi code.
TC-13 giá âm và NaN đã được ghi nhận ở đợt kiểm tra trước,
không phải các trường hợp chạy lại trong ngày này.

## Còn phải kiểm tra và hoàn thiện

- Migration, seed và kết nối PostgreSQL thực tế trên môi trường của C/E.
- `GET /products` và `GET /products/:id` thật, kể cả dữ liệu rỗng và lỗi.
- Kiểm tra lại chọn size, nhiều topping và tính giá khi tích hợp Product API thật.
- Review của thành viên khác, chạy trên máy nhóm và nghiệm thu theo 24 AC trong hồ sơ v1.1.

Không dùng `/health` làm bằng chứng database đã hoạt động. Các commit khởi tạo
là bộ khung hỗ trợ nhóm bắt đầu; nhóm cần đọc, hiểu và kiểm tra trước khi bàn giao.
