# Bàn giao database Sprint 1 — Thành viên E

> Tài liệu giữ nội dung bàn giao database của E tại thời điểm mở PR #6.
> PR #6 hiện đã merge; migration và seed đã được kiểm tra thêm trên máy A.
> Phần Product API cũng đã tích hợp qua PR #7.
> Xem SPRINT1_CHECKLIST.md để theo dõi kết quả và việc còn lại.

## Công nghệ và phạm vi
- PostgreSQL 17, Prisma.
- Ba bảng: products, toppings, product_toppings.
- ProductTopping biểu diễn quan hệ nhiều–nhiều.
- Giá lưu bằng số nguyên VND; giá Product là giá size S.

## Thiết lập trên máy thành viên khác
1. Cài Node.js 24 và PostgreSQL.
2. Cài dependency và tạo env tại thư mục gốc:

```powershell
npm.cmd ci
npm.cmd run setup
```

3. Tạo database PostgreSQL và tài khoản sở hữu database.
4. Điền DATABASE_URL trong backend/.env theo máy mình.
5. Chạy:

```powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd exec --workspace backend -- prisma migrate deploy
npm.cmd run db:seed
```

Dùng migrate deploy để áp dụng migration đã có.
Không tạo lại migration init-products trên từng máy.
Không commit hoặc chia sẻ file .env chứa mật khẩu.

## Dữ liệu mẫu
- 4 sản phẩm.
- 2 topping: cream và pearl.
- 2 liên kết: coffee-milk với cream và pearl.
- Seed dùng upsert trong transaction.

## Đã kiểm tra trên máy E
- Prisma validate và generate thành công.
- Migration tạo và áp dụng thành công.
- Seed thành công; truy vấn xác nhận số lượng 4 / 2 / 2.
- Typecheck và build frontend/backend thành công.

## Bàn giao và việc còn lại
- PR #6 đang chờ review.
- C triển khai Product API từ database.
- A tích hợp frontend với API.
- D kiểm thử API và luồng tích hợp.
- Cần một thành viên khác kiểm tra cài đặt theo hướng dẫn này.
- /health hiện không xác nhận kết nối database.
## Kiểm tra khởi động
- Lint frontend thành công.
- Frontend mở được tại http://localhost:3000, hiển thị menu bằng fixture.
- Backend GET /health trả {"status":"ok","service":"brewlite-api"}.
- Chưa xác nhận Product API và tích hợp frontend với database.