# Cách review sơ đồ với code

D/E đối chiếu Order lock, Product CAS và một tx với C points. A/B đối chiếu owner/revision/binding, BFF captured token và recovery. C kiểm quyền/đọc snapshot/version. E đối chiếu 13 model/constraints với migration mới, không đổi migration cũ. Mỗi reviewer nêu hình/đoạn code/fixture và kết quả thực trên PR; không ghi tất cả đạt vì render thành công. Các ca chuẩn ở TEST_MATRIX.md. Sơ đồ đã đồng bộ nội dung thiết kế; code ứng dụng chưa được nghiệm thu trong lượt này.

 bỏ API quote và GET payment riêng. GET Order có latestPayment đầy đủ; recovery chính key dùng POST payment cùng key/body, không suy identity từ latestPayment. Chỉ kho Product, không reservation hoặc field stock trên Topping. Giữ13model/14mãUC/27AC, hold15phút và expiry backend. UI hiện tổng chính thức từ Order trước khách xác nhận payment.
