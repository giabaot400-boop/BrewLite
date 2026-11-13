# S3-B-02: Sprint 3 Review, Retrospective và backlog (khung điền từ sự việc thật)

## Ghi nhận thực tế trong đợt tích hợp 12/11/2026

Phần này ghi từ source, kết quả A cung cấp và quá trình kiểm tra; chưa phải biên bản một buổi Review/Retrospective chung. Chưa có xác nhận demo với giảng viên hoặc feedback khách hàng. Source ứng dụng đã kiểm: 3959f40; [báo cáo và giới hạn](A1_ACCEPTANCE_REVIEW.md).

| Nội dung | Sự việc và bằng chứng |
|---|---|
| Increment đã có | Payment, hủy/refund/điểm, expiry/startup, CLI và checkout v2 đã tích hợp; unit/PG/HTTP/browser và Compose có kết quả thật |
| Demo kỹ thuật A đã chạy | Đăng nhập/cart/PENDING/payment/recovery/refund/history/mobile; FAILED/retry qua cấu hình backend; persistence; không đồng nhất lượt script với một buổi nhóm đã họp |
| Phát hiện và sửa | Profile có giỏ v1 báo không hỗ trợ khi bật provider v2; sửa 3959f40 gọi migration trước controller. Giữ FAIL trước sửa và PASS sau sửa riêng |
| Kiểm chứng bổ sung | A→B→A giữ recovery; hai tab/cookie; late logout giữ B; 401 thật; expired/reorder; newer cart; legacy digest/replay/read-only; Windows 9/9 nhóm |
| Điều làm tốt để giữ | Tích hợp từng thay đổi, kiểm bằng chứng theo SHA; fixture riêng và cleanup; kiểm mất response sau commit, concurrency và rollback thay vì chỉ demo happy path |
| Điều cần cải thiện | Mô tả PR/bảng trạng thái bị chậm so với source; các helper có sẵn nhưng bước kích hoạt chưa nối đầy đủ; cần thêm ca profile cũ trước bật rollout |

### Việc tiếp theo và backlog phát hiện từ kết quả thật

| ID | Việc | Owner thực hiện/đề xuất | Điều kiện hoàn tất |
|---|---|---|---|
| A1-CLOSE-01 | Lưu QA cuối, cập nhật mô tả PR #53 và chốt review diff mới | A; reviewer nhóm xác nhận trên PR | SHA/evidence hiện hành; review có tên/commit, không dùng approval ff9bb73 thay bản workflow |
| A1-CLOSE-02 | Hoàn thiện gói source/README/demo và nội dung trình bày Review/Retro | A điều phối | File/link chạy được; ghi đúng sự kiện/người tham gia/feedback khi thực sự có |
| A1-CLOSE-03 | Xác minh giờ nộp LMS | A/PO | Theo thông báo chính thức, không suy giờ từ kế hoạch cũ |
| BL-03 cập nhật | Backend integration harness đã có tại 88f5f35 và có kết quả PG/concurrency/rollback | A tích hợp, tái sử dụng phần C/D/E | Không tiếp tục ghi là chưa có code; review/phát hành vẫn cần chốt |
| BL-06 cập nhật | Payment/cancel/official total và provider đã nối vào UI; rollout v1→v2 sửa tại 3959f40 | A | Có unit/browser/Windows; không coi là toàn bộ ticket đã được peer approve |
| BL-05 giữ mở | Screen reader thật và Firefox/Safari/Edge | B/A đề xuất cho đợt kiểm tiếp | Có môi trường và kết quả riêng; hiện chỉ ghi Chromium đã kiểm |

Các phần khung và backlog ở dưới là snapshot 06/11, được giữ để truy vết. Không điền ngược ngày họp, người tham gia hoặc feedback chưa xảy ra.


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
