# Sprint 3 — kiểm tra workflow trên Windows

Ngày kiểm tra: 12/11/2026. Người kiểm thử: A. Thư mục làm việc: `D:\cnpm\brewlite`. Nhánh: `integration/sprint3-checkout-e2e`.

## Phiên bản và nguồn kết quả

Phiên bản kiểm tra là nền `04f3dc6a1f9bb9260934ab94d2caf52cc23c8801` cộng `BrewLite_A1_Workflow_Completion.patch` (38 file). SHA-256 của patch: `27c7d764de57352042729ef5ab602c46b4b8b9f90bba82ebccdda46e45553542`.

Các lượt chạy diễn ra trước commit workflow. Khi lưu kết quả vào Git, cần đối chiếu patch và ghi SHA của commit chứa thay đổi. Mọi sửa đổi code sau lượt kiểm tra phải có kết quả kiểm chứng phù hợp riêng.

Bảng dưới được tổng hợp từ console người kiểm thử cung cấp. Báo cáo gốc cần được đính kèm tại các đường dẫn trong mục Báo cáo gốc để reviewer đối chiếu. Kết quả Linux được lưu riêng trong thư mục cha.

## Kết quả kiểm tra

| Kiểm tra | Kết quả | Nguồn bằng chứng |
|---|---|---|
| Áp dụng patch | Thành công; diff check sạch; file workflow và script test đúng dự kiến | Console Git/PowerShell do A cung cấp |
| `npm ci` | Không báo lỗi | Xác nhận của người kiểm thử |
| API typecheck/build | Không báo lỗi | Xác nhận các lệnh kiểm tra của A |
| API unit/controller/HTTP dùng mock | 181/181 đạt; 0 fail, 0 skipped; 16546.3815 ms | Tổng kết test do A cung cấp |
| Web lint/typecheck/build | Không báo lỗi | Xác nhận các lệnh kiểm tra của A |
| Web tests | 955/955 đạt; 0 fail, 0 skipped; 9930.619 ms | Tổng kết test do A cung cấp |
| PostgreSQL workflow | 28/28 đạt; 0 fail, 0 skipped; 6204.9852 ms; `POSTGRES_WORKFLOW_CHECKS_PASSED` | Tổng kết test; profile `.env.sprint3-test`, DB demo đã đối chiếu |
| HTTP/BFF/CLI | 9/9 nhóm đạt; cleanup hoàn tất; `HTTP_BFF_CHECKS_PASSED` | Báo cáo `BrewLite_A1_Workflow_HTTP_Windows_20261112_131047.txt` |
| Browser và HTTP/BFF/CLI | Browser 9/9 bước đạt; tổng hợp 10/10 nhóm; cleanup hoàn tất; `BROWSER_WORKFLOW_CHECKS_PASSED` | Console đầy đủ các dòng PASS và thư mục báo cáo browser |

Phạm vi tổng hợp:

- Bộ 181 test backend đã gồm 53 test workflow thuần; kết quả 53 test này không được cộng thêm vào tổng.
- Runner browser tổng hợp 9 nhóm HTTP/BFF/CLI và 1 nhóm chứa 9 bước browser.
- Các kết quả trên là bằng chứng kiểm thử. Trạng thái nghiệm thu 27 AC được cập nhật sau khi đối chiếu SHA, báo cáo và review của từng AC.

## Phạm vi kiểm chứng

### HTTP/BFF/CLI

- Payment FAILED trả HTTP 200, giữ kho và điểm; các field điều khiển payment từ client bị từ chối.
- Đổi cấu hình mock sau restart không thay kết quả replay key cũ; key mới có thể thanh toán cùng đơn theo điều kiện workflow.
- DTO, key, quyền sở hữu, truy vấn lịch sử và body hủy đơn được kiểm tra.
- Cancel/refund lặp giữ nguyên kết quả; startup catch-up chỉ xử lý đơn policy 2 phù hợp, giữ nguyên legacy và đơn PAID.
- CLI kiểm tra cờ bật và ba cạnh pha chế; BFF kiểm tra cookie, Origin và expected owner.
- Mã giảm giá, 9 điểm thưởng, replay, refund và marker không có attempt ở đơn đã kết thúc được kiểm tra qua API thật.

### Trình duyệt

- Đăng nhập bằng form và hiển thị giỏ đúng chủ.
- Tạo PENDING giữ giỏ, hiển thị tổng chính thức và không tự gửi payment.
- F5 đọc lại đơn mà không POST; mất phản hồi sau commit giữ recovery UNRESOLVED.
- Khôi phục chủ động sau F5 gửi cùng key/body; current Order được đối chiếu trước khi dọn giỏ.
- Hủy PAID giữ giỏ đã dọn; lịch sử và chi tiết hiển thị CANCELLED.
- Trang chi tiết không tràn ngang ở kích thước mobile đã kiểm tra.

Phiên bản browser và `pageErrors` được ghi trong JSON của lượt chạy. Test expiry có failure injection để kiểm tra batch tiếp tục khi một dòng lỗi; trường hợp này được ghi nhận là test đạt, không phải lỗi production được miễn xử lý.

## Báo cáo gốc

Nguồn trên máy kiểm thử:

- HTTP/BFF: `E:\download\BrewLite_A1_Workflow_HTTP_Windows_20261112_131047.txt`.
- Browser: `E:\download\BrewLite_A1_Browser_20261112_131733`.

Vị trí lưu trong repo:

- [HTTP/BFF — 9 nhóm](testing/a1-workflow-2026-11-12/windows/http-bff.txt).
- [HTTP/BFF và browser](testing/a1-workflow-2026-11-12/windows/browser-run.txt).
- [Browser JSON](testing/a1-workflow-2026-11-12/windows/browser-result.json).
- [Ảnh đơn PAID sau khôi phục](testing/a1-workflow-2026-11-12/windows/checkout-paid.png).

Các liên kết trên chỉ có bằng chứng tương ứng sau khi file gốc được sao chép vào repo. Không lưu `.env`, cookie, token hoặc profile đăng nhập trong hồ sơ kiểm thử.

## Kết quả Docker và hiệu năng bổ sung

Lượt Compose và hiệu năng chạy sau commit trên source `88f5f35f3bb921bd68be2d0f8c70bd6736ab101e`, tách riêng với các lượt ngoài container ở trên. Compose 8/8 nhóm, Chromium 158.0.8127.18 chạy 9/9 bước và không page error; lượt hiệu năng riêng đạt 330/330 mẫu dưới 500 ms. Cả hai cleanup thành công, cùng image ID và kho demo giữ nguyên. Xem [báo cáo đầy đủ và JSON gốc](A1_COMPOSE_PERFORMANCE_QA.md).

## Công việc còn lại

1. Hoàn thiện việc lưu log/ảnh gốc cho lượt Compose và hiệu năng, kiểm tra checksum và commit/push hồ sơ QA; source ứng dụng đã kiểm tra là `88f5f35`.
2. Đối chiếu từng AC/DoD với assertion và bằng chứng tương ứng; kết quả Compose/hiệu năng không tự thay review AC.
3. Cập nhật Review/Retrospective, backlog và gói bàn giao theo sự việc thực tế. Giữ kết quả Sprint 2, ngoài container và Docker riêng theo môi trường/phạm vi.

Assignment 1 mục 4.2 yêu cầu phù hợp trên các trình duyệt web. Các lượt hiện tại cung cấp bằng chứng Chromium; browser khác và trình đọc màn hình trong backlog UI cần được kiểm tra riêng.
