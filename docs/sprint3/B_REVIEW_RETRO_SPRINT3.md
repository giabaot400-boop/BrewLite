# S3-B-02: Sprint 3 Review, Retrospective và backlog (khung điền từ sự việc thật)

Phiên bản 1.0 ngày 06/11/2026. Nguồn quy tắc: `TEAM_PLAN.md` v1.3 mục 5–6.
**Đây là khung, chưa phải biên bản.** Chưa có buổi Review hay Retro nào của Sprint 3 diễn ra; không ghi đã họp,
đã demo hoặc đã nhận góp ý khi chưa có. Nếu lớp yêu cầu buổi trực tiếp, hình thức bất đồng bộ phải theo hướng dẫn của lớp.

## Các mốc review/merge cập nhật 13/11/2026

- Ghi nhận thiếu payment/cancel/expiry ngày 12/11 chỉ áp dụng cho `ff9bb73`.
  Workflow đã tích hợp ở `88f5f35`, rollout sửa tại `3959f40`; không còn là
  backlog thiếu code trên main. [Hồ sơ A](https://github.com/giabaot400-boop/BrewLite/blob/88b4e12cf909226e9b376041d5da4205765b7649/docs/sprint3/A1_ACCEPTANCE_REVIEW.md)
  giữ bằng chứng và giới hạn theo từng SHA/image.
- B review `a08152c` (COMMENTED), tự chạy web typecheck/lint và 960 test;
  sau đó [approve `f3f0ef7`](https://github.com/giabaot400-boop/BrewLite/pull/53#pullrequestreview-5884511329),
  tự kiểm web lint/typecheck/960 test/build. API 89/94 còn năm spec cần
  Prisma Client; backend build/typecheck, PG và UI thật dựa vào hồ sơ A.
- PR #53 đã merge `6f38fcb`; #49 merge `a9145f3`; #51 merge `88b4e12`.
  Còn chốt hồ sơ #54, kiến trúc #55, gói cuối và giờ nộp LMS. Approval PR
  không tự đóng từng ticket hoặc thay buổi Review/Retro mà lớp yêu cầu.
- Đây là cập nhật từ PR/code/evidence, không ghi thay đã có buổi nhóm,
  người tham gia hoặc feedback giảng viên. Không tạo burndown hoặc kết quả mới.

## 1. Sprint Review

Điền sau khi có increment đã tích hợp trên một SHA cụ thể.

| Mục | Nội dung |
|---|---|
| Mục tiêu Sprint 3 | Tạo đơn, giữ kho Product, thanh toán giả lập, hủy/hết hạn, điểm thưởng, mã DEMO10, lịch sử đơn (A1 v1.3: 14 UC, 27 AC) |
| SHA được review / base SHA | _chưa có_ / `a1a0e4ae92de681deac538685e24407b3190866b` |
| Hình thức | _họp trực tiếp / video / PR bất đồng bộ_ (ghi đúng thực tế) |
| Ngày, người tham gia | _chưa có_ |
| Demo (video / ảnh / link) | _chưa có_ |

### 1.1 Kịch bản demo (CONTRACTS mục 1, TEST_MATRIX S3-DEL-01)

Mỗi bước ghi kết quả thật (đạt/không, ghi chú). Không ghi đạt khi chưa chạy.

| # | Bước | Kết quả thật |
|---|---|---|
| 1 | Đăng nhập, thêm món vào giỏ, nhập mã DEMO10 (preview "dự kiến") | |
| 2 | Bấm "Tạo và xem đơn": đơn PENDING, tổng chính thức từ server (`/orders/:id`) | |
| 3 | Thanh toán bằng Ví → PAID, điểm thưởng | |
| 4 | Đơn khác: thanh toán thất bại → PAYMENT_FAILED, thử lại thành công | |
| 5 | Mất phản hồi giữa chừng → khôi phục bằng replay đúng key | |
| 6 | Hủy đơn PENDING (nhả kho) và hủy đơn PAID trước pha chế (hoàn tiền, thu hồi điểm) | |
| 7 | Đơn quá hạn 15 phút bị hủy tự động | |
| 8 | Lịch sử đơn `/orders`: đúng chủ, mới nhất trước | |
| 9 | Chạy CLI PAID → PREPARING → READY → COMPLETED (chỉ khi `DEMO_WORKFLOW_ENABLED=true`) | |

### 1.2 Góp ý (có tên, ngày)

| Ngày | Người | Góp ý | Xử lý (PR/ticket) |
|---|---|---|---|
| | | | |

## 2. Retrospective

Chỉ ghi điều **đã xảy ra** trong Sprint 3 và việc cải thiện có owner. Điền sau, không điền trước.

| Nhóm | Ghi nhận (sự việc, ngày, bằng chứng) |
|---|---|
| Làm tốt, nên giữ | B review có kiểm chứng (lint/test/build, merge thử với main) cho các PR checkout/docs; PR #32 sửa 4 điểm review của A ngày 08/11 và A approve tại `ee15c75`; PR #49 và #53 được review 12/11 |
| Chưa tốt | Tại lượt B review `ff9bb73` ngày 12/11, #53 chưa có payment/cancel/expiry; ghi nhận board chưa cập nhật thuộc mốc đó. Các phần này đã được A tích hợp/kiểm sau đó; route V1/V2 đã thống nhất tại `4e1d3ce`. Cần cập nhật hồ sơ kịp source |
| Việc cải thiện | Giữ từng kết quả theo SHA/người chạy; khi bổ sung QA của B/E phải ghi lượt thực tế. Workflow không còn là phần chờ code; chốt review/hồ sơ phát hành, gói cuối và ghi Review/Retro theo sự việc thật |

## 3. Backlog thật (ứng viên đã biết tại 06/11/2026)

Danh sách dưới chỉ gồm việc **đã được phát hiện** khi rà soát gói thiết kế Sprint 3 v1.3, Assignment 2 v0.6
và main `a1a0e4a`. Mỗi dòng cần PO/nhóm xác nhận trước khi đưa vào Sprint sau.

| ID | Mục | Nguồn | Gợi ý owner | Ưu tiên (PO điền) |
|---|---|---|---|---|
| BL-01 | main chưa có workflow CI (lint/typecheck/test/build); Assignment 2 Task 4 cần CI chặn merge | Rà soát main `a1a0e4a` | B (A2-REPO-CI) | |
| BL-02 | ~~Đổi `frontend/backend` → `apps/web`, `apps/api`~~ Đã làm bằng PR #30, merge 07/11/2026. Còn lại: nhánh Sprint 3 của từng lead cập nhật đường dẫn | KE_HOACH_GIAO_NHOM_A2, PR #30 | B, A | Xong |
| BL-03 | Thiếu backend integration harness (PostgreSQL thật, hai connection) cho test cạnh tranh/rollback | TEST_MATRIX mục 3 | D, E | |
| BL-04 | Xác minh giờ chốt nộp chính thức trên LMS | TEAM_PLAN mục 4 | PO | |
| BL-05 | Trình đọc màn hình thật và Safari/Firefox chưa kiểm tra cho UI dùng chung và UI đơn hàng | `UI_SHARED_COMPONENTS.md`, `SPRINT3_B_UI.md` | B | |
| BL-06 | Nút Thanh toán/Hủy trên trang chi tiết đơn (điểm gắn `renderActions`) và điều hướng `?placed=1` sau tạo đơn do S3-A-02 | `SPRINT3_B_UI.md` | A | |
| BL-07 | Cập nhật board Sprint 2 (S2-03 Done) và hồ sơ Review/Retro Sprint 2 khớp `SPRINT2_CLOSEOUT.md` | Nhắc từ trao đổi nhóm | B | |
| BL-08 | Ghi nhận tại `ff9bb73`: thiếu payment/cancel/expiry. Đã có workflow `88f5f35` và bằng chứng A; #53 đã merge `6f38fcb`. Không còn backlog thiếu hiện thực; giữ phần chốt hồ sơ/phát hành riêng | Review #53 ngày 12/11; cập nhật 13/11 theo hồ sơ A và approval `f3f0ef7` | A tích hợp phần C/D/E; reviewer nhóm | Không còn chờ code |
| BL-09 | Giới hạn môi trường B: API 50/54 tại `ff9bb73`, 89/94 tại `f3f0ef7`; backend build/typecheck/PG chưa tự chạy. `pretest` sinh Prisma Client đã có từ `f3f0ef7`; lượt kiểm bổ sung và CI ghi riêng khi thực hiện | Review #53 tại từng SHA, không thay số liệu cũ | B, E | Theo phạm vi kiểm bổ sung |
