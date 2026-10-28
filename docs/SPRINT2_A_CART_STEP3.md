# Sprint 2 phần A bước 3 Giao diện giỏ khách

Gói này nối phần lõi A1/A2 vào React và giao diện để khách chưa đăng nhập
thêm món từ chi tiết, mở giỏ, chỉnh số lượng, xóa và xem tổng tiền.
Nền local được A xác nhận là `d6b6e5d`, nhánh feature/sprint2-cart.
Phạm vi theo CART-AC và P06/P09 của đặc tả Sprint 2 v0.6.

## Thay đổi chính

- CartProvider là Client Component, dùng Context/useReducer. Layout giữ
  Server Component, bọc Header và children bằng Provider; SkipLink giữ ngoài.
- CartBadge bổ sung vào Header: số ly là tổng qty, không phải số cấu hình.
- ProductOptions nhận ProductDetail thay cho ba props basePrice/sizes/toppings;
  call site trong app/products/[id]/page.tsx được cập nhật cùng gói.
- buildProductCartDraft lấy giá/tùy chọn từ ProductDetail, không hardcode giá
  hoặc gọi thêm endpoint. Cùng helper dùng cho preview và draft thêm giỏ.
- Mỗi lần thêm thành công lưu một ly; thông báo chỉ sau khi storage đã ghi.
  Khách ở nguyên trang chi tiết. Giới hạn gộp/dòng/tiền vẫn do lõi A1/A2 kiểm tra.
- Route /cart hiển thị tên, size, topping, đơn giá, qty, thành tiền và tổng.
  Cộng/trừ theo bước một; nút trừ khóa tại 1, cộng khóa tại 20; xóa theo khóa
  cấu hình. Giỏ rỗng có đúng thông báo và Xem menu; tổng/badge sau khôi phục là 0.

Gói sửa bốn file hiện có: app/layout.tsx, components/layout/header.tsx,
app/products/[id]/page.tsx và features/products/components/product-options.tsx.
Các file khác trong gói là file mới. Không sửa component UI chung, API,
schema, migration, .env hoặc dependency.

## Khôi phục và cập nhật giữa các tab

SSR và lần render client đầu cùng có trạng thái restoring, cart=null.
Badge hiển thị dấu chờ thay vì số 0 chưa được xác minh. Không cho thêm/sửa
khi chưa khôi phục, đang ghi hoặc gặp lỗi đọc/lưu. Không có effect ghi lại
state rỗng ban đầu vào localStorage.

Provider đọc storage trong Effect và đăng ký storage event. Tab ghi cập nhật
Context từ kết quả đã lưu; tab khác nhận event và đọc lại dữ liệu hiện tại
dưới cùng Web Lock, không lấy newValue cũ của event làm nguồn quyết định.
Focus, visibilitychange khi trở lại và pageshow từ bfcache cũng đọc lại.
Cleanup gỡ listener và bỏ qua kết quả bất đồng bộ của lifecycle đã kết thúc.

Số sequence nội bộ ngăn phản hồi đọc cũ đè phản hồi mới. Đây là thứ tự UI
trong một Provider, không thay cart.revision, requestKey hoặc cơ chế server.
Ref chặn hai mutation trong một tab trước khi React kịp render trạng thái
disabled; Web Lock A2 vẫn bảo vệ đọc/ghi chung giữa các tab.

Không cập nhật lạc quan: thao tác chỉ báo thành công sau setItem. Lỗi đọc/
lưu hoặc dữ liệu hỏng ẩn các tổng chưa xác minh, cho thử đọc lại và giữ
bản storage. Menu/chi tiết vẫn xem được. Bản ghi pending/kết quả cũ không
được đưa toàn bộ vào Context hiển thị hoặc tự gửi HTTP.

## Ranh giới với xác thực và tạo đơn

Giao diện hiện chỉ cho thao tác cart.ownerId=null. ownerId trong storage
không chứng minh đã đăng nhập. Nếu đọc thấy giỏ có owner, ẩn nội dung và
chặn sửa, giữ nguyên storage để bước tích hợp phiên xác nhận đúng tài khoản.
Đây chưa phải triển khai giữ/xóa giỏ khi login/logout hoặc hết hạn phiên.

Không dựng form giả hoặc gọi endpoint auth chưa có trong nền đang dùng.
Chưa có nút xác nhận tạo đơn hoặc hành vi tự gửi lại. Bước tích hợp sau cần
nhận auth state đã xác thực từ C, bổ sung mutation nhận chủ giỏ/đổi tài khoản/
logout và xử lý pending cùng owner theo P01/P05/P09. D cung cấp orders thật.
Các thay đổi đó phải dùng cùng envelope, không ghi đè riêng cart bằng state UI.

Giá trong giỏ vẫn là preview. PRICE_CHANGED, kết quả PENDING, retry cùng
key/payload và dọn đúng phần giỏ theo owner/revision chưa nằm trong A3.
Không suy ra auth, orders hoặc thanh toán đã hoàn thành từ giao diện giỏ.

## Kiểm tra tự động

Ngày 28/10/2026, môi trường thực thi hỗ trợ Node.js v24.22.1:
46/46 unit test đạt, gồm 16 reducer A1, 20 envelope/storage A2 và 10 ca mới.
Ca mới kiểm tra trạng thái UI thuần, phản hồi cũ, giỏ có owner, lỗi/khôi phục,
giá từ ProductDetail và tập topping. Chưa mount React hoặc chạy trình duyệt.

```powershell
node --test frontend/src/features/cart/cart-reducer.test.mjs frontend/src/features/cart/cart-storage.test.mjs frontend/src/features/cart/cart-view.test.mjs
npm run typecheck --workspace frontend
npm run lint --workspace frontend
npm run build --workspace frontend
git diff --check
```

Typecheck/lint/build theo dependency thật và kiểm thử UI trên máy A còn cần
kết quả sau áp dụng. Build không thay kết quả các ca nghiệp vụ. Không đánh
dấu 36 AC hoặc 37 mã test nghiệm thu là Đạt từ số bài unit test này.

## Kiểm tra giao diện dự kiến

Sau khi các kiểm tra mã qua, chạy ứng dụng theo README. Dùng cùng origin
http://localhost:3000 cho cả hai tab. Ghi nguồn fixture/API, commit hoặc
trạng thái chưa commit và kết quả thực tế; không cần một ảnh cho mỗi AC.

| Nhóm | Thao tác | Mong đợi | Trạng thái |
|---|---|---|---|
| Thêm/gộp | Mở coffee-milk, chọn M + cream, thêm hai lần | 1 dòng, 2 ly, 47.000/ly, tổng 94.000; badge 2, ở lại chi tiết | Chưa chạy |
| Khác cấu hình | Thêm S không topping hoặc đổi tập topping | Dòng riêng; badge tổng số ly | Chưa chạy |
| Số lượng/xóa | Cộng/trừ, thử tại 1, xóa một dòng và dòng cuối | Đúng dòng/giá; tại 1 không trừ; rỗng có Xem menu, tổng/badge 0 | Chưa chạy |
| Khôi phục/tab | Giữ giỏ có món, điều hướng, reload; mở /cart ở tab thứ hai và sửa ở một tab | Giữ đúng món/qty; tab còn lại cập nhật; không mất thay đổi | Chưa chạy |
| UI/hồi quy | Dùng bàn phím; màn hình hẹp/rộng; thử menu và tùy chọn chi tiết | Focus/label/nút dùng được; size/topping và giá nền vẫn đúng | Chưa chạy |

Các biến thể dữ liệu hỏng, storage bị chặn, thiếu Web Locks và owner không
khớp phải kiểm tra trong môi trường test phù hợp, giữ bản lưu trước khi sửa
dữ liệu thử. Unit test A2 chưa thay kiểm thử trình duyệt của các biến thể đó.

## Review và nguồn

Header/layout là điểm giao với B: cần B review badge/điều hướng và responsive.
ProductOptions/trang chi tiết và features/cart thuộc phần A. C review phần
auth state khi nối phiên; không chuyển auth backend hoặc BFF auth sang A.

- Đặc tả BrewLite Sprint 2 v0.6: CART-AC, P01/P06/P09/P10.
- frontend/AGENTS.md và đoạn Context providers trong hướng dẫn Next.js
  đang cài do A cung cấp: Provider là Client Component, layout có thể là Server Component.
- https://react.dev/reference/react/useReducer
- https://react.dev/reference/react/useEffect
