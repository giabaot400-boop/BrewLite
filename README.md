# BrewLite

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

- backend/.env
- frontend/.env.local

Lệnh không ghi đè cấu hình đã có. Không commit các file môi trường thật.

## Cấu hình database và API thật

1. Tạo tài khoản PostgreSQL và database local tên brewlite.
2. Điền DATABASE_URL trong backend/.env bằng thông tin của máy mình.
3. Kiểm tra cấu hình backend:

```dotenv
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
DEMO_MODE=false
```

Giữ DATABASE_URL đã cấu hình. Nếu mật khẩu có ký tự đặc biệt, cần mã hóa
phần mật khẩu khi đưa vào URL; ví dụ ký tự @ được viết thành %40.
Mật khẩu dùng khi đăng nhập psql vẫn giữ nguyên.

4. Trong frontend/.env.local, đặt:

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
npm exec --workspace backend -- prisma migrate deploy
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

## Nhánh và review

Repository chung: https://github.com/giabaot400-boop/BrewLite

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

Xem docs/GIT_WORKFLOW.md để cập nhật nhánh và xử lý tích hợp.
Các hướng dẫn tạo repository/remote lần đầu trong tài liệu đó
chỉ áp dụng khi khởi tạo repository mới.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| frontend/ | Ứng dụng Next.js, giao diện và phần gọi API |
| backend/ | Ứng dụng NestJS, Product API và kết nối Prisma |
| backend/prisma/ | Schema, migration và seed PostgreSQL |
| docs/ | API contract, workflow, checklist và kết quả kiểm tra |
| scripts/ | Script hỗ trợ thiết lập môi trường |
| package.json | Workspace và các lệnh chạy chung |
| package-lock.json | Khóa phiên bản dependency dùng chung |

## Sơ đồ thiết kế

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
Xem [checklist và đối chiếu 24 AC](docs/SPRINT1_CHECKLIST.md),
[tổng hợp Review/Retrospective và backlog](docs/SPRINT1_REVIEW_RETRO.md)
và [nội dung đồng bộ báo cáo](docs/SPRINT1_BAO_CAO_DONG_BO.md).
Hồ sơ phân biệt kết quả chức năng đã kiểm tra với quyết định chấp nhận của PO.

## Tài liệu tham khảo

- https://nextjs.org/docs/app/getting-started/installation
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://docs.nestjs.com/first-steps
- https://www.prisma.io/docs/orm/v7

Các dependency trực tiếp được chọn theo phiên bản tương thích tại lúc khởi tạo;
`package-lock.json` khóa phiên bản cài đặt cho cả nhóm. Dùng `npm ci` sau khi clone.
