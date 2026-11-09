# Sprint 3 — Bàn giao database của E

## Nền và phạm vi
- Thiết kế Sprint 3 v1.3.
- Nhánh: feature/sprint3-database.
- Nền origin/main khi bắt đầu: 2983ab3.
- Schema gồm 13 model.
- Migration mới: 20261109010714_sprint3_payment_stock.
- Không sửa migration Sprint 1–2.
- Bổ sung subtotal vào hai chỗ tạo đơn legacy, bằng total.

## Môi trường kiểm thử
- PostgreSQL local, database brewlite_s2_test.
- Dùng apps/api/.env.test, đã xác nhận Git bỏ qua.
- Không đưa mật khẩu hoặc token vào báo cáo.

## Kết quả
- Prisma validate/generate: PASS.
- Typecheck và build frontend/backend: PASS.
- Migration áp dụng thành công trên database có dữ liệu Sprint 2.
- Giữ nguyên 4 sản phẩm, 2 topping, 5 đơn và 10 ledger.
- Đơn cũ: subtotal = total, discountTotal = 0, policy = 1.
- Hash ledger trước/sau migration và sau kiểm thử:
  c2ad7e396d3c9d1e27cee746ae78a679

## Kiểm thử SQL đã thực hiện
- Giữ kho vượt tồn và tồn âm: bị từ chối.
- Tồn 2, giữ 1: được chấp nhận.
- Điểm thưởng âm: bị từ chối.
- Tổng tiền không khớp: bị từ chối.
- Policy 2 thiếu trường bắt buộc: bị từ chối.
- Policy 2 đủ trường: được chấp nhận.
- Reservation ACTIVE chưa resolved: được chấp nhận.
- Reservation CONSUMED thiếu resolvedAt: bị từ chối.
- Hai payment SUCCEEDED cùng đơn: lần thứ hai bị từ chối.
- FAILED thiếu failureCode: bị từ chối.
- FAILED có PAYMENT_DECLINED: được chấp nhận.
- Payment sai chủ đơn: bị khóa ngoại ghép từ chối.
- Ledger canonicalVersion 2: được chấp nhận.
- Tất cả transaction thử đã rollback.
- Sau kiểm thử: payments/reservations/loyalty_entries đều 0.

## Chưa hoàn thành
- Migration trên máy thành viên khác chưa xác nhận.
- Các constraint chưa kiểm thử không được tính PASS.
- Còn kiểm thử seed với đơn/reservation đang hoạt động.
- Tích hợp helper kho với workflow của D và kiểm thử hồi quy.
- Tích hợp pricing/payment/cancel/expiry với C và D.
- Docker Compose, README và kiểm thử triển khai.
- Chưa xác nhận hoàn thành toàn bộ S3-E-01 hoặc Sprint 3.
## Helper kho — kiểm thử trên PostgreSQL

File: apps/api/src/database/stock.ts

Đã bổ sung:
- aggregateNeeds, precheckStock.
- reserveStock, consumeStock, releaseStock, returnStock.
- Dùng transaction bên gọi; không tự commit hoặc retry.
- CAS kiểm tra stockVersion và giá trị tồn đã đọc.
- D phải khóa Order trước consume/release/return.
- Gọi helper và cập nhật workflow trong cùng transaction;
  lỗi phải rollback toàn bộ.

Kết quả:
- check-stock.ts: 10/10 PASS.
- Kiểm tra gộp nhu cầu, giữ/trừ/hoàn/giải phóng kho,
  chặn thao tác lặp và kế hoạch kho cũ; fixture đã rollback.
- check-stock-concurrency.ts: 5/5 PASS.
- Hai transaction RepeatableRead cùng đọc sản phẩm cuối:
  một thành công, một xung đột; chỉ còn một đơn/item/reservation.
- Transaction mới thấy hết hàng; fixture riêng đã dọn.

Giới hạn:
- Chưa kiểm thử tích hợp helper với ledger/payment/points,
  cancel/expiry và vòng retry workflow của D.
- Timeout của script phục vụ kiểm thử, không thay timeout workflow.
- Seed demo đã kiểm tra khởi tạo và chạy lại trên fixture chưa có đơn.
- Còn kiểm thử seed với đơn/reservation đang hoạt động.
- Compose chưa hoàn thành.
## Seed demo

- File: apps/api/prisma/seed-demo.ts.
- Database riêng: brewlite_s3_demo.
- Cả ba migration áp dụng thành công trên database sạch.
- Catalog: 4 sản phẩm, 2 topping, 2 liên kết.
- Guard yêu cầu đúng database và DEMO_SEED_ENABLED=true.
- Khởi tạo lần đầu: mỗi Product tồn 10, giữ 0, phiên bản 1.
- Seed thường chạy lại không reset kho; DEMO10 vẫn một dòng.
- Bật INIT_DEMO_STOCK lần hai bị từ chối, kho không thay đổi.
- DEMO10: giảm 10%, tối thiểu 50000, trần 20000.
- Hiệu lực UTC: 01/11/2026 đến trước 01/12/2026.
- Kết nối seed dùng options: '-c timezone=UTC';
  đã xác nhận thời gian lưu đúng UTC.
- Cần kiểm tra timezone backend và các script khác.
- Typecheck PASS.
- Chưa kiểm thử seed với đơn/reservation đang hoạt động.