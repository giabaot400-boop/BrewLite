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

## Xem thử UI checkout bằng dữ liệu mẫu

Trang `/dev/checkout` phục vụ review phần UI của S3-A-02 trong lúc chờ read API và backend Sprint 3. `CheckoutV2Panel` nhận các port từ bên ngoài, tái sử dụng coordinator và UI dùng chung; route xem thử cung cấp fixture riêng. Đây không phải trang checkout đã tích hợp và không thay các trang xác nhận/chi tiết/lịch sử của B.

Từ thư mục gốc repo, dừng frontend đang chạy ở cổng 3000 rồi mở bằng PowerShell:

```powershell
$env:CHECKOUT_PREVIEW_ENABLED = "1"
npm run dev --workspace apps/web
```

Mở `http://localhost:3000/dev/checkout`. Cờ trên chỉ áp dụng cho terminal hiện tại; không cần sửa `.env`. Không bật cờ thì route trả 404. Production luôn trả 404 kể cả có cờ. Kết thúc bằng Ctrl+C rồi `Remove-Item Env:\CHECKOUT_PREVIEW_ENABLED`; lần mở dev bình thường không có cờ thì trang bị khóa.

- Ban đầu có hai Cappuccino M, giá mẫu 50.000đ/ly. Nhập DEMO10 để xem giảm dự kiến 10.000đ; mở xác nhận rồi quay lại chưa tạo request. Tạo đơn xác nhận PENDING vẫn giữ hai ly và khóa sửa giỏ.
- Ví/Thẻ đều có xác nhận riêng. Trong mục điều khiển dữ liệu mẫu, chọn “Không thành công” (FAILED) để thử giữ giỏ; đổi lại thành công rồi xác nhận lần mới để thấy key mới trên cùng orderId. Replay key cũ vẫn giữ kết quả cũ.
- Có ba sự cố một lần: mất phản hồi tạo đơn, mất phản hồi payment sau khi lưu, GET Order lỗi sau payment. Dùng nút thử lại/khôi phục chủ động và dấu vết giả lập để đối chiếu key cũ; không tự POST sau đọc dữ liệu hoặc đổi cấu hình mẫu.
- Hủy trước thanh toán giữ các món; hủy sau PAID không dựng lại giỏ đã dọn. Nút thêm/làm lại chỉ thao tác fixture; tải lại trang tạo fixture mới.
- Dùng “Ẩn khung checkout” rồi “Mở lại khung checkout” để thử component đọc lại đơn đã lưu mà vẫn giữ fixture trong bộ nhớ. Đơn PENDING và payment recovery còn nguyên; việc mở lại không thêm dòng POST vào dấu vết. Đây là kiểm tra remount với fixture, không phải bằng chứng F5/localStorage/PostgreSQL thật.

Fixture chỉ giữ phiên/giỏ/orders/payments trong bộ nhớ của trang, dùng network/khóa giả lập và OrderDetail mẫu qua HTTP reader/parser đầy đủ của B; không đọc/ghi localStorage giỏ thật, migrate storage, gửi mutation backend hoặc chạy kho/điểm/refund thật. Header và GET `/api/auth/me` vẫn thuộc nền ứng dụng hiện có, không xác thực tài khoản mẫu. Không dùng fixture làm bằng chứng quyền server, Web Locks nhiều tab, DTO backend thực tế, transaction hoặc AC Sprint 3 đạt. Các reason/nhánh recovery đang đề xuất ở CONTRACTS 7.2 chưa được kích hoạt.

Kiểm tra trước bàn giao: unit test fixture/model và hồi quy frontend, typecheck/lint/build; HTTP smoke route bật/tắt và production. Trình duyệt cần thử thêm desktop/mobile, Tab/Shift+Tab/Escape, quay lại không gửi request và không đổi bytes giỏ thật. Bằng chứng trình duyệt ghi theo môi trường thực chạy; không suy kết quả từ build hoặc test giả lập.

## Nối panel với provider và khôi phục đơn

Tại 09/11/2026, `CartCheckoutPanelV2` đã được chuẩn bị để dùng provider/runtime v2. Luồng mở lại đọc mã đơn theo đúng owner, xác minh phiên và GET trạng thái hiện tại; không tự tạo đơn, thanh toán hoặc gửi lại yêu cầu. Các record chưa rõ kết quả giữ nguyên key/body; chỉ settlement đã kiểm tra mới có thể cập nhật binding/giỏ theo CONTRACTS mục 7.1.

Frontend unit test đạt 889/889 trên bản thay đổi này; typecheck/lint/build được kiểm tra riêng. Tests dùng storage/khóa/network giả lập. A đã xác nhận hai lượt thử UI bằng fixture: mở lại PENDING không tự POST; mở lại và khôi phục payment giữ key cũ. Chưa kiểm tra E2E Sprint 3 với Nest/PostgreSQL. Không đổi trạng thái AC thành đạt từ các kết quả trên.

Layout và trang `/cart` vẫn dùng v1. Chưa tự migrate hoặc bật v2 trước DEP-05/06; phần còn chờ là backend/read API phù hợp contract, đóng băng các điểm mở mục 7.2, rồi kích hoạt một provider duy nhất và kiểm tra tích hợp thật. Các trang đơn hàng của B vẫn được giữ riêng.


## Hiển thị giá chính thức trước thanh toán

Khung đơn trong checkout và hộp xác nhận lần thanh toán mới dùng OrderDetail đã đọc đúng phiên/ID/version. Tạm tính, mã/giảm giá và tổng lấy từ snapshot đơn, độc lập với giỏ/mã nhập hiện tại. Không gọi thêm HTTP chỉ để render giá; thiếu snapshot khớp thì yêu cầu đọc lại đơn trước khi mở lần thanh toán mới. Parser và thành phần hiển thị của B được tái sử dụng; không thêm API hoặc thay hợp đồng dữ liệu backend.

Môi trường triển khai đã chạy 912/912 frontend unit test, typecheck, lint, build và diff check đạt. Trong đó có 23 test bổ sung cho snapshot giá, quyền đọc theo phiên, DTO/version không khớp, mở lại panel, retry giữ mã/key/body và đơn đổi sau khi mở xác nhận. Tests vẫn dùng network/storage/khóa giả lập; A đã xác nhận UI fixture hiển thị đúng giá DEMO10, hộp xác nhận cùng số tiền, quay lại không gửi PAYMENT và mở lại giữ giá chính thức. Chưa kiểm tra E2E với backend Sprint 3.

Kiểm tra UI tại `/dev/checkout`: tạo hai Cappuccino M với DEMO10, xem tạm tính 100.000đ, giảm 10.000đ, tổng 90.000đ; ẩn/mở panel vẫn giữ giá/mã chính thức; mở xác nhận thanh toán rồi quay lại chưa thêm PAYMENT vào dấu vết. Không dùng kết quả fixture để đánh dấu AC backend đạt. Layout hiện tại vẫn là v1, bước kích hoạt v2 chờ DEP-05/06.

## Kiểm tra tổng hợp sau bản sửa recovery

Ngày 10/11/2026, đối chiếu source tại `8299e7b` (PR #41), đã nhận bản sửa
binding rỗng từ `bde50f2` (PR #35). Các số 889/912 ở trên là kết quả tại từng
mốc trước; không thay lại kết quả lịch sử bằng số tổng mới.

Trong môi trường review Linux, Node 24.22.1:

- Chạy `node --test "src/**/*.test.mjs"` từ `apps/web`: **914/914 đạt**,
  không fail hoặc skip. Đây là cùng phạm vi với script `npm test` của web.
- Nhóm tạo đơn/payment/cancel coordinator và payment recovery: **149/149 đạt**;
  nhóm này nằm trong 914 test trên, không cộng thêm vào tổng.
- Hai file `cookie-options.test.ts` và `csrf.test.ts` chạy riêng bằng
  `node --import tsx --test src/lib/server/auth/cookie-options.test.ts src/lib/server/auth/csrf.test.ts`
  từ `apps/web`: **7/7 đạt**, ngoài phạm vi script test `.mjs`.

Đã đọc bổ sung ba coordinator, các bước ghi bền/đối chiếu kết quả và cổng
điều phối chung của runtime. Nhánh chưa có PaymentAttempt của CONTRACTS 7.2
vẫn giữ UNRESOLVED; các reason đề xuất chưa được coi là hợp đồng đã chốt.
Bản sửa binding rỗng không công bố Order cũ hoặc mở lần thanh toán mới khi
không có settlement binding phù hợp. Ba file coordinator giống nhau ở HEAD
PR #37 (`29c536f`) và bản tích hợp trên; core recovery của #37 chưa chứa fix
`bde50f2`, nên không dùng riêng HEAD #37 làm bản phát hành cuối.

Các test dùng auth/network/storage/khóa giả lập. Chưa chạy E2E với backend
Sprint 3/PostgreSQL; lượt review này không chạy lại lint/typecheck/build,
không bật provider v2 và không đổi trạng thái AC. Trước khi phát hành, kiểm
tra source đã merge có fix recovery và tiếp tục DEP-05/06 cùng kiểm thử thật.

## Kiểm thử tích hợp tạo và đọc đơn — 11/11/2026

Nhánh `integration/sprint3-checkout-e2e`, source `5c41899`, ghép frontend
`9c4658b` với backend `ad797f4`. A cung cấp kết quả trên Windows, Node 24.16.0,
PostgreSQL 17, database riêng `brewlite_s3_demo`:

- Frontend unit test: 945/945, không fail/skip; backend typecheck, frontend
  lint/build và diff check đều thành công.
- `BrewLite_S3_Order_HTTP_Check.cjs`: 15/15 qua HTTP trực tiếp NestJS cổng 3002.
- `BrewLite_S3_BFF_Order_Check.cjs`: 18/18 qua Next.js cổng 3000 và NestJS 3002.

Hai lượt HTTP kiểm tra tạo đơn v2, DEMO10, đọc chi tiết/lịch sử qua parser
frontend, replay/conflict và phân quyền; đối chiếu ledger/giữ kho trong
PostgreSQL. Lượt BFF kiểm thêm cookie/binding, Origin, expected owner và
đăng xuất. Báo cáo JSON đang được A giữ ở `%TEMP%`, chưa đính kèm repo:
`BrewLite_S3_Order_HTTP_Result_1794388409565.json` và
`BrewLite_S3_BFF_Order_Result_1794389047234.json`. Đây là kết quả do A cung cấp,
không phải toàn bộ ma trận AC đã nghiệm thu. Không chạy lại chỉ để đổi tên báo cáo.

### Bật giao diện v2 để thử trên máy phát triển

Đặt `CHECKOUT_V2_INTEGRATION_ENABLED=1` trong cửa sổ chạy `next dev`, rồi khởi
động lại frontend. Cờ phía server chọn đồng thời đúng một provider và panel
v2 tại layout và `/cart`. Không có cờ, giá trị khác `1`, hoặc production vẫn
dùng v1. Cờ này khác `CHECKOUT_PREVIEW_ENABLED` của trang fixture `/dev/checkout`.

Chỉ thử bằng một cửa sổ ẩn danh mới, giữ các tab của profile đó ở cùng phiên
bản. Mở ứng dụng với cờ sẽ đọc/migrate envelope v1 sang v2 dưới Web Lock;
không tự POST và không tự đổi pending key/body. Migration storage là một chiều:
không quay lại writer v1 trên profile đã migrate; không xóa storage để hạ cấp.

Phạm vi lượt thử hiện tại là tạo/đọc đơn, giữ giỏ và khôi phục bằng GET sau F5.
Thanh toán/hủy/expiry và hai lỗi V1 ở PR #52 còn chờ backend; không thao tác
thanh toán/hủy trong lượt này và không dùng các kết quả trên để công bố các
luồng đó đạt. Production rollout vẫn chờ đóng phụ thuộc DEP-05/06 và nghiệm thu.

Trong môi trường chuẩn bị patch, 945/945 unit test, lint và build frontend
đạt. Đã build với cờ bằng `1` và kiểm tra HTML production vẫn chọn provider/
panel v1. Môi trường này không khởi động được server/trình duyệt để chạy lượt
thử development nên không cung cấp bằng chứng tương tác trình duyệt.

A đã xác nhận lượt UI trên máy Windows với cờ integration, Next.js 3000,
NestJS 3002 và PostgreSQL `brewlite_s3_demo`:

- Thêm một Americano S, không topping; giỏ khách có một ly, tổng 40.000đ.
  Đăng ký/đăng nhập tài khoản test rồi quay lại vẫn giữ món.
- Mở xác nhận rồi chọn quay lại: không có POST tạo đơn.
- Xác nhận một lần: POST `/api/orders` trả 201, GET chi tiết trả 200; hiển thị
  chờ thanh toán, tổng chính thức 40.000đ; giữ một ly và khóa sửa giỏ.
- F5: đọc lại đúng mã đơn cũ, giữ món/giá và không phát sinh POST tạo đơn mới.

Đây là kết quả thao tác và Network do A xác nhận, chưa có ảnh/log trình duyệt
đính kèm. Chưa kiểm chứng bằng lượt này: nhiều tab, tranh chấp kho, payment,
hủy/refund/expiry hoặc production. Không mở rộng kết luận sang toàn bộ AC/DoD.

## Kiểm thử lại bản tích hợp — 12/11/2026

A cung cấp kết quả tại source `c290c57017e3f6be34cd72f9ac9a332817a01a93`,
nhánh `integration/sprint3-checkout-e2e`, sau khi nhận bản sửa D `e70a9e4`
và reason pricing của C `25ff9a8`. Môi trường Windows, Node 24.16.0,
PostgreSQL 17; giữ profile `apps/api/.env.sprint3-test` trỏ
`localhost:5432/brewlite_s3_demo`, NestJS 3002 và Next.js dev 3000.

| Phạm vi | Kết quả A cung cấp |
|---|---|
| Backend typecheck/build và năm file spec pricing/service V1/V2/controller/HTTP mock | Mã thoát 0; 49/49 test đạt, không fail/skip |
| `BrewLite_S3_Order_HTTP_Check.cjs` | 15/15, mã thoát 0 |
| `BrewLite_S3_BFF_Order_Check.cjs` | Lượt chạy lại 18/18, mã thoát 0 |

A đã đọc metadata cả hai báo cáo: `sourceSha` đúng SHA đầy đủ trên,
`passed=true`, `checks` lần lượt 15/18 và không có check thất bại.
Báo cáo JSON nằm ở `%TEMP%` trên máy A, chưa đính kèm repo:

- `BrewLite_S3_Order_HTTP_Result_1794455808567.json`.
- `BrewLite_S3_BFF_Order_Result_1794456397999.json`.

Lượt BFF đầu dừng trước check đầu tiên: `Check stopped: 23`, 0/1,
mã thoát 1; báo cáo `BrewLite_S3_BFF_Order_Result_1794456087859.json`.
Sau đó GET không cookie tới `/api/auth/me` trả 401 AUTH_REQUIRED và
`/api/products` trả 200, rồi A chủ động chạy lại script. Không tăng timeout
hoặc đổi code để nhận kết quả 18/18; chưa đủ log kết luận chắc nguyên nhân
lượt đầu là biên dịch route. Giữ lịch sử lượt thất bại cùng lượt đạt.

Helper môi trường dùng chế độ `check` rồi `start`; không setup/seed/reset.
Trước kiểm thử, coffee-milk stock 10/reserved 5, americano 10/1. Script HTTP
giữ thêm 3 ly và BFF giữ thêm 2 ly coffee-milk; đơn/ledger/reservation được
giữ làm bằng chứng, các phiên thử được logout. Không chạy lặp để đổi tên
báo cáo hoặc đặt lại kho/version về ban đầu.

Hai lượt HTTP/BFF kiểm chứng hồi quy tạo/đọc đơn V2, giá/DEMO10,
replay/conflict, quyền và giữ kho trên PostgreSQL. Không chứng minh riêng
retry exhaustion/zero-total V1 trên DB, lỗi giá/kho ở UI, tranh chấp kho,
payment, cancel/refund/expiry, trình duyệt hoặc toàn bộ AC/DoD.
Đây là bằng chứng cho source c290c57 trước patch frontend bên dưới,
không tự chuyển thành bằng chứng chạy backend/DB sau patch hoặc của A2.

### Nối hai reason giá đã chốt vào frontend

Runtime checkout v2 mặc định nhận PRODUCT_PRICE_CHANGED và
EXPECTED_TOTAL_MISMATCH theo CONTRACTS mục 3, kèm đối chiếu số tiền và
cấu hình món với pending đã lưu. Giá dòng đổi ưu tiên PRODUCT_PRICE_CHANGED;
chỉ lệch tổng mới nhận EXPECTED_TOTAL_MISMATCH. Khi từ chối hợp lệ, chỉ
kết thúc pending tương ứng, giữ nguyên giỏ và chờ khách xác nhận yêu cầu mới.
Reason lạ, nhãn không khớp dữ liệu và hai tên kho chưa chốt vẫn giữ UNKNOWN.

Kiểm tra khi chuẩn bị patch: ba file spec frontend rejection/runtime/client
đạt 92/92 trên Node 24.22.1, storage/network giả lập; không kết nối DB.
A xác nhận sau khi áp dụng patch trên nền c290c57, trước commit: full frontend
suite đạt 951/951, không fail/skip; test, typecheck, lint và build đều mã thoát 0.
Diff vẫn đúng sáu file (168 dòng thêm, 13 dòng xóa trước cập nhật ghi nhận này).
Đây là kết quả A cung cấp trên máy Windows, không phải lượt chạy full suite
trong môi trường chuẩn bị patch. HTTP/BFF 15/15 và 18/18 ở trên vẫn gắn với
source c290c57 trước patch; chưa chạy lại HTTP/BFF hoặc thử UI lỗi giá sau patch.
Không thay DTO/canonical, backend, schema/migration, profile, timeout hoặc
cơ chế giữ kho; không dùng kết quả này để kết luận toàn bộ Sprint 3 đạt.
