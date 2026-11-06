# BrewLite Assignment 2 — Bối cảnh và phạm vi

| Thông tin | Giá trị |
|---|---|
| Tạo phẩm | Task 1.1 — Bối cảnh, stakeholder và phạm vi |
| Đường dẫn dự kiến trên repository | `docs/requirements/context-and-scope.md` |
| Ngày cập nhật | 06/11/2026 |
| Trạng thái | Bản nháp để nhóm review; chưa là baseline yêu cầu được phê duyệt |
| Phạm vi của tệp | Bối cảnh và ranh giới sản phẩm; làm đầu vào cho SRS và đặc tả use case |

BrewLite giúp khách hàng chọn đồ uống, đặt đơn, thanh toán không tiền mặt mô phỏng và theo dõi đơn để nhận đồ tại quầy. Assignment 2 tiếp tục phát triển cùng sản phẩm của Assignment 1, đồng thời yêu cầu quản lý tài liệu, mô hình, kiến trúc, kiểm thử, CI/CD và bàn giao một phiên bản production truy cập được.

Tài liệu này xác định phạm vi mục tiêu, không ghi nhận các chức năng đã triển khai hoặc kiểm thử đạt. Các chính sách chi tiết kế thừa từ bản nháp Sprint 3 được tách riêng tại mục 6 để nhóm review trước khi đưa thành yêu cầu chính thức. Việc soạn xong Task 1.1 chưa đồng nghĩa hoàn thành toàn bộ Task 1 hoặc đã đưa tài liệu lên repository.

## Nền sử dụng và trạng thái

Bản giao nhóm ngày 06/11/2026, đồng bộ **Sprint 3** và nền Sprint 2 main `a1a0e4ae92de681deac538685e24407b3190866b`. PO đã chọn phương án Sprint 3 làm cơ sở thực hiện; chưa thay xác nhận review của từng thành viên hoặc minh chứng kiểm thử Assignment 2. Giữ nguyên 17 FR, 12 NFR, 59 AC, 14 mã UC và 10 lớp domain.

Chi tiết kế thừa nằm tại [contract dùng chung](../assignment2/CONTRACTS.md). Hạn cả hai assignment là **15/11/2026 theo thông tin PO cung cấp**; giờ nộp LMS cần PO xác nhận. Xem [kế hoạch giao nhóm](../assignment2/TEAM_PLAN.md); lịch là mục tiêu đề xuất, chưa ghi nhận các bạn đã nhận việc.

## 1. Bối cảnh nghiệp vụ và vấn đề cần giải quyết

Trong bối cảnh cửa hàng đồ uống phục vụ tại quầy, khách cần biết món đang bán, chọn size và topping, kiểm tra giá, đặt đơn và biết kết quả thanh toán. Nếu thông tin lựa chọn và trạng thái đơn không được quản lý thống nhất, khách có thể không biết đơn đã được ghi nhận hay chưa; phía cửa hàng khó xác định đúng đơn và tình trạng xử lý.

BrewLite cung cấp một luồng đặt hàng trên web, từ xem menu đến xác nhận và theo dõi đơn. Backend kiểm tra yêu cầu và tính giá chính thức; dữ liệu đơn, tùy chọn và kết quả thanh toán được lưu để có thể tra cứu. Việc gửi lại yêu cầu hoặc nhiều khách đặt đồng thời phải được kiểm soát để tránh tạo trùng và bán vượt tồn kho.

Đây là bối cảnh sản phẩm được xây dựng từ đề bài và tài liệu phân tích hiện có. Chưa có biên bản phỏng vấn hoặc số liệu khảo sát cửa hàng thực tế để xác nhận thời gian xếp hàng, doanh thu hay mức giảm sai sót; không sử dụng các giá trị chưa đo làm kết quả của dự án.

## 2. Mục tiêu sản phẩm

1. Khách thực hiện được luồng xem menu → chọn size/topping → giỏ hàng → đặt đơn → thanh toán mô phỏng → xác nhận và theo dõi đơn.
2. Khách nhìn thấy giá và kết quả rõ ràng, phân biệt được thanh toán thất bại đã xác nhận với trường hợp chưa nhận được phản hồi.
3. Hệ thống kiểm tra quyền sở hữu, tính giá chính thức, bảo vệ trạng thái đơn, chống xử lý trùng và kiểm soát tồn kho đồng thời.
4. Nhóm kế thừa phần mềm và tài liệu Assignment 1, bổ sung đúng các tạo phẩm của Assignment 2, đồng thời giữ lịch sử thay đổi và bằng chứng kiểm chứng.
5. Một người ngoài nhóm có thể chạy hệ thống theo README và truy cập phiên bản production qua các URL bàn giao khi đến giai đoạn nghiệm thu tương ứng.

Các mục tiêu sẽ được chuyển thành FR/NFR, mức ưu tiên và tiêu chí chấp nhận kiểm chứng được trong Task 1.2; tệp này chưa thay cho SRS.

## 3. Stakeholder và kỳ vọng

| Mã | Stakeholder | Mục tiêu và kỳ vọng | Liên quan đến MVP |
|---|---|---|---|
| SH-01 | Khách hàng | Xem món và tùy chọn; biết tổng tiền; đặt, thanh toán và tìm lại đơn của mình; nhận thông báo rõ khi có lỗi | Người sử dụng chính. Khách chưa đăng nhập có thể xem món và quản lý giỏ; các thao tác tài khoản/đơn cá nhân yêu cầu xác thực theo contract |
| SH-02 | Nhân viên quầy / Barista | Nhận biết đơn và tiến trình thực hiện để giao đúng đồ uống | Có liên quan nghiệp vụ. Backend cần quản lý trạng thái đơn; giao diện nghiệp vụ quầy đầy đủ nằm ngoài MVP đang đề xuất |
| SH-03 | Quản lý cửa hàng / Product Owner | Xác định phạm vi, ưu tiên yêu cầu và xem xét sản phẩm có đáp ứng mục tiêu hay không | Tham gia review và nghiệm thu yêu cầu. Vai trò stakeholder này không tự tạo yêu cầu xây trang quản trị cửa hàng |
| SH-04 | Giảng viên / khách hàng nghiệm thu | Truy vết được yêu cầu đến thiết kế, code và test; xem demo và truy cập sản phẩm bàn giao | Đánh giá tạo phẩm theo thứ tự task, kết quả kiểm thử, CI/CD, production và hướng dẫn chạy |
| SH-05 | Nhóm phát triển | Có phạm vi chung, contract nhất quán, phân công và phụ thuộc rõ; tái tạo được môi trường và kiểm thử | Nhóm năm vị trí A–E kế thừa vai trò hiện có; phân công và lịch Assignment 2 cần nhóm review riêng |
| SH-06 | Đơn vị thanh toán | Cung cấp kết quả thanh toán theo yêu cầu hợp lệ và cho phép nhận diện yêu cầu lặp | Được mô phỏng trong bài tập; không có giao dịch tiền thật hoặc cam kết tích hợp nhà cung cấp ngoài |

Stakeholder là bên có lợi ích hoặc ảnh hưởng đến sản phẩm; không phải mọi stakeholder đều là actor trên sơ đồ use case. Với phương án mock nội bộ hiện tại, Payment Service là thành phần của BrewLite, không phải actor hệ thống bên ngoài. Nếu đổi phương án tích hợp, nhóm phải cập nhật ranh giới, use case và các mô hình liên quan.

## 4. Ranh giới hệ thống

### 4.1. Bên trong BrewLite

- Giao diện Next.js cho xem món, chọn tùy chọn, giỏ hàng, tài khoản và đơn hàng; phần server/BFF hỗ trợ trao đổi với NestJS theo contract.
- Backend NestJS cung cấp API, xác thực và kiểm tra quyền, xử lý giá, đơn, tồn kho, ưu đãi/điểm và thanh toán mô phỏng.
- PostgreSQL lưu dữ liệu ứng dụng; migration và seed phục vụ tái tạo môi trường. Trình duyệt không được cấp thông tin kết nối hoặc quyền truy cập database trực tiếp.
- Payment Service mô phỏng thuộc backend theo phương án Sprint 3 đang review; không yêu cầu thêm một server/container thanh toán độc lập chỉ để đủ tên lifeline trong sequence.

### 4.2. Bên ngoài BrewLite

Khách sử dụng trình duyệt/PWA để tương tác với sản phẩm. Giảng viên và nhóm phát triển kiểm tra hoặc vận hành môi trường phục vụ bài tập. Hạ tầng hosting, registry và CI là môi trường cung cấp dịch vụ triển khai; lựa chọn cụ thể sẽ được trình bày trong Task 3 và hiện thực ở Task 4–5.

MVP phục vụ đặt và nhận đồ tại quầy. Chưa tích hợp cổng tiền thật, hệ thống giao hàng, POS hoặc hệ thống kinh doanh của một cửa hàng thực tế. Phương án dùng CLI nội bộ có cờ DEMO_WORKFLOW_ENABLED=false mặc định để demo chuyển bước pha chế; cần hiện thực và kiểm chứng; khách hàng không được tự chuyển đơn sang PREPARING/READY/COMPLETED.

## 5. Phạm vi MVP

### 5.1. Chức năng trong phạm vi

Các mã IN dưới đây dùng để thảo luận phạm vi, chưa thay cho mã FR của SRS. “Trong phạm vi” là mục tiêu cần thực hiện, không có nghĩa chức năng đã hoàn thành.

| Mã | Nhóm chức năng | Ranh giới mục tiêu |
|---|---|---|
| IN-01 | Menu | Hiển thị danh sách món, ảnh, tên và giá; xử lý loading, empty và error |
| IN-02 | Chi tiết và tùy chọn | Xem chi tiết, chọn size/topping được phép, số lượng và giá xem trước; backend xác định giá chính thức khi đặt |
| IN-03 | Giỏ hàng | Thêm, sửa số lượng, xóa, tính tổng xem trước và badge; lưu/khôi phục, bảo vệ đúng chủ và các yêu cầu đang chờ kết quả |
| IN-04 | Xác thực và phiên | Đăng ký, đăng nhập JWT, khôi phục trạng thái đăng nhập và đăng xuất; kế thừa contract phiên/cookie/BFF của Sprint 2 |
| IN-05 | Tạo đơn | Xác thực, validate, kiểm tra món/giá, lưu snapshot và tạo đơn PENDING; chống tạo trùng khi gửi lại cùng yêu cầu |
| IN-06 | Thanh toán mô phỏng | Chọn Ví/Thẻ, xử lý kết quả thành công/thất bại, idempotency và phục hồi khi mất phản hồi; không chuyển tiền thật |
| IN-07 | Xác nhận và theo dõi đơn | Hiển thị mã, chi tiết, trạng thái và lịch sử của đúng khách; đọc trạng thái hiện tại từ server |
| IN-08 | Vòng đời đơn | Chặn chuyển trạng thái không hợp lệ; hỗ trợ luồng PAID → PREPARING → READY → COMPLETED và xử lý thất bại/hủy theo chính sách được chốt |
| IN-09 | Tồn kho đồng thời | Kiểm soát tồn kho Product theo số ly khi nhiều khách đặt; Topping chỉ kiểm tra cấu hình/giá và lưu snapshot; giữ/trừ/giải phóng kho với transaction và optimistic locking, kế thừa phạm vi nghiệp vụ Assignment 1 |
| IN-10 | Khuyến mãi và điểm thưởng | Áp một mã hợp lệ và ghi điểm sau thanh toán thành công; xử lý lặp và bù trừ theo chính sách được nhóm review; chưa có đổi điểm |

### 5.2. Chất lượng và đầu ra bàn giao trong phạm vi Assignment 2

- Giao diện mobile-first/PWA theo đề. Mức hỗ trợ PWA cụ thể phải có tiêu chí kiểm chứng trong SRS; không tự suy ra việc cho phép đặt đơn hoặc thanh toán offline.
- Yêu cầu về hiệu năng, bảo mật, tính khả dụng và khả năng triển khai phải được định danh, ưu tiên và gắn tiêu chí chấp nhận ở Task 1.2.
- Task 2 có activity, sequence và class diagram mức domain. ERD có thể làm nguồn đối chiếu, không thay cho class diagram bắt buộc.
- Task 3 có mô tả kiến trúc, ADR và deployment diagram phản ánh nền tảng production thực tế được chọn.
- Task 4–5 có CI/CD, unit/integration/E2E test, migration/seed, Compose local, health check, production HTTPS, release và hướng dẫn chạy/deploy/rollback theo đề.
- Ma trận truy vết nối yêu cầu → use case/user story → thiết kế → code/API → test. Khi chưa có code/test tương ứng, ghi chờ thực hiện; không tạo minh chứng hoàn thành từ bản thiết kế.

### 5.3. Ngoài phạm vi MVP hiện tại

| Mã | Nội dung không thực hiện | Giới hạn |
|---|---|---|
| OUT-01 | Thanh toán và hoàn tiền thật | Không kết nối tài khoản ngân hàng/ví thật, SDK thẻ, webhook hoặc đối soát tiền thật. Hoàn mô phỏng nếu được chốt chỉ là nghiệp vụ của bản demo |
| OUT-02 | Kho nguyên liệu và công thức pha chế | Không quản lý sữa, đường, đá, cà phê hạt hoặc định mức gram/ml; chỉ quản lý kho Product theo số ly; không quản lý tồn kho Topping |
| OUT-03 | Hệ thống quản trị cửa hàng/quầy đầy đủ | Không mặc định bổ sung màn hình CRUD món, quản trị nhân sự, phân ca, báo cáo doanh thu hoặc dashboard barista. Vẫn phải có cơ chế hợp lệ để kiểm chứng chuyển trạng thái đơn |
| OUT-04 | Giao hàng và nhiều chi nhánh | Không quản lý địa chỉ giao, shipper, bản đồ, phí vận chuyển, kho nhiều cửa hàng hoặc chọn chi nhánh |
| OUT-05 | Ưu đãi và loyalty nâng cao | Chưa cộng dồn mã, quota chiến dịch, đổi điểm, hạng thành viên hoặc điểm hết hạn; không tự thêm các biến thể để tăng số bảng/use case |
| OUT-06 | Tài khoản mở rộng | Chưa thêm đăng nhập mạng xã hội, quên mật khẩu hoặc refresh token vào MVP kế thừa. Nếu nhóm chọn thêm phải ghi nhận thay đổi phạm vi |
| OUT-07 | Ghi đơn/thanh toán offline | Không chấp nhận giao dịch nghiệp vụ chỉ dựa vào dữ liệu offline rồi tự gửi bù mà thiếu xác nhận/kiểm tra server |
| OUT-08 | Tích hợp vận hành kinh doanh thật | Chưa có hóa đơn thuế, POS, nhà cung cấp nguyên liệu hoặc dữ liệu khách hàng thật |

Một nội dung ngoài phạm vi chỉ được đưa vào backlog thực hiện sau khi ghi rõ lý do, ảnh hưởng và kết quả review; không thêm chỉ vì stakeholder có nhắc tới hoặc sơ đồ có chỗ để biểu diễn.

## 6. Chính sách kế thừa đang đề xuất để review

Các chính sách sau đã được cụ thể hóa trong bản nháp Sprint 3 của Assignment 1 để làm cơ sở tiếp tục thiết kế. Chưa mặc định cả nhóm phê duyệt hoặc code/test đã đáp ứng. Nhóm cần review trước khi chốt thành baseline SRS của Assignment 2.

| Tham chiếu | Chính sách trong bản nháp hiện tại | Việc cần chốt |
|---|---|---|
| DEC-06 | Tạo PENDING chưa dọn giỏ; FAILED/chưa rõ vẫn giữ và khóa phần checkout; chỉ dọn đúng giỏ sau trạng thái thanh toán thành công hiện tại | Vòng đời giỏ, khôi phục yêu cầu, bảo vệ chủ/revision và tương thích storage Sprint 2 |
| Giữ hàng / DEC-09 | Hạn thanh toán 15 phút từ khi tạo đơn; chỉ Product tính theo ly; Topping không giữ/trừ kho; retry không gia hạn | Tồn kho seed, giữ/trừ/trả kho, task hết hạn và ca tranh chấp đồng thời |
| DEC-01 | Hủy trước trả tiền giải phóng giữ kho; PAID được hủy trước PREPARING với hoàn mô phỏng toàn phần, trả kho và thu hồi điểm đúng một lần | Schema, phân xử với pha chế, bù trừ và giữ lịch sử |
| DEC-02 | Mock cục bộ trong NestJS, không I/O/tác động tiền bên ngoài; kết quả cuối và đơn/kho/điểm trong cùng transaction | Demo đổi cấu hình backend rồi restart; replay key cũ giữ kết quả, lần mới dùng key mới cùng đơn; kiểm chứng rollback/recovery |
| DEC-03 | Một mã mẫu DEMO10: giảm 10%, trần 20.000đ, đơn từ 50.000đ; điểm floor(total/10.000); tổng đơn từ 1đ | Cấu hình và thời gian hiệu lực seed, cách làm tròn, entry điểm 0; các con số là đề xuất demo, không do đề bài ấn định |
| DEC-04 | UI hiển thị giá dự kiến; khách chọn Tạo và xem đơn, lưu pending v2 rồi tạo PENDING; đọc Order để xem tổng chính thức trước xác nhận thanh toán. Không API báo giá riêng; pending v1/v2 chưa rõ thử lại nguyên key/body | Contract và kế hoạch tích hợp backend/BFF/storage; không bật yêu cầu mới khi nền chưa sẵn sàng |

Không cần đưa tên bảng, trường vật lý, toàn bộ mã lỗi hoặc thuật toán transaction vào Task 1.1. SRS mô tả hành vi và điều kiện nghiệm thu; chi tiết hiện thực được truy vết sang thiết kế phù hợp.

## 7. Giả định

| Mã | Giả định làm cơ sở soạn thảo | Cách xác minh hoặc xử lý khi thay đổi |
|---|---|---|
| A-01 | MVP mô phỏng một cửa hàng, nhận đồ tại quầy; danh mục và tồn kho dùng dữ liệu mẫu có kiểm soát | Nhóm review với phạm vi đề; nếu có nhiều chi nhánh/giao hàng phải đánh giá thay đổi |
| A-02 | Người dùng có kết nối mạng khi đặt và thanh toán; trình duyệt có thể mất phản hồi hoặc tải lại | Có ca lỗi mạng và phục hồi; không coi timeout là thanh toán thất bại chắc chắn |
| A-03 | Payment Service mô phỏng thành công/thất bại, không gọi nhà cung cấp tiền thật | Đối chiếu thiết kế và demo; nếu chuyển sang dịch vụ ngoài phải thiết kế lại ranh giới và recovery |
| A-04 | Nhóm tiếp tục dùng repository BrewLite, dữ liệu và chức năng đã xây trong Assignment 1 | Kiểm tra tương thích trước tích hợp; không xây một bộ auth/schema song song hoặc xóa lịch sử để làm lại bài |
| A-05 | PO đã chọn chính sách Sprint 3 làm cơ sở giao việc; chưa có xác nhận review của toàn nhóm cho SRS A2 | Các bạn kiểm tra phần phụ trách theo bản giao này; phản hồi cụ thể bằng mã FR/AC/contract, lưu kết quả review trên repo |
| A-06 | Bối cảnh và kỳ vọng hiện dựa trên đề/tài liệu nội bộ, chưa phải kết quả khảo sát cửa hàng thực tế | Nếu có phỏng vấn hoặc phản hồi mới, ghi nguồn, ngày và tác động đến phạm vi |

## 8. Ràng buộc

| Mã | Ràng buộc | Căn cứ / ảnh hưởng |
|---|---|---|
| C-01 | Dùng Next.js, NestJS và PostgreSQL; Docker phục vụ đóng gói/chạy theo yêu cầu bài | Assignment 2 mục 1.1, 6–7; không thay ba thành phần bắt buộc |
| C-02 | Frontend theo hướng mobile-first/PWA | Assignment 2 mục 1.1; phải làm rõ tiêu chí PWA trong SRS và kiểm chứng khi triển khai |
| C-03 | Năm task được hoàn thành theo thứ tự; task sau chỉ được nghiệm thu khi tạo phẩm bắt buộc task trước đã có trên repo, có lịch sử thay đổi | Assignment 2 mục 1, 6.2 và 8; bản nháp hiện tại chưa đáp ứng điều kiện nghiệm thu Task 1 |
| C-04 | Giữ nguyên hồ sơ lịch sử và migration đã áp dụng; thay đổi tiếp theo dùng phiên bản/commit mới và có lý do | Kế thừa Sprint 1–2 và yêu cầu quản lý tài liệu của Assignment 2; kiểm chứng chuyển đổi dữ liệu trước khi tích hợp |
| C-05 | Xác thực, validate và quyền sở hữu được kiểm tra ở backend; mật khẩu được băm, JWT không đưa cho JavaScript theo contract BFF kế thừa; không đưa secret vào repo/log | Assignment 1 mục 4/Task 7 và Sprint 2 P04/P05; Assignment 2 mục 7.4 |
| C-06 | Kế thừa mục tiêu API dưới 500 ms với dữ liệu mẫu từ Assignment 1; môi trường, phép đo và ngưỡng của từng NFR phải được đặc tả tiếp | Chưa có kết quả đo Assignment 2. Timeout UI/BFF là giới hạn dừng chờ, không thay bằng chứng đạt hiệu năng |
| C-07 | Có CI quality gate, kiểm thử, production HTTPS, database production không public trực tiếp và khả năng tái tạo/rollback theo đề | Assignment 2 Task 4–5; không nghiệm thu production chỉ từ Compose local hoặc deployment diagram |
| C-08 | Dùng năm vị trí A–E hiện có; hạn cả hai assignment 15/11/2026 do PO cung cấp, chưa xác nhận giờ LMS | Kế hoạch A2 đi song song phần A1, có cổng nghiệm thu Task 1→5; không sao chép tên ba Sprint A1 thành hai Sprint A2. Mục tiêu đóng gói ngày 14/11 |

## 9. Rủi ro ban đầu

Các đầu mối dưới đây là đề xuất theo vai trò đang có, không phải xác nhận giao việc hoặc deadline mới.

| Mã | Rủi ro và tác động | Hướng xử lý | Đầu mối đề xuất |
|---|---|---|---|
| R-01 | Contract auth, orders và schema giữa các nhánh chưa khớp, làm chậm tích hợp | Dùng chung nền đã review; đối chiếu contract, dependency và migration; kiểm thử luồng HTTP thật | C/D/E, A phối hợp frontend |
| R-02 | Đưa nhầm phương án Sprint 3 thành yêu cầu đã phê duyệt hoặc coi test riêng là tích hợp đạt | Tách trạng thái đề xuất/đã duyệt/đã triển khai/đã kiểm chứng; review mục 6 và lưu bằng chứng theo commit | A/PO và nhóm |
| R-03 | Gửi lại hoặc đặt đồng thời tạo trùng, sai kho, cộng điểm lặp | Đặc tả idempotency, transaction, optimistic locking, chuyển trạng thái và ca lỗi/concurrent có thể kiểm chứng | D/E, C phối hợp |
| R-04 | Phạm vi phình vì thêm admin, nguyên liệu, cổng thật hoặc quá nhiều biến thể | Dùng IN/OUT để kiểm soát thay đổi; ưu tiên luồng tối thiểu và yêu cầu bắt buộc trước | A/PO, B/SM |
| R-05 | Migration làm mất dữ liệu cũ hoặc môi trường khác không tái tạo được | Kiểm kê dữ liệu, migration mới và seed có kiểm soát; kiểm tra trên môi trường khác trước bàn giao | E và nhóm tích hợp |
| R-06 | PWA, CI/CD hoặc production được chuẩn bị muộn, thiếu minh chứng khi chấm | Chốt NFR và nền tảng ở đúng task; ghi rủi ro/phụ thuộc sớm, kiểm chứng pipeline và URL khi triển khai | Nhóm; E phối hợp môi trường |
| R-07 | Lộ secret hoặc đọc dữ liệu đơn của người khác | Cấu hình qua môi trường, kiểm tra quyền từng API, rà repo/log và kiểm thử truy cập sai chủ | C/D/E |
| R-08 | Cả A1/A2 cùng hạn 15/11, Task 3/CI/CD/PWA/production bị dồn cuối | Bắt đầu nhánh việc A2 ngay theo kế hoạch giao nhóm; từng lead báo capacity/blocker và có mốc dự phòng 13–14/11 | A/PO, B/SM và nhóm |

## 10. Nội dung cần nhóm xác nhận trước baseline

1. Phạm vi IN/OUT và kỳ vọng của stakeholder có phù hợp cách nhóm demo, nhận đồ tại quầy và yêu cầu giảng viên không?
2. Các chính sách mục 6 được giữ, chỉnh hoặc loại bỏ thế nào; thay đổi ảnh hưởng đến yêu cầu và contract nào?
3. Cơ chế nào được phép chuyển bước pha chế để kiểm chứng state machine khi chưa xây giao diện quầy?
4. Mức hỗ trợ PWA, tiêu chí khả dụng/hiệu năng và điều kiện đo nào được chọn cho SRS?
5. Ai phụ trách/review từng tạo phẩm, lịch Assignment 2 ra sao và nền tảng production nào được chọn khi làm Task 3?

Không bổ sung chức năng chỉ để trả lời các câu hỏi trên; nếu thay phạm vi phải cập nhật tài liệu và ghi nhận review.

## 11. Kiểm tra đầu ra Task 1.1 và bước kế tiếp

- [x] Có bối cảnh, vấn đề nghiệp vụ và mục tiêu sản phẩm.
- [x] Có bảng stakeholder gồm đủ sáu nhóm trong đề và kỳ vọng tương ứng.
- [x] Có ranh giới hệ thống, bảng in-scope và out-of-scope.
- [x] Có bảng giả định, ràng buộc và rủi ro ban đầu.
- [x] Có nguồn kế thừa và phân biệt chính sách đang đề xuất với yêu cầu đã được chốt.
- [ ] Nhóm review và ghi nhận điểm đồng ý/chưa đồng ý.
- [ ] Đưa phiên bản đã review vào `docs/requirements/context-and-scope.md` trên repository, kèm commit/PR và lý do thay đổi.

Gói hiện tại đã có bản nháp Task 1.2 (SRS/FR/NFR/MoSCoW/AC/master) và Task 1.3 (đặc tả duy nhất UC-09 Thanh toán không tiền mặt), cùng các mô hình Task 2. Chỉ nghiệm thu toàn bộ Task 1 khi đủ các tạo phẩm bắt buộc và lịch sử trên repo. Task 2 phải truy vết từ baseline yêu cầu đó; không coi bộ sơ đồ Assignment 1 là tự động hoàn thành Task 2.

## 12. Nguồn tham chiếu

| Nguồn | Nội dung sử dụng |
|---|---|
| `Assignment2-BrewLite.pdf`, mục 1–4, 6–9 | Mục tiêu tiếp nối dự án, Task 1.1, các đầu ra yêu cầu/mô hình, thứ tự nghiệm thu, CI/CD và bàn giao |
| `BrewLite-CongNghePhanMem.pdf`, mục 3–6, Task 8–10/mục 9 | Vision nhận đồ tại quầy, stakeholder, chức năng tối thiểu, thanh toán mock, trạng thái đơn, tồn kho và ưu đãi/điểm |
| `BrewLite_Sprint1_Analysis_Design_v1.1.docx.pdf`, mục 1, 3, 8–10 | Danh mục/size/topping, giá do backend kiểm tra, phạm vi barista và vai trò A–E |
| `BrewLite_Sprint2_Phan_Tich_Thiet_Ke_v0.6(2).docx`, P01–P10 | Phạm vi giỏ/auth/tạo đơn, phiên/cookie/BFF, yêu cầu bất biến, replay và tương thích nền |
| `docs/sprint3/DESIGN.md`, phiên bản ngày 06/11/2026 | Chính sách đề xuất giỏ–kho–hủy, mock, ưu đãi/điểm và tạo/xem đơn v2; dùng làm đầu vào review, không làm bằng chứng triển khai |

## Phạm vi quản lý trạng thái đơn

FR-13 và state machine chín cạnh thuộc phạm vi bắt buộc. Ba bước PAID → PREPARING → READY → COMPLETED được thực hiện qua CLI nội bộ gọi cùng service và assertTransition, chỉ bật khi DEMO_WORKFLOW_ENABLED=true; CLI phục vụ vận hành demo/test, không cấp quyền cho khách tự đổi trạng thái và không cập nhật status trực tiếp bằng SQL. D16 của baseline Sprint 1 chỉ đặt Barista UI/giao diện quầy đầy đủ ngoài MVP; không loại chức năng quản lý trạng thái khỏi phạm vi. Master giữ 14 UC; FR-13 được truy vết qua UC-08/09/11 và S3-ORD-01/02, không thêm actor/UC quầy trong lần hiệu đính này. Cơ chế này cần được hiện thực và kiểm thử; tài liệu chưa xác nhận đã chạy đạt.

## Quan hệ A1 và A2

A2 tiếp tục sử dụng đề tài BrewLite của A1. Nhóm chọn dùng chung repository/code và đối chiếu các chính sách S3 để tránh hai thiết kế mâu thuẫn; đề không yêu cầu phải hoàn tất A1 mới bắt đầu A2, cũng không tự biến mọi lựa chọn chi tiết của A1 thành yêu cầu bắt buộc A2. Chuẩn bị A1/A2 song song theo phân công; A2 chỉ nghiệm thu Task sau khi đủ tạo phẩm bắt buộc Task trước trên repo, theo thứ tự Task 1→5 và lịch sử thật. Hai Sprint A2 là các mốc Task 4/5, không đổi nhãn ba Sprint A1 để thay nghiệm thu. Giữ giới hạn tái sử dụng code/evidence theo đúng phiên bản, môi trường và AC; không tạo lịch sử ngược.
