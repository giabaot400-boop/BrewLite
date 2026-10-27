# Sprint 1 — Bản ghi Sprint Review và Retrospective (bản nháp)

Chuẩn bị ngày 27/10/2026 từ lịch sử repository và các tài liệu đã merge vào main
(mốc b599076). Đây là **bản nháp để nhóm dùng trong buổi họp**. Các mục
“Kết quả buổi họp” còn trống vì chưa có buổi họp nào được ghi nhận; không điền
thay nhóm hoặc PO.

## 1. Sprint Review

### 1.1 Thông tin buổi họp

| Mục | Nội dung |
|---|---|
| Ngày giờ | [BỔ SUNG] |
| Người tham dự | [BỔ SUNG: A, B, C, D, E] |
| Người điều phối | [BỔ SUNG] |
| Người ghi biên bản | [BỔ SUNG] |

### 1.2 Sprint Goal

Xây dựng nền tảng ban đầu cho BrewLite cho phép khách hàng xem danh sách đồ uống
từ backend, mở trang chi tiết, chọn size và topping rồi xem giá được cập nhật
chính xác (hồ sơ v1.1, mục 2.1).

### 1.3 Backlog item và trạng thái theo bằng chứng trong repository

Trạng thái dưới đây là **đề xuất từ bằng chứng đã có**; PO quyết định chấp nhận.

| ID | Kết quả phải có | Lead | Trạng thái đề xuất | Căn cứ và phần còn thiếu |
|---|---|---|---|---|
| S1-01 | Repo, docs, env, README | E | Gần xong | Hai ứng dụng build được; có `.env.example`; không thấy env thật trong Git (A kiểm tra). Còn thiếu: xác nhận thiết lập từ máy mới theo README |
| S1-02 | Product, Topping, dữ liệu mẫu | E | Xong trên máy A | Migration và seed chạy thành công trên PostgreSQL 17 (A); seed chạy lại không nhân đôi dữ liệu |
| S1-03 | GET /products, GET /products/:id | C | Xong trên máy A | 200, 404 đúng contract; lần đo local dưới 500 ms (A và D). Ghi nhận C từng đưa code thẳng lên main |
| S1-04 | Trang Menu | A | Xong | Loading, lưới, empty, lỗi, thử lại, điều hướng (A); responsive 390/768/1280 px |
| S1-05 | Chi tiết, tùy chọn, tính giá | A | Xong | Mặc định S, nhiều topping, không cộng trùng, chặn giá sai (A); lỗi phục hồi retry đã sửa ở PR #10 |
| S1-06 | Kiểm thử và tích hợp | D | Một phần | Báo cáo D đã merge (12 nhóm ca, 18 ảnh). Chưa ghi commit chạy từng ảnh; repo chưa có test tự động |
| S1-07 | Hồ sơ Sprint và hướng dẫn chạy | A, E | Chưa xong | Đối chiếu 24 AC đã lập. Còn: Review này, Retrospective, đồng bộ báo cáo |

### 1.4 Definition of Done (hồ sơ v1.1, mục 2.4)

| Tiêu chí | Tình trạng theo bằng chứng hiện có | Ghi chú |
|---|---|---|
| Frontend và backend build; có hướng dẫn chạy từ máy mới | Chưa xác nhận đầy đủ | Build frontend và hướng dẫn README đã có; chưa có ai khác ngoài A ghi nhận chạy toàn bộ README (bao gồm database) |
| AC đã kiểm tra, không lỗi chặn demo | Đã đối chiếu 24 AC | Kết quả tổng hợp từ A và D, không phải đợt chạy mới trên b599076 |
| API validate tham số; UI có loading, empty, error | Đạt theo ghi nhận | Kiểm tra ở Menu và chi tiết (A) |
| Commit rõ nghĩa; ít nhất một người khác review | Có ngoại lệ | Các PR từ #4 trở đi có review; C đưa code thẳng lên main trước đó (checklist ghi nhận) |
| Không secret trong Git; có env example | Đạt trong phạm vi đã kiểm tra | Hai file env mẫu; kiểm tra lịch sử đường dẫn `.env*` |
| PO chấp nhận Increment; việc chưa xong trả về Product Backlog | **Chưa có** | Quyết định ở mục 1.6 |

### 1.5 Demo (nhóm điền)

| Nội dung demo | Người trình bày | Dữ liệu (fixture hay API thật) | Kết quả |
|---|---|---|---|
| Menu từ API | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |
| Chi tiết, size, topping, giá | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |
| Trạng thái lỗi và thử lại | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |
| 404 sản phẩm không tồn tại | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |

### 1.6 Kết quả buổi họp (PO điền)

| Mục | Nội dung |
|---|---|
| Quyết định của PO về Increment | [BỔ SUNG: chấp nhận / chấp nhận có điều kiện / không chấp nhận] |
| Việc chưa đạt, trả về Product Backlog | [BỔ SUNG] |
| Phản hồi từ người tham dự | [BỔ SUNG] |

## 2. Retrospective

### 2.1 Thông tin buổi họp

| Mục | Nội dung |
|---|---|
| Ngày giờ | [BỔ SUNG] |
| Người điều phối | B (Scrum Master) |
| Người tham dự | [BỔ SUNG] |

### 2.2 Dữ kiện từ repository để làm đầu vào thảo luận

Các mục dưới đây là **sự kiện ghi trong repository hoặc PR**, không phải kết luận
của nhóm. Nhóm bổ sung, sửa hoặc bỏ mục nào chưa đúng.

**Điều đã tiến hành tốt (đề xuất ghi nhận)**
- Các thay đổi chính được đưa vào main qua pull request (PR #1 đến #10), nhiều PR có yêu cầu hoặc ghi nhận review.
- A phát hiện lỗi nút Thử lại không phục hồi khi kiểm thử với API thật, sửa ở PR #10
  bằng tài liệu Next.js của chính dự án.
- Tài liệu phân biệt kết quả fixture với kết quả API thật; báo cáo D giữ lịch sử
  FAIL ban đầu (TC-D02 trả 404) thay vì xóa.
- Có đối chiếu 24 AC kèm căn cứ và ngoại lệ.

**Vấn đề đã gặp (sự kiện có ghi nhận)**
- C đưa code thẳng lên main trước khi tách nhánh (TS01-AC-05 có ngoại lệ).
- Giao diện dùng fixture cho đến khi migration và Product API được tích hợp qua PR #6 và #7.
- Lần kiểm thử đầu của D gặp `GET /products` trả 404, sau đó 500 vì PostgreSQL chưa
  sẵn sàng; phải retest.
- Phiên bản PostgreSQL khác nhau giữa các máy (A và E ghi 17, D ghi 18).
- Bằng chứng kiểm thử chưa ghi commit đã chạy, `DEMO_MODE` và nguồn dữ liệu của UI.
- Một số lỗi trình bày nhỏ: tên file ảnh không khớp nội dung (`Pearl`), đuôi `.png.png`,
  số thập phân dùng dấu phẩy dễ đọc nhầm thành hàng nghìn (“4,008–54,361 ms”).
- Quy ước có yêu cầu review nhưng GitHub chưa bắt buộc (nút Merge vẫn bấm được
  khi chưa có approve).

### 2.3 Hành động cải thiện đề xuất (nhóm quyết định)

| # | Hành động đề xuất | Người đề xuất phụ trách | Hạn | Nhóm đồng ý? |
|---|---|---|---|---|
| 1 | Bật branch protection cho `main`: bắt buộc PR và 1 approval | Chủ repo [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |
| 2 | Mẫu PR có mục “commit đã kiểm thử” và “nguồn dữ liệu: fixture/API” | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |
| 3 | Thống nhất một phiên bản PostgreSQL; cân nhắc đưa Docker Compose cho DB vào sớm hơn Sprint 3 | E | [BỔ SUNG] | [BỔ SUNG] |
| 4 | Quy ước đặt tên file bằng chứng (`TC-xx_mô-tả.png`, không đuôi kép) và quy ước viết số (dùng khoảng trắng hoặc dấu chấm cho hàng nghìn) | D | [BỔ SUNG] | [BỔ SUNG] |
| 5 | Họp checkpoint giữa Sprint để phát hiện phần chậm (API, DB) sớm hơn | B | [BỔ SUNG] | [BỔ SUNG] |
| 6 | Thêm test tự động tối thiểu (unit test tính giá, test API) trước Sprint 2 | [BỔ SUNG] | [BỔ SUNG] | [BỔ SUNG] |

Mục “Nhóm đồng ý?” và “Hạn” chỉ điền sau khi họp. Hành động chưa được nhóm đồng ý
thì không ghi là đã thống nhất.

### 2.4 Kết luận buổi Retro

[BỔ SUNG sau buổi họp]
