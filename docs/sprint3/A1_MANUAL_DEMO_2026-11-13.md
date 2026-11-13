# Assignment 1 — demo thủ công trên máy A ngày 13/11/2026

Người thao tác: A. Hana hỗ trợ hướng dẫn và tổng hợp từ kết quả A xác nhận,
ảnh giao diện và console PowerShell được gửi trong trao đổi. Thời gian nêu
trong tài liệu theo Việt Nam, UTC+7. Không có giờ bắt đầu/kết thúc chính xác
của toàn lượt, bản ghi Network/SQL hoặc video liên tục.

Đây là bản ghi demo riêng của A trên ứng dụng Compose đang chạy, không là
raw log của automation, buổi Review/Retrospective nhóm hoặc nghiệm thu của
giảng viên. Các ảnh còn trong trao đổi, chưa đính kèm repository. Kết quả
unit/PostgreSQL/browser tự động ngày 12/11 giữ nguyên tại
[hồ sơ nghiệm thu](A1_ACCEPTANCE_REVIEW.md) và các báo cáo nguồn được dẫn ở đó.

## Môi trường và phiên bản

A cung cấp metadata sau khi kết thúc các thao tác demo và cập nhật tài liệu:

| Nội dung | Giá trị A cung cấp |
|---|---|
| Thư mục làm việc | `D:\cnpm\brewlite`, Windows PowerShell |
| Nhánh Git lúc ghi metadata | `docs/sprint3-architecture-current`, sạch và đồng bộ remote |
| Git HEAD lúc ghi metadata | `0741c18c1df5e84ca494e58ef1c3fc2110f96546`, sửa góp ý kiến trúc |
| Compose | `.env.compose`; db/backend/frontend đều healthy |
| Backend image | `brewlite-api:sprint3`, ID rút gọn `93c73e1dd9c2` |
| DB image | `postgres:17-bookworm`, ID rút gọn `665dc7b37ac5` |
| Frontend image | `brewlite-web:sprint3`, ID rút gọn `6ac3316340d4` |
| Platform ba image | `linux/amd64` |
| Cổng truy cập | Frontend `127.0.0.1:3000`; backend `3001/tcp` và DB `5432/tcp` nội bộ, không có host mapping trong output `ps` |
| Mock khi chốt metadata | `MOCK_PAYMENT_OUTCOME=SUCCEEDED` |
| Checkout khi chốt metadata | `CHECKOUT_V2_ENABLED=1` |

Các ID rút gọn khớp tiền tố image trong hồ sơ chạy trước: backend/DB giữ từ
workflow, frontend sau sửa rollout `3959f40`. Lượt này không lấy full digest
mới, không build image tại `0741c18` hoặc chạy lại toàn bộ test ở Git HEAD
đó. Không suy phiên bản trình duyệt/Node/npm hiện tại từ các báo cáo cũ.

Các lệnh đọc metadata A đã gửi kết quả:

```powershell
git status --short --branch
git log -1 --oneline
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose images
docker compose --env-file .env.compose exec backend node -p "process.env.MOCK_PAYMENT_OUTCOME"
docker compose --env-file .env.compose exec frontend node -p "process.env.CHECKOUT_V2_ENABLED"
```

## Các nhóm thao tác và kết quả A xác nhận

M01–M10 là mã để tra cứu trong bản ghi, không phải số test hoặc AC mới.
Các kết quả dưới đây thuộc phạm vi quan sát UI, thao tác và console A cung cấp.

| Mã | Thao tác | Kết quả A xác nhận | Đối chiếu/giới hạn |
|---|---|---|---|
| M01 | Chọn Cà phê sữa L, Kem và Trân châu; tăng/giảm/xóa | Một ly 57.000đ; hai ly 114.000đ; badge đổi 1→2→1→0, xóa hiện giỏ trống | Xác nhận thao tác; không có trace tính giá backend riêng cho bước này |
| M02 | Hai Cappuccino M không topping; đăng ký/đăng nhập, DEMO10, tạo đơn | Tổng 100.000đ, giảm 10.000đ, chính thức 90.000đ; PENDING giữ giỏ; F5 giữ mã `811e907c-992d-4664-b180-537ac19b7ff4` | Ảnh trong trao đổi cho thấy PENDING và bảng giá; không đính kèm ảnh trong repo |
| M03 | Thanh toán Ví mô phỏng cho đơn M02; xem đơn hàng và F5 | PAID, giỏ/badge về 0; có 9 điểm; cùng mã đơn trong lịch sử và sau F5 | Chưa đọc SQL/ledger trong lượt thủ công |
| M04 | CLI thử PAID→READY rồi đi lần lượt PREPARING→READY→COMPLETED cho đơn M02 | Cạnh bỏ bước bị chặn; ba cạnh đúng cập nhật trạng thái tương ứng sau đọc lại/F5 | A xác nhận các lệnh đúng kỳ vọng; không có raw CLI log riêng trong repo cho lượt này |
| M05 | Một Americano S 40.000đ, Thẻ mô phỏng; hủy khi PAID | Đơn `e1083e69-9ae3-4b46-965f-6886b9ca5faf` thanh toán rồi hủy; hoàn trả mô phỏng 40.000đ, thu hồi 4 điểm; giỏ đã dọn vẫn trống | Ảnh PAID và xác nhận kết quả hủy từ A; tính một lần/atomic xem bằng chứng PG trước đó |
| M06 | Backend FAILED, thanh toán một Americano S; đổi về SUCCEEDED, đọc lại rồi bấm Thử thanh toán mới | Đơn `2ee2a1a5-0bc6-4c83-9e4f-87ae48a3024a` ban đầu PAYMENT_FAILED, giữ giỏ, chưa cộng điểm; sau thử mới thành PAID trên cùng mã, dọn giỏ và cộng 4 điểm | Hạn A gửi là 10:57:30 ngày 13/11; không chụp key/body hoặc phát lại key cũ trong lượt này |
| M07 | Tạo một Trà đào S 39.000đ, không mã; hủy khi PENDING | Đã hủy; giữ một ly/badge 1, giỏ sửa được; điểm không đổi; lịch sử có đơn hủy | A xác nhận kết quả; mã đơn của bước này không được ghi lại |
| M08 | Tạo lại Trà đào S; để qua hạn thanh toán thật | Đơn `0d7f7282-0824-4ded-ad02-07dd07effcbe`, hạn 11:12:50 ngày 13/11; khoảng 11:13 không còn nút thanh toán, khoảng 11:14 không còn nút hủy; ảnh cho thấy Đã hủy | A không chủ động hủy/thanh toán đơn này; không lấy log tick expiry hoặc SQL để đo thời điểm xử lý chính xác |
| M09 | Giao diện không còn nhận diện đăng nhập; đăng nhập lại đúng tài khoản | Trước đăng nhập, giỏ bị chặn theo chủ/phiên; sau đăng nhập vẫn có Trà đào và đơn cũ đã hủy | Chưa xác định nguyên nhân mất phiên; không gọi đây là test JWT hết hạn đã được chứng minh |
| M10 | Từ lựa chọn còn trong giỏ, chủ động xác nhận tạo đơn mới rồi xem lịch sử | Mã đơn khác, có hạn mới; đơn cũ trong lịch sử được ghi quá hạn thanh toán | A xác nhận; không lưu mã/hạn mới hoặc ảnh của bước này, không chụp key/body |

M04 dùng CLI nội bộ có `DEMO_WORKFLOW_ENABLED=true`; CLI chỉ xử lý ba cạnh
sau PAID. Luồng đầy đủ khách nhìn thấy vẫn có năm trạng thái:
PENDING → PAID → PREPARING → READY → COMPLETED.

Ở M06, việc đổi cấu hình và bấm Đọc lại trạng thái không tự thực hiện
payment. A chủ động chọn Thử thanh toán mới trên cùng Order. Việc replay
đúng key FAILED cũ sau restart, hoặc giữ key/body khi mất response, thuộc
các lượt PostgreSQL/HTTP/browser đã có; không lấy bước refresh UI thay cho
bằng chứng exact-key replay trong lượt demo này.

M08 chờ qua hạn thật, bổ sung cho S5 tự động vốn dùng deadline fixture đặt
về quá khứ. Expiry service quét định kỳ 60 giây theo code đã review; các mốc
11:13/11:14 là quan sát xấp xỉ của A, không là phép đo SLA hoặc bằng chứng
giao diện có polling. Sau CANCELLED, thanh toán/hủy không còn được hiển thị.

Ở M09–M10, lựa chọn còn nguyên sau đăng nhập và chỉ có mã mới khi A chủ động
tạo lại. Không thu Network nên không kết luận số lượng request POST từ
quan sát này; các assertion không auto-POST đã có trong test tự động trước.

## Ghi nhận giao diện và trạng thái kết thúc

A nhận thấy Đọc lại trạng thái dùng con trỏ mũi tên, còn liên kết chuyển
trang hiện bàn tay. Sau trao đổi, A quyết định giữ nguyên để đồng bộ với
nhóm nút thao tác trong trang. Không có bản sửa con trỏ, hover, màu hoặc
layout nào được tạo trong đợt này.

Metadata cuối xác nhận ba service healthy, mock SUCCEEDED và checkout v2
bật. Các đơn demo được giữ làm dữ liệu thao tác; không có lượt kiểm kê SQL
cuối hoặc bằng chứng fixture cleanup cho toàn bộ lượt thủ công. Không ghi
tồn kho giữ nguyên, vì các đơn đã thanh toán có thể đã tiêu thụ kho đúng
nghiệp vụ. Việc hủy đơn mới cuối M10 đã được hướng dẫn nhưng chưa có mã/log
xác nhận riêng trong bản ghi này.

## Kết luận trong phạm vi lượt demo

A xác nhận kết quả mong đợi của các nhóm thao tác được liệt kê; có ảnh cho
các trạng thái PENDING, PAID, CANCELLED và giao diện yêu cầu đăng nhập lại,
cùng console trạng thái Compose cuối. Đây là kiểm tra thao tác bổ sung,
không cộng vào tổng 960 frontend, 181 backend, 28 PostgreSQL hoặc coi là
toàn bộ 27 AC đã được ký nghiệm thu.

Lượt này không tự kiểm lại concurrency/rollback, exact-key replay, SQL
ledger/kho/điểm một lần, lỗi giá/kho, mất response, mobile, offline, bàn phím,
screen reader hoặc nhiều trình duyệt. Những mục có bằng chứng cũ tiếp tục
giữ đúng báo cáo và phạm vi cũ; mục chưa có bằng chứng không được chuyển PASS.
Chốt review/merge hồ sơ, buổi Review/Retro nếu lớp yêu cầu, giờ LMS và gói
bàn giao từ SHA cuối vẫn được theo dõi trong hồ sơ nghiệm thu.
