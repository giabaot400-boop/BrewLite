# Sprint 1 — Nội dung đồng bộ cho báo cáo Assignment 1 (đợt chốt hồ sơ 27/10/2026)

Cập nhật ngày 27/10/2026 từ main b599076 và hồ sơ PR #11; đồng bộ với
báo cáo làm việc 0.6, Chương 6–8. Báo cáo Word được lưu riêng, không đưa lên Git. Mọi kết quả dưới đây **lấy từ ghi nhận trong
`SPRINT1_CHECKLIST.md`, `KIEM_TRA_BAN_KHOI_DONG.md` và `Testing/`**, không phải đợt
chạy mới trên b599076. Báo cáo phải giữ cách ghi này: chỉ ghi “Đạt” cho phạm vi, môi
trường và người chạy đã nêu.

## 1. Đoạn thay cho Mục 6.1 (bảng “Ghi nhận tại mốc cập nhật”)

| Mục | Ghi nhận tại mốc b599076 (26/10/2026) |
|---|---|
| Repository | https://github.com/giabaot400-boop/BrewLite |
| Frontend | Next.js; chạy cổng 3000; có thể dùng fixture hoặc Product API qua `NEXT_PUBLIC_PRODUCTS_SOURCE`. |
| Backend | NestJS; cổng 3001; `/health`, `GET /products`, `GET /products/:id` đã tích hợp qua PR #6 và #7. |
| Database | PostgreSQL với Prisma; migration `20261024160346_init_products`; seed 4 sản phẩm, 2 topping, 2 liên kết. A/E ghi PostgreSQL 17; D ghi PostgreSQL 18. Kết quả máy E được bổ sung từ commit 332a1ed. |
| Layout và UI dùng chung | Tích hợp qua PR #4 (thành viên B). |

## 2. Bảng thay cho Mục 6.3 (tiến độ chức năng)

| Hạng mục | Tiến độ có căn cứ | Còn thiếu |
|---|---|---|
| Phân tích và thiết kế | Hồ sơ v1.1, đối chiếu 24 AC, bộ sơ đồ trong `docs/diagrams/` | Họ tên, ngày cụ thể |
| Bộ khung và Git | Frontend/backend chạy; main và các nhánh tính năng; PR #1 đến #10 | Giữ ngoại lệ C đưa code thẳng main; clean install trọn README cuối chưa xác nhận |
| Menu | Chạy với fixture và với API thật (A) | Không yêu cầu chạy lại nếu không có thay đổi code hoặc lỗi mới |
| Trang chi tiết | Size, topping, giá xem trước, chặn giá sai; retry sửa ở PR #10 | – |
| Product API | Hai endpoint đã tích hợp; 200/404; đo local dưới 500 ms (A, D), E có ghi nhận tích hợp | Test tự động là đề xuất cho kế hoạch tiếp theo |
| Database | A/E có kết quả migration và seed; A kiểm tra reseed 4/2/2 | Chưa có một lần clone sạch chạy trọn README cuối |
| Kiểm thử | Báo cáo D đã merge (PR #8) với 12 nhóm ca và 18 ảnh | Commit chạy từng ảnh, nguồn dữ liệu UI ở một số ca |
| Nghiệm thu Sprint 1 | Đã đối chiếu 24 AC; có tổng hợp Review/Retro và backlog qua PR/chat | PO đã chấp nhận ngày 27/10/2026; hồ sơ PR #11 chờ review/merge |
| Sprint 2 và 3 | Có phạm vi và kế hoạch | Chưa triển khai |

## 3. Cập nhật trạng thái bộ ca kiểm thử (Mục 7.4)

Cột “Trạng thái” đề xuất, theo ghi nhận hiện có. “A” là kết quả A chạy; “D” là kết
quả trong báo cáo của D.

| Mã | Trạng thái đề xuất | Căn cứ và giới hạn |
|---|---|---|
| TC-01 | Đạt phần chạy/build/env đã kiểm; clean install cuối chưa xác nhận | A/E có kết quả hai ứng dụng và database. Linux sạch dùng Node 22 khác hướng dẫn Node 24, Prisma bị chặn tải công cụ; không dùng để kết luận backend đạt/lỗi |
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

Sprint 1 đã có kết quả chức năng trong phạm vi kiểm tra ghi nhận của A/D/E.
Đủ 24 mã AC đã được đối chiếu; ngoại lệ Git và giới hạn bằng chứng giữ nguyên.
Đã có bản tổng hợp Review/Retrospective qua PR/chat, trạng thái ý kiến A–E và
backlog tại [SPRINT1_REVIEW_RETRO.md](SPRINT1_REVIEW_RETRO.md). C/D/E chưa có
ý kiến bổ sung trong đợt chốt; không tính là đồng ý. Chưa có buổi họp riêng.
PO đã chấp nhận kết quả chức năng ngày 27/10/2026, theo phạm vi và giới hạn
ở mục 1.5 của bản tổng hợp Review. Còn chờ review/merge PR #11; không ghi
thành “24/24 đạt mọi DoD”.
Test tự động, Docker và chụp lại toàn bộ bằng chứng không phải điều kiện mới
của đợt chốt này. Clean install trọn README cuối chưa xác nhận được theo dõi
ở F02. Bản Word 0.6 giữ các giới hạn này và kết quả gốc, không nhân bản 18 ảnh.

## 5. Mục [BỔ SUNG] vẫn cần người thật làm

| Mã trong báo cáo | Việc |
|---|---|
| KQ-01 | Đã liên kết ảnh bản chạy trong `docs/Testing/evidence/`; chỉ chèn ảnh tiêu biểu khi cần theo mẫu nộp, không phải chụp lại toàn bộ |
| KT-01 | Đã ghi kết quả lint/typecheck/build A và kết quả máy E; giữ commit/nguồn. Clean install cuối theo dõi F02, không ghi đã làm |
| Họ tên, ngày | Họ tên và mã số sinh viên A đến E; ngày cụ thể từng Sprint |
