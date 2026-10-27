# Sprint 1 — Nội dung đồng bộ cho báo cáo Assignment 1 (bản nháp)

Chuẩn bị ngày 27/10/2026 từ main b599076 để người cập nhật báo cáo (bản làm việc 0.2
trở đi) chép vào Chương 6 và 7. Mọi kết quả dưới đây **lấy từ ghi nhận trong
`SPRINT1_CHECKLIST.md`, `KIEM_TRA_BAN_KHOI_DONG.md` và `Testing/`**, không phải đợt
chạy mới trên b599076. Báo cáo phải giữ cách ghi này: chỉ ghi “Đạt” cho phạm vi, môi
trường và người chạy đã nêu.

## 1. Đoạn thay cho Mục 6.1 (bảng “Ghi nhận tại mốc cập nhật”)

| Mục | Ghi nhận tại mốc b599076 (26/10/2026) |
|---|---|
| Repository | https://github.com/giabaot400-boop/BrewLite |
| Frontend | Next.js; chạy cổng 3000; có thể dùng fixture hoặc Product API qua `NEXT_PUBLIC_PRODUCTS_SOURCE`. |
| Backend | NestJS; cổng 3001; `/health`, `GET /products`, `GET /products/:id` đã tích hợp qua PR #6 và #7. |
| Database | PostgreSQL với Prisma; migration `20261024160346_init_products`; seed 4 sản phẩm, 2 topping, 2 liên kết. A chạy trên PostgreSQL 17; D ghi PostgreSQL 18. |
| Layout và UI dùng chung | Tích hợp qua PR #4 (thành viên B). |

## 2. Bảng thay cho Mục 6.3 (tiến độ chức năng)

| Hạng mục | Tiến độ có căn cứ | Còn thiếu |
|---|---|---|
| Phân tích và thiết kế | Hồ sơ v1.1, đối chiếu 24 AC, bộ sơ đồ trong `docs/diagrams/` | Họ tên, ngày cụ thể |
| Bộ khung và Git | Frontend/backend chạy; main và các nhánh tính năng; PR #1 đến #10 | Xác nhận thiết lập từ máy thành viên khác; ngoại lệ C đưa code thẳng lên main |
| Menu | Chạy với fixture và với API thật (A) | Kiểm tra lại ở b599076 nếu cần bằng chứng mới |
| Trang chi tiết | Size, topping, giá xem trước, chặn giá sai; retry sửa ở PR #10 | – |
| Product API | Hai endpoint đã tích hợp; 200/404; đo local dưới 500 ms (A, D) | Test tự động |
| Database | Migration và seed chạy trên máy A | Chạy lại trên máy thành viên khác |
| Kiểm thử | Báo cáo D đã merge (PR #8) với 12 nhóm ca và 18 ảnh | Commit chạy từng ảnh, nguồn dữ liệu UI ở một số ca |
| Nghiệm thu Sprint 1 | Đã đối chiếu 24 AC | Sprint Review, Retro, quyết định của PO |
| Sprint 2 và 3 | Có phạm vi và kế hoạch | Chưa triển khai |

## 3. Cập nhật trạng thái bộ ca kiểm thử (Mục 7.4)

Cột “Trạng thái” đề xuất, theo ghi nhận hiện có. “A” là kết quả A chạy; “D” là kết
quả trong báo cáo của D.

| Mã | Trạng thái đề xuất | Căn cứ và giới hạn |
|---|---|---|
| TC-01 | Chờ ghi kết quả | Cần máy khác chạy toàn bộ README. Đã có lần chạy trên môi trường Linux sạch: cài đặt, `setup`, lint, typecheck và build frontend thành công; bước Prisma không chạy được trong môi trường đó nên chưa tính |
| TC-02 | Đạt (A, D) | API thật trả 4 sản phẩm; Menu có loading và đúng ảnh, tên, giá S |
| TC-03 | Đạt với phản hồi giả lập (A, D) | Local Overrides trả `[]` (A) và fixture rỗng (D); không phải database rỗng |
| TC-04 | Đạt (A); D ghi PASS, bước phục hồi chưa được A xác minh độc lập | Dừng và bật lại backend, bấm Thử lại phục hồi 4 sản phẩm |
| TC-05 | Đạt (A) | Card mở đúng id; chi tiết lấy từ API; có đường quay lại |
| TC-06 | Đạt (A, D) | 404 với `Product not found`; giao diện không tìm thấy và về Menu |
| TC-07 | Đạt (A) | Cà phê sữa 35.000, 40.000, 45.000 đồng và quay lại 35.000 |
| TC-08 | Đạt (A, D) | M + Kem = 47.000; L + Kem + Trân châu = 57.000; bỏ topping giảm đúng |
| TC-09 | Đạt (A) | Americano không topping vẫn chọn size và tính giá |
| TC-10 | Đạt trong phạm vi API và đọc code | Giá integer không âm; component nhận dữ liệu từ backend; chưa đối chiếu trực tiếp SQL cho mọi giá |
| TC-11 | Đạt trong các lần đo local | A: khoảng 4,0–54,4 ms và 5,7–12,0 ms; D: khoảng 57,6 ms và 67,0 ms; một lần đo không cam kết cho môi trường khác |
| TC-12 | Đạt một phần | Responsive 390/768/1280 px, bàn phím, focus, ảnh lỗi (A); các thay đổi chính qua PR; riêng thay đổi sớm của C đưa thẳng lên main nên không có bằng chứng review |
| TC-13 | Đạt ở phạm vi component (A) | Giá âm, NaN, thiếu, chuỗi: không hiện preview sai, có thông báo |

## 4. Đoạn thay cho Mục 7.3 (đánh giá hiện tại)

Sprint 1 đã có luồng Menu, chi tiết, tùy chọn và giá chạy với dữ liệu từ Product API và
PostgreSQL trên máy A, cùng báo cáo kiểm thử của D. Các kết quả thể hiện phạm vi đã
kiểm tra, không thay thế Sprint Review. Còn mở: xác nhận thiết lập từ máy thành viên
khác, test tự động, ghi rõ commit cho từng đợt kiểm thử, ngoại lệ quy trình review ở
giai đoạn đầu, Sprint Review và Retrospective, và quyết định chấp nhận Increment của
PO.

## 5. Mục [BỔ SUNG] vẫn cần người thật làm

| Mã trong báo cáo | Việc |
|---|---|
| KQ-01 | Chèn ảnh Menu và chi tiết chụp từ bản chạy, ghi ngày, nhánh, commit (có thể dùng ảnh trong `docs/Testing/evidence/` và chú thích giới hạn) |
| KT-01 | Chèn log lint, typecheck, build và kiểm tra setup từ một máy khác |
| Họ tên, ngày | Họ tên và mã số sinh viên A đến E; ngày cụ thể từng Sprint |
