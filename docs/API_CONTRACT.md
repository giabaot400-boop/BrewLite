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

## Trạng thái triển khai ban đầu

Backend mới có `GET /health`. C tiếp tục triển khai hai endpoint trên bằng Prisma.
D kiểm tra raw array, 404, dữ liệu hợp lệ và thời gian phản hồi theo v1.0.
