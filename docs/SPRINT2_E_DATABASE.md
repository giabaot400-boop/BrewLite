# Sprint 2 — Bàn giao schema và migration của E

Căn cứ thiết kế: BrewLite Sprint 2 v0.6.

## Thay đổi
- Thêm User, AuthSession, Order, OrderItem,
  OrderItemTopping và OrderRequest.
- Giữ nguyên bảng và migration Sprint 1.
- Bổ sung khóa ngoại, khóa unique và CHECK cho
  giá, số lượng, size, thành tiền và trạng thái OrderRequest.

## Kết quả đã kiểm tra trên PostgreSQL local
- Migration deploy và Prisma generate thành công.
- Dữ liệu Sprint 1 còn nguyên: 4 sản phẩm, 2 topping, 2 liên kết.
- Tổng tiền âm bị từ chối.
- Email trùng bị từ chối.
- Số lượng 0 và 21 bị từ chối; 1 và 20 được chấp nhận.
- SUCCEEDED thiếu orderId bị từ chối.
- REJECTED không có orderId được chấp nhận.
- Trùng userId/requestKey trên OrderRequest bị từ chối.
- Các transaction thử đã rollback.
- Typecheck và build frontend/backend thành công.

## Cần phối hợp tiếp
- C rà soát User/AuthSession trước khi tích hợp auth.
- D rà soát schema đơn hàng và hợp đồng httpStatus của ledger.
- Chưa hoàn thành helper transaction advisory lock.
- Chưa kiểm tra tính nhất quán giữa Order và OrderRequest,
  rollback luồng tạo đơn, replay và gửi đồng thời.
- Chưa xác nhận migration trên máy thành viên khác.

Schema/migration nền chưa đồng nghĩa hoàn thành Sprint 2.