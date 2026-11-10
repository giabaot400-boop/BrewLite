# BrewLite — Assignment 1

Repository A1: https://github.com/giabaot400-boop/BrewLite.
Assignment 2 có [repo và bộ source riêng](https://github.com/giabaot400-boop/BrewLite-Assignment2).

Ứng dụng BrewLite sử dụng Next.js, TypeScript, Tailwind CSS và backend
NestJS, Prisma, PostgreSQL.

Sprint 1 triển khai menu, chi tiết sản phẩm, chọn size/topping và tính giá
xem trước theo hồ sơ phân tích và thiết kế v1.1.

Product API và migration PostgreSQL đã tích hợp vào main qua PR #6 và #7.
Việc nghiệm thu Sprint 1 được đối chiếu riêng theo checklist AC/DoD,
kết quả kiểm thử, Sprint Review và Retrospective.

## Yêu cầu trên máy

- Node.js 24, từ 24.15 trở lên trong dòng 24; npm đi kèm Node.js.
- Git và trình soạn thảo như VS Code.
- PostgreSQL 17 cho backend và kiểm thử tích hợp.
- Tài khoản PostgreSQL có quyền sở hữu database local của dự án.

Backend hiện khởi tạo kết nối PostgreSQL khi chạy. Cần cấu hình database
trước khi khởi động cả hai ứng dụng.

## Cài đặt lần đầu

Mở terminal tại thư mục gốc của repository, nơi có package.json:

```sh
npm ci
npm run setup
```

Lệnh setup tạo các file sau nếu chúng chưa tồn tại:

- apps/api/.env
- apps/web/.env.local

Lệnh không ghi đè cấu hình đã có. Không commit các file môi trường thật.

## Cấu hình database và API thật

1. Tạo tài khoản PostgreSQL và database local tên brewlite.
2. Điền DATABASE_URL trong apps/api/.env bằng thông tin của máy mình.
3. Kiểm tra cấu hình backend:

```dotenv
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
DEMO_MODE=false
```

Giữ DATABASE_URL đã cấu hình. Nếu mật khẩu có ký tự đặc biệt, cần mã hóa
phần mật khẩu khi đưa vào URL; ví dụ ký tự @ được viết thành %40.
Mật khẩu dùng khi đăng nhập psql vẫn giữ nguyên.

4. Trong apps/web/.env.local, đặt:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PRODUCTS_SOURCE=api
```

Cấu hình mẫu hiện mặc định dùng fixture. Thành viên chạy tích hợp phải
chủ động chuyển sang api, kể cả khi đã chạy setup trước đó.

5. Từ thư mục gốc, chạy lần lượt:

```sh
npm run db:generate
npm run db:validate
npm exec --workspace apps/api -- prisma migrate deploy
npm run db:seed
```

migrate deploy áp dụng migration đã có trong repository.
Thành viên thiết lập máy mới không tạo lại migration init-products.

Người thay đổi schema phải tạo migration mới trên nhánh phần việc,
review trước khi merge và không sửa migration đã được áp dụng.

Dữ liệu seed mẫu:
- 4 sản phẩm.
- 2 topping: cream và pearl.
- 2 liên kết topping với coffee-milk.

Seed dùng upsert, không tạo thêm dòng trùng khi chạy lại với dữ liệu mẫu.
Seed cũng cập nhật lại thông tin các sản phẩm/topping mẫu theo seed.ts.

## Chạy ứng dụng

Sau khi cấu hình database, migration và seed thành công:

```sh
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Kiểm tra tiến trình backend: http://localhost:3001/health
- Danh sách sản phẩm: http://localhost:3001/products
- Chi tiết mẫu: http://localhost:3001/products/coffee-milk

Dừng bằng Ctrl+C.

Có thể chạy riêng trong hai terminal tại thư mục gốc:

```sh
npm run dev:frontend
```

```sh
npm run dev:backend
```

Sau khi thay đổi biến môi trường, khởi động lại ứng dụng tương ứng.

Endpoint /health chỉ trả trạng thái tiến trình, không thực hiện truy vấn
kiểm tra database. Dùng Product API để kiểm tra luồng đọc dữ liệu thực tế.

## Chế độ fixture cho frontend

Khi chỉ phát triển giao diện, có thể đặt:

```dotenv
NEXT_PUBLIC_PRODUCTS_SOURCE=fixture
```

Sau đó chạy npm run dev:frontend.

Fixture chỉ hỗ trợ phát triển và kiểm thử giao diện. Kết quả chạy fixture
không thay thế kiểm thử frontend với Product API và PostgreSQL thật.

Backend có DEMO_MODE, nhưng chế độ này vẫn khởi tạo Prisma và cần database;
không coi đây là chế độ chạy backend độc lập khi chưa có PostgreSQL.

## PWA

Bản production bổ sung manifest, icon và trang offline chung. Service worker chỉ
cache tài nguyên công khai đã chọn; dữ liệu API, phiên và giao dịch không được
cache hoặc tự gửi lại. Hướng dẫn A2 được duy trì ở [repo A2](https://github.com/giabaot400-boop/BrewLite-Assignment2)
để build/start đúng môi trường, kiểm tra cài đặt và thử mất mạng. Các AC PWA cần
bằng chứng browser/production riêng, không suy ra từ build thành công.

## Nhánh và review

Repository A1: https://github.com/giabaot400-boop/BrewLite

main chứa bản tích hợp đã được review. Mỗi task làm trên nhánh riêng,
có ít nhất một thành viên khác review trước khi merge.
Mỗi thành viên tự cập nhật tiến độ trên board.

Ví dụ bắt đầu phần việc mới:

```sh
git switch main
git pull --ff-only origin main
git switch -c feature/ten-cong-viec
```

Thay tên nhánh ví dụ bằng tên phù hợp với phần việc thực tế.

Xem docs/guides/GIT_WORKFLOW.md để cập nhật nhánh và xử lý tích hợp.
Các hướng dẫn tạo repository/remote lần đầu trong tài liệu đó
chỉ áp dụng khi khởi tạo repository mới.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| apps/web/ | Ứng dụng Next.js, giao diện và phần gọi API |
| apps/api/ | Ứng dụng NestJS, Product API và kết nối Prisma |
| apps/api/prisma/ | Schema, migration và seed PostgreSQL |
| docs/ | API contract, workflow, checklist và kết quả kiểm tra |
| scripts/ | Script hỗ trợ thiết lập môi trường |
| package.json | Workspace và các lệnh chạy chung |
| package-lock.json | Khóa phiên bản dependency dùng chung |

### Chuyển từ frontend/backend sang apps/web và apps/api

Hai ứng dụng đã được chuyển sang `apps/web` và `apps/api` qua PR #30.
Sau khi tách A1/A2 thành hai repo, A1 tiếp tục giữ layout này; không cần chuyển ngược.
Tên package `@brewlite/frontend`, `@brewlite/backend` và các
lệnh gốc `dev:frontend`, `dev:backend` được giữ để hạn chế đổi cách chạy.
Khi dùng đường dẫn workspace trực tiếp, thay `--workspace frontend` bằng
`--workspace apps/web`, và `--workspace backend` bằng `--workspace apps/api`.

Dừng các tiến trình dev trước khi cập nhật nhánh hoặc áp dụng patch. Sau khi
chuyển các file được Git quản lý, chạy từ thư mục gốc:

```sh
npm run setup
npm ci
```

Setup chuyển các file cấu hình local `.env`, `.env.local`, `.env.test` và các
file `.env.*` khác từ hai thư mục cũ sang thư mục mới tương ứng, rồi chỉ tạo
cấu hình mẫu còn thiếu. Nội dung file được giữ nguyên, không in secret.
Nếu một đích đã tồn tại, setup dừng trước khi chuyển bất kỳ file cấu hình nào;
giữ cả hai bản để đối chiếu, không ghi đè. Không commit file môi trường thật.

Các thư mục cache/dependency cũ có thể còn trên máy sau khi áp dụng patch;
workspace mới không chạy từ các thư mục đó. Không chuyển `.next`, `dist`,
`node_modules` hoặc Prisma Client đã sinh; `npm ci` và build/generate tạo lại
chúng ở vị trí phù hợp. Lần chuyển này không đổi schema, migration, seed,
API, cổng hoặc dữ liệu PostgreSQL; không cần reset hay chạy lại migration
chỉ vì đổi đường dẫn.

Các hồ sơ Sprint 1–2 trong `docs/` giữ nguyên lệnh/đường dẫn tại thời điểm
kiểm tra. Khi chạy lại hiện nay, đổi tiền tố `frontend/` thành `apps/web/`,
`backend/` thành `apps/api/`; không sửa kết quả kiểm thử lịch sử.
Các script kiểm thử nằm ngoài repo cũng cần đổi đường dẫn nếu ghi cứng
hai thư mục cũ. Việc đổi layout chưa xác nhận Task 3–5 A2 đã nghiệm thu.

## Tài liệu và sơ đồ thiết kế

Xem [mục lục tài liệu A1](docs/README.md): hồ sơ được gom theo Sprint 1–2–3,
hướng dẫn kỹ thuật và sơ đồ. Tài liệu Task 1–5 A2 nằm ở repo A2 riêng.


Xem [bộ sơ đồ và mã PlantUML](docs/diagrams/README.md): bối cảnh hệ thống,
master use case, activity Sprint 1, ERD tổng thể và logical architecture. Tài liệu phân biệt phần
đã triển khai trong Sprint 1 với phần thiết kế cho các sprint sau.

## Phân công

| Vị trí | Kỹ thuật | Scrum |
|---|---|---|
| A | Menu, chi tiết, size/topping, tính giá, phân tích | Product Owner |
| B | Layout và component dùng chung, responsive | Scrum Master |
| C | Product API, auth | Phát triển |
| D | Order/payment và kiểm thử | Phát triển |
| E | Database, môi trường và tích hợp | Phát triển |

## Kiểm tra

```sh
npm run lint
npm run typecheck
npm run build
```

Các lệnh trên không thay cho kiểm thử kết nối PostgreSQL và migration/seed thực tế.
Xem [checklist và đối chiếu 24 AC](docs/sprint1/SPRINT1_CHECKLIST.md),
[tổng hợp Review/Retrospective và backlog](docs/sprint1/SPRINT1_REVIEW_RETRO.md)
và [nội dung đồng bộ báo cáo](docs/sprint1/SPRINT1_BAO_CAO_DONG_BO.md).
Hồ sơ phân biệt kết quả chức năng đã kiểm tra với quyết định chấp nhận của PO.

## Tài liệu tham khảo

- https://nextjs.org/docs/app/getting-started/installation
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://docs.nestjs.com/first-steps
- https://www.prisma.io/docs/orm/v7

Các dependency trực tiếp được chọn theo phiên bản tương thích tại lúc khởi tạo;
`package-lock.json` khóa phiên bản cài đặt cho cả nhóm. Dùng `npm ci` sau khi clone.
