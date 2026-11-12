# Sprint 3 — tích hợp workflow đơn hàng và thanh toán

## Kết quả tích hợp mới nhất

Source 3959f40 đã được A commit/push và build lại frontend Docker: 960/960 frontend, lint/typecheck/build mã 0; legacy/session 9/9 nhóm, browser mới 7 nhóm và hồi quy 9 bước. Backend/DB giữ image đã kiểm tại 88f5f35; frontend có image mới; ba service healthy, cleanup giữ kho. [Đối chiếu 27 AC](A1_ACCEPTANCE_REVIEW.md) và [bằng chứng gốc](testing/a1-final-qa-2026-11-12/README.md) ghi rõ SHA/môi trường/giới hạn. Còn review/phát hành S3-DEL-02; phần hướng dẫn áp patch workflow ở dưới giữ cho mốc nền cũ, không apply lại trên HEAD hiện tại.


Ngày cập nhật: 12/11/2026. Nhánh tích hợp: `integration/sprint3-checkout-e2e`, trên nền `04f3dc6a1f9bb9260934ab94d2caf52cc23c8801`. Phạm vi gồm thanh toán giả lập, hủy đơn, hoàn tiền, xử lý hết hạn và chuyển trạng thái qua CLI. Kết quả kiểm tra Windows được ghi riêng tại [A1_WORKFLOW_WINDOWS_QA.md](A1_WORKFLOW_WINDOWS_QA.md). Trạng thái nghiệm thu 27 AC tiếp tục được quản lý theo SHA, bằng chứng và review của từng AC.

## Phạm vi hiện thực

| Phần | Hành vi |
|---|---|
| `POST /payments` | Xác thực Bearer, DTO và key trước transaction; canonical payment v1 và namespace riêng; tra replay trước trạng thái/deadline; trả HTTP 200 cho cả FAILED/SUCCEEDED |
| Thành công | Một transaction chứa final attempt, consume reservation/CAS Product, LoyaltyEntry/User points, PAID/paidAt/version; không phát sinh giao dịch tiền thật |
| Thất bại/retry | FAILED giữ kho/giỏ, không cộng điểm; key mới cùng Order qua PENDING logic, version tăng một lần; không gia hạn deadline; key cũ luôn replay attempt cũ |
| `POST /orders/:id/cancel` | Body chính xác `{}`; release trước trả; PAID trước pha chế thì full refund/return/reverse, lặp không thêm tác động; hủy từ PREPARING trở đi trả 409 |
| Expiry | Quét khi khởi động và mỗi 60 giây, tối đa 50 ID, một lượt xử lý tại mỗi process; từng Order khóa/recheck/transaction riêng, một lỗi không chặn cả batch; giữ nguyên đơn policy 1 |
| Trạng thái | Chín cạnh bắt buộc; CLI nội bộ gọi cùng service/lock, mặc định tắt; không endpoint public pha chế |
| Cạnh tranh | Repeatable Read, `maxWait=1000 ms`, `timeout=2000 ms`; tối đa 3 transaction, snapshot mới, không retry lồng; Product CAS và đúng thứ tự lock; classifier nhận cả serialization SQLSTATE do Prisma 7 adapter-pg bọc trong metadata |
| Frontend | Bật v2 bằng cờ server rõ ràng trong dev/production; đúng một provider/panel, giữ nguyên quy tắc migration một chiều |
| Lỗi/recovery | Chọn INSUFFICIENT_STOCK theo backend hiện có; bổ sung marker no-attempt terminal đúng contract 7.2, không đổi request/schema/hash; GET riêng không giải quyết recovery |
| F5 sau mất response | Giữ key/body; replay đúng PaymentAttempt; nếu binding PAID đã được xử lý bởi restore, đọc current Order lại để không làm biến mất khung đơn |
| Lịch sử | Từ chối query lạ 400 như TEST_MATRIX; không thêm pagination/filter |

Kết quả mock được đọc một lần khi khởi tạo backend: `MOCK_PAYMENT_OUTCOME=SUCCEEDED|FAILED`, mặc định SUCCEEDED. Không nhận outcome/mode/amount/status từ trình duyệt. CLI chuyển trạng thái chỉ bật khi `DEMO_WORKFLOW_ENABLED=true`.

Không thêm migration, thay schema vật lý hoặc seed lại dữ liệu. Tái sử dụng schema/helper của E, pricing/points/reader của C, create V1/V2 của D và frontend của A/B. Các đơn V1 mới vẫn policy 2/giữ kho/deadline; payload/canonical V1 và lịch sử replay giữ nguyên.

## Kiểm tra trong môi trường Linux

Môi trường: Linux, Node 24.22.1, PostgreSQL 17.11, Prisma 7.10.1/adapter-pg, NestJS 12.1.3, Next.js 16.4.2 production; browser Chromium 153.0.8010.0, viewport1280 × 900 và 390 × 844. Database được tạo riêng trong môi trường chuẩn bị, không kết nối database Windows của A. Ba migration hiện có được deploy trên database sạch trước test; không reset dữ liệu đã có của A.

| Lệnh/nhóm | Kết quả thực |
|---|---|
| `npm test --workspace apps/api` | 181/181 unit/controller/HTTP dùng mock; kết quả PostgreSQL được ghi riêng |
| `npm test --workspace apps/web` | 955/955 unit/adapter/runtime |
| `order-workflow.spec.ts` + `workflow-postgres.integration.ts` | 81/81, gồm 53 unit và 28 PostgreSQL; 53 unit nằm trong bộ 181 test backend |
| 5 script E hiện có | `check-order-lock.ts`, `check-stock.ts`, `check-stock-concurrency.ts`, `check-orders-v2-postgres.ts`, `check-orders-v2-concurrency.ts`: mã thoát 0 |
| `prisma/check-workflow-http.ts` | 9 nhóm HTTP/BFF/CLI thật + 1 nhóm browser = 10/10 |
| Browser trong nhóm trên | 9/9 bước; không page error; trang chi tiết không tràn ngang tại hai kích thước đã kiểm tra |
| Typecheck/build API | mã thoát 0 |
| Lint/typecheck/build web | mã thoát 0 |

Log được lưu tại [testing/a1-workflow-2026-11-12](testing/a1-workflow-2026-11-12). Phiên bản kiểm tra là commit nền nêu trên cộng patch workflow, trước commit tích hợp. Khi lưu kết quả vào Git, cần đối chiếu patch và ghi SHA của commit chứa thay đổi. Báo cáo Windows và Linux được quản lý riêng.

Fixture PostgreSQL bao gồm WALLET/CARD; hai failure rồi cancel; key cũ FAILED sau key mới thành công; replay create PENDING không đè current PAID/CANCELLED; điểm 0/9/28; biên 50.001 → giảm 5.000 → còn 45.001; promotion hết hạn không thay total/deadline đơn cũ; payment/cancel/expiry/PREPARING race; same-key/different-key payment; simultaneous create; tồn kho 2, hai khách đặt số lượng 2 và 1 bằng hai connection và barrier; nhiều cấu hình chung Product; rollback từng write và lỗi ở Product thứ hai; đơn legacy chỉ đọc; expiry startup và batch lỗi tiếp tục. Failure injection nằm trong proxy test, không public hook hoặc browser field.

Browser đăng nhập thật, thêm món, tạo PENDING/giữ giỏ/không auto payment, F5 không POST, cố ý thay response payment bằng504 **sau khi upstream đã commit**, F5 và explicit replay cùng key/bytes, dọn giỏ sau đọc current Order, hủy PAID không dựng lại giỏ, lịch sử/detail hiện CANCELLED, kiểm mobile. Phải bỏ `--disable-web-security` của browser serverless khi chạy harness để kiểm P04 thật; không thêm Origin giả vào app hoặc nới guard.

## Áp dụng bản tích hợp

Quy trình dưới đây dành cho cây làm việc tại commit nền `04f3dc6`, chưa có patch workflow. Dừng frontend/backend trước khi thay source và cài dependency; giữ PostgreSQL cùng dữ liệu hiện có. Kiểm tra nhánh, HEAD và working tree trước khi áp dụng. Nếu phiên bản hoặc diff khác dự kiến, cần đối chiếu trước khi tiếp tục.

```powershell
Set-Location D:\cnpm\brewlite
git status --short --branch
git log -1 --oneline
git apply --check "E:\download\BrewLite_A1_Workflow_Completion.patch"
git apply --stat "E:\download\BrewLite_A1_Workflow_Completion.patch"
# Khi check sạch và đúng phạm vi:
git apply "E:\download\BrewLite_A1_Workflow_Completion.patch"
git diff --check
npm ci
npm run typecheck --workspace apps/api
npm test --workspace apps/api
npm run build --workspace apps/api
npm run lint --workspace apps/web
npm run typecheck --workspace apps/web
npm test --workspace apps/web
npm run build --workspace apps/web
```

Dừng nếu một lệnh native trả mã khác 0. Không commit/push bản có test lỗi. Lockfile thay đổi chỉ để thêm Playwright 1.65.0 phục vụ E2E; không đổi stack runtime. Profile `.env.test` lịch sử được giữ riêng; bộ workflow mới hỗ trợ profile Sprint 3 hiện có.

### Kiểm tra PostgreSQL bằng profile Sprint 3

Suite mới hỗ trợ đúng `localhost` và `brewlite_s3_demo` (hoặc database test riêng `brewlite_s2_test`), schema public, cần flag test. Nó tạo fixture unique, chỉ cleanup fixture chính lượt đó; không seed/reset/demo-stock. File profile cần có DATABASE_URL/AUTH_JWT_SECRET, không gửi nội dung secret qua chat.

```powershell
Push-Location .\apps\api
$env:SPRINT3_INTEGRATION_TEST = "1"
node --env-file=.env.sprint3-test --import tsx --test src/orders/workflow-postgres.integration.ts
$LASTEXITCODE
Remove-Item Env:\SPRINT3_INTEGRATION_TEST
Pop-Location
```

Kỳ vọng 28/28. Nếu quyền DB thiếu, kiểm đúng quyền đối với schema/bảng/sequence; không tạo database khác, dùng superuser hoặc reset để né lỗi.

### HTTP/BFF/CLI và browser thật

Build API/web trước. Runner dùng cổng 3302/3300 và sẽ từ chối nếu cổng đã có server; tự start/stop các process chính nó tạo. Nest test dùng cùng database đã được profile trỏ tới; vì có startup catch-up, mọi đơn policy 2 hết hạn sẵn trong database đó cũng được trả kho theo workflow và giữ lịch sử. Muốn hoàn toàn cô lập, dùng bản sao/demo database test đã được cấp riêng; không đổi/đè profile đang sử dụng.

```powershell
Push-Location .\apps\api
$env:SPRINT3_INTEGRATION_TEST = "1"
node --env-file=.env.sprint3-test --import tsx prisma/check-workflow-http.ts
$LASTEXITCODE
Remove-Item Env:\SPRINT3_INTEGRATION_TEST
Pop-Location
```

Kỳ vọng 9/9 nhóm khi không bật browser. Runner đăng ký hai user riêng, tạo Product/promotion riêng và cleanup dữ liệu của chính các user/fixture ấy. Runner không gọi seed.

Browser opt-in, cài Chromium phục vụ test một lần:

```powershell
npx --no-install playwright install chromium
Push-Location .\apps\api
$env:SPRINT3_INTEGRATION_TEST = "1"
$env:A1_BROWSER_TEST = "1"
node --env-file=.env.sprint3-test --import tsx prisma/check-workflow-http.ts
$LASTEXITCODE
Remove-Item Env:\A1_BROWSER_TEST
Remove-Item Env:\SPRINT3_INTEGRATION_TEST
Pop-Location
```

Kỳ vọng 10/10 nhóm, bên trong browser 9/9. JSON/ảnh browser nằm trong thư mục `%TEMP%\BrewLite-A1-browser-*`; có thể đặt `A1_TEST_REPORT_DIR` là thư mục evidence riêng. Không dùng fixture ở `/dev/checkout` làm E2E. Runner không yêu cầu secret nhập vào browser script; credential fixture truyền qua environment của child process và không ghi báo cáo.

## Cấu hình demo trên máy phát triển

Dùng backend từ profile S3 hiện có/cổng 3002 và frontend cổng 3000. Trước khi mở profile thử nghiệm, đóng các tab writer v1 của profile ấy hoặc dùng profile/ẩn danh mới. Bật `CHECKOUT_V2_ENABLED=1` ở cửa sổ Next rồi khởi động Next; chọn đúng BACKEND_INTERNAL_URL theo cấu hình cũ đã kiểm tra. Đây là cờ server, không phải NEXT_PUBLIC. Production cũng hỗ trợ cờ này; mặc định tắt để rollout có chủ đích.

Khi khởi động, backend xử lý các đơn policy 2 đã hết hạn và trả phần kho đang giữ. Order và ledger vẫn được bảo toàn. Dữ liệu demo đã sử dụng không được khởi tạo tồn lại. Profile trình duyệt đã migrate sang envelope 2 phải tiếp tục dùng writer v2 theo CONTRACTS mục 7.

CLI local với profile, sau khi đã có Order PAID:

```powershell
Push-Location .\apps\api
$env:DEMO_WORKFLOW_ENABLED = "true"
node --env-file=.env.sprint3-test dist/orders/demo-advance.js <orderId> PREPARING
# Tiếp theo READY, rồi COMPLETED. Bỏ qua cạnh hoặc cancel muộn bị chặn.
Remove-Item Env:\DEMO_WORKFLOW_ENABLED
Pop-Location
```

Docker: theo [../SPRINT3_COMPOSE.md](../SPRINT3_COMPOSE.md). Cờ frontend phải bật rõ sau khi cùng backend patch đã được kiểm tra. Không tự migrate/seed ở từng container khi startup; dùng lệnh deploy riêng đã có.

## Phạm vi kiểm chứng và công việc còn lại

Các kết quả kiểm thử được dùng để review từng AC theo [B_AC_LINKS.md](B_AC_LINKS.md). Việc nghiệm thu còn các đầu ra sau:

1. Source tích hợp đã commit tại `88f5f35f3bb921bd68be2d0f8c70bd6736ab101e`; bằng chứng Windows ngoài container đã được lưu trong thư mục `testing/a1-workflow-2026-11-12/windows`. Kết quả 181/955/28 và HTTP/browser giữ đúng phạm vi ở trên.
2. Máy A đã kiểm tra Compose 8/8 nhóm, browser 9/9 bước; lượt đo riêng 330/330 mẫu API sau warmup dưới 500 ms. Xem [báo cáo Compose và hiệu năng](A1_COMPOSE_PERFORMANCE_QA.md); hoàn thiện log/ảnh gốc và commit/push hồ sơ QA.
3. Browser Docker được xác nhận là Chromium 158.0.8127.18; Linux và Windows ngoài container giữ phiên bản theo JSON của từng lượt. Chưa có kết quả Firefox, Safari hoặc Edge trong các lượt này.
4. Review từng AC/DoD, hoàn thiện Review/Retrospective, backlog và gói bàn giao Assignment 1. Lịch sử kiểm thử và trạng thái review được cập nhật theo sự việc thực tế.
