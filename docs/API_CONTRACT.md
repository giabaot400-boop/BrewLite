# Product API cho Sprint 1

Backend NestJS chạy tại `http://localhost:3001`. Frontend đọc URL từ
`NEXT_PUBLIC_API_URL`, không gọi trực tiếp database.

## GET /products

Trả 200 với một mảng JSON trực tiếp, không bọc trong `{ data: ... }`.
Mảng rỗng `[]` là trạng thái thành công nhưng không có sản phẩm.

```json
[
  {
    "id": "coffee-milk",
    "name": "Cà phê sữa",
    "price": 35000,
    "imageUrl": "/images/coffee-milk.svg"
  }
]
```

## GET /products/:id

Trả 200 với ProductDetail:

```json
{
  "id": "coffee-milk",
  "name": "Cà phê sữa",
  "description": "Cà phê đậm vị kết hợp sữa.",
  "price": 35000,
  "imageUrl": "/images/coffee-milk.svg",
  "sizes": [
    { "code": "S", "extraPrice": 0 },
    { "code": "M", "extraPrice": 5000 },
    { "code": "L", "extraPrice": 10000 }
  ],
  "toppings": [
    { "id": "cream", "name": "Kem", "price": 7000 },
    { "id": "pearl", "name": "Trân châu", "price": 5000 }
  ]
}
```

ID là chuỗi opaque. Giá và phụ thu là số nguyên VND không âm; `price` là giá S.
Ba size có mã duy nhất. Topping không có thì trả `toppings: []`, không trả `null`.
Không có sản phẩm theo id thì trả 404. Sprint 1 không thêm `stock` hay `isAvailable`.

Ảnh mẫu đang dùng SVG local thay ảnh chụp; phần mở rộng ảnh không phải ràng buộc
của contract. Có thể đổi ảnh khi vẫn giữ field `imageUrl` và đường dẫn hợp lệ.

## Trạng thái triển khai Sprint 1

Hai endpoint sản phẩm đã được tích hợp vào main qua PR #7.
Migration PostgreSQL đã được tích hợp qua PR #6.
Mốc code đối chiếu: 7df9f61.

Đã kiểm tra trên máy A với DEMO_MODE=false:
- GET /products trả raw JSON array, HTTP 200.
- GET /products/coffee-milk trả đúng chi tiết, sizes và toppings.
- ID không tồn tại trả HTTP 404 với message Product not found.
- Các lần đo API đã thực hiện đều dưới 500 ms trong môi trường local.

Chi tiết kết quả và những mục còn cần xác nhận nằm trong
SPRINT1_CHECKLIST.md. Trạng thái triển khai API không thay thế
nghiệm thu toàn Sprint theo 24 AC/DoD.
