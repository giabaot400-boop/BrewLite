# Sprint 3 — Docker Compose và hiệu năng API trên Windows

Ngày kiểm tra: 12/11/2026. Người thực hiện: A. Nguồn: báo cáo JSON và console do người kiểm thử cung cấp; JSON được đối chiếu lại theo từng mẫu.

## Phiên bản và môi trường

- Repository: `giabaot400-boop/BrewLite`; nhánh `integration/sprint3-checkout-e2e`.
- SHA source của cả hai lượt: `88f5f35f3bb921bd68be2d0f8c70bd6736ab101e`; working tree sạch khi bắt đầu.
- Máy Windows 10 x64 (`10.0.19045`), Intel Core i5-6200U 2.30 GHz, 4 CPU logic, RAM 19.87 GiB.
- Node trên host `v24.16.0`; Node backend container `v24.22.3`.
- `Docker version 29.9.3, build 5457199`; `Docker Compose version v5.7.0`; WSL 2 backend.
- PostgreSQL `17.11 (Debian 17.11-1.pgdg12+2)`, timezone UTC, database Docker `brewlite_s3_demo` tại `db:5432`.
- Chromium `158.0.8127.18` qua Playwright; viewport desktop 1280 × 900 và mobile 390 × 844 theo runner đã lưu.
- `CHECKOUT_V2_ENABLED=1`; mock payment mặc định SUCCEEDED. Chỉ frontend publish `127.0.0.1:3000`; backend/database ở mạng Compose riêng.

Hai lượt dùng cùng ba image ID:

| Service | Image ID |
|---|---|
| backend | `sha256:93c73e1dd9c20e558c64f08aac6f859792384ed430653ec27f7b522be71e0e7b` |
| frontend | `sha256:bb88e42438f0a4abdfad51c87a10dd58fca8747c3d151d3a73b6a22bcdc9ab05` |
| db | `sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994` |

## Khởi tạo và workflow Compose

Theo console: build hai image đạt, mã thoát 0; deploy đủ ba migration hiện có; seed 4 sản phẩm, 2 topping; `INIT_DEMO_STOCK=true` chỉ chạy trên volume mới. Ba service healthy; `/api/products` trả đủ bốn món; cờ checkout đọc trong frontend là `1`. PostgreSQL Windows được giữ riêng.

Lượt workflow bắt đầu 2026-11-12T11:31:06.172Z, kết thúc 2026-11-12T11:32:37.563Z (18:31:06–18:32:37, UTC+7). Lệnh thực chạy trên máy A:

```powershell
node "E:\download\BrewLite_A1_Compose_Check (1).cjs" "D:\cnpm\brewlite"
```

Tên file có hậu tố `(1)` do tải lại; runner ghi `helperVersion=2`. Bản script dùng trong lượt này được lưu trong thư mục bằng chứng.

| Nhóm | Kết quả và phạm vi assertion |
|---|---|
| 1 | Healthy/private networking; đăng ký/đăng nhập BFF thật; kiểm tra anonymous, owner, Origin và session-binding guards |
| 2 | Promotion fixture 10%; tổng 90.000đ; payment/replay một attempt; 9 điểm; full refund, reverse điểm và hủy lặp |
| 3 | FAILED giữ kho/deadline; field outcome từ client bị từ chối; đổi cấu hình/restart không đổi key cũ; key mới thanh toán cùng đơn |
| 4 | Marker NO_ATTEMPT_TERMINAL_ORDER chỉ xuất hiện khi chưa có attempt; không tạo attempt ở nhánh bị chặn |
| 5 | CLI mặc định khóa; từ chối bỏ qua cạnh; PREPARING → READY → COMPLETED; từ chối hủy muộn |
| 6 | Đặt deadline của riêng fixture về quá khứ rồi khởi động lại backend; startup catch-up hủy và nhả hold |
| 7 | Browser thật 9/9: form login, cart, PENDING/không auto-payment, F5, mất response sau commit, replay đúng key/body, clear cart, cancel/history/detail/mobile |
| 8 | Dừng rồi khởi động cả ba service; snapshot đơn/payment/ledger/điểm/kho giữ nguyên; phiên vẫn đọc được lịch sử |

Kết quả: **8/8 nhóm Compose, 9/9 bước browser**, mã thoát 0; `passed=true`, `cleanup=true`, `pageErrors=[]`. Năm lượt readiness GET đều đạt ngay lần probe đầu. Browser là một nhóm trong tám nhóm Compose; không cộng 8+9 thành số nhóm nghiệm thu.

Helper v1 trước đó dừng ở 2/8 vì `fetch failed`; console xác nhận trả cấu hình về SUCCEEDED và cleanup thành công. Bản v2 dùng kết nối HTTP mới, GET readiness sau lifecycle và ghi cause lỗi. Chưa có đủ dữ liệu xác định chính xác nguyên nhân transport của lượt v1; giữ kết quả FAIL đó theo lịch sử, không đổi thành PASS. Source ứng dụng vẫn là cùng SHA trên.

Fixture có Product/promotion/user UUID riêng. Cleanup xóa dữ liệu của chính lượt thử. Bốn Product demo trước và sau đều `stock=10`, `reservedStock=0`, `stockVersion=1`; ba service healthy trước và sau. Không seed/reset trong runner.

## Hiệu năng API sau warmup

Assignment 1 mục 4.2 yêu cầu API dưới 500 ms với dữ liệu mẫu. `TEST_MATRIX.md` yêu cầu ghi môi trường/dataset/percentile và mọi failure. Lượt đo này bắt đầu 2026-11-12T11:47:57.230Z, kết thúc 2026-11-12T11:48:36.741Z (18:47:57–18:48:36, UTC+7):

```powershell
node "E:\download\BrewLite_A1_Compose_Performance_Check.cjs" "D:\cnpm\brewlite"
```

- Đo từ host Windows qua Next BFF → Nest → PostgreSQL trong Compose; tính từ gửi request đến đọc hết response bằng `performance.now()`; mỗi request có TCP connection mới.
- Concurrency 1, chạy tuần tự; 5 lượt warmup đầy đủ, sau đó 30 lượt đo. Có 55 mẫu warmup và 330 mẫu đo trong 11 nhóm request; payment mới và replay là hai nhóm của cùng endpoint.
- Percentile dùng nearest-rank: p50 là mẫu thứ 15, p95 thứ 29 trong 30 mẫu đã sắp tăng; max là mẫu chậm nhất. Warmup không nằm trong bảng dưới.
- Dataset ban đầu: 4 Product demo, 0 User và 0 Order. Fixture thêm 1 Product/promotion, 36 User; tạo/thanh toán/replay/hủy 35 Order trong toàn bộ warmup và lượt đo. Lịch sử tăng dần đến 35 Order. WALLET/CARD luân phiên theo script.
- Sau đo, assertion DB xác nhận mỗi Order có một payment, full refund và reverse điểm; tồn fixture trở về 100, reserved 0. Cleanup thành công; dữ liệu demo giữ nguyên.

Đơn vị: ms. Số liệu p50/p95/max được tính lại từ các mẫu JSON; cột đạt xét từng mẫu `<500`, không chỉ p95.

| Nhóm request | n | p50 | p95 | max | Dưới 500 ms |
|---|---:|---:|---:|---:|---:|
| `POST /api/auth/register` | 30 | 305.76 | 325.72 | 331.88 | 30/30 |
| `POST /api/auth/login` | 30 | 304.48 | 317.06 | 322.59 | 30/30 |
| `GET /api/auth/me` | 30 | 13.18 | 19.32 | 24.57 | 30/30 |
| `GET /api/products` | 30 | 11.20 | 13.19 | 14.06 | 30/30 |
| `POST /api/orders` | 30 | 47.45 | 56.49 | 62.48 | 30/30 |
| `POST /api/payments` | 30 | 50.20 | 64.20 | 67.96 | 30/30 |
| `POST /api/payments (exact-key replay)` | 30 | 23.82 | 26.66 | 27.94 | 30/30 |
| `GET /api/orders/:id` | 30 | 20.22 | 24.66 | 25.37 | 30/30 |
| `GET /api/orders/me` | 30 | 22.97 | 25.09 | 28.47 | 30/30 |
| `POST /api/orders/:id/cancel` | 30 | 58.36 | 72.02 | 72.83 | 30/30 |
| `POST /api/auth/logout` | 30 | 17.93 | 20.35 | 24.97 | 30/30 |

**330/330 mẫu đo hợp lệ đều dưới 500 ms; 0 lỗi HTTP; max toàn lượt 331,88 ms.** `functionalPassed=true`, `latencyPassed=true`, `cleanup=true`; console có `COMPOSE_API_PERFORMANCE_PASSED`, mã thoát 0. SHA và ba image ID trùng lượt workflow.

Phạm vi kết luận là các nhóm request và dataset trên, sau warmup, chạy tuần tự trên máy A. Đây không phải phép thử tải đồng thời, cold-start, browser rendering hoặc production HTTPS; kết quả không mở rộng sang các điều kiện đó. Kết quả trực tiếp Nest của Sprint 2 giữ riêng tại `../sprint2/SPRINT2_AUTH_PERFORMANCE.md`.

## Bằng chứng và nghiệm thu

- [Chỉ mục, checksum và script đã dùng](testing/a1-compose-2026-11-12/README.md).
- [Compose JSON](testing/a1-compose-2026-11-12/compose-result.json).
- [Browser JSON](testing/a1-compose-2026-11-12/browser-result.json).
- [Performance JSON, gồm từng mẫu](testing/a1-compose-2026-11-12/performance-result.json).
- Log console và ảnh browser được sao chép từ các thư mục báo cáo trên máy A theo chỉ mục; giữ nguyên JSON gốc.

Bằng chứng này bổ sung cho S3-PAY-01/02/03/07, S3-ORD-01/02/03/04, S3-LOY-01, S3-CART-01/03/04/05, S3-SEC-01 và S3-DEL-01 theo assertion đã nêu. Mức phủ từng AC phải đối chiếu toàn bộ fixture trong TEST_MATRIX; không suy rằng một nhóm Compose đã phủ hết các điều kiện của AC liên quan. Cạnh tranh kho/payment, failure injection, legacy/migration và các race storage/session dùng bằng chứng PostgreSQL/unit/HTTP riêng.

Còn lại: review từng AC/DoD với SHA và bằng chứng cụ thể; ghi nhận Review/Retrospective/backlog từ sự việc thật; review PR tích hợp và hoàn thiện gói bàn giao. Không ghi đã họp hoặc đã có approval của thành viên khi chưa có.
