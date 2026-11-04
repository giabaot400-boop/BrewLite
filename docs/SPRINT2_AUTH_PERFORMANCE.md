# Sprint 2 — bcrypt native ở cost 12

## Vấn đề và thay đổi

Baseline code: `ec042b5` (PR #24). Nguồn: Assignment 1 mục 4.2 API dưới 500ms và Sprint 2 v0.6 P08, bcrypt cost 12. Đây là sửa hiệu năng auth sau tích hợp, không đổi hợp đồng API hoặc thời hạn phiên.

A đo 5 mẫu mỗi nhóm qua NestJS 3002/PostgreSQL test, báo cáo `BrewLite_S2_Closeout_Result_1793781471823.json`: chức năng 9/9 đạt nhưng register max 660,450ms và login max 545,187ms. JSON đã được đọc: register 1/5, login 2/5 mẫu vượt 500ms; sáu nhóm còn lại dưới ngưỡng trong mẫu đo. Máy A: Windows x64, i5-6200U, Node 24.16.0; ban đầu 4 sản phẩm mẫu. Không dùng trung bình dưới ngưỡng để gọi mọi mẫu đạt.

Đo riêng hai thư viện trên cùng máy A, theo console `BrewLite_S2_Bcrypt_Compare_Result_1793783036079.json`:

| Implementation, cost 12 | Hash mean (ms) | Compare mean (ms) |
|---|---|---|
| bcryptjs 3.0.3 | 407,511 | 403,320 |
| bcrypt native 6.0.0 | 336,299 | 333,393 |

Native giảm khoảng 17% thời gian trong lượt đo riêng này. Kiểm tra tương thích hai chiều ASCII/Unicode 72 byte/emoji 72 byte/dấu cách đầu-cuối: 4/4 đạt theo console A gửi; chưa trực tiếp đọc JSON benchmark đó. Đây chưa phải kết quả HTTP của bản sửa.

- Runtime đổi import hash/compare từ `bcryptjs` sang `bcrypt` 6.0.0, vẫn async và cost 12.
- `bcryptjs` được giữ trong devDependencies để test hash cũ và tương thích hai chiều; thêm `@types/bcrypt` 6.0.0 cho TypeScript.
- Login đọc hash hiện có, không rewrite/rehash. Không đổi password validation, normalize email, JWT/session, schema, migration, cookie/BFF hoặc frontend.
- Bộ test mới gọi AuthService thật với Prisma giả: login hash cũ cost 12 không ghi lại hash, sai password không cấp phiên; đăng ký tạo hash cost 12 đọc được bằng thư viện cũ; ASCII 15/72 byte, Unicode/emoji 72 byte, dấu cách và các input không hợp lệ theo P08.

## Kết quả và cách kiểm tra

Môi trường triển khai của trợ lý: **50/50 backend test đạt**, gồm 37 auth (21 cũ + 16 mới), 6 canonical và 7 OrdersService. Backend typecheck và build đạt. Test dùng Prisma giả, chưa thay kết quả HTTP/PostgreSQL trên máy A sau đổi implementation.

```powershell
npm ci
node --import tsx --test backend/src/auth/auth.service.test.ts backend/src/auth/auth-session-review.test.ts backend/src/auth/auth-password-compat.test.ts backend/src/orders/order-canonical.spec.ts backend/src/orders/orders.service.spec.ts
npm run typecheck --workspace backend
npm run build --workspace backend
```

Sau build phải dừng và khởi động lại backend test bằng `.env.test` đúng database `brewlite_s2_a_auth_test`, cổng 3002. Tiến trình đã chạy trước build có thể vẫn giữ module cũ trong bộ nhớ.

`BrewLite_S2_Auth_Performance_Check.cjs` là công cụ đo bổ sung: 5 mẫu register/login/me/logout (20 mẫu), đối chiếu PostgreSQL, login bằng hash bcryptjs cost 12 cũ và kiểm tra không ghi lại hash. Script tự kiểm tra source dependency/dist native và database trước HTTP ghi. Không qua BFF/UI, không thay benchmark HTTP thành benchmark thuật toán.

### Kiểm tra trên máy A sau sửa — 04/11/2026

A chạy 37 test auth: 37 đạt, không fail hoặc skip. Backend typecheck, build và `git diff --check` không báo lỗi.

Sau khi khởi động lại backend test, A chạy công cụ HTTP trên PostgreSQL riêng `brewlite_s2_a_auth_test`, NestJS cổng 3002. Theo console A cung cấp, báo cáo được tạo là `BrewLite_S2_Auth_Performance_Result_1793784786074.json`; chưa trực tiếp đọc file JSON này.

| API | Số mẫu | Min (ms) | Max (ms) | Mean (ms) | Kết quả mẫu đo |
|---|---:|---:|---:|---:|---|
| POST /auth/register | 5 | 340,349 | 385,749 | 350,860 | 5/5 dưới 500ms |
| POST /auth/login | 5 | 339,869 | 387,496 | 359,898 | 5/5 dưới 500ms |
| GET /auth/me | 5 | 3,561 | 4,416 | 4,037 | 5/5 dưới 500ms |
| POST /auth/logout | 5 | 4,211 | 13,011 | 6,361 | 5/5 dưới 500ms |

**Chức năng 5/5 đạt**: phiên backend khớp database test; đăng ký lưu hash cost 12; đăng nhập được bằng hash bcryptjs cost 12 cũ mà không ghi lại hash; TTL và thời điểm hết hạn giữ nguyên qua các lần gọi /me; logout thu hồi các phiên đã đo.

**NFR dưới 500ms đạt trong cả 20 mẫu auth của lượt đo sau sửa.** Đây là đo tuần tự HTTP cục bộ, gồm đọc hết phản hồi; chưa phải kiểm thử tải hoặc cam kết độ trễ cho mọi môi trường. Lượt baseline trước sửa vẫn được giữ để đối chiếu. Sáu nhóm API khác đã đo trong baseline không được đo lại trong lượt auth này; không gộp thành một lượt 40 mẫu sau sửa.

Không chạy lại 315 frontend test chỉ vì import backend đổi. Không hạ cost, không tự chấp nhận ngoại lệ NFR và không kết luận toàn bộ AC/DoD Sprint 2 đã đạt từ bản sửa này.

## Nguồn triển khai

- https://github.com/kelektiv/node.bcrypt.js — API async, hỗ trợ nền tảng và định dạng hash.
- `backend/src/auth/auth-password-compat.test.ts` — các trường hợp tương thích thực thi trong repo.
