# BrewLite Sprint 3 gói triển khai rút gọn

Cập nhật ngày 07/11/2026. Thiết kế triển khai Task 8–10 của Assignment 1 trên nền Sprint 2 tại a1a0e4a. Bộ tài liệu xác định phạm vi, contract, phân công và kiểm thử dự kiến; chưa xác nhận code hoặc AC Sprint 3 đã đạt.

## Đọc và nhận việc

1. [Thiết kế và phạm vi](DESIGN.md) mô tả luồng, quyết định nghiệp vụ, phân công, lịch và 27 AC. Bản Word trong gói bàn giao dùng để đọc/gửi nhóm; repo quản lý bản Markdown và nguồn sơ đồ.
2. `docs/sprint3/TEAM_PLAN.md` có 12 ticket A–E, đầu vào, reviewer và checklist bằng chứng.
3. `docs/sprint3/CONTRACTS.md` có năm API, DTO/response/error, BFF, hash/storage, schema/transaction, demo và usecase09…13.
4. `docs/sprint3/TEST_MATRIX.md` có fixture/thao tác/assertion cho 27 AC và ba test (a)(b)(c).
5. `docs/diagrams/sprint3` có năm nguồn/chín SVG cùng nội dung thiết kế; hai ERD là một mô hình 13 model.
6. [Rà soát phạm vi](REVIEW.md) giữ kết quả đối chiếu và lịch sử thay đổi thiết kế.

Bảng [user story và công việc hỗ trợ](DESIGN.md#11-user-story) trong thiết kế
được bổ sung ngày 07/11/2026: sáu story người dùng và ba nhóm công việc hỗ trợ,
nối đủ 27 AC với 12 ticket hiện có. Bảng phục vụ backlog và tra cứu phạm vi;
lead/reviewer, contract và trạng thái kiểm thử vẫn theo các tài liệu nêu trên.
Khi xuất lại bản Word bàn giao, đồng bộ hai mục này từ `DESIGN.md`.

## Luồng khách hàng

Giỏ/mã và tổng dự kiến → Tạo và xem đơn → POST /orders, backend tính/kiểm tra tiền/mã và giữ kho Product → GET Order hiển thị tổng chính thức → khách chọn Ví/Thẻ và xác nhận → POST /payments → current Order/xác nhận/lịch sử. Không tự thanh toán ngay sau create hoặc login.

Giữ request v2/expectedTotal/hash và pending v1 nguyên bản; UI preview theo cấu hình DEMO10 không thay kết quả backend. Nếu payment mất phản hồi, replay chính key/body đã lưu rồi đọc Order hiện tại. latestPayment là lần gần nhất, không dùng để đoán attempt của key chưa biết. Tồn kho chỉ Product, reservation chỉ Product; không còn kho Topping/XOR/partial index Topping.

## Phân công và mốc

A làm giỏ/storage/BFF/checkout/payment/recovery. B làm shared UI/xác nhận/chi tiết/lịch sử và board/evidence. C làm read API với latestPayment, pricing/promo/points. D làm workflow create/payment/cancel/expiry và tests. E làm schema/kho Product/migration/Compose/README. Mỗi ticket một lead và reviewer, từng lead tự test.

Giữ 13 model, 14 mã UC, 27 AC. Hold 15 phút/expiry và hủy PAID trước PREPARING kèm bù trừ vẫn làm. Ngoài phạm vi: tiền thật, nguyên liệu/công thức, admin mới; hoãn pagination/polling/badge đơn chờ. Mốc 04–11/11 làm/test/đóngA1 dự kiến;12–13/11 buffer tích hợp A1/A2; A2 được chuẩn bị song song theo kế hoạch riêng;14/11 freeze;15/11 nộp theo giờ LMS. Kế hoạch 50–70h là estimate chưa capacity/buffer, không là tiến độ đã đạt.

Tất cả 27 AC CHƯA CHẠY. Nền hiện hành đã đối chiếu là main `a1a0e4ae92de681deac538685e24407b3190866b` sau merge PR #24/#26/#28/#27; kế thừa hiệu đính logout A9, bcrypt native cost12 và invariant Order/ledger trước commit. Ghi chú snapshot cũ ở các bản trước chỉ là lịch sử. Backend hỗ trợ trước frontend; schema S3 khác nếu đã chạy phải kiểm kê, không tự drop dữ liệu. Không chứa code ứng dụng, helper, source snapshot, ảnh/PDF QA hoặc secret. Giữ hồ sơ Sprint 1–2; A2 được chuẩn bị song song theo kế hoạch riêng.

## Đồng bộ sau khi chốt Sprint 2

Giữ nguyên thiết kế nghiệp vụ, 13 model, 14 UC, 27 AC, năm API và chín hình. Các thay đổi lần này gồm mốc nền/nhận bàn giao, kế thừa logout A9, bảo toàn P07/assert và contract lỗi v1, Compose PostgreSQL 17. Bốn nhóm sửa được ghi trong [REVIEW.md](REVIEW.md). Không mở thêm tính năng hoặc sửa hồ sơ S1/S2.

Bộ thiết kế cho phạm vi Assignment 1 đã chọn dùng các hồ sơ Sprint 1–2 lịch sử cùng bản Sprint 3 hiện hành này; báo cáo tổng hợp dùng thiết kế hiện hành và ghi delta. Chốt thiết kế không đồng nghĩa code/test/demo/DoD Assignment 1 đã hoàn thành. Gói A2 được đồng bộ cùng đợt; Task 3–5 của A2 vẫn có đầu ra và cổng nghiệm thu riêng.

## Phối hợp A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.

Các ngày 04–05/11 là mốc mục tiêu trong kế hoạch cũ, không phải xác nhận đã hoàn thành. Tại 06/11, lead cập nhật kết quả/PR/SHA hoặc blocker thực tế trên board; gói này không có đủ dữ liệu để tự ghi DONE hay đặt lại capacity.

## Ghi chú thiết kế

Xem [changelog](CHANGELOG.md). Giữ 13 model/14 UC/27 AC; làm rõ FR-13 và D16, công thức/canonical, kế hoạch A1/A2. Tất cả AC vẫn CHƯA CHẠY.
