# Sprint 2 phần A bước 1 Logic giỏ hàng

Bước này bổ sung kiểu dữ liệu và reducer giỏ khách theo đặc tả Sprint 2
v0.6, CART-AC và P06/P09. Nền mã đối chiếu là commit
`6b2cbb442c23a1f5eb25f8c22c5a4197eda98bd9`.

## Phạm vi đã viết

- `frontend/src/features/cart/types.ts`: kiểu dòng giỏ, chủ giỏ, revision,
  action và lỗi giao diện.
- `frontend/src/features/cart/cart-reducer.ts`: thêm/gộp, tăng/giảm một ly,
  xóa đúng dòng; tính tổng số ly và tổng tiền xem trước.
- `frontend/src/features/cart/cart-reducer.test.mjs`: kiểm thử bằng Node.js
  test runner có sẵn; không thêm dependency hoặc sửa package-lock.

Đây là logic thuần, chưa được nối vào giao diện. Cart Provider, hydration,
envelope localStorage, Web Locks, đồng bộ tab, nút thêm món, trang giỏ và
badge sẽ triển khai ở bước sau. Auth, BFF và tạo đơn chưa được nối.

## Quy tắc dữ liệu và hành vi

Khóa dòng là JSON tuple `[productId, size, sortedToppingIds]`, không nối ID
bằng dấu phân cách. ID giữ nguyên nội dung; sort mặc định theo UTF-16 code
unit, không dùng localeCompare. Topping trùng bị từ chối.

Mỗi ADD_ITEM thêm đúng một ly. Cùng cấu hình thì giữ snapshot hiển thị và
giá xem trước của dòng đang có, chỉ tăng số lượng; thêm lại không tự thay
giá cho những ly đã chọn. Giá chính thức vẫn do backend quyết định. Luồng
PRICE_CHANGED sẽ được bổ sung riêng theo P02/P03; bước này chưa có action
cập nhật giá từ server.

CartLine dùng `productName`, `imageUrl`, `size`, `toppingIds`,
`toppingNames` (bản đồ id -> tên), `previewUnitPrice` và `qty`.
Các trường tên/ảnh chỉ phục vụ hiển thị. Không gửi nguyên CartLine cho
API orders. Payload đặt đơn sau này chỉ có productId, size, toppingIds,
qty, expectedUnitPrice theo contract; previewUnitPrice ánh xạ sang
expectedUnitPrice, không phải giá chính thức.

Tối đa 20 cấu hình và 20 ly mỗi dòng. Ở qty=1, DECREMENT không thay đổi
giỏ; giao diện sau này vẫn phải disable nút trừ. Đơn giá, thành tiền dòng
và tổng không vượt 2.147.483.647 VND. Số ly trên badge là tổng qty.

Mutation thành công tăng revision một lần; thao tác bị từ chối hoặc không
thay đổi không tăng revision. Reducer giữ ownerId hiện tại; chưa có thao
tác đăng nhập, đổi owner hoặc logout. CartState.error chỉ dùng cho UI,
không thuộc phần cart cần lưu trong envelope.

Reducer yêu cầu state đầu vào hợp lệ. normalizeDraft chỉ kiểm tra draft
thêm món, không thay cho validator toàn bộ storage. Khi nối Provider,
mọi mutation phải đọc envelope mới nhất, validate owner/pending và dữ liệu,
áp reducer rồi ghi trong Web Lock ngắn theo P01/P09. Chưa hydrate hoặc lỗi
storage thì chưa cho thao tác. Không giữ Web Lock qua HTTP.

## Kiểm tra bước 1

Từ thư mục gốc repository:

```powershell
node --test frontend/src/features/cart/cart-reducer.test.mjs
npm run typecheck --workspace frontend
npm run lint --workspace frontend
git diff --check
```

Ngày 28/10/2026, 16 bài kiểm thử reducer đã chạy đạt trên môi trường
thực thi hỗ trợ, Node.js v24.22.1. Bao gồm gộp khác thứ tự topping,
phân biệt cấu hình/ID có dấu phân cách, tăng/giảm/xóa, tính tổng,
giới hạn dòng/qty/tiền, không ép kiểu và không làm thay đổi dữ liệu đầu vào.

Chưa chạy typecheck/lint bằng dependency của repository trên máy A.
Chưa kiểm tra Provider, trình duyệt, storage, nhiều tab, auth hoặc backend.
Kết quả unit test không thay kết quả nghiệm thu CART-AC hay 37 ca S2-CART,
S2-AUTH và S2-ORDER. Không đánh dấu các ca kế hoạch là Đạt từ bước này.

## Review và tích hợp tiếp theo

Làm trên nhánh feature/sprint2-cart. B rà phần nối layout/header khi có UI;
C/D/E rà các phần phiên/BFF/orders/dữ liệu khi bắt đầu tích hợp tương ứng.
Giữ quy tắc có thành viên khác review trước merge vào main.
## Cập nhật kiểm tra trên máy A

Ngày 28/10/2026, A chạy trên Windows với Node.js v24.16.0:
- Kiểm thử reducer: 16/16 đạt.
- Frontend typecheck: không báo lỗi.
- Frontend lint: không báo lỗi.
- Có cảnh báo MODULE_TYPELESS_PACKAGE_JSON khi chạy test trực tiếp; test vẫn đạt.
Chưa kiểm tra UI, storage, nhiều tab, auth hoặc orders.
