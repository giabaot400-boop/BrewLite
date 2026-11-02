# BREWLITE — BÁO CÁO KIỂM THỬ SPRINT 1 (THÀNH VIÊN D)

**Dự án:** BrewLite — Website bán đồ uống

**Người thực hiện kiểm thử:** Thành viên D — Testing.

**Ngày retest do D ghi nhận:** 26/10/2026.

**Nhánh nộp báo cáo:** `feature/member-d`.

**Mốc báo cáo được rà soát:** `d8615550777dc0b9f0b75e7adbc6e980a138dfe9`; nhánh đã nhận main `c97565b4666e99eb0e718e3230615fbe938af9c2` qua merge `1aa6a1ab8cb570261e330ad691cfcb02fccc782f`. Đây là mốc của hồ sơ, không phải xác nhận phiên bản đã chạy trong từng ảnh.

**Commit mã nguồn tại từng lần kiểm thử:** D chưa ghi nhận; không thể xác định chắc chắn chỉ từ ảnh hiện có.

**Môi trường do D ghi nhận:** Windows, Chrome, Next.js `localhost:3000`, NestJS `localhost:3001`, PostgreSQL 18, Prisma.

**Phạm vi hiệu đính:** A rà nội dung và ảnh đã nộp; việc sửa báo cáo không được tính là A chạy lại các ca kiểm thử của D.

**Thư mục minh chứng:** `docs/Testing/evidence/`.

## 1. Mục tiêu và phạm vi

Kiểm tra API health, danh sách và chi tiết sản phẩm, giao diện, tính giá theo size/topping, trạng thái rỗng, lỗi/retry và thời gian phản hồi. Ngưỡng hiệu năng đã có tại **TS02-AC-05, hồ sơ Sprint 1 v1.1: API phản hồi dưới 500 ms với dữ liệu mẫu trong môi trường demo**.

`PASS (API)` chứng minh phản hồi được ghi nhận, không tự chứng minh nguồn dữ liệu PostgreSQL. Báo cáo chưa ghi `DEMO_MODE` của backend trong từng lần chạy. TC-D05 dùng fixture; nguồn dữ liệu frontend tại TC-D03, TC-D07 và TC-D08 chưa được D ghi rõ, nên không dùng các ảnh UI đó để khẳng định tích hợp API thật. Không đưa nội dung hoặc bí mật trong file env vào báo cáo.

Các kết quả và xác nhận dưới đây được giữ theo phần D đã nộp. Chúng không thay thế toàn bộ kiểm thử trên máy A hoặc nghiệm thu đủ 24 AC/DoD.

## 2. Lịch sử lỗi và khắc phục môi trường

- **Lần kiểm thử ban đầu (25/10/2026):** TC-D02 `GET /products` trả **404 Not Found**, được ghi **FAIL** tại thời điểm đó. Không xóa kết quả lịch sử.
- **Trong quá trình retest (26/10/2026):** Có thời điểm `GET /products` trả **500** do PostgreSQL chưa sẵn sàng / cấu hình kết nối chưa đúng; đây là vấn đề môi trường trong quá trình chuẩn bị retest.
- **Sau khắc phục:** PostgreSQL 18 chạy; Prisma migration `20261024160346_init_products` được áp dụng thành công; seed thành công **4 sản phẩm và 2 topping**; khởi động lại backend. `GET /products` trả **200 OK**.
- **TC-D06:** D ghi nhận đã chạy đầy đủ quy trình retry và kết luận **PASS**. Ảnh hiện có chứng minh trạng thái lỗi `GET /products` HTTP 404 và nút **Thử lại**; chưa ghi lại bước khôi phục, phản hồi sau retry hoặc việc có dùng F5 hay không. Giữ nguyên xác nhận của D, đồng thời tách rõ giới hạn bằng chứng; A chưa xác minh độc lập bước phục hồi này trong đợt rà báo cáo.

## 3. Bảng tổng hợp

| Mã     | Nội dung                         | Kết quả retest                     | Căn cứ / ghi chú                                                                  |
| ------ | -------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| TC-D01 | Health API                       | **PASS**                           | HTTP 200, `status: ok`                                                            |
| TC-D02 | Product list API                 | **PASS (retest)**                  | HTTP 200, mảng 4 sản phẩm; lần đầu FAIL 404                                       |
| TC-D03 | Tính giá size/topping            | **PASS 6/6 trường hợp được chụp**  | Trường hợp 06 là L + Kem = 52.000đ, khác tên ảnh đang lưu                         |
| TC-D04 | Đường dẫn frontend không tồn tại | **PASS**                           | Thông báo không tìm thấy trang/sản phẩm                                           |
| TC-D05 | Danh sách sản phẩm rỗng          | **PASS (fixture)**                 | Hiển thị “Hiện chưa có sản phẩm.”                                                 |
| TC-D06 | Xử lý lỗi và retry               | **PASS theo D; phục hồi chưa được A xác minh độc lập** | Ảnh chứng minh trạng thái lỗi và Network 404; chưa ghi rõ thao tác phục hồi |
| TC-D07 | Chi tiết sản phẩm hợp lệ         | **PASS (UI + API)**                | Giao diện và `GET /products/coffee-milk` HTTP 200                                 |
| TC-D08 | ID sản phẩm không hợp lệ         | **PASS (UI + API)**                | Giao diện không tìm thấy, API HTTP 404                                            |
| TC-D09 | Dữ liệu size                     | **PASS (API)**                     | S: 0, M: 5.000, L: 10.000; chưa đối chiếu trực tiếp SQL                           |
| TC-D10 | Dữ liệu topping                  | **PASS (API)**                     | Kem: 7.000, Trân châu: 5.000; chưa đối chiếu trực tiếp SQL                        |
| TC-D11 | Thời gian GET /products          | **PASS trong lần đo đã ghi nhận**   | HTTP 200, khoảng **57,6 ms < 500 ms**; TS02-AC-05                                |
| TC-D12 | Thời gian GET /products/:id      | **PASS trong lần đo đã ghi nhận**   | HTTP 200, khoảng **67,0 ms < 500 ms**; TS02-AC-05                                |

### Đối chiếu AC trong hồ sơ Sprint 1 v1.1

Bảng dưới đây chỉ ra AC mà từng ca cung cấp kết quả liên quan, không khẳng định một ca đã kiểm tra đầy đủ mọi điều kiện của AC.

| Test case | AC liên quan | Phạm vi kết quả |
|---|---|---|
| TC-D01 | Hỗ trợ TS01-AC-02 | Health trả 200; không thay thế kiểm tra build hai ứng dụng. |
| TC-D02 | TS02-AC-01 | Danh sách HTTP 200, raw array và các trường trên ảnh. |
| TC-D03 | US02-AC-03, US02-AC-04, US02-AC-05, US02-AC-06 | Sáu cấu hình giá đã chụp; không tự chứng minh mọi chuỗi thao tác, chống cộng trùng hoặc nguồn API thật. |
| TC-D04 | Kiểm tra bổ sung | 404 cho đường dẫn frontend bất kỳ; không thay thế TC-D08. |
| TC-D05 | US01-AC-03 | Giao diện empty bằng fixture; không phải database rỗng hoặc phản hồi API thật. |
| TC-D06 | US01-AC-04 | Ảnh chứng minh hiển thị lỗi; kết quả phục hồi theo xác nhận của D, có giới hạn nêu ở ca. |
| TC-D07 | TS02-AC-02, US02-AC-02 | UI chi tiết và API chi tiết được ghi nhận riêng; chưa xác nhận nguồn dữ liệu của UI. |
| TC-D08 | TS02-AC-03, US02-AC-07 | API ID không tồn tại trả 404 và UI không tìm thấy; chưa xác nhận nguồn dữ liệu của UI. |
| TC-D09, TC-D10 | TS02-AC-02, TS02-AC-04 | Giá trị sizes/toppings trong response API; không khẳng định có bảng Size trong database. |
| TC-D11, TC-D12 | TS02-AC-05 | Hai lần đo local được ghi nhận đều dưới 500 ms. |

## 4. Chi tiết test case và minh chứng

### TC-D01 — Backend Health Check

- **Thao tác:** `curl.exe -i http://localhost:3001/health`
- **Mong đợi:** HTTP 200 và JSON `{"status":"ok","service":"brewlite-api"}`.
- **Thực tế:** Đúng mong đợi. **PASS**.

![TC-D01 Health Check](evidence/TC-D01_Health_Check_PASS.png)

### TC-D02 — Danh sách sản phẩm API

- **Thao tác:** `curl.exe -i http://localhost:3001/products`
- **Mong đợi:** HTTP 200, JSON array danh sách sản phẩm.
- **Thực tế retest:** HTTP 200, trả 4 sản phẩm: Americano, Cappuccino, Cà phê sữa, Trà đào. **PASS (retest)**.
- **Lịch sử:** Lần đầu HTTP 404 **FAIL**; có lần HTTP 500 khi môi trường database chưa hoàn tất. Không thay thế lịch sử bằng kết quả mới.

![TC-D02 Products API](evidence/TC-D02-products-pass.png)

### TC-D03 — Tính giá sản phẩm Cà phê sữa

- **Giá gốc:** 35.000đ. **Công thức:** tổng = giá gốc + phụ thu size + các topping được chọn.
- **Phạm vi:** Kiểm thử thao tác chọn size/topping trên Chrome; sáu ảnh thể hiện các cấu hình và giá trong bảng. Nguồn dữ liệu frontend ở lần chạy này chưa được D ghi rõ; kết quả chỉ được ghi nhận trong phạm vi UI, không suy diễn truy vấn PostgreSQL hoặc tích hợp API thật.

| Lần | Size | Topping         | Giá mong đợi | Giá trên ảnh | Kết quả                               |
| --- | ---- | --------------- | -----------: | -----------: | ------------------------------------- |
| 01  | S    | Không           |      35.000đ |      35.000đ | PASS                                  |
| 02  | M    | Không           |      40.000đ |      40.000đ | PASS                                  |
| 03  | L    | Không           |      45.000đ |      45.000đ | PASS                                  |
| 04  | M    | Kem             |      47.000đ |      47.000đ | PASS                                  |
| 05  | L    | Kem + Trân châu |      57.000đ |      57.000đ | PASS                                  |
| 06  | L    | **Kem**         |  **52.000đ** |  **52.000đ** | PASS; **tên ảnh ghi Pearl chưa đúng** |

**Minh chứng TC-D03-01 — Size S:**

![TC-D03-01 Size S](evidence/TC-D03_01_Size_S_PASS.png.png)

**Minh chứng TC-D03-02 — Size M:**

![TC-D03-02 Size M](evidence/TC-D03_02_Size_M_PASS.png.png)

**Minh chứng TC-D03-03 — Size L:**

![TC-D03-03 Size L](evidence/TC-D03_03_Size_L_PASS.png.png)

**Minh chứng TC-D03-04 — Size M + Kem:**

![TC-D03-04 Size M Cream](evidence/TC-D03_04_Size_M_Cream_PASS.png.png)

**Minh chứng TC-D03-05 — Size L + hai topping:**

![TC-D03-05 Size L Two Toppings](evidence/TC-D03_05_Size_L_Two_Toppings_PASS.png.png)

**Minh chứng TC-D03-06 — Size L + Kem (ảnh hiện tại):**

![TC-D03-06 Size L Cream — current filename mismatched](evidence/TC-D03_06_Size_L_Pearl_PASS.png.png)

> **Ghi chú tên file:** Ảnh cuối có tên chứa `Pearl`, nhưng nội dung thực tế là L + Kem = 52.000đ. Báo cáo ghi theo nội dung ảnh và giữ đường dẫn hiện có. Đổi tên file là chỉnh sửa trình bày tùy chọn; không cần chụp lại chỉ để khớp tên file.

### TC-D04 — Đường dẫn frontend không tồn tại

- **Thao tác:** Mở `http://localhost:3000/trang-khong-ton-tai`.
- **Mong đợi:** Hiển thị giao diện không tìm thấy trang.
- **Thực tế:** Hiển thị “Không tìm thấy trang hoặc sản phẩm” và nút “Về menu”. **PASS**.

![TC-D04 Frontend 404](evidence/TC-D04-frontend-404.png.png)

### TC-D05 — Danh sách sản phẩm rỗng

- **Thao tác:** Dùng fixture rỗng `[]` và mở trang menu.
- **Mong đợi:** Hiển thị trạng thái danh sách trống.
- **Thực tế:** “Hiện chưa có sản phẩm.” **PASS (fixture)**. Sau kiểm thử cần khôi phục dữ liệu mẫu.

![TC-D05 Empty Product List](evidence/TC-D05_Empty_Product_List_PASS.png.png)

### TC-D06 — Xử lý lỗi tải menu và nút Thử lại

- **Tình huống trên ảnh:** Menu gọi nguồn API; `GET http://localhost:3001/products` trả HTTP 404. Giao diện hiển thị “Không tải được thực đơn” và nút **Thử lại**.
- **Mong đợi:** Hiển thị thông báo lỗi rõ ràng; nút Thử lại gửi lại request; sau khi dịch vụ hoạt động bình thường, có thể tải dữ liệu mà không cần F5.
- **Kết quả do D ghi nhận:** D xác nhận đã kiểm tra đầy đủ và kết luận **PASS**. Giữ nguyên xác nhận này.
- **Đối chiếu ảnh:** Ảnh hiện có chứng minh trạng thái lỗi và sự hiện diện của nút, chưa chứng minh request sau retry, danh sách phục hồi hoặc thao tác không dùng F5. Chi tiết cách D khôi phục dịch vụ chưa được ghi nhận; A chưa xác minh độc lập bước này trong đợt rà báo cáo.
- **Dẫn chiếu riêng:** Kết quả kiểm thử menu phục hồi trên máy A đã được ghi tại [SPRINT1_CHECKLIST.md](../SPRINT1_CHECKLIST.md). Không chuyển kết quả của A thành kết quả D. Phần sửa retry ở trang chi tiết trong PR #10 là luồng riêng với retry menu của ca này.

![TC-D06 Error UI and Retry Network](evidence/TC-D06-retry-network.png.png)

### TC-D07 — Chi tiết sản phẩm hợp lệ

- **Thao tác:** Mở `http://localhost:3000/products/coffee-milk`; gọi `GET /products/coffee-milk`.
- **Mong đợi:** Trang chi tiết có tên, mô tả, size, topping; API HTTP 200.
- **Thực tế:** Ảnh UI hiển thị Cà phê sữa, mô tả, các size S/M/L, topping Kem/Trân châu. Response API HTTP 200 và JSON chi tiết có tại ảnh TC-D09. **PASS trong phạm vi UI và API đã ghi nhận riêng**; nguồn dữ liệu UI chưa được D ghi rõ.

![TC-D07 Product Detail UI](evidence/TC-D07_Product_Detail_UI_PASS.png.png)

### TC-D08 — Sản phẩm không tồn tại

- **Thao tác:** Mở `http://localhost:3000/products/id-khong-ton-tai`; gọi `GET /products/id-khong-ton-tai`.
- **Mong đợi:** API HTTP 404; giao diện không tìm thấy sản phẩm.
- **Thực tế:** API trả `404 Not Found`, `Product not found`; Chrome hiển thị “Không tìm thấy trang hoặc sản phẩm”. **PASS**.

**Minh chứng API:**

![TC-D08 Invalid Product API 404](evidence/TC-D08_Invalid_Product_API_404_PASS.png)

**Minh chứng giao diện:**

![TC-D08 Invalid Product UI](evidence/TC-D08_Invalid_Product_UI_PASS.png.png)

### TC-D09 — Dữ liệu size qua API

- **Thao tác:** `curl.exe -s http://localhost:3001/products/coffee-milk | ConvertFrom-Json | Select-Object -ExpandProperty sizes | Format-Table`
- **Mong đợi / thực tế:** `S = 0`, `M = 5000`, `L = 10000`. **PASS (API)**.
- **Giới hạn:** Chưa có ảnh truy vấn SQL trực tiếp PostgreSQL.

![TC-D09 Product Sizes API](evidence/TC-D09_Product_Sizes_API_PASS.png)

### TC-D10 — Dữ liệu topping qua API

- **Thao tác:** `curl.exe -s http://localhost:3001/products/coffee-milk | ConvertFrom-Json | Select-Object -ExpandProperty toppings | Format-Table`
- **Mong đợi / thực tế:** `cream` — Kem — 7000; `pearl` — Trân châu — 5000. **PASS (API)**.
- **Giới hạn:** Chưa có ảnh truy vấn SQL trực tiếp PostgreSQL.

![TC-D10 Product Toppings API](evidence/TC-D10_Product_Toppings_API_PASS.png)

### TC-D11 — Đo thời gian GET /products

- **Thao tác:** `curl.exe -s -o NUL -w "HTTP Status: %{http_code}`nResponse Time: %{time_total} seconds`n" http://localhost:3001/products`
- **Thực tế:** HTTP 200; `0.057645` giây, khoảng **57,6 ms**.
- **Đánh giá:** **PASS theo TS02-AC-05 trong lần đo này**, vì nhỏ hơn 500 ms. Một lần đo local không chứng minh mọi lần gọi hoặc môi trường khác đều có cùng thời gian phản hồi.

![TC-D11 Products Response Time](evidence/TC-D11_Products_Response_Time.png)

### TC-D12 — Đo thời gian GET /products/coffee-milk

- **Thao tác:** `curl.exe -s -o NUL -w "HTTP Status: %{http_code}`nResponse Time: %{time_total} seconds`n" http://localhost:3001/products/coffee-milk`
- **Thực tế:** HTTP 200; `0.066977` giây, khoảng **67,0 ms**.
- **Đánh giá:** **PASS theo TS02-AC-05 trong lần đo này**, vì nhỏ hơn 500 ms. Một lần đo local không chứng minh mọi lần gọi hoặc môi trường khác đều có cùng thời gian phản hồi.

![TC-D12 Product Detail Response Time](evidence/TC-D12_Product_Detail_Response_Time.png)

## 5. Kết luận và giới hạn của báo cáo

- Có **12 nhóm test case**. TC-D01 đến TC-D05 và TC-D07 đến TC-D12 có kết quả PASS kèm ảnh trong phạm vi mô tả; riêng hiệu năng chỉ kết luận cho hai lần đo đã ghi nhận. TC-D06 được D kết luận PASS, nhưng ảnh chỉ chứng minh trạng thái lỗi; bước phục hồi chưa được A xác minh độc lập trong đợt rà này.
- TC-D02 giữ lịch sử **FAIL HTTP 404** và kết quả **PASS HTTP 200** sau khắc phục. Không xóa lỗi cũ hoặc gọi kết quả cũ là BLOCKED.
- Chưa xác định commit đã chạy trong từng lần kiểm thử, cấu hình DEMO_MODE của backend và nguồn dữ liệu UI của một số ca. Các mốc commit đầu báo cáo chỉ dùng truy vết hồ sơ, không lấp thay các thông tin còn thiếu này.
- TC-D05 là kiểm thử fixture. TC-D09/10 là kiểm tra response API; không bắt buộc tạo lại ảnh SQL chỉ để hoàn thiện báo cáo này. Kết quả migration/seed/SQL trên máy A được giữ riêng tại [SPRINT1_CHECKLIST.md](../SPRINT1_CHECKLIST.md).
- Báo cáo là một nguồn kết quả của D, **không tuyên bố đủ 24/24 AC hoặc nghiệm thu Sprint 1 hoàn tất**. PO đối chiếu cùng các kết quả khác của nhóm trong Sprint Review.
- Khi bổ sung thông tin còn thiếu, chỉ ghi theo dữ liệu hoặc xác nhận thực tế; không gán commit hiện tại cho ảnh cũ, không tự đổi nguồn fixture thành API và không ghi kiểm thử mới nếu chưa chạy.
