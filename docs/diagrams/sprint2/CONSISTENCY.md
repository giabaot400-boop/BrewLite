# Đối chiếu Sprint 2 v0.6

> **Cách đọc hồ sơ lịch sử:** Bộ này ghi thiết kế Sprint 2 tại thời điểm
> bàn giao ngày 27/10/2026, được bổ sung vào repository ngày 10/11/2026.
> Các câu “Chưa chạy”, “chưa triển khai” và lịch đề xuất bên dưới phản ánh
> thời điểm soạn thiết kế, không phải trạng thái hiện tại của Sprint 2.
> Kết quả thực tế và giới hạn nghiệm thu xem [hồ sơ đóng Sprint 2](../../sprint2/SPRINT2_CLOSEOUT.md).
> Những hiệu đính khi triển khai, gồm bảo vệ owner/phiên ở BFF và logout,
> xem [mục lục hồ sơ Sprint 2](../../sprint2/README.md).
> Bộ hình là baseline thiết kế, không mô tả lại mọi chi tiết của code cuối sprint.

Cập nhật ngày 27/10/2026 từ v0.5 và góp ý rà soát. Phạm vi giữ Assignment 1
Task 5–7, 4 user story, 36 mã AC, 37 mã test và phân công A–E. Lịch
28/10–03/11 lúc 21:00 vẫn là phương án A duyệt để nhóm chốt.

P01–P10 và phân công nền đã được nhóm đồng ý theo cập nhật của A. V0.6
hiệu đính hợp đồng lỗi/logout, timeout và quy tắc dữ liệu dưới đây để triển khai
thống nhất; không ghi các chi tiết bổ sung đã được cả nhóm phê duyệt riêng.
Tất cả test vẫn **Chưa chạy**.

## Những điểm đã hiệu đính

| Điểm | Quy tắc v0.6 | Nơi đối chiếu |
|---|---|---|
| Giỏ rỗng và pending | Chặn xác nhận lần đặt mới từ cart rỗng; cho đúng owner thử lại snapshot có món với key/payload cũ. Lần retry có thể tạo Order đầu tiên nếu lần gửi trước chưa đến server | CART-AC-10, ORDER-AC-01, P01, D02/D05a |
| Logout token hỏng | NestJS từ chối 401 SESSION_INVALID; BFF sau kiểm tra P04 xóa cookie, trả 204 với X-BrewLite-Logout-Scope: local. Dọn cart nhưng giữ pending; không nhận là đã thu hồi server | R06/P05, D04, AUTH-11/13 |
| Phản hồi đặt đơn | Bảng P01 phân biệt 200/201, validation, giá đổi, 401, 403/413, conflict, in-progress và 5xx/mạng | P01, D02/D05a, ORDER-07/11/12/14 |
| Thời gian chờ | UI 15 s, BFF 10 s; chờ Web Lock tối đa 2 s. Lock chỉ giữ lúc đọc/ghi storage, nhả trước HTTP. Prisma v7 maxWait 1 s, timeout 2 s mỗi tx | P01/P07/P09, CART-07, AUTH-13, ORDER-10/12 |
| Lỗi theo dòng | DTO/miền dữ liệu trước PRICE_CHANGED; fieldErrors theo items[index].field của request nhận được, trước chuẩn hóa. Replay lỗi món ánh xạ chỉ số canonical về request hiện tại | Hợp đồng lỗi/P06/P07, ORDER-04/11 |
| Dữ liệu trùng | Giữ các trường đã chọn trên Order và OrderRequest; cùng owner/key/hash, ghi trong cùng tx. Ledger là nguồn replay | P07, D05b/D06, ORDER-08/09/11 |
| Snapshot RR | Snapshot có thể cũ từ câu try-lock; rollback rồi mở tx mới khi serialization hoặc unique race. Tối đa 3 lượt gồm lần đầu | P07, D05b, ORDER-10 |
| Bcrypt | Giữ cost 12; đo register/login ngay khi có API, kèm mốc bàn giao auth 30/10 trong lịch đề xuất | P08, AUTH-01/05 |
| JWT audience | Giữ aud=brewlite-web; sửa mô tả thành audience cấu hình của ứng dụng, NestJS kiểm tra đúng giá trị | JWT/P04, AUTH-05/09 |
| Nguồn và lịch sử | Ghi đủ v0.2–0.6, nguồn 1–3 đúng thứ tự; bảng LOGIN-AC-08 có ORDER-07 trong Word và ma trận | Lịch sử, truy vết, nguồn |

## Truy vết đủ 36 AC

Mỗi dòng là liên kết kế hoạch, chưa phải kết quả test. D02 là activity tổng quan; các thao tác giỏ, form đăng ký và giới hạn chi tiết đọc trong đặc tả, không đòi mỗi AC có một sơ đồ hoặc ảnh bằng chứng riêng.

| AC | Use case / thiết kế | Mã kiểm thử dự kiến | Phụ trách |
|---|---|---|---|
| CART-AC-01 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-01 | A, B hỗ trợ UI |
| CART-AC-02 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-02 | A, B hỗ trợ UI |
| CART-AC-03 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-03 | A, B hỗ trợ UI |
| CART-AC-04 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-04 | A, B hỗ trợ UI |
| CART-AC-05 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-05 | A, B hỗ trợ UI |
| CART-AC-06 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-06 | A, B hỗ trợ UI |
| CART-AC-07 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-01, S2-CART-03, S2-CART-04, S2-CART-05 | A, B hỗ trợ UI |
| CART-AC-08 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-07, S2-CART-09 | A, B hỗ trợ UI |
| CART-AC-09 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-01, S2-CART-02 | A, B hỗ trợ UI |
| CART-AC-10 | UC-05; D01/D02; P01/P09; đặc tả giỏ | S2-CART-05 | A, B hỗ trợ UI |
| REG-AC-01 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-02 | B UI, C API, E dữ liệu |
| REG-AC-02 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-02, S2-AUTH-03 | B UI, C API, E dữ liệu |
| REG-AC-03 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-04 | B UI, C API, E dữ liệu |
| REG-AC-04 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-01, S2-AUTH-13 | B UI, C API, E dữ liệu |
| REG-AC-05 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-01 | B UI, C API, E dữ liệu |
| REG-AC-06 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-02, S2-AUTH-04, S2-AUTH-13 | B UI, C API, E dữ liệu |
| REG-AC-07 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-CART-08, S2-AUTH-01, S2-AUTH-13 | B UI, C API, E dữ liệu |
| REG-AC-08 | UC-06; D01/D06; P04/P08; đặc tả đăng ký | S2-AUTH-03 | B UI, C API, E dữ liệu |
| LOGIN-AC-01 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-02 | B UI, C API; A giỏ |
| LOGIN-AC-02 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-02 | B UI, C API; A giỏ |
| LOGIN-AC-03 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-06 | B UI, C API; A giỏ |
| LOGIN-AC-04 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-05, S2-AUTH-13 | B UI, C API; A giỏ |
| LOGIN-AC-05 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-CART-08, S2-AUTH-12 | B UI, C API; A giỏ |
| LOGIN-AC-06 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-06, S2-AUTH-13 | B UI, C API; A giỏ |
| LOGIN-AC-07 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-12 | B UI, C API; A giỏ |
| LOGIN-AC-08 | UC-07; D01/D03a/D03b; P01/P04/P05/P08 | S2-AUTH-08, S2-ORDER-07 | B UI, C API; A giỏ |
| ORDER-AC-01 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-03, S2-ORDER-07 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-02 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-03, S2-ORDER-04 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-03 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-01, S2-ORDER-02, S2-ORDER-06 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-04 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-01, S2-ORDER-02, S2-ORDER-08 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-05 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-01, S2-ORDER-12 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-06 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-01, S2-ORDER-02, S2-ORDER-09 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-07 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-03, S2-ORDER-04, S2-ORDER-05, S2-ORDER-08 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-08 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-12, S2-CART-09 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-09 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-05, S2-ORDER-06 | D API; A BFF/UI; C phiên; E DB |
| ORDER-AC-10 | UC-08; D01/D02/D05a/D05b/D06; P01–P03/P06/P07/P10 | S2-ORDER-09, S2-ORDER-10, S2-ORDER-12, S2-ORDER-13, S2-ORDER-14 | D API; A BFF/UI; C phiên; E DB |

## Quy tắc kiểm tra bổ sung

- Tên S2-CART/S2-AUTH/S2-ORDER là mã test dự kiến, không phải kết quả đã chạy.
- AUTH-11/13: token sai chữ ký, đổi secret, thiếu cookie, owner sai và lỗi DB;
  kiểm tra header scope, cookie/cart và việc server có thực sự thu hồi hay không.
- ORDER-04: cùng request có dòng sai và giá đổi phải trả VALIDATION_ERROR;
  chỉ số lỗi khớp thứ tự input. ORDER-11 kiểm tra replay lỗi khi đảo thứ tự dòng.
- ORDER-08: gây lỗi giữa ghi Order và ledger, hoặc cố tạo cặp sai owner/key/hash;
  không commit dữ liệu lệch. ORDER-09 kiểm tra một cặp thành công duy nhất.
- ORDER-10: tái hiện snapshot lấy ở try-lock trước khi request khác commit,
  nhưng lock được cấp sau commit; test cả ledger SUCCEEDED và REJECTED.
  Khi gặp unique race phải dùng transaction mới để đọc lại, không query tx đã lỗi.
- ORDER-12: trì hoãn/mất phản hồi, BFF 504, UI timeout và response sai contract;
  giữ pending và đúng key/payload. 403/413 giữ pending để đối chiếu, không đổi key.
- AUTH-01/05 đo bcrypt cost 12 và thời gian endpoint sớm, trước đợt QA 02/11;
  dưới 500 ms là mục tiêu NFR, 10/15 s là ngưỡng dừng chờ, hai giá trị khác vai trò.
- Một log/video có thể minh họa nhiều AC; không yêu cầu một ảnh cho mỗi AC.

## Phạm vi và trạng thái

Giữ Product/Topping/ProductTopping của Sprint 1; thêm sáu model theo ERD Sprint 2.
Không thêm Size, Payment, stock, quên mật khẩu, promotion hoặc loyalty.
Hồ sơ này là hợp đồng triển khai, chưa chứng minh migration/build/test đã chạy.
Nghiệm thu dựa vào kết quả thực tế, không dựa vào số trang hoặc việc render hình.
ERD không thay class diagram cho một bài nộp khác.

## Lịch và phân công

Giữ các mốc 28/10, 30/10, 31/10, 01/11, 02/11, 03/11, lúc 21:00 giờ Việt Nam.
Lịch cần nhóm chốt khả năng đáp ứng; không tự ghi im lặng là đồng ý deadline.
A cart/BFF orders; B form/UI; C auth/BFF auth; D orders/QA; E schema/transaction.
Mỗi người kiểm tra phần mình, tích hợp theo phụ thuộc và review trước merge.
