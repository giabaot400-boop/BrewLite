# BrewLite — Kế hoạch giao nhóm Assignment 2

**Cập nhật 10/11/2026 · Giữ lịch và lead đề xuất ban đầu; chưa mặc định capacity cam kết.**

Hạn cả A1/A2 là **15/11/2026 theo PO cung cấp**; PO kiểm tra giờ LMS, mục tiêu sẵn sàng nộp ngày 14/11. Dùng Sprint 3 cho A1 và gói A2 này cho Task 1–2. Cùng một sản phẩm/repo: kế thừa menu/auth/giỏ/đơn, checkout S3; A2 bổ sung đúng yêu cầu, kiến trúc, PWA, CI/CD, production và bằng chứng.

## 1. Trạng thái và việc tiếp theo

Task 1–2 gốc đã merge qua PR #29; hiệu đính Task 1 ở PR #42 và lượt đồng bộ Task 2/matrix tiếp tục được review riêng. PR #30 đã chuyển source sang `apps/web` và `apps/api`; PR #31 đã bổ sung phần kiến trúc frontend/BFF/PWA của A; PR #33 đã triển khai PWA với [kết quả local và giới hạn](PWA.md). Chưa suy ra hoàn tất toàn bộ Task 3–5 từ các PR này.

C/D/E tiếp tục tích hợp S3, từng lead cung cấp PR/SHA và evidence phần mình. B giữ board/checklist và CI; D chốt kiến trúc tổng thể/ADR; E phối hợp deployment; C chuẩn bị health/log/secrets; A đối chiếu PWA trên bản tích hợp và môi trường triển khai. Không đợi A1 hoàn tất mới chuẩn bị A2.

## 2. Một lead cho mỗi nhóm đầu ra

| Mã | Lead | Reviewer | Đầu ra cụ thể | Đầu vào |
|---|---|---|---|---|
| A2-REQ | A | B | Task 1.1–1.3/SRS/master và review/commit | Gói và phản hồi lead nghiệp vụ |
| A2-UML | B | D | Task 2 activity/sequence/class, source/SVG khớp | Baseline Task 1 |
| A2-ARCH | D | E | Task 3.1 layered/module, migration/mock, trade-off và ADR | Task 1–2; A góp BFF/PWA, C góp security |
| A2-DEPLOY-DESIGN | E | C | Task 3.2 deployment theo nền tảng thật, ranh giới local/CI/prod | Tài nguyên/tài khoản có thể dùng, kiến trúc |
| A2-REPO-CI | B | E | Task 4 layout/backlog/DoD, CI PR install→lint→unit→build, chặn merge khi lỗi, log success/failure | Quyết định layout/kiến trúc, repo hiện hành |
| A2-MENU-PWA | A | B | Menu/API/seed kế thừa có test, mobile/PWA/manifest/offline boundary | Catalog và browser/version kiểm chứng |
| A2-HEALTH-SECURITY | C | E | Health endpoint/URL, cấu hình/log không secret, quyền và hồi quy logout A9 | Nền S2 a1a0e4a, deployment contract |
| A2-CHECKOUT-TEST | D | C | Integration tạo đơn/payment, E2E menu→xác nhận, retry/race/rollback | S3 C/D/E và UI A/B; từng lead tự test phần mình |
| A2-CD-PRODUCTION | E | B | Image tag/registry nếu cần, deploy bằng CI secret, migration, smoke/health/rollback, HTTPS/DB private | Cổng Task 4, build/health và hạ tầng |
| A2-HANDOVER | B | A | Traceability đủ, release/tag/notes, README/video/URL, Review/Retro và bộ nộp | Evidence các lead, người ngoài nhóm chạy theo README |

Đây là nhóm đầu ra A2, không phải UC/FR mới. B gom tài liệu/CI/QA để A không tự kiểm kê mọi tệp. E và C phối hợp vận hành; D tập trung nghiệp vụ. Lead xác nhận nhận việc hoặc báo blocker trên board/PR; chưa nhận thì TODO. Đổi lead cần ghi bàn giao, mỗi mục vẫn một lead. Chưa cộng estimate A1+A2 thành capacity khi chưa trừ phần tái sử dụng.

## 3. Lịch mục tiêu và cổng nghiệm thu

| Mốc (giờ Việt Nam) | Mục tiêu | Điều kiện ghi hoàn thành |
|---|---|---|
| 05/11 | A đưa Task 1 lên repo/review, sau đó B đưa Task 2 khớp baseline | G1 đủ Task 1.1–1.3/lịch sử/review; G2 đủ ba loại UML source/SVG |
| 06/11 | Rà soát tài liệu S3/A2; đối chiếu tình trạng Task 1–3 thực tế | Có tệp cập nhật; trạng thái repo/review/capacity cần lead xác nhận |
| 06/11 | Task 3.1/3.2: kiến trúc/ADR, layout và nền tảng production | G3 có trên repo, phản ánh hạ tầng thật, truy vết module/code |
| 07–08/11 | Task 4: MVP menu kế thừa, quản lý docs/layout/backlog/DoD và CI | G4 lint/test/build lỗi chặn merge; evidence CI success/failure và test MVP |
| 09–12/11 | Task 5: S3 tích hợp, PWA, integration/E2E, Compose, health/CD/HTTPS | G5 URL hoạt động, test/traceability/release/README/smoke/rollback |
| 13–14/11 | Sửa lỗi, máy khác chạy, video, Review/Retro và đóng gói A1/A2 | Không thêm chức năng ngoài phạm vi; review bản sẽ nộp |
| 15/11 | Nộp theo giờ LMS | A kiểm link, quyền truy cập và tệp đã nộp |

Đề yêu cầu **Task 1→2→3→4→5 nghiệm thu theo thứ tự**. Có thể chuẩn bị việc độc lập sớm, nhưng task sau chỉ nghiệm thu khi đủ tạo phẩm task trước trên repo. Code cũ được ghi kế thừa A1 bằng SHA/review/evidence tương ứng; không tạo lịch sử ngược để giả bắt đầu lại. Hai Sprint A2 (Task 4/5) là hai mốc đánh giá riêng, không đổi tên ba Sprint A1 để thay chúng.

Nếu 06/11 chưa có phương án production dùng được hoặc 08/11 chưa có CI/MVP đầu tiên, B ghi BLOCKED/owner/mốc mới ngay ngày đó; A điều chỉnh ưu tiên. Không chờ 14/11 hoặc bỏ PWA/health/production rồi ghi hoàn tất.

## 4. Quyết định còn cần đóng

| Việc | Lead | Mốc | Cách xử lý |
|---|---|---|---|
| Giờ LMS | A | 05/11 | Ghi giờ/link thông báo; hiện chưa biết giờ, không đoán 23:59 |
| Browser/version PWA, môi trường/phép đo mẫu | A, C góp API/auth | 05/11 | Chọn browser hỗ trợ đang dùng, ghi version/máy/viewport trong SRS O-01/O-02 |
| Nền tảng/tài khoản/chi phí/quyền deploy | E | 06/11 | Xác nhận tài nguyên thật, chưa tự mua; deployment diagram theo phương án đó |
| Layout source | B, A hỗ trợ chuyển layout | Đã merge PR #30 | Source hiện ở `apps/web` và `apps/api`; hướng dẫn chuyển cấu hình local ở README gốc. Khi tích hợp CI/Docker, dùng các đường dẫn mới. Việc đổi layout chưa tự nghiệm thu Task 4 |
| Demo/legacy/storage | D, A/C/E đối chiếu phần mình | Trước writer S3 | Dùng S3 /contract A2; chỉ mở lại khi có mismatch cụ thể với code |

## 5. Theo dõi và DONE

Mỗi ngày từng lead cập nhật ba dòng: đã làm + PR/SHA/log; tiếp theo + ngày giao; blocked bởi ai/đầu vào nào. Review bằng PR nhỏ, không cần chờ cả nhóm có mặt để bắt đầu. Review/Retro ghi phản hồi/sự kiện thật, tuân hướng dẫn lớp, không ghi đã họp khi chưa có.

DONE cần artifact đúng phiên bản, reviewer phản hồi, kiểm tra phù hợp và evidence. [Ma trận truy vết](../traceability-matrix.md) đã có mapping yêu cầu/thiết kế/API mục tiêu; code/test chưa xác minh ghi CHỜ. Đường găng là S3 tích hợp, CI/CD và production; tài liệu đồng bộ không tự hoàn thành Task 3–5 hoặc bảo đảm kịp hạn khi chưa có capacity thật.

## Phạm vi use case trọng tâm

Task 1.3 chọn duy nhất UC-09 Thanh toán không tiền mặt; UC-08 tạo đầu vào, hủy/expiry là ngữ cảnh hỗ trợ. Hình payment là sequence chính Task 2.2, activity vẫn end-to-end. Giữ nguyên lead/lịch mục tiêu và toàn bộ contract S3; chưa xác nhận nhận việc hoặc code/test đạt.

## Quan hệ A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.

## Cách dùng các mốc đã qua

Các mốc 05/11 và đầu ra dự kiến 06/11 ở bảng trên là kế hoạch, không phải kết quả đã hoàn thành. Lead ghi tình trạng thực tế bằng PR/SHA/log hoặc BLOCKED và mốc điều chỉnh trên board. Giờ LMS và capacity chưa xác nhận vẫn để mở; không tự ghi đã nhận việc hoặc đã đáp ứng lịch.
