# Chạy BrewLite bằng Docker Compose

## Kết quả trên bản tích hợp ngày 12/11/2026

Máy A đã chạy theo hướng dẫn trên source `88f5f35`: build/deploy/seed trên volume Docker mới, ba service healthy, workflow Compose 8/8 nhóm và browser 9/9 bước. Lượt đo riêng sau warmup có 330/330 mẫu dưới 500 ms, max 331,88 ms. Xem [báo cáo và giới hạn](sprint3/A1_COMPOSE_PERFORMANCE_QA.md). Kết quả của E ở mục bằng chứng bên dưới giữ nguyên phạm vi lượt trước; hai môi trường/bản kiểm tra được ghi riêng.

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
- Quan sát trình duyệt: menu hiển thị đủ bốn sản phẩm.
- Chi tiết coffee-milk: chọn L + Kem + Trân châu,
  tổng dự kiến 57000 VND, đúng phép tính.
- Chưa kiểm chứng thao tác thêm giỏ hoặc checkout qua hai ảnh này.

Chưa xác nhận:
- Luồng auth/cart/order/payment hoàn chỉnh trong Docker.
- Tính đúng thời gian backend qua kiểm thử round-trip.
- Chạy theo hướng dẫn trên máy thành viên khác.
- Compose local không phải bằng chứng triển khai production HTTPS.

## Cấu hình workflow ngày 12/11/2026

Sử dụng cùng phiên bản frontend/backend của bản tích hợp. Trước khi bật checkout v2, đóng các tab writer v1 trong profile thử nghiệm, sau đó tạo lại frontend với cờ sau:

```powershell
$env:CHECKOUT_V2_ENABLED = "1"
docker compose --env-file .env.compose up -d --build --wait backend frontend
```

`CHECKOUT_V2_ENABLED` mặc định là `0`. Profile đã migrate sang v2 phải tiếp tục dùng writer v2 theo CONTRACTS mục 7. Backend khởi động sẽ chạy catch-up các đơn policy2 đã hết hạn và trả kho đúng workflow, giữ lịch sử. Không chạy lại seed/INIT_DEMO_STOCK trên database đã sử dụng.

Mock payment mặc định trả SUCCEEDED. Để kiểm tra nhánh FAILED qua backend, đổi cấu hình và tạo lại service: Replay payment key đã lưu không thay theo outcome mới:

```powershell
$env:MOCK_PAYMENT_OUTCOME = "FAILED"
docker compose --env-file .env.compose up -d --force-recreate --wait backend
# Thử tạo/thanh toán bằng UI, rồi đổi lại SUCCEEDED và khởi động lại backend.
```

CLI chuyển trạng thái được bật riêng cho từng lệnh; chức năng này không có endpoint công khai:

```powershell
docker compose --env-file .env.compose exec -e DEMO_WORKFLOW_ENABLED=true backend npm run demo:advance --workspace apps/api -- <orderId> PREPARING
# Sau đó READY, rồi COMPLETED; không bỏ qua cạnh.
```

Kết quả chạy ngoài container và trong Docker được ghi riêng. Lượt kiểm tra Docker cần bao gồm auth, cart và payment trên cùng bản tích hợp; xem [hồ sơ workflow](sprint3/A1_WORKFLOW_HANDOVER.md).
