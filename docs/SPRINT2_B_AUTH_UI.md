# Sprint 2 – Phần B: giao diện xác thực và thành phần dùng chung

Backlog: S2-03. Nhánh: `feature/sprint2-auth-ui`. Căn cứ: Sprint 2 Phân tích & Thiết kế v0.6.

## Phạm vi đã làm

| Hạng mục | Vị trí |
|---|---|
| Trang đăng ký, đăng nhập | `app/register`, `app/login` |
| Form, validation P08 (≥15 code point, ≤72 byte UTF-8, từ chối U+0000 và surrogate lẻ, không trim mật khẩu) | `features/auth/components/*`, `features/auth/validation.ts` |
| Đăng xuất có hộp xác nhận (`<dialog>` gốc) | `logout-control.tsx`, `components/ui/confirm-dialog.tsx` |
| Thông báo dùng chung | `components/ui/{alert,toast,form-field}.tsx` |
| Trạng thái phiên cho cả app | `features/auth/auth-provider.tsx` (`useAuth`) |
| Gọi BFF `/api/auth/*`, timeout 15 s, ánh xạ lỗi theo contract | `features/auth/auth-client.ts`, `auth-error.ts` |
| Chống open redirect cho `?next=` | `features/auth/return-to.ts` |

## Hành vi cần giữ

- Đăng ký không cấp phiên; xong thì chuyển sang `/login?registered=1`.
- 401 ở form đăng nhập là "sai thông tin", không phải hết hạn phiên.
- Lỗi mạng/timeout/5xx **không** kết luận đã đăng xuất, chưa tạo tài khoản hay hết hạn; trạng thái và giỏ được giữ.
- Đăng xuất chỉ được xác nhận khi HTTP **204** và `X-BrewLite-Logout-Scope` đúng `session` hoặc `local`; phản hồi khác (200, thiếu/sai scope) là chưa xác nhận: giữ đăng nhập, không gọi handler dọn giỏ. Scope `local` báo rõ phiên máy chủ không được xác nhận thu hồi.
- Một deadline 15 s bao cả gửi request lẫn đọc body (kể cả khi adapter bỏ qua AbortSignal).
- Kết quả `/api/auth/me` cũ không ghi đè phiên mới: login/logout thành công làm mất hiệu lực các lần kiểm tra bắt đầu trước đó (`auth-session.ts`).
- Hộp xác nhận đăng xuất theo S2-R05/P05: giỏ rỗng và không có lần đặt chưa rõ kết quả thì đăng xuất thẳng; có món thì nêu sẽ xóa N món; có lần đặt chưa rõ kết quả thì nêu lần đặt không bị hủy. Nút hủy là "Ở lại".
- Trình duyệt không thấy JWT; chỉ nhận `user` và `expiresAt`.

## Mock khi BFF của C chưa xong

Đặt `NEXT_PUBLIC_AUTH_SOURCE=mock` trong `frontend/.env.local`. Tài khoản thử: `demo@brewlite.test` / `demo-password-123456`. Bỏ biến này để gọi BFF thật. Không dùng mock trên production.

## Giao ước với người khác

- **A (giỏ hàng):** B không triển khai thay module cart; A nối hai điểm sau trong cart provider:
  - `useAuth().setLogoutInfoSource(() => ({ cartItemCount, hasPendingOrder }))` để hộp xác nhận nêu đúng số món và lần đặt chưa rõ kết quả (trả hàm hủy đăng ký). Chưa đăng ký thì hộp chỉ hỏi chung, không nói gì về giỏ.
  - `useAuth().onSignedOut(scope => ...)` chạy sau khi BFF xác nhận 204: A gọi `LOGOUT_CONFIRMED`, xóa giỏ, giữ pending theo owner.
- **A (header):** B thêm `<AuthNav />` và bọc nhóm liên kết trong một `div`. Nếu xung đột `header.tsx` khi merge, giữ cả `<CartBadge />` của A và `<AuthNav />` của B trong cùng `div`. Nếu cả hai PR cùng sửa `tsconfig.json` (`allowImportingTsExtensions`) và `package.json` (script `test`), giữ một bản.
- **C (BFF):** UI gửi `Content-Type: application/json`, `X-BrewLite-Request: 1`, `credentials: same-origin`; đọc `X-BrewLite-Logout-Scope` ở 204; đọc lỗi dạng `{error:{code,message,fieldErrors}}`.
- Nơi khác cần yêu cầu đăng nhập: chuyển tới `/login?reason=expired|required&next=<đường dẫn nội bộ>`.

## Kiểm thử đã chạy

- `npm run typecheck`, `npm run lint`, `npm run build`: đạt.
- `npm test` (frontend): 45 test (validation, return-to, ánh xạ lỗi, client/timeout/body chậm/logout nghiêm ngặt, thứ tự hoàn tất của /me, nội dung xác nhận): đạt.
- Trình duyệt (Playwright, mock): đăng ký → đăng nhập → quay về `next`; focus vào ô lỗi đầu tiên; dialog đóng bằng Esc, focus quay về nút, Tab không ra khỏi dialog; không cuộn ngang ở 360 px và 1280 px; `next` ngoài site bị bỏ.

## Chưa làm / chưa kiểm chứng

- Chưa chạy với BFF và backend thật (phụ thuộc C và D).
- Chưa thử bằng trình đọc màn hình thật; mới kiểm tra thuộc tính ARIA và thao tác bàn phím.
- Chưa có test component (repo chưa có công cụ test React).
- Mốc bàn giao B ngày 30/10 21:00 đã quá hạn; cần báo lại nhóm.
