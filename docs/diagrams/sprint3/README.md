# BrewLite Sprint 3 sơ đồ triển khai 1.3

Ngày 06/11/2026. Năm nguồn PlantUML sinh chín SVG; mở SVG bằng browser, giữ nguồn để sửa. Các hình đồng bộ thiết kế 1.3, chưa chứng minh code/test đã đạt.

| Mã | File SVG | Dùng để đọc |
|---|---|---|
| D01 | master-use-case-sprint3.svg | 14 mã UC, hai extend, mock nội bộ không actor ngoài |
| D02A | activity-sprint3-order.svg | Preview/create, tổng chính thức trước payment; BFF owner và Product CAS |
| D02B | activity-sprint3-payment.svg | Payment/recovery và giỏ tới paid-current |
| D03 | sequence-checkout-order.svg | UI/BFF/same captured token, ledger và tx tạo đơn |
| D04 | sequence-checkout-payment.svg | Atomic payment, replay, mất response |
| D05 | sequence-checkout-cancel-expiry.svg | Cancel/refund/expiry, lock và bù trừ |
| D06 | state-order-sprint3.svg | Chín cạnh nghiệp vụ theo đề 9.1 |
| D07A | erd-sprint3-core.svg | Chín model nền và field mở rộng |
| D07B | erd-sprint3-business.svg | Bốn model mới và quan hệ; không tính trùng model |

Types/nullable/default/mapping/indices/checks chi tiết ở docs/sprint3/CONTRACTS.md. State Order có PAYMENT_FAILED, trạng thái attempt là FAILED; client UNKNOWN không là enum server. Năm backend endpoint; không endpoint public pha chế/refund hay worker thứ tư. Hình master là sơ đồ tổng quan kế thừa, không phải backlog mới phải code thêm.

V1.1 bỏ API quote và GET payment riêng. GET Order có latestPayment đầy đủ; recovery chính key dùng POST payment cùng key/body, không suy identity từ latestPayment. Chỉ kho Product, không reservation hoặc field stock trên Topping. Giữ13model/14mãUC/27AC, hold15phút và expiry backend. UI hiện tổng chính thức từ Order trước khách xác nhận payment.


Nền triển khai sau chốt Sprint 2: main `a1a0e4ae92de681deac538685e24407b3190866b`. Hiệu đính auth/logout và contract lỗi kế thừa đọc cùng CONTRACTS/TEAM_PLAN hiện hành. Nguồn PlantUML và chín SVG không thay đổi trong lượt đồng bộ nền này.
