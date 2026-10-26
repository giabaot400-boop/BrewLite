# Tiến độ Sprint 1

Mốc main đã tích hợp để chốt hồ sơ: b599076 (26/10/2026).
Product API và migration PostgreSQL đã tích hợp qua PR #6 và #7.
PR #10 sửa phục hồi trang chi tiết, PR #9 cập nhật tài liệu và
PR #8 bổ sung báo cáo kiểm thử của D đều đã merge vào main.
Mốc kiểm thử tích hợp ban đầu là 7df9f61; phần sửa retry được
kiểm thử riêng tại 2ed30b3. Không coi b599076 là commit đã chạy
trong các ảnh kiểm thử cũ.

Bản tích hợp kiểm thử trên máy A: 5d6e058,
ghép main da5c861 với commit sửa API d82837b.
Nội dung code của bản merge 7df9f61 khớp bản ghép đã kiểm tra.

Các kết quả dưới đây phân biệt kiểm thử bằng fixture và bằng API thật.
Mục được đánh dấu hoàn thành phản ánh kết quả đã ghi nhận;
bằng chứng và đối chiếu đủ 24 AC/DoD được hoàn thiện trước nghiệm thu.

Sprint 1 chưa được xác nhận nghiệm thu hoàn tất.

## Đã hoàn thành với dữ liệu mẫu

- [x] A triển khai Menu và điều hướng đến trang chi tiết.
- [x] A triển khai chi tiết sản phẩm, mặc định size S,
      chọn một size, chọn/bỏ nhiều topping và cập nhật giá xem trước.
- [x] A bổ sung kiểm tra dữ liệu giá không hợp lệ.
- [x] A chạy thử đổi size, chọn/bỏ topping và đối chiếu tổng giá.
- [x] A chạy thử giá cơ bản âm và NaN.
- [x] Frontend chạy thành công typecheck, lint và build trên máy A.
- [x] Code được push và tích hợp vào main qua PR #1.
- [x] A kiểm tra TC-09: không có topping vẫn chọn size và tính giá đúng.
- [x] A kiểm tra bảo vệ giá ở component với giá âm, NaN,
      thiếu giá và giá dạng chuỗi qua các đợt kiểm tra.
- [x] A kiểm tra ảnh lỗi chuyển sang ảnh thay thế ở trang chi tiết.
- [x] A kiểm tra Menu loading, empty, error và thử lại,
      gồm phục hồi thành công bằng dữ liệu giả lập.
- [x] B triển khai layout và component dùng chung;
      A review và kiểm tra trên máy A tại commit 914e4ab.
- [x] Kiểm tra responsive ở 390/768/1280 px, bàn phím,
      focus, skip-link và giao diện 404 trên Chrome.

## Kết quả tích hợp API và PostgreSQL đã ghi nhận trên máy A

- [x] Áp dụng migration của E thành công trên PostgreSQL 17.
- [x] Seed tạo đúng 4 sản phẩm, 2 topping và 2 liên kết.
- [x] Đối chiếu giá sản phẩm, giá topping và liên kết đúng dữ liệu mẫu.
- [x] Chạy lại seed không tạo thêm dòng trùng; số lượng vẫn là 4 / 2 / 2.
- [x] Backend khởi động thành công với ProductsModule và PrismaModule.
- [x] GET /products trả HTTP 200, raw JSON array và đúng 4 sản phẩm.
- [x] GET /products/coffee-milk trả HTTP 200,
      đúng mô tả, giá cơ bản, sizes và toppings.
- [x] GET /products/khong-ton-tai trả HTTP 404,
      thông báo Product not found.
- [x] Chạy tích hợp với DEMO_MODE=false.
- [x] Đo mỗi API danh sách và chi tiết 3 lần bằng curl:
      cả 6 lần trả HTTP 200 và dưới 500 ms.
      Danh sách: khoảng 4,0–54,4 ms; chi tiết: khoảng 5,7–12,0 ms.
- [x] Frontend dùng NEXT_PUBLIC_PRODUCTS_SOURCE=api,
      menu hiển thị sản phẩm và điều hướng đến trang chi tiết.
- [x] Xác nhận request menu tới http://localhost:3001/products;
      thời gian Total trên trình duyệt được A ghi nhận là 18,05 ms.
- [x] Đối chiếu giá cà phê sữa:
      S = 35.000đ; M = 40.000đ; L = 45.000đ;
      M + Kem = 47.000đ;
      L + Kem + Trân châu = 57.000đ;
      L + Trân châu, bỏ Kem = 50.000đ.
- [x] Dừng backend và tải lại menu: frontend hiển thị trạng thái lỗi.
- [x] Khởi động lại backend, bấm Thử lại mà không reload:
      danh sách 4 sản phẩm được khôi phục.
- [x] Truy cập /products/khong-ton-tai trên frontend:
      hiển thị không tìm thấy và quay về menu được.
- [x] PR #6 và PR #7 đã được review, kiểm tra và merge vào main.

Các kết quả thời gian chỉ mô tả những lần đo local đã thực hiện,
không phải cam kết mọi lần gọi đều có cùng thời gian phản hồi.

## Kiểm tra bổ sung ngày 26/10/2026 trên máy A

- [x] Menu dùng API: hiển thị loading khi mô phỏng mạng chậm,
      sau đó hiển thị đủ 4 sản phẩm.
- [x] Menu hiển thị “Hiện chưa có sản phẩm.” khi phản hồi GET
      /products được ghi đè thành [] bằng Chrome Local Overrides.
      Đây là phản hồi API giả lập, không phải kiểm thử database rỗng.
      Sau khi tắt Overrides, menu hiển thị lại 4 sản phẩm.
- [x] Trang chi tiết hiển thị “Đang tải chi tiết sản phẩm…”
      khi mô phỏng mạng chậm, sau đó hiển thị sản phẩm.
- [x] Dừng backend và reload trang chi tiết:
      hiển thị “Không tải được sản phẩm”; lỗi kết nối ECONNREFUSED.
- [x] Phát hiện lỗi phục hồi: backend đã trả HTTP 200 nhưng
      nút Thử lại không phục hồi trang; F5 phục hồi được.
- [x] Sửa reset() thành retry() tại commit 2ed30b3.
      Kiểm thử lại: khởi động lại backend, bấm Thử lại
      và tải được chi tiết sản phẩm mà không cần F5.
- [x] Frontend typecheck, lint và build thành công
      với phần sửa tại commit 2ed30b3.
- [x] Backend typecheck và build thành công tại commit 4cbfb28
      trên nhánh docs/sprint1-closeout, dùng Prisma 7.10.1.
- [x] Git chỉ theo dõi backend/.env.example
      và frontend/.env.local.example trong nhóm file .env*.
- [x] git check-ignore xác nhận backend/.env
      và frontend/.env.local được .gitignore bỏ qua.
- [x] Kiểm tra lịch sử đường dẫn .env* trên các Git refs
      hiện có chỉ thấy hai file mẫu, không thấy file env thật.

## Hồ sơ đã tích hợp sau review

- [x] PR #10 đã merge; main có phần sửa retry() ở trang chi tiết.
- [x] PR #9 đã merge; README, API contract và tài liệu liên quan đã cập nhật.
- [x] PR #8 đã merge cùng commit hiệu đính 2ad9a0d của A.
      [Báo cáo D](Testing/MEMBER_D_TEST_RESULTS.md) giữ kết quả lần đầu,
      retest, đối chiếu AC và các giới hạn bằng chứng.
- [x] Đã liên kết [18 ảnh do D nộp](Testing/evidence/).
      Kết quả API đo trên máy D khoảng 57,6 ms và 67,0 ms,
      đạt ngưỡng dưới 500 ms trong hai lần đo đã ghi nhận.

Báo cáo D chưa xác định commit chạy trong từng ảnh, DEMO_MODE của
backend và nguồn dữ liệu UI ở một số ca; bước phục hồi retry menu
là xác nhận của D, chưa được A xác minh độc lập trong đợt rà báo cáo.
Không dùng các ảnh đó để suy diễn đủ toàn bộ AC hoặc thay thế kết quả A.
Kết quả A trước đây và kết quả D được giữ riêng theo người thực hiện.

Bằng chứng hiện có khác: [kiểm tra bản khởi động và các đợt bổ sung](KIEM_TRA_BAN_KHOI_DONG.md),
[bàn giao database](SPRINT1_E_DATABASE.md), cùng các log và kết quả
được ghi trong checklist này. Nếu liên kết thêm ảnh/log của A,
sử dụng bằng chứng đã lưu; không yêu cầu chụp lại toàn bộ.

## Đối chiếu 24 AC theo hồ sơ Sprint 1 v1.1

Nguồn tiêu chí: hồ sơ phân tích và thiết kế Sprint 1 v1.1, Mục 4.2–4.5.
Đối chiếu code tại b599076 với các kết quả A đã cung cấp và hồ sơ D đã nộp.
Đây là tổng hợp kết quả có sẵn, không phải đợt chạy kiểm thử mới trên b599076.
Chữ “Đạt” dưới đây chỉ áp dụng trong phạm vi dữ liệu mẫu, môi trường và ca
đã ghi nhận; quyết định chấp nhận Increment thuộc PO.

Nguồn đối chiếu đã có:
- [README](../README.md), [workflow Git](GIT_WORKFLOW.md), package.json
  của hai ứng dụng và các file env mẫu, gitignore trong repository.
- Các kết quả API/PostgreSQL và UI trên máy A trong checklist này;
  mốc tích hợp 5d6e058/7df9f61, phần sửa retry tại 2ed30b3.
- [Các đợt kiểm thử giao diện trước đó](KIEM_TRA_BAN_KHOI_DONG.md):
  fixture, tính giá, giá không hợp lệ, responsive và thao tác bàn phím.
- [Báo cáo D](Testing/MEMBER_D_TEST_RESULTS.md) và
  [ảnh D](Testing/evidence/), với giới hạn commit/nguồn dữ liệu đã nêu.
- Code [đọc và kiểm tra Product API](../frontend/src/features/products/api.ts),
  [menu](../frontend/src/features/products/components/menu.tsx),
  [tùy chọn và giá](../frontend/src/features/products/components/product-options.tsx),
  [trang chi tiết](../frontend/src/app/products/[id]/page.tsx) và
  [Product service](../backend/src/products/products-prisma.service.ts).

| Mã AC | Nội dung đối chiếu | Kết quả và căn cứ hiện có |
|---|---|---|
| TS01-AC-01 | Next.js, Tailwind, TypeScript và NestJS | Đạt. Cấu trúc ứng dụng, dependency và code phù hợp; hai ứng dụng đã chạy trên máy A. |
| TS01-AC-02 | Chạy độc lập và build hai ứng dụng | Đạt trong các đợt đã ghi nhận. A chạy riêng frontend/backend; frontend lint, typecheck, build với phần sửa 2ed30b3; backend typecheck/build tại 4cbfb28. Không ghi là đã chạy lại build ở b599076. |
| TS01-AC-03 | README có cài đặt, chạy, build và cấu trúc thư mục | Đạt về nội dung tài liệu sau PR #9. Việc xác nhận thành viên khác thiết lập theo toàn bộ README vẫn là mục DoD riêng còn mở. |
| TS01-AC-04 | Gitignore, env example và không đưa env thật/secret lên Git | Phù hợp trong phạm vi đã kiểm tra. Có gitignore và hai env mẫu; A kiểm tra tracked files, check-ignore và lịch sử đường dẫn .env trên các refs đã có. Không phát hiện env thật trong phạm vi đó; không coi đây là quét mọi secret trong mọi nội dung. |
| TS01-AC-05 | Thống nhất quy ước branch, commit và review | Có quy ước trong baseline và GIT_WORKFLOW.md; thực hiện chưa đầy đủ trong lịch sử. Đã ghi nhận C đưa code thẳng lên main trước khi tách nhánh. Các PR sau có rà soát, nhưng không kết luận mọi thay đổi trước đó đều đạt DoD review. |
| TS02-AC-01 | GET /products trả 200 và raw array đủ trường | Đạt với dữ liệu mẫu. A kiểm tra API thật trả 4 sản phẩm; ảnh D TC-D02 bổ sung kết quả HTTP 200/raw array. |
| TS02-AC-02 | Chi tiết có mô tả, sizes, toppings và phụ thu | Đạt với coffee-milk. Response API thật trên máy A có mô tả, S/M/L và hai topping; D TC-D07/09/10 bổ sung response và UI trong phạm vi báo cáo D. |
| TS02-AC-03 | ID không tồn tại trả 404 nhất quán | Đạt. A và D ghi nhận HTTP 404, message Product not found. |
| TS02-AC-04 | Giá nguyên không âm, giá cơ bản là size S | Đạt với dữ liệu mẫu đã đối chiếu. A kiểm tra giá/quan hệ SQL và response; S cộng 0, M cộng 5000, L cộng 10000; tiền truyền bằng số nguyên. |
| TS02-AC-05 | API dưới 500 ms với dữ liệu mẫu trong demo | Đạt trong các lần đo local đã ghi nhận. A: sáu request đều 200 và khoảng 4,0–54,4 ms; D: hai lần khoảng 57,6 ms và 67,0 ms. Không cam kết cho tải hoặc môi trường khác. |
| US01-AC-01 | Menu gọi API và có loading | Đạt. A xác nhận nguồn api, request /products và loading khi làm chậm mạng; code Menu khởi tạo loading rồi gọi getProducts. |
| US01-AC-02 | Card có ảnh, tên và giá size S dạng VND | Đạt. UI menu đã kiểm tra; ProductCard dùng dữ liệu sản phẩm và formatPrice, giá API là giá cơ bản S. |
| US01-AC-03 | Danh sách rỗng hiển thị empty | Đạt về hành vi UI. A ghi đè response GET /products thành [] bằng Local Overrides; D có ca fixture rỗng. Không ghi đây là kiểm thử database rỗng. |
| US01-AC-04 | API lỗi có trạng thái lỗi và cách thử lại | Đạt theo kết quả A. Dừng backend gây lỗi menu; khởi động lại rồi bấm Thử lại phục hồi 4 sản phẩm không reload. Ảnh D chỉ bổ sung trạng thái lỗi; không chuyển kết quả A thành kết quả D. |
| US01-AC-05 | Chọn card mở đúng chi tiết theo id | Đạt trong các lượt điều hướng đã ghi nhận. A mở chi tiết từ menu; ProductCard tạo link theo product.id được encode. |
| US01-AC-06 | Không hardcode danh sách và giá trong component | Đạt qua đọc code. Menu nhận dữ liệu từ getProducts, ProductCard nhận props; fixture nằm ở nguồn dữ liệu riêng và đã phân biệt với chế độ api. |
| US02-AC-01 | Chi tiết lấy id từ route, gọi API và có loading | Đạt. Route nhận id và gọi getProduct; có loading.tsx; A đã thấy loading rồi tải được chi tiết khi mô phỏng mạng chậm. |
| US02-AC-02 | Hiển thị và dùng dữ liệu tùy chọn, giá từ backend | Đạt theo kiểm thử tích hợp A và đọc code. ProductPage truyền dữ liệu API vào ProductOptions; giá và phụ thu không hardcode trong component. Phụ thu cố định ở backend phù hợp thiết kế v1.1. |
| US02-AC-03 | Mặc định S, không topping, luôn một size | Đạt qua code và ca UI đã ghi nhận. State ban đầu S và mảng topping rỗng; size dùng radio với một selectedSize. |
| US02-AC-04 | Công thức giá và đổi size không cộng dồn | Đạt. A đối chiếu cà phê sữa 35000/40000/45000; ca Americano S→M→L→S cho 40000/45000/50000/40000; code tính lại từ lựa chọn hiện tại. |
| US02-AC-05 | Nhiều topping, bỏ chọn trừ đúng, không cộng trùng | Đạt trong các ca đã ghi nhận và qua code. A kiểm tra L + hai topping = 57000, bỏ Kem còn 50000; toggle dùng tập id không trùng. |
| US02-AC-06 | Giá cập nhật ngay, VND và lựa chọn rõ | Đạt. A thao tác đổi lựa chọn và đối chiếu giá; code render giá từ state, dùng formatPrice và radio/checkbox thể hiện trạng thái chọn. |
| US02-AC-07 | 404, lỗi khác và đường quay về Menu | Đạt trong các ca A đã ghi nhận. ID sai hiện not-found; backend dừng gây lỗi chi tiết; retry phục hồi sau sửa 2ed30b3; trang chi tiết/not-found có đường về Menu. |
| US02-AC-08 | Chặn giá thiếu, không phải số hoặc âm | Đạt ở phạm vi component đã thử. A đưa giá âm, NaN, undefined và chuỗi vào ProductOptions; không hiện preview sai và có thông báo. API client cũng kiểm tra dữ liệu; các ca này không chứng minh database đã có ràng buộc chặn mọi giá sai. |

Kết luận đối chiếu: đã có kết quả phù hợp cho 19 AC về API/menu/chi tiết
trong phạm vi thử nêu trên, và căn cứ cho các AC nền tảng. TS01-AC-05 có
quy ước đã thống nhất nhưng có ngoại lệ thực thi cần ghi nhận trung thực
trong đánh giá DoD/Retro. Đây không phải kết luận 24/24 AC đã được PO
nghiệm thu hoặc toàn bộ DoD đã hoàn thành. Không sửa lịch sử để coi lần
đẩy thẳng main là đã qua nhánh/PR; nhóm cần ghi nhận và thống nhất cải tiến.

## Còn phải hoàn thành hoặc xác nhận trước nghiệm thu

- [ ] Đối chiếu hướng dẫn README với kết quả thiết lập trên máy
      thành viên khác đã có; việc cập nhật nội dung README đã xong qua PR #9.
- [x] Đã gom liên kết các nguồn bằng chứng hiện có của A/D/E,
      phân biệt phạm vi, người thực hiện và thông tin chưa xác định.
- [x] Đã lập đối chiếu đủ 24 mã AC trong hồ sơ Sprint 1 v1.1,
      ghi căn cứ và ngoại lệ quy trình; chưa thay cho quyết định nghiệm thu của PO.
- [ ] Cập nhật board/backlog theo tiến độ thực tế;
      công việc chưa đạt được ghi nhận để nhóm quyết định xử lý.
- [ ] Nhóm thực hiện Sprint Review, ghi kết quả nghiệm thu của PO.
- [ ] B hỗ trợ Retrospective, ghi vấn đề và hành động cải thiện.
- [ ] Đồng bộ báo cáo Assignment 1 với kết quả cuối Sprint.

Kết quả kiểm thử trên máy A không tự thay thế cho kết quả D trực tiếp
thực hiện. Báo cáo phải phân biệt người kiểm thử và người tổng hợp.

Chỉ xác nhận Sprint 1 hoàn thành khi nhóm đã đối chiếu AC/DoD
và ghi nhận kết quả Sprint Review.

Thời gian toàn đồ án:
- Sprint 1: Tuần 1.
- Sprint 2: Tuần 2 và 3.
- Sprint 3: Tuần 4 và 5, bao gồm chuẩn bị nộp.

Ngày cụ thể bổ sung theo nhóm.
