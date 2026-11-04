# Sprint 2 — cải thiện hiệu năng xác thực

Ngày kiểm tra: 04/11/2026. Bản sửa: `38cecc5`, PR [#26](https://github.com/giabaot400-boop/BrewLite/pull/26), trên nền main `ec042b5`.

## Vấn đề và phương án

Assignment 1 mục 4.2 yêu cầu API dưới 500ms với dữ liệu mẫu; Sprint 2 v0.6 P08 chọn bcrypt cost 12. Lượt đo trước sửa (`BrewLite_S2_Closeout_Result_1793781471823.json`) có register 1/5 và login 2/5 mẫu vượt ngưỡng. Register cao nhất 660,450ms; login cao nhất 545,187ms.

Đo riêng trên máy A cho thấy thời gian hash/compare của bcryptjs khoảng 400ms. Kết quả benchmark được ghi trong console của `BrewLite_S2_Bcrypt_Compare_Result_1793783036079.json`:

| Thư viện, cost 12 | Hash trung bình (ms) | Compare trung bình (ms) |
|---|---:|---:|
| bcryptjs 3.0.3 | 407,511 | 403,320 |
| bcrypt native 6.0.0 | 336,299 | 333,393 |

Native giảm khoảng 17% thời gian xử lý trong lượt benchmark này. Bốn nhóm kiểm tra tương thích hai chiều (ASCII, Unicode 72 byte, emoji 72 byte, dấu cách đầu/cuối) đạt 4/4 theo console. Kết quả HTTP sau sửa được đo riêng ở phần dưới.

## Thay đổi

- Hash/compare runtime dùng `bcrypt` 6.0.0, vẫn async và cost 12.
- Giữ `bcryptjs` trong devDependencies để kiểm tra hash cũ; thêm `@types/bcrypt` 6.0.0.
- Login tiếp tục dùng hash hiện có, không ghi lại hash. Validation mật khẩu, chuẩn hóa email, JWT/session, API, cookie/BFF và schema/migration được giữ nguyên.
- Bổ sung test AuthService: hash cũ cost 12, đăng ký bằng native đọc được bằng thư viện cũ, sai mật khẩu không cấp phiên, ASCII/Unicode/emoji 72 byte, dấu cách và các đầu vào không hợp lệ theo P08.

## Kiểm tra tự động

Trên máy A, 37/37 test auth đạt; backend typecheck/build và diff check không báo lỗi. Môi trường triển khai Linux ghi nhận 50/50 backend test tại bản sửa auth: 37 auth, 6 canonical, 7 OrdersService. Các bộ unit dùng Prisma giả; kết quả PostgreSQL nằm ở lượt HTTP bên dưới.

## HTTP và PostgreSQL sau sửa

Báo cáo gốc `BrewLite_S2_Auth_Performance_Result_1793784786074.json` đã được đối chiếu đủ 20 mẫu với bảng tổng hợp. Lượt chạy bắt đầu lúc 16:33:01 ngày 04/11/2026 (UTC+7).

| Thành phần | Môi trường |
|---|---|
| Máy | Windows 10 x64, Intel i5-6200U @ 2.30GHz, 4 CPU logic, RAM 19,87 GiB |
| Runtime | Node 24.16.0; bản backend đã build và khởi động lại với bcrypt native 6.0.0 |
| API/DB | NestJS `http://127.0.0.1:3002`; PostgreSQL test `brewlite_s2_a_auth_test` |
| Phép đo | 5 request tuần tự mỗi API; tính cả đọc hết response; bước chuẩn bị dữ liệu nằm ngoài 20 mẫu |

**Chức năng 5/5 đạt:** backend và DB test khớp phiên; đăng ký lưu hash cost 12; login hash bcryptjs cost 12 cũ không ghi lại hash; TTL 3600s/expiration giữ nguyên qua /me; logout thu hồi các phiên đã đo.

| API | n | Min (ms) | Mean (ms) | Max (ms) | Kết quả <500ms |
|---|---:|---:|---:|---:|---|
| POST /auth/register | 5 | 340,349 | 350,860 | 385,749 | 5/5 đạt |
| POST /auth/login | 5 | 339,869 | 359,898 | 387,496 | 5/5 đạt |
| GET /auth/me | 5 | 3,561 | 4,037 | 4,416 | 5/5 đạt |
| POST /auth/logout | 5 | 4,211 | 6,361 | 13,011 | 5/5 đạt |

Số đo từng lần (ms):

| API | Lần 1 | Lần 2 | Lần 3 | Lần 4 | Lần 5 |
|---|---:|---:|---:|---:|---:|
| POST /auth/register | 385,749 | 342,757 | 340,349 | 343,319 | 342,124 |
| POST /auth/login | 348,699 | 339,869 | 367,297 | 356,127 | 387,496 |
| GET /auth/me | 4,073 | 3,732 | 4,416 | 3,561 | 4,405 |
| POST /auth/logout | 13,011 | 4,863 | 4,731 | 4,990 | 4,211 |

JSON ghi sourceHead `ec042b5` vì lượt chạy thực hiện trên cây làm việc đã áp dụng patch, trước khi commit bản sửa thành `38cecc5`. Trường này xác định commit nền; phiên bản thực thi được đối chiếu bằng patch, dependency/dist native và trình tự build/khởi động lại.

## Kết luận và phạm vi

Cả 20 mẫu auth sau sửa đều dưới 500ms; cost 12 và khả năng đăng nhập bằng hash cũ được giữ. Kết quả trước sửa vẫn là baseline để đối chiếu.

Phép đo này trực tiếp NestJS, tuần tự trên máy A; không bao gồm BFF/UI hoặc thử tải. Sáu nhóm API khác của lượt baseline không được đo lại ở đây. Kết quả của hai lượt được báo cáo riêng.

## Chạy kiểm tra

```powershell
npm ci
node --import tsx --test backend/src/auth/auth.service.test.ts backend/src/auth/auth-session-review.test.ts backend/src/auth/auth-password-compat.test.ts
npm run typecheck --workspace backend
npm run build --workspace backend
```

Để đo HTTP, khởi động lại backend vừa build bằng `.env.test` đúng database/cổng test rồi chạy `BrewLite_S2_Auth_Performance_Check.cjs` từ thư mục gốc repo. Công cụ đối chiếu database với phiên backend trước các HTTP ghi.

## Tham chiếu

- https://github.com/kelektiv/node.bcrypt.js — API async và định dạng hash.
- `backend/src/auth/auth-password-compat.test.ts` — test tương thích hash và đầu vào.
- `BrewLite_S2_Closeout_Result_1793781471823.json` — số đo trước sửa.
- `BrewLite_S2_Auth_Performance_Result_1793784786074.json` — số đo sau sửa; bản tải lên có thêm hậu tố `(1)` trong tên file.
