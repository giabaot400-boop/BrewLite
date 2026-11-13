# Hiệu đính kích hoạt giỏ v2

## Kết quả Windows sau sửa

A đã commit/push bản sửa tại `3959f4096ee8b2f4baffac83ab8e0e5b6460752d`; frontend 960/960, lint/typecheck/build mã 0. Build Docker frontend 41,0 giây; recreate healthy 7,8 giây theo console. Lượt 20:18 UTC+7 trên Chromium 158.0.8127.18 đạt legacy/session 9/9 nhóm, gồm 7 nhóm browser bổ sung và hồi quy 9 bước; pageErrors=[], cleanup và tồn có trước giữ nguyên. JSON source/blob/script hash và image đã đối chiếu. Xem [báo cáo](A1_ACCEPTANCE_REVIEW.md) và [file gốc](testing/a1-final-qa-2026-11-12/README.md). Các mục “kiểm tra tiếp” bên dưới là quy trình đã dùng; chưa thay review nhóm/phát hành.


Ngày: 12/11/2026. Nền áp dụng: `d42deb5023ec0323b3d8ba1357b9694db7e1c921`. Phạm vi source: provider v2, helper kích hoạt và năm test lifecycle. Không đổi DTO, canonical, envelope, backend hoặc migration SQL.

## Lỗi được xác nhận

Layout chọn CartProviderV2 khi bật cờ, nhưng provider khởi động controller ngay; chưa gọi `storage.migrateToV2()`. Controller/bridge đúng thiết kế chỉ đọc v2 và không tự nâng cấp. Profile mới hoặc envelope 2 hoạt động; profile đang có envelope 1 từ Sprint 2 báo “Phiên bản dữ liệu giỏ chưa được hỗ trợ”. README đã mô tả bước nâng cấp khi rollout, nên thiếu nằm ở phần nối provider.

Browser trước sửa: sáu nhóm session/expiry đạt; nhóm đọc giỏ v1 không mở được checkout, giữ nguyên dữ liệu cũ. Đây là FAIL thực ở phần kích hoạt. Log/JSON trước và sau được giữ riêng trong gói `BrewLite_A1_Cart_Rollout_Fix.zip`, không đổi kết quả trước sửa thành PASS.

## Hành vi sau sửa

- Provider được cờ chọn gọi `migrateToV2()` trong client effect, chờ storage kiểm tra/ghi xong dưới Web Lock rồi mới start controller.
- Việc nâng cấp giữ cart, pending payload/key/snapshot/timestamp và lastOrderResult. Không tự POST hoặc tự nhận chủ giỏ.
- Nếu dữ liệu không hợp lệ hoặc ghi bị lỗi, controller chưa hoạt động; giao diện hiển thị lỗi. Nút thử đọc lại thực hiện lại bước kích hoạt và giữ dữ liệu khi chưa thành công.
- Effect đã cleanup không được start controller sau khi Promise cũ hoàn tất. Controller/bridge/runtime riêng vẫn không tự migrate; writer v1 vẫn từ chối envelope 2.
- Cờ `CHECKOUT_V2_ENABLED=1` và cờ development tương thích giữ nguyên. Rollout vẫn một chiều và cần đóng/reload tab writer cũ theo CONTRACTS.

## Kiểm tra trong môi trường chuẩn bị

Source kiểm tra là nền d42deb5 cộng patch này, trước commit của A. Linux, Node 24.22.1, PostgreSQL 17.11 riêng; Nest/Next production. Chromium 153.0.8010.0, không dùng `--disable-web-security`; bỏ `--single-process` của bản Chromium serverless khi kiểm nhiều context/tab.

| Nhóm | Kết quả và phạm vi |
|---|---|
| Frontend unit | 960/960, không fail/skip; gồm 5 test mới cho chờ migration, lỗi/thử lại, cleanup và strict-mode replacement |
| Lint/typecheck/build web | Mã thoát 0 |
| Browser bổ sung | 7/7 nhóm: A→B→A giữ recovery; cookie khác owner/403 và response cũ; logout đến muộn giữ cookie/giỏ B; revoked-session 401; expired/reorder chủ động; old read giữ giỏ mới; dữ liệu lạ giữ nguyên, thử lại nâng cấp v1 pending |
| Migration/legacy | Exact SQL Sprint 1–2 rồi Sprint 3 trong schema UUID riêng; original-column digest trước/sau bằng nhau; SUCCEEDED/REJECTED replay, remap lỗi, conflict v1/v2; policy1 read-only; schema thử được dọn |
| Browser hồi quy | Runner hiện có 9/9: đăng nhập, PENDING, F5, mất response sau commit, replay đúng key/bytes, PAID clear, cancel không dựng giỏ, history/detail và mobile |
| Cleanup | Xóa đúng fixture UUID, tồn Product có trước giữ nguyên |

Migration schema riêng không phải migrate/reset các bảng ứng dụng đang chạy. Expiry/revocation chỉ thay fixture riêng; không chờ 15 phút hoặc sửa đồng hồ hệ thống. Bộ browser có dữ liệu lỗi/cũ được đưa vào storage của context thử; không sửa profile trình duyệt của người dùng. Bằng chứng này bổ sung S3-CART-02/03/04/05, S3-SEC-01 và S3-MIG-01 trong phạm vi assertion trên, không tự thay approval của nhóm.

## Bằng chứng Windows đã nhận trước patch

`ac-boundaries-result.json` của A: source d42deb5, cùng ba image của ứng dụng 88f5f35, 7/7 nhóm/10 vòng tranh ly cuối, cleanup và ba service healthy. SHA256 file gốc: `f9746dd306e4cb3c84a7160ab258956049420c70a6876e2fb221b44ec4c27ece`. `dbProgramSha256` khớp bản đã kiểm tra trong môi trường chuẩn bị. Lượt này kiểm service PostgreSQL trong container; không phải browser và chưa bao gồm bản sửa provider.

## Áp dụng và kiểm tra tiếp

1. Apply patch trên nền d42deb5 sạch; chạy frontend lint/typecheck/test/build và diff check. Dự kiến 960 test; source ứng dụng đổi đúng ba file trong `features/cart`.
2. Commit/push source và tài liệu; build lại image frontend và recreate riêng frontend, giữ backend/DB cùng volume hiện có.
3. Chạy helper `BrewLite_A1_Session_Legacy_Check.cjs` trong gói. Nó kiểm base d42deb5 là tổ tiên, Git blob ba file đã sửa, clean HEAD, backend/DB image cũ và frontend image mới; ghi SHA/image thực.
4. Helper gồm 1 nhóm legacy, 7 nhóm browser bổ sung và 1 nhóm browser hồi quy có 9 bước: kỳ vọng 9/9 nhóm. Nó lưu `session-legacy-result.json`, JSON browser và log riêng; cleanup fixture và kiểm tồn Product.

Sau khi có JSON Windows mới, nối kết quả vào bảng AC theo đúng SHA. Còn review diff mới trên PR #53, Review/Retrospective/backlog thật và gói bàn giao. Không ghi đã họp, có feedback giảng viên hoặc approval của thành viên khi chưa có.
