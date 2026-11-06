# BrewLite Sprint 3 kế hoạch bàn giao A đến E

Cập nhật ngày 06/11/2026. PO cho phép dùng phương án này làm cơ sở thực hiện, chưa thay lời xác nhận nhận việc của từng bạn. Không cần họp chung để bắt đầu. Mỗi lead nhận ticket của mình bằng một dòng trên board/PR; nếu vướng thì nêu đầu vào thiếu và người cung cấp, không để trống trạng thái.

## 1 Gói công việc có đầu ra cụ thể

| Ticket | Lead | Đầu ra để review | Nhận từ | Reviewer | Ước lượng giờ tập trung |
|---|---|---|---|---|---|
| S3-A-01 | A | Cart envelope 2/migration/writer guard; binding giữ tới PAID, recovery đúng owner/revision | Shape nền và CONTRACTS | B | 5–7 |
| S3-A-02 | A | BFF payment/cancel theo captured token owner guard; UI preview/tạo đơn/xem tổng/payment/retry | D DTO, C read API, reuse BFF orders | D | 4–6 |
| S3-B-01 | B | Shared money/status/error UI, trang xác nhận/chi tiết/lịch sử, loading/empty/error | C OrderDetail/History; A auth state | A | 5–7 |
| S3-B-02 | B | Board/AC links, regression checklist, demo/Review/Retro/backlog thật | Evidence từng lead | D | 3–4 |
| S3-C-01 | C | priceOrder, DEMO10/policy snapshot và award/reverse points nhận cùng tx | E fields, D interface | D | 5–7 |
| S3-C-02 | C | GET Order/history với latestPayment đúng owner/snapshot/version/no-store; tests quyền/giá/điểm | D workflow, E schema | E | 3–4 |
| S3-D-01 | D | Canonical v1/v2, create ledger/reserve integration, final mock payment/replay/state | C pricing, E StockPlan | E | 6–8 |
| S3-D-02 | D | Cancel/refund atomic, expiry/startup, demo advance script; transaction retry classifier | E stock, C points | C | 6–8 |
| S3-D-03 | D | Test a/b mapping và failure injection, tổng hợp evidence không viết thay mọi lead | Evidence A/B/C/E | B | 3–4 |
| S3-E-01 | E | Migration mới 13 model/constraints, legacy fixture, seed demo có guard | CONTRACTS, S2 schema exact | D | 4–6 |
| S3-E-02 | E | aggregate/precheck/reserve/consume/release/return CAS, concurrency tests ly cuối | D tx, C item snapshot | D | 3–5 |
| S3-E-03 | E | Compose ba services, deploy/seed README, máy khác chạy, evidence migration | Build A/B/C/D | C | 3–4 |

Tổng sơ bộ: A 9–13h, B 8–11h, C 8–11h, D 15–20h, E 10–15h; cả nhóm 50–70h tập trung, chưa có buffer lỗi nền. Đây là estimate thiết kế để phân tải, không là capacity đã cam kết hoặc số giờ đã làm. D/E là đường găng. B giữ tài liệu/QA UI để A không phải gánh cả điều phối; C sở hữu read API và toàn bộ pricing/points, E sở hữu tests kho/migration, A tự test cart/BFF. D chỉ tổng hợp và viết test workflow, không ôm mọi backend/QA. Nếu capacity không đủ, A/B đổi owner ticket trên board kèm bàn giao; một ticket vẫn chỉ một lead.

Ước lượng dựa trên phạm vi không có hai endpoint riêng và kho Topping; đây vẫn chỉ là estimate, không hứa tiết kiệm đúng số giờ. Giữ hold15phút/expiry và các ca rollback/quyền/recovery.

## 2 Phụ thuộc cần bằng chứng

| Mã | Điều kiện trước tích hợp | Người cung cấp | Người nhận và bằng chứng |
|---|---|---|---|
| DEP-01 | Nhận auth/session binding và hiệu đính logout đã chốt; giữ phiên mới kể cả cùng owner | A/C | A/D nhận main a1a0e4a, hồ sơ S2/A9 và PO acceptance; hồi quy phần S3 chạm tới, không mở lại lỗi S2 đã sửa |
| DEP-02 | Create v1/ledger/replay/P07 invariant và lỗi P01…P09 giữ contract | D | D/E nhận PR28/main a1a0e4a; giữ assert trước commit, 409 bận khóa, 413 và details giá; hồi quy khi thêm kho/v2 |
| DEP-03 | Storage v1/Web Lock/revision/pending và multi-tab owner baseline | A | A/B; fixtures/các đường writer fail closed |
| DEP-04 | Migration S2 đã có trên target sạch, seed exact catalog/topping links | E | C/D; Prisma validate + rowcounts + baseline |
| DEP-05 | DTO/error/5 API và helper tx interface đóng băng theo CONTRACTS | C/D/E | A/B; spec fixture và reviewer đọc |
| DEP-06 | Backend v1/v2/payment/cancel/read hỗ trợ trước FE bật envelope2 | D/C/E | A; integration responses thực, không chỉ mock UI |
| DEP-07 | Demo DB/profile riêng và testDB riêng, Compose/README chạy máy khác | E | B/D; command/log môi trường và SHA |

Nền nhận bàn giao là main `a1a0e4ae92de681deac538685e24407b3190866b` sau merge #24/#26/#28/#27. Hồ sơ SPRINT2_CLOSEOUT.md ghi PO chấp nhận phạm vi đã kiểm tra và các giới hạn bằng chứng. Auth/logout A9 và invariant Order/ledger đã có sửa/kiểm tra ở S2; DEP-01…04 là nhận nền và hồi quy chịu ảnh hưởng, không yêu cầu làm lại phần đó. DEP-05…07 và mọi AC S3 vẫn cần hiện thực/evidence mới. Không suy rằng mọi biến thể S2 đã PASS. Lượt cập nhật tài liệu này không merge PR hoặc chạy test ứng dụng.

## 3 Việc làm ngay từ nền đã chốt

A/B dựng UI với fixture đúng contract, giữ cờ chưa gửi payload S3 vào backend cũ. C viết pure pricing/promo/points interface và tests biên. E viết migration/stock functions trên DB test riêng. D hoàn thành canonical/workflow unit và integration harness nhận helper. Các nhánh này review độc lập; không lấy việc UI với fixture làm bằng chứng E2E. Khi DEP-01…06 đạt, tích hợp theo thứ tự schema → C/E helpers → D workflow/read → BFF/UI → Compose/demo.

## 4 Lịch theo hạn nộp

04/11 nhận nền S2 đã chốt, bắt đầu phần độc lập và ghi phạm vi hồi quy S3. 05/11 đủ schema/interface/fixture. 06–07/11 hoàn thiện workflow và UI contract. 08/11 có E2E đầu tiên. 09–10/11 chạy a/b/c và ca an toàn. 11/11 đóng gói A1 dự kiến, Review/Retro thật. 12–13/11 dự phòng tích hợp A1/A2 và hoàn thiện bàn giao; A2 được chuẩn bị song song từ các mốc trước. 14/11 freeze bộ nộp. 15/11 nộp theo giờ LMS (PO kiểm tra giờ chính thức). Tất cả theo giờ Việt Nam.

Nếu cuối 05/11 chưa đủ nền hoặc 08/11 chưa E2E, A/B ghi rủi ro với ticket/owner/ngày mới trong ngày đó; cập nhật capacity và giảm việc ngoài phạm vi. Không kéo khung '10 ngày sau khi đủ nền' qua hạn và không tự bỏ Task10 để đạt ngày. Hạn này được PO cung cấp trong trao đổi; giờ LMS chưa xác minh, không đoán giờ chót.

## 5 Review và theo dõi không cần chờ họp

Mỗi lead cập nhật mỗi ngày ba dòng: đã làm + PR/SHA/log; tiếp theo + thời điểm; blocked bởi ticket/người/đầu vào. B tổng hợp board, A quyết định thứ tự ưu tiên theo phạm vi đã chọn. Reviewer phản hồi trên PR nhỏ theo hẹn của nhóm, không mặc định im lặng là đồng ý. Có xung đột contract, ghi ví dụ request/response/fixture và phương án sửa; không nhờ cả nhóm họp rồi mới tiếp tục các việc độc lập.

Board: TODO / DOING / BLOCKED / REVIEW / DONE. DONE chỉ khi lead có artifact + tests/evidence, reviewer ghi kết quả; 'đã code' chưa bằng DONE. Burndown dùng remaining hours cập nhật thực từng ngày, giữ lịch sử thay estimate; chưa có số thì để trống, không vẽ đường giảm giả. Review dùng demo/video và góp ý có tên/ngày; Retro ghi điều đã xảy ra, việc cải thiện/owner. Nếu lớp yêu cầu buổi trực tiếp, hình thức bất đồng bộ cần tuân hướng dẫn lớp; không ghi đã họp khi không có.

## 6 Phiếu nhận bàn giao và Definition of Done

Mẫu mỗi ticket: ticket/lead/reviewer; SHA + base SHA; contract/AC chịu ảnh hưởng; migration/env cần; command test; expected/actual; log/ảnh/video; limitation còn lại; kết quả reviewer. B ghi liên kết từng AC, không chuyển trạng thái hàng loạt dựa trên demo một đường success.

Release chỉ khi build/typecheck/lint/tests phù hợp, a/b/c và 27 AC có evidence, không lỗi quyền/kho/nhân giao dịch, Compose chạy máy khác, README có env/migrate/seed/demo, PR review xong và Review/Retro/backlog thật. Các mục chưa đạt ghi rõ trạng thái và ảnh hưởng. A2 được đồng bộ cùng đợt; tiếp tục Task 1→5 theo cổng nghiệm thu riêng, không chờ A1 xong mới chuẩn bị.

## Phối hợp A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.

Các ngày 04–05/11 là mốc mục tiêu trong kế hoạch cũ, không phải xác nhận đã hoàn thành. Tại 06/11, lead cập nhật kết quả/PR/SHA hoặc blocker thực tế trên board; gói này không có đủ dữ liệu để tự ghi DONE hay đặt lại capacity.
