# Bàn giao database Sprint 1 — Thành viên E

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

## Kiểm thử tích hợp Product API — 25/10/2026

Bản kiểm thử: code C tại commit d82837b kết hợp migration E.
Nhánh kiểm thử local: test/e-product-api.
Cấu hình backend: DEMO_MODE=false, kết nối PostgreSQL local.

Kết quả:
- Migration status: database đã đồng bộ.
- Seed chạy thành công.
- Typecheck và build frontend/backend thành công.
- GET /health: 200, status ok.
- GET /products: 200, đủ 4 sản phẩm.
- GET /products/coffee-milk: 200, giá 35000.
- Size S/M/L có phụ thu 0/5000/10000.
- Topping cream giá 7000, pearl giá 5000.
- ID không tồn tại: 404, message "Product not found".

Bằng chứng: ảnh Terminal của các lệnh kiểm tra.
Chưa xác nhận frontend đã chuyển từ fixture sang API thật.