# Sprint 1 — Tổng hợp Review, Retrospective và backlog

Cập nhật ngày 27/10/2026 bằng PR và trao đổi bất đồng bộ. Nhóm chưa có buổi
họp riêng; tài liệu này không ghi đã tổ chức một buổi họp hoặc demo mới.
Nguồn: main `b599076`, checklist 24 AC, báo cáo A/D/E và bản tổng hợp B
ở commit [c96a7eb](https://github.com/giabaot400-boop/BrewLite/commit/c96a7eb3beff44cd4979585ad7a9c8fffdcbc504).
A yêu cầu hoàn thiện hồ sơ và ghi trung lập người chưa có ý kiến.

## 1. Sprint Review qua PR và trao đổi bất đồng bộ

### 1.1 Mục tiêu và kết quả được xem xét

Khách hàng xem menu từ backend, mở chi tiết sản phẩm, chọn size/topping và
xem giá được cập nhật. Increment đã tích hợp tại main `b599076`.
Các lần chạy giữ đúng mốc code ban đầu: tích hợp `5d6e058`/`7df9f61`,
sửa retry `2ed30b3`, backend build `4cbfb28`. Đây là tổng hợp kết quả có sẵn,
không phải đợt chạy mới trên main. Code frontend/backend, package lock và
scripts ở đầu PR #11 (`c96a7eb`) khớp main `b599076`; PR này chỉ sửa tài liệu.

| Luồng đã kiểm tra | Căn cứ và phạm vi |
|---|---|
| Menu | A: API thật, loading, ảnh/tên/giá S, điều hướng; empty bằng response `[]` giả lập, không phải database rỗng |
| Chi tiết và giá | A: mặc định S, size/topping, giá 35/40/45 nghìn; M + Kem 47 nghìn, L + hai topping 57 nghìn; bỏ Kem còn 50 nghìn |
| Lỗi và thử lại | A: Menu phục hồi sau khi backend hoạt động lại; chi tiết phục hồi bằng nút Thử lại sau sửa tại `2ed30b3`, không cần F5 |
| API và database | A/E: migration/seed; A reseed giữ 4/2/2. API 200/raw array, chi tiết và 404 đúng; các lần đo A/D đều dưới 500 ms trong môi trường local |
| Kiểm thử bổ sung | D: 12 nhóm ca, 18 ảnh; giữ giới hạn commit/cấu hình chưa xác định theo báo cáo D |

Nguồn chi tiết: [checklist và 24 AC](SPRINT1_CHECKLIST.md),
[báo cáo D](Testing/MEMBER_D_TEST_RESULTS.md),
[bàn giao và kết quả máy E](SPRINT1_E_DATABASE.md).

### 1.2 Sprint Backlog đối chiếu để chốt hồ sơ

Đây là bảng backlog trong repository. Chưa có bằng chứng một board ngoài
repository đã được cập nhật; không ghi thay là đã cập nhật board đó.

| ID | Phần việc | Lead | Kết quả ghi nhận | Trạng thái chốt |
|---|---|---|---|---|
| S1-01 | Repo, môi trường, README | E | Có cấu trúc, env mẫu, hướng dẫn cài/chạy/build; A/E có kết quả hai ứng dụng build | Đã có kết quả kỹ thuật; PO xem xét ngoại lệ quy trình Git |
| S1-02 | Product, Topping, seed | E | A/E áp dụng migration và seed; A kiểm tra reseed giữ 4/2/2 | Đã kiểm tra trong phạm vi mẫu |
| S1-03 | Product API | C | Hai endpoint hoạt động sau sửa đăng ký ProductsModule; 200/404 và giá đúng theo mẫu | Đã kiểm tra; giữ lịch sử lỗi ban đầu và retest |
| S1-04 | Menu | A | API thật, loading, empty giả lập, lỗi/retry, điều hướng, responsive | Đã kiểm tra trong các ca ghi nhận |
| S1-05 | Chi tiết, tùy chọn, giá | A | API thật, lựa chọn/giá, 404, retry đã sửa PR #10 | Đã kiểm tra; dữ liệu giá sai thử ở component |
| S1-06 | Kiểm thử và tích hợp | D | Báo cáo đã merge; A bổ sung kiểm tra tích hợp, E có kết quả riêng | Đã tổng hợp; giữ giới hạn bằng chứng D |
| S1-07 | Hồ sơ, sơ đồ, Review/Retro | A, B, E | Đã có 24 AC, sơ đồ, tổng hợp Review/Retro và nội dung đồng bộ báo cáo | Hồ sơ chuẩn bị xong; chờ quyết định PO và review/merge PR #11 |

### 1.3 Đối chiếu DoD và ngoại lệ

| Tiêu chí | Kết luận từ bằng chứng |
|---|---|
| Hai ứng dụng chạy/build; có hướng dẫn thiết lập | Có kết quả A/E và README. Chưa xác nhận một lần chạy trọn README cuối từ clone sạch; không ghi là đã thực hiện |
| AC và trạng thái UI | Đã đối chiếu đủ 24 mã; kết quả theo phạm vi ở checklist. Không phát hiện lỗi chức năng đang chặn các luồng đã thử |
| Review và quy ước Git | Có ngoại lệ C từng đẩy trực tiếp main. Các phần tích hợp sau đã qua PR và kiểm tra; không đổi ngoại lệ lịch sử thành “đạt hoàn toàn” |
| Env/secret | Có env mẫu; kiểm tra tracked paths, ignore và lịch sử đường dẫn env không thấy env thật. Không coi đây là kiểm toán mọi secret |
| Quyết định PO | Chờ A xác nhận rõ tại mục 1.5; không suy ra từ sự im lặng của thành viên |

Không thêm yêu cầu mới phải có test tự động, Docker hoặc chụp lại mọi ảnh để
nghiệm thu Sprint 1. Việc có hướng dẫn thiết lập và việc đã chứng minh một lần
clean install trọn vẹn là hai kết quả khác nhau. Hạng mục kiểm tra bổ sung
được theo dõi ở mục 3, không được ghi thành kết quả đã chạy.

### 1.4 Ý kiến tại đợt chốt hồ sơ

| Thành viên | Ý kiến đã ghi nhận | Căn cứ / lưu ý |
|---|---|---|
| A | Đề nghị hoàn thiện hồ sơ Sprint 1; người chưa phản hồi ghi “chưa có ý kiến” | Trao đổi với A ngày 27/10/2026; quyết định PO vẫn cần ghi riêng |
| B | Đã soạn dự thảo Review/Retro và đồng bộ báo cáo | Commit `c96a7eb`; chưa ghi B đã đồng ý với mọi nội dung hiệu đính sau đó |
| C | Chưa có ý kiến bổ sung trong đợt chốt này | Không đồng nghĩa không làm việc hoặc đã đồng ý |
| D | Chưa có ý kiến bổ sung trong đợt chốt này | Báo cáo kiểm thử đã nộp vẫn được ghi nhận |
| E | Chưa có ý kiến bổ sung trong đợt chốt này | Migration, bàn giao và kết quả máy E vẫn được ghi nhận |

Không cần tự viết ý kiến cho C/D/E. Có phản hồi mới thì bổ sung đúng nội dung
và ngày thực tế; không hồi tố thành ý kiến đã có ở thời điểm tổng hợp.

### 1.5 Quyết định của PO

**Trạng thái: chờ A xác nhận; chưa ghi Increment đã được PO chấp nhận.**

Nội dung đề xuất để A quyết định:

> Chấp nhận kết quả chức năng Sprint 1 gồm menu, chi tiết, lựa chọn size/topping,
> giá xem trước, Product API và database trong phạm vi bằng chứng đã ghi nhận.
> Giữ ngoại lệ quy trình Git và giới hạn kiểm thử trong hồ sơ; các việc bổ sung
> tại mục 3 tiếp tục được theo dõi, không ghi là đã hoàn thành.

Nếu A đồng ý, bổ sung nguyên văn quyết định và ngày xác nhận. Nếu A chưa chấp
nhận, ghi rõ chức năng/AC cần sửa. Không ghi “24/24 đạt mọi DoD” vì ngoại lệ
quy trình và giới hạn bằng chứng vẫn tồn tại.

## 2. Retrospective: dữ kiện và bài học được tổng hợp

Đây là bản tổng hợp từ ghi nhận A và dự thảo B; không phải kết luận đồng thuận
của cả năm thành viên. Việc C/D/E chưa gửi ý kiến không ngăn lưu bản tổng hợp này.

| Mặt xem xét | Ghi nhận |
|---|---|
| Điều làm được | Luồng UI–API–PostgreSQL đã tích hợp; lỗi retry chi tiết được phát hiện/sửa; có phân biệt fixture/API, người chạy và mốc code |
| Khó khăn | Code từng lên thẳng main; ProductsModule chưa đăng ký gây 404; database chưa sẵn sàng gây lỗi; một số ảnh thiếu commit/nguồn dữ liệu; PostgreSQL khác phiên bản |
| Bài học | Kiểm tra một luồng tích hợp sớm; ghi commit/cấu hình ngay khi chạy; kiểm tra trạng thái phục hồi sau lỗi; giữ lỗi ban đầu và kết quả retest |

Các ghi nhận trên mô tả công việc và sự kiện, không suy đoán thái độ hoặc
mức độ nghiêm túc. Không tự gán mức trừ điểm cho thành viên.

## 3. Backlog bổ sung và đề xuất cải thiện

| ID | Việc tiếp theo | Người dự kiến phối hợp | Trạng thái / thời điểm |
|---|---|---|---|
| F01 | Ghi quyết định nghiệm thu của A; review/merge hồ sơ PR #11 | A / người review | Chờ xác nhận và review; không tự merge main |
| F02 | Xác nhận trọn README cuối khi thành viên tiếp theo thiết lập máy; ghi phiên bản và kết quả | E + người thiết lập | Theo dõi ở lần thiết lập tiếp theo; chưa có ngày cam kết |
| F03 | Ghi commit đã kiểm thử, nguồn fixture/API, DEMO_MODE và kết quả retest trong PR/báo cáo từ Sprint 2 | D cùng người nộp PR | Đề xuất áp dụng từ lần bàn giao tiếp theo; chưa ghi cả nhóm đã đồng ý |
| F04 | Rà quy tắc bảo vệ main và review trước merge | Chủ repo, B | Đề xuất; chưa kiểm tra cấu hình bảo vệ hiện tại, chưa bật thay |

Test tự động, Docker Compose, đổi tên ảnh và checkpoint có thể được nhóm cân
nhắc theo kế hoạch Sprint sau; không đặt thành điều kiện mới phải làm ngay
để chốt chức năng Sprint 1. Nếu dùng board riêng, B có thể đồng bộ bảng mục 1.2
và F01–F04; hiện chỉ xác nhận backlog trong tài liệu này đã được cập nhật.
