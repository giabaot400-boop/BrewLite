# Chạy BrewLite bằng Docker Compose

## Yêu cầu
- Docker Desktop đang chạy Linux containers, có Docker Compose.
- Chạy các lệnh tại thư mục gốc repository.
- Cổng localhost:3000 chưa được ứng dụng khác sử dụng.

## Tạo cấu hình riêng
Chạy một lần để tạo .env.compose; không commit file này:

```powershell
node -e "const fs=require('node:fs'),c=require('node:crypto');const p='.env.compose';if(fs.existsSync(p))throw Error('File already exists; keep existing secrets.');fs.writeFileSync(p,'POSTGRES_PASSWORD='+c.randomBytes(24).toString('hex')+'\nAUTH_JWT_SECRET='+c.randomBytes(32).toString('hex')+'\n');console.log('Created .env.compose');"
git check-ignore .env.compose
docker compose --env-file .env.compose config --quiet
```

Giữ nguyên secret khi sử dụng lại volume database.

## Cài đặt lần đầu

```powershell
docker compose --env-file .env.compose build backend frontend
docker compose --env-file .env.compose up -d --wait db
docker compose --env-file .env.compose run --rm --no-deps backend npm run db:deploy --workspace apps/api
docker compose --env-file .env.compose run --rm --no-deps backend npm run db:seed --workspace apps/api
docker compose --env-file .env.compose run --rm --no-deps -e INIT_DEMO_STOCK=true backend npm exec --workspace apps/api -- tsx prisma/seed-demo.ts
docker compose --env-file .env.compose up -d --wait backend frontend
```

INIT_DEMO_STOCK chỉ dùng khi fixture demo chưa sử dụng.
Khởi tạo lại tồn bị guard từ chối; không xóa dữ liệu để vượt guard.

## Chạy lại
Nếu có migration mới, chạy db:deploy trước khi khởi động app.

```powershell
docker compose --env-file .env.compose up -d --wait
```

Seed DEMO10 lại, không khởi tạo lại kho:

```powershell
docker compose --env-file .env.compose run --rm --no-deps backend npm exec --workspace apps/api -- tsx prisma/seed-demo.ts
```

## Kiểm tra

```powershell
docker compose --env-file .env.compose ps
curl.exe -i http://localhost:3000/api/products
docker compose --env-file .env.compose exec db psql -U brewlite -d brewlite_s3_demo -c "SELECT COUNT(*) AS products, SUM(stock) AS total_stock FROM products;"
```

- Menu: http://localhost:3000
- Chi tiết: http://localhost:3000/products/coffee-milk
- Browser gọi Product API qua /api/products.
- Frontend server gọi http://backend:3001.
- PostgreSQL ở db:5432, không publish cổng database ra host.
- Database Docker và PostgreSQL Windows là hai môi trường riêng.

## Dừng và xem log

```powershell
docker compose --env-file .env.compose logs --tail 100 backend frontend
docker compose --env-file .env.compose down
```

down giữ named volume. Không dùng down -v trên dữ liệu cần giữ.
Migration và seed chạy bằng lệnh riêng, không tự chạy mỗi lần app start.

## Cấu hình demo
- PostgreSQL 17, Node 24.
- Backend và seed đặt timezone kết nối PostgreSQL là UTC.
- DEMO10: 10%, tối thiểu 50000, trần 20000.
- Hiệu lực từ 01/11 đến trước 01/12/2026 theo UTC.
- Seed không tạo tài khoản đăng nhập hoặc cộng điểm.

## Bằng chứng và giới hạn
Đã kiểm tra trên máy E:
- Build cả hai image, áp dụng ba migration và seed trong Docker.
- Ba service Healthy; /api/products trả 200, đủ bốn sản phẩm.
- Kho khởi tạo 10 mỗi Product, reserved 0, version 1.
- DEMO10 lưu đúng UTC.
- Restart container: service Healthy, API 200;
  dữ liệu vẫn bốn sản phẩm, tổng tồn 40.
- Backend build/typecheck và khởi động đạt sau cấu hình UTC.

Chưa xác nhận:
- Giao diện menu/chi tiết bằng quan sát trên trình duyệt.
- Luồng auth/cart/order/payment hoàn chỉnh trong Docker.
- Tính đúng thời gian backend qua kiểm thử round-trip.
- Chạy theo hướng dẫn trên máy thành viên khác.
- Compose local không phải bằng chứng triển khai production HTTPS.