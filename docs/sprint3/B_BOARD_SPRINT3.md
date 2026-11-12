# S3-B-02: Board Sprint 3, nhật ký hằng ngày và burndown

Phiên bản 1.0 ngày 06/11/2026, phần việc của B (Scrum Master). Nguồn: `TEAM_PLAN.md` v1.3 mục 1, 4, 5, 6.
Chưa có bằng chứng về một board ngoài repository; bảng dưới đây là bản trong repository để cả nhóm cập nhật
bằng PR nhỏ. Không ghi thay là đã cập nhật board ngoài.

## 1. Quy ước

- Cột: TODO / DOING / BLOCKED / REVIEW / DONE. Một ticket chỉ một lead.
- **DONE chỉ khi** lead có artifact + test/evidence **và** reviewer đã ghi kết quả. "Đã code" chưa phải DONE.
- Ô chưa biết để trống hoặc ghi `chưa cập nhật`; B không tự điền thay lead.
- Mốc 04–05/11 trong TEAM_PLAN là mục tiêu, không phải xác nhận đã xong. Tại 06/11 mỗi lead cập nhật PR/SHA hoặc blocker thật.

## 2. Board (12 ticket)

Trạng thái ghi theo dữ liệu B có tại 06/11/2026. Các ticket của lead khác ghi `chưa cập nhật`: lead điền ở PR của mình.

| Ticket | Lead | Reviewer | Giờ ước lượng | Trạng thái | PR / SHA | Blocker / ghi chú |
|---|---|---|---|---|---|---|
| S3-A-01 | A | B | 5–7 | chưa cập nhật |  |  |
| S3-A-02 | A | D | 4–6 | chưa cập nhật |  | Cần DTO D, read API C |
| S3-B-01 | B | A | 5–7 | PR #32 đã merge vào main (merge `5a0fde2`); A đã approve tại `ee15c75` sau khi B sửa 4 điểm review. **Chưa kiểm với backend tích hợp** | PR #32 / `5a0fde2` | Dùng fixture; cần thử trên #53 khi backend đủ payment/cancel (DEP-05/06) |
| S3-B-02 | B | D | 3–4 | DOING: tài liệu đã cập nhật 12/11 theo kết quả review #49/#53; **chờ evidence từng lead** |  | Review/Retro chỉ điền sau khi có sự việc thật |
| S3-C-01 | C | D | 5–7 | chưa cập nhật |  | Cần trường E, interface D |
| S3-C-02 | C | E | 3–4 | chưa cập nhật |  | Cần workflow D, schema E |
| S3-D-01 | D | E | 6–8 | chưa cập nhật |  | Đường găng |
| S3-D-02 | D | C | 6–8 | chưa cập nhật |  | Đường găng |
| S3-D-03 | D | B | 3–4 | chưa cập nhật |  | Cần evidence A/B/C/E |
| S3-E-01 | E | D | 4–6 | chưa cập nhật |  | Đường găng |
| S3-E-02 | E | D | 3–5 | chưa cập nhật |  |  |
| S3-E-03 | E | C | 3–4 | chưa cập nhật |  | Cần build A/B/C/D |

Tổng ước lượng của kế hoạch: 50–70 giờ tập trung, chưa có buffer lỗi nền. Đó là estimate phân tải, không phải cam kết hay số giờ đã làm.

## 3. Nhật ký hằng ngày (mỗi lead ba dòng)

Thêm một khối mỗi ngày, mới nhất ở trên. Không sửa khối cũ; sửa bằng dòng mới có ngày.

```
### dd/mm/2026
- A: đã làm (PR/SHA/log) | tiếp theo (thời điểm) | blocked bởi (ticket/người/đầu vào)
- B: ...
- C: ...
- D: ...
- E: ...
```

### 12/11/2026

- B: đã làm: review PR #49 (sơ đồ Sprint 2): đạt, 8 SVG khớp nguồn PlantUML, 0 liên kết hỏng; review PR #53 tại `ff9bb73`: frontend lint/typecheck/build sạch, 945/945 test web, API 50/54 spec (4 spec cần Prisma client); backend chưa có `POST /payments` và hủy đơn; cập nhật checklist hồi quy, ghi chú AC, board, Review/Retro | tiếp theo: kiểm UI trên backend tích hợp khi D bàn giao payment/cancel; chạy lại trên Node 24/CI | blocked bởi: backend payment/cancel (D), Prisma/PostgreSQL chưa chạy trong môi trường của B.
- A (thông báo nhóm 12/11): A2 PR #2 (CI) và #4 (UML) đã merge.
- C, D, E: chưa cập nhật trong repository.

### 07/11/2026

- B: đã làm: review PR #30 (đổi layout `apps/web`, `apps/api`, đã merge) và PR #31 (tài liệu kiến trúc frontend/BFF/PWA của A: approve kèm góp ý nhỏ, chưa merge tại thời điểm ghi); chuyển phần S3-B sang layout mới | tiếp theo: mở PR S3-B-01/S3-B-02, nhờ A và D review | blocked bởi: chưa có (backend đọc đơn của C chưa tích hợp, dùng fixture).
- A, C, D, E: chưa cập nhật.

### 06/11/2026

- B: đã làm: S3-B-01 (UI đọc đơn, trang xác nhận/chi tiết/lịch sử, BFF đọc, PR #32; 378 test trên máy B Node 24 trước review; đã sửa 4 điểm review 08/11: 388 test đạt trên Node 24 (máy B) và Node 22.22; lint/typecheck/build/Playwright mới chạy trên Node 22.22) và bộ tài liệu S3-B-02 | tiếp theo: push bản sửa, nhờ A review lại | blocked bởi: chưa có (backend đọc đơn của C chưa tích hợp, dùng fixture).
- A, C, D, E: chưa cập nhật.

## 4. Burndown (remaining hours)

Chỉ điền số thật từng ngày; ô chưa có số để trống, **không vẽ đường giảm giả**. Khi đổi estimate, giữ dòng cũ và thêm dòng mới ghi lý do.

| Ngày | A | B | C | D | E | Tổng còn lại | Ghi chú thay estimate |
|---|---|---|---|---|---|---|---|
| 06/11 |  |  |  |  |  |  |  |
| 07/11 |  |  |  |  |  |  |  |
| 08/11 |  |  |  |  |  |  | Mốc: có E2E đầu tiên |
| 09/11 |  |  |  |  |  |  | Chạy a/b/c và ca an toàn |
| 10/11 |  |  |  |  |  |  |  |
| 11/11 |  |  |  |  |  |  | Đóng gói A1 dự kiến, Review/Retro thật |
| 12/11 |  |  |  |  |  |  | Dự phòng tích hợp A1/A2 |
| 13/11 |  |  |  |  |  |  |  |
| 14/11 |  |  |  |  |  |  | Freeze bộ nộp |
| 15/11 |  |  |  |  |  |  | Nộp theo giờ LMS (PO kiểm tra giờ chính thức) |

## 5. Rủi ro đang mở (ghi trong ngày phát hiện)

| Ngày | Rủi ro | Ticket / owner | Ngày xử lý mới |
|---|---|---|---|
| 06/11 | Mốc 05/11 (đủ schema/interface/fixture) và 06/11 chưa có xác nhận từ các lead; còn 9 ngày tới hạn | Tất cả lead | Mỗi lead cập nhật board trong 06/11 |
| 06/11 | main chưa có workflow CI; Assignment 2 Task 4 cần CI chặn merge | A2-REPO-CI (B) | Làm sớm, trước khi dồn PR Sprint 3 |
| 06/11 | PR đổi `frontend/backend` → `apps/web`, `apps/api` sẽ xung đột với PR Sprint 3 đang mở | A2-REPO-CI (B), A | Chốt thời điểm đóng băng merge hoặc hỏi giảng viên có chấp nhận giữ tên cũ kèm bảng ánh xạ |
| 07/11 | _Đã xử lý:_ PR #30 (`apps/web`, `apps/api`) đã merge vào main; nhánh Sprint 3 cần cập nhật đường dẫn theo README | A2-REPO-CI | Mỗi lead cập nhật nhánh của mình |
| 07/11 | Task 3.1/3.2 (mốc 06/11) chưa đủ tạo phẩm trên main: kiến trúc tổng thể/ADR (D) và deployment (E) chưa thấy; PR #31 mới có phần BFF/PWA của A | A2-ARCH (D), A2-DEPLOY-DESIGN (E) | D, E đặt mốc mới và ghi vào board trong 07/11 |
| 06/11 | Giờ chốt nộp trên LMS chưa xác minh | PO | Kiểm tra trước 12/11 |
| 12/11 | Bản tích hợp #53 chưa có `POST /payments`, hủy đơn, hết hạn; các AC S3-PAY/S3-ORD chưa kiểm được dù BFF web đã có route | D (backend), E (kiểm thử PostgreSQL) | D, E đặt giờ bàn giao PR/SHA |
| 12/11 | Typecheck/build backend và script PostgreSQL chưa chạy trên SHA #53 trong môi trường của B | E, B | Chạy trên CI hoặc máy có Prisma/PostgreSQL |

Nếu cuối 08/11 chưa có E2E đầu tiên: A/B ghi rủi ro với ticket/owner/ngày mới trong ngày đó, cập nhật capacity và giảm việc ngoài phạm vi. Không bỏ Task 10 để đạt ngày.

## 5A. Đầu mối Assignment 2 sau khi tách repo

Task 1–5 A2 được theo dõi trong [repo A2](https://github.com/giabaot400-boop/BrewLite-Assignment2),
tại `docs/assignment2/TEAM_PLAN.md` của repo đó. Bảng A2 cũ ngày 07/11 được giữ
trong [commit nguồn](https://github.com/giabaot400-boop/BrewLite/blob/69b801165fc0b199ac70fdc3afa75932a82601c9/docs/sprint3/B_BOARD_SPRINT3.md).
Các dòng rủi ro có ngày ở mục 5 là lịch sử ghi nhận, không phải xác nhận tiến độ
A2 hiện tại. Board này tiếp tục phục vụ Sprint 3 A1.

## 6. Phiếu nhận bàn giao mỗi ticket (TEAM_PLAN mục 6)

Dán vào mô tả PR của ticket. Mục chưa có thì ghi `chưa có`, không bỏ trống.

```
Ticket / lead / reviewer:
SHA + base SHA (base hiện hành: a1a0e4ae92de681deac538685e24407b3190866b):
Contract / AC chịu ảnh hưởng:
Migration / env cần:
Lệnh kiểm thử:
Expected / actual:
Log / ảnh / video:
Giới hạn còn lại:
Kết quả reviewer (tên, ngày, đồng ý / yêu cầu sửa):
```
