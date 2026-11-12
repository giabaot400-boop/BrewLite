# S3-B-02: Board Sprint 3, nhật ký hằng ngày và burndown

## Mốc tích hợp của A — 12/11/2026

A đã chủ động tiếp nhận phần workflow còn thiếu để hoàn thiện A1 theo trao đổi trong ngày; dùng lại helper/schema/pricing/read và UI đã có của các bạn. Đây là ghi nhận phần tích hợp thực tế, không thay lời xác nhận nhận việc hoặc review của C/D/E.

| Phần | Artifact/kết quả thực | Trạng thái hiện tại |
|---|---|---|
| Workflow còn thiếu và tích hợp | 88f5f35: payment/cancel/refund/expiry/CLI; 181 backend, 955 frontend, 28 PG, HTTP/browser và Compose | Có code/evidence, cần review diff phát hành |
| Boundary/QA triển khai | d42deb5: Compose/performance được lưu; boundary 7/7, 10 vòng last-cup | Kết quả kỹ thuật đã đối chiếu |
| Rollout giỏ cũ | 3959f40: sửa provider trước controller; 960 frontend, checks đạt, image mới; legacy/session 9/9 nhóm | Đã sửa và kiểm Windows, chờ review |
| Hồ sơ/bàn giao | Đối chiếu 27 AC; cập nhật Review/Retro/backlog từ sự việc thật | Đang hoàn thiện; S3-DEL-02 còn mở |

Xem [báo cáo](A1_ACCEPTANCE_REVIEW.md). Các bảng ticket/nhật ký cũ bên dưới là lịch sử theo mốc ghi trên từng bảng; không tự chuyển 12 ticket sang DONE hoặc điền giờ/burndown thay thành viên.


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
| S3-B-01 | B | A | 5–7 | Code xong trên máy B, **chờ mở PR** (chưa có reviewer) |  | Dùng fixture; chưa thử với backend C thật (DEP-05/06) |
| S3-B-02 | B | D | 3–4 | DOING: bộ tài liệu board/AC/hồi quy/Review-Retro đã soạn, **chờ evidence từng lead** |  | Review/Retro chỉ điền sau khi có sự việc thật |
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
