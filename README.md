# BrewLite

Bộ khung khởi động Sprint 1 theo hồ sơ phân tích và thiết kế v1.0 của nhóm.
Một repository gồm frontend Next.js, TypeScript, Tailwind CSS và backend NestJS,
TypeScript, Prisma, PostgreSQL. Còn năm tuần cho toàn bộ đồ án.

## Yêu cầu trên máy

- Node.js 24, từ 24.15 trở lên trong dòng 24; npm đi kèm Node.js.
- Git và trình soạn thảo như VS Code.
- PostgreSQL chỉ cần khi C/E triển khai database; giao diện mẫu và `/health`
  có thể chạy trước khi có DB.

## Chạy lần đầu

Mở terminal tại thư mục có `package.json` gốc:

```sh
npm ci
npm run setup
npm run db:generate
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001/health
- Dừng cả hai bằng Ctrl+C.

`npm run setup` chỉ sao chép các file môi trường mẫu nếu file đích chưa tồn tại.
Lệnh không ghi đè cấu hình của thành viên khác. Không commit các file môi trường thật.

Nếu chỉ làm frontend, có thể dùng `npm run dev:frontend`. Chạy backend riêng bằng
`npm run dev:backend` trong terminal khác.

## Database cho C và E

1. Tạo một database PostgreSQL local tên `brewlite` và user có quyền sở hữu database.
2. Sửa `DATABASE_URL` trong `backend/.env` theo máy mình.
3. Chạy từ thư mục gốc:

```sh
npm run db:validate
npm run db:migrate -- --name init-products
npm run db:seed
```

Nếu user không có quyền tạo shadow database, E chuẩn bị shadow database riêng và
cấu hình theo tài liệu Prisma trước khi chạy `migrate dev`.

Schema ban đầu chỉ có Product, Topping và ProductTopping. Chưa có tồn kho, đơn hàng,
thanh toán hay đăng nhập. File PrismaService đã chuẩn bị nhưng chưa import vào
AppModule, nên `/health` không có nghĩa là database đã kết nối thành công.
C tiếp tục làm ProductsModule và hai endpoint sản phẩm theo `docs/API_CONTRACT.md`.

## Nhánh và review

`main` giữ bộ khung đã kiểm tra. Mỗi task làm trên nhánh riêng. Ít nhất một người
khác review trước khi merge; mỗi thành viên tự cập nhật tiến độ trên board.

```sh
git switch main
git pull --ff-only
git switch -c feature/menu
```

Lệnh `git pull` chỉ dùng sau khi repo đã có remote chung. Bản đóng gói ban đầu là
repo local; xem `docs/GIT_WORKFLOW.md` để đưa lên GitHub.

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
Checklist từng task nằm ở `docs/SPRINT1_CHECKLIST.md`.

## Tài liệu tham khảo

- https://nextjs.org/docs/app/getting-started/installation
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://docs.nestjs.com/first-steps
- https://www.prisma.io/docs/orm/v7

Các dependency trực tiếp được chọn theo phiên bản tương thích tại lúc khởi tạo;
`package-lock.json` khóa phiên bản cài đặt cho cả nhóm. Dùng `npm ci` sau khi clone.
