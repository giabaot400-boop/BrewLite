# Sprint 2 phần A bước 3 Giao diện giỏ khách

Gói này nối phần lõi A1/A2 vào React và giao diện để khách chưa đăng nhập
thêm món từ chi tiết, mở giỏ, chỉnh số lượng, xóa và xem tổng tiền.
Nền local được A xác nhận là `d6b6e5d`, nhánh feature/sprint2-cart.
Phạm vi theo CART-AC và P06/P09 của đặc tả Sprint 2 v0.6.
Checkpoint mã đã push: `0f9a45f84d6096439f149b13ad3e1f01c97aeb9e`,
PR #13: https://github.com/giabaot400-boop/BrewLite/pull/13.
Kết quả dưới đây thuộc phạm vi giỏ khách; chưa là nghiệm thu toàn Sprint 2.

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

Kết quả A cung cấp trên Windows trong quá trình áp dụng A3:

| Kiểm tra | Kết quả và phạm vi |
|---|---|
| Unit test, Node.js v24.16.0 | 46/46 đạt, không fail hoặc skip; có cảnh báo MODULE_TYPELESS_PACKAGE_JSON |
| Frontend typecheck | Không báo lỗi, chạy trước hiệu đính cleanup |
| Frontend build | Thành công với Next.js 16.4.2; có route /cart và /products/[id]; chạy trước hiệu đính cleanup |
| Frontend lint | Ban đầu có một warning react-hooks/exhaustive-deps tại cleanup; sau sửa, A chạy lại và cung cấp đầu ra không có lỗi hoặc warning |
| Khoảng trắng | git diff --check không báo lỗi trước commit A3 |

Hiệu đính cleanup bỏ việc tăng sequence trong cleanup; alive chặn kết quả
sau unmount và lần setup tiếp theo tăng sequence để vô hiệu hóa phản hồi cũ.
Bản đã push tại `0f9a45f` có hiệu đính này. Đã chạy lại đúng các module mã
được tải từ commit đó trên Node.js v24.22.1: 46/46 unit test đạt. Đây là
kiểm thử module thuần, chưa mount React; môi trường kiểm tra đó không chạy
frontend typecheck/lint/build bằng dependency repository. Chưa có đầu ra
typecheck/build trên máy A sau hiệu đính cleanup trong hồ sơ hiện tại.

Build không thay kết quả các ca nghiệp vụ. Không đánh dấu 36 AC hoặc
37 mã test nghiệm thu là Đạt từ số bài unit test này.

## Kiểm tra giao diện đã ghi nhận và còn lại

A thao tác trên bản A3 trong quá trình áp dụng, trước commit `0f9a45f`.
Frontend được cấu hình `NEXT_PUBLIC_PRODUCTS_SOURCE=api` theo kết quả đọc
biến này trên máy A; không đưa nội dung .env hoặc thông tin kết nối vào hồ sơ.
Đây là kiểm tra thủ công do A xác nhận, chưa có bộ chạy trình duyệt tự động.
Chưa ghi nhận phiên bản trình duyệt hoặc ngày riêng cho từng thao tác.

| Nhóm | Thao tác | Kết quả hoặc điểm còn chờ |
|---|---|---|
| Thêm/gộp | Coffee-milk, M + cream, thêm hai lần | A xác nhận: ở lại chi tiết; một dòng, 2 ly, 47.000đ/ly, tổng 94.000đ, badge 2 |
| Cập nhật giữa tab | Sửa số lượng ở một tab | A xác nhận tab còn lại tự cập nhật; chưa bao phủ thao tác đồng thời và các tình huống lỗi |
| Điều hướng | Nút Xem menu ở giỏ rỗng | A xác nhận hoạt động |
| Khác cấu hình | Thêm S không topping hoặc đổi tập topping | Chưa có kết quả riêng đủ chi tiết trong hồ sơ; giữ chờ xác nhận |
| Số lượng/xóa | Cộng/trừ tại giới hạn, xóa một dòng và dòng cuối | Chưa có kết quả riêng đủ chi tiết trong hồ sơ; giữ chờ xác nhận |
| Khôi phục | Điều hướng/reload khi giỏ có món | Chưa có kết quả riêng đủ chi tiết trong hồ sơ; giữ chờ xác nhận |
| UI/hồi quy | Bàn phím, màn hình hẹp/rộng, menu và tùy chọn chi tiết | Chờ B review Header/layout và ghi kết quả bàn phím/responsive |

Khi kiểm tra tiếp hai tab, dùng cùng origin http://localhost:3000. Chỉ bổ
sung các kết quả còn thiếu hoặc kiểm tra lại khi có thay đổi liên quan;
không cần một ảnh cho mỗi AC hoặc chạy lại toàn bộ chỉ vì cập nhật hồ sơ.

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
