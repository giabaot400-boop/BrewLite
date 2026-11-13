# Assignment 1 — đối chiếu nghiệm thu sau tích hợp

## Cập nhật 13/11/2026 — review, merge và demo thủ công

- B đã [approve PR #53 tại `f3f0ef7`](https://github.com/giabaot400-boop/BrewLite/pull/53#pullrequestreview-5884511329).
  B tự chạy web lint/typecheck/960 test/build; API 89/94, năm spec còn vướng
  Prisma Client trong môi trường B. Backend typecheck/build, PostgreSQL và
  UI với backend thật vẫn dựa vào hồ sơ A; không đổi thành các lượt B tự chạy.
- [PR #53](https://github.com/giabaot400-boop/BrewLite/pull/53) đã merge
  `6f38fcb`; #49 merge `a9145f3`; #51 merge `88b4e12`. Main khi đối chiếu
  là `88b4e12cf909226e9b376041d5da4205765b7649`; không còn chờ merge #53.
- [PR #54](https://github.com/giabaot400-boop/BrewLite/pull/54) tại `85062ce`
  và [PR #55](https://github.com/giabaot400-boop/BrewLite/pull/55) tại
  `0741c18` còn mở tại thời điểm ghi. #55 có review COMMENTED trên `4b0742a`,
  đã sửa góp ý ở `0741c18`; chưa ghi approval mới hoặc merge cho hai PR này.
- A đã thực hiện [lượt demo thủ công ngày 13/11](A1_MANUAL_DEMO_2026-11-13.md)
  trên Compose: các luồng chính checkout, workflow, hủy, FAILED/thử mới,
  chờ hết hạn thật, đăng nhập lại giữ giỏ và chủ động đặt lại. Đây là xác nhận
  thao tác/ảnh/console A cung cấp, không phải chạy lại toàn bộ test/27 AC,
  buổi Review/Retro chung hoặc nghiệm thu của giảng viên.
- Git HEAD khi chốt thông tin sau demo là `0741c18`; image đang chạy có ID
  rút gọn backend `93c73e1dd9c2`, db `665dc7b37ac5`, frontend `6ac3316340d4`.
  Không gán image đã build trước thành một lượt build/test tại Git HEAD mới.

Các mục QA ngày 12/11 bên dưới giữ nguồn SHA/image và giới hạn ban đầu.
Ngày rà soát ban đầu: 12/11/2026. Source ứng dụng mới nhất đã kiểm trên máy A: `3959f4096ee8b2f4baffac83ab8e0e5b6460752d`, nhánh `integration/sprint3-checkout-e2e`. Nguồn: code/test, JSON gốc của A, console đã cung cấp và hồ sơ lịch sử có ghi phạm vi. Trợ lý hỗ trợ đối chiếu kỹ thuật; bằng chứng này không tự thay approval trong nhóm.

## Kết luận kỹ thuật và phần còn mở

Đã đối chiếu đủ 27 AC. 26 AC chức năng/triển khai đã có bằng chứng theo các assertion và giới hạn trong bảng; S3-DEL-02 còn bước review/phát hành. Không phát hiện lỗi ứng dụng còn mở trong các ca đã kiểm sau sửa rollout. Không suy ra mọi tổ hợp môi trường hoặc toàn bộ DoD đều PASS.

Bản sửa 3959f40 nối migration storage trước khi controller v2 hoạt động. Trước sửa, profile có giỏ Sprint 2 bị lỗi không hỗ trợ; sau sửa browser kiểm v1 pending/unsupported/retry đạt và giữ key/payload/snapshot. Phạm vi không đổi API, canonical, backend, schema DB hoặc chính sách đơn lịch sử. Xem [A1_CART_ROLLOUT_FIX.md](A1_CART_ROLLOUT_FIX.md).

## Các mốc và nguồn bằng chứng

Mốc hồ sơ được B review là `a08152c2358a800cea0c45bef05668c31e15b208`,
phát triển tiếp từ source ứng dụng `3959f40`. Commit `a08152c` chỉ bổ sung tài
liệu/bằng chứng; không là lượt chạy lại các test bên dưới. Báo cáo gốc giữ
SHA/image, thời điểm và môi trường của từng lượt. Phần backend kế thừa source
`88f5f35`; boundary gắn `d42deb5`; phiên bản frontend sau sửa rollout gắn
`3959f40`. Kết quả hiệu năng vẫn thuộc image cũ tại `88f5f35`.

[Review của B tại mốc `a08152c`](https://github.com/giabaot400-boop/BrewLite/pull/53#pullrequestreview-5878454053)
ngày 12/11/2026, trạng thái `COMMENTED`, gắn đúng `a08152c`: đọc ZIP cả nhánh,
tự chạy web typecheck/lint và 960/960 test; chưa so diff với approval cũ.
Backend/PG/build/Docker/browser/hiệu năng trong review này dựa vào hồ sơ A,
không được ghi thành các lượt B đã chạy. Tại thời điểm đó, review này chưa
là approval hoặc xác nhận merge/phát hành; approval `f3f0ef7` và các mốc
merge sau đó được ghi trong cập nhật 13/11 ở đầu tài liệu.

Đợt xử lý góp ý này thêm `pretest` sinh Prisma Client, làm rõ hướng dẫn và
chuyển vị trí một JSON lịch sử; không sửa code chạy nghiệp vụ, schema DB hoặc
contract. Kiểm tra riêng cho đợt sửa được ghi khi có kết quả thực; không đổi
SHA trong các bằng chứng cũ thành commit mới.

| Mã | Bản kiểm và kết quả thực |
|---|---|
| V | Backend 181 unit/controller/HTTP mock trên workflow source 88f5f35; có 49 cặp trạng thái, canonical, create V1/V2/retry/PR28 invariant. Log trong [workflow](testing/a1-workflow-2026-11-12/backend-unit.txt). |
| W | Frontend 960/960 sau patch trên máy A (console), lint/typecheck/build mã 0; 5 test activation mới. Log Linux trước commit ở gói rollout ghi đúng base+patch, không gán thành raw log Windows. |
| P | 28 PostgreSQL workflow và 5 script E được lưu trong [log Linux](testing/a1-workflow-2026-11-12/postgres-http-browser.txt); máy A báo PostgreSQL 28/28. Linux ghi base+patch trước commit; backend hiện có cùng code tại 88f5f35, không gán phiên bản trước commit thành một SHA đã tồn tại khi đó. |
| H | Windows HTTP/BFF/CLI 9/9, lượt bật browser tổng 10/10; [console gốc](testing/a1-workflow-2026-11-12/windows/http-bff.txt) và [browser run](testing/a1-workflow-2026-11-12/windows/browser-run.txt). |
| C | Compose 8/8 trên 88f5f35, browser 9/9 và persistence; [báo cáo](A1_COMPOSE_PERFORMANCE_QA.md), JSON gốc trong testing/a1-compose-2026-11-12. |
| B | Boundary 7/7 trên d42deb5, 19:31:48–19:31:54 UTC+7; 10 vòng last-cup đều 201/409. Program digest và image khớp; [JSON gốc](testing/a1-final-qa-2026-11-12/ac-boundaries-result.json). |
| L | Nhóm legacy của lượt 3959f40: exact migration SQL trong schema UUID riêng, 2 Order/2 ledger và digest original-column giữ nguyên, replay/read-only; schema được dọn. |
| S | 7 nhóm browser session/expiry/storage trên 3959f40; Chromium 158.0.8127.18; pageErrors=[]; cookie/auth/BFF/Nest/PG thật. |
| R | Runner browser hiện có, 9/9 bước trên frontend mới tại cùng lượt 3959f40; pageErrors=[]. R là một nhóm trong tổng 9 nhóm, không cộng thành 17 AC. |
| N | 55 mẫu warmup tách riêng; 330/330 mẫu API trong 11 nhóm dưới 500 ms, 0 lỗi, max 331,88 ms trên 88f5f35. [Báo cáo và giới hạn](A1_COMPOSE_PERFORMANCE_QA.md). |
| M | [Demo thủ công 13/11](A1_MANUAL_DEMO_2026-11-13.md): M01–M10 là các nhóm thao tác A xác nhận, không là tổng test tự động. Có chờ hạn thật 15 phút và tạo đơn mới chủ động; metadata Git và image được ghi riêng. Không thu Network/SQL, không kết luận exact-key replay hoặc side effects một lần từ UI. |

L/S/R thuộc một lượt: **9/9 nhóm**, mã 0, `passed=true`, `cleanup=true`, `demoInventoryUnchanged=true`, bắt đầu 20:18:10.568 và kết thúc 20:18:55.773 UTC+7. [JSON tổng hợp gốc](testing/a1-final-qa-2026-11-12/session-legacy-result.json) đã chứa cả hai báo cáo browser; log và JSON browser riêng được sao chép theo [chỉ mục](testing/a1-final-qa-2026-11-12/README.md).

## Phiên bản chạy thực tại 3959f40

- Windows 10.0.19045 x64, Node host v24.16.0, Docker 29.9.3, Compose v5.7.0, PostgreSQL 17.11, Chromium 158.0.8127.18.
- Backend image `sha256:93c73e1dd9c20e558c64f08aac6f859792384ed430653ec27f7b522be71e0e7b`; DB image `sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994` giữ từ lượt đã kiểm trước.
- Frontend image mới `sha256:6ac3316340d40fee89a9522aa5cb851934249c8dab5b86a900053dcdb5fc3db5`, build/recreate riêng. Ba service healthy trước/sau.
- JSON ghi đúng ba Git blob của bản sửa; source d42deb5 là parent; kiểm GitHub xác nhận commit 3959f40 đổi đúng 6 file, trong đó 3 file ứng dụng và 3 tài liệu.
- SHA256 ba script browser/fixture/legacy khớp bản đã kiểm trong môi trường chuẩn bị. Hai JSON gốc được giữ nguyên byte; checksum ở chỉ mục.

NFR N được đo trước sửa provider và trước image frontend mới. Source API/BFF không đổi trong 3959f40; vẫn giữ kết quả N đúng SHA/image cũ, không ghi đã đo lại 330 mẫu trên image mới. Đo tuần tự sau warmup trên dữ liệu mẫu, không phải tải đồng thời/cold-start/HTTPS production. Chromium là trình duyệt đã kiểm; chưa có kết quả Firefox/Safari/Edge hoặc screen reader thật.

## Bảng đối chiếu 27 AC

“Có bằng chứng” là kết quả rà kỹ thuật trong phạm vi mô tả, chưa phải chữ ký reviewer từng ticket. Các assigned reviewer trong TEAM_PLAN/B_AC_LINKS được giữ theo lịch sử; không ghi thay là các bạn đã approve.

| AC | Hành vi được đối chiếu | Bằng chứng/assertion | Giới hạn và ghi chú |
|---|---|---|---|
| S3-PAY-01 | WALLET/CARD, amount từ Order, một consume/award | P: hai phương thức; C2; H8; N luân phiên phương thức | Mock thanh toán, không cổng tiền thật. |
| S3-PAY-02 | FAILED giữ hold/giỏ, không cộng điểm | P FAILED/retry; H1; C3; W payment recovery/runtime | Giữ giỏ khi FAILED có unit; H/C kiểm DB thật. |
| S3-PAY-03 | K1 recovery không lấy identity của latest K2 | P K1 FAILED/K2 success; W payment-recovery/client; R4–6 | K1/K2 là PG + unit; browser mất response kiểm một attempt riêng. |
| S3-PAY-04 | Cùng key create/payment không nhân đơn/tác động | P concurrent create và same-key payment; C3/C8; R5 | Create bận khóa có thể ORDER_REQUEST_IN_PROGRESS; retry chủ động hội tụ. |
| S3-PAY-05 | Đổi method/orderId với key cũ bị chặn, cả sau cancel | P method conflict; B3 sau cancel cả method/orderId, state/kho/điểm giữ nguyên | Key/body gốc replay đúng attempt đã refund. |
| S3-PAY-06 | Hai key tranh một Order tối đa một success | P different-key payment race; hai FAILED/retry | Race success chạy đồng thời; chuỗi FAILED chạy tuần tự. |
| S3-PAY-07 | Key FAILED cũ giữ kết quả, retry key mới cùng Order | P retry/deadline; H2; C3 recreate backend FAILED/SUCCEEDED | Không gia hạn hold/deadline. |
| S3-PAY-08 | Chặn payment tại/sau hạn, expiry/legacy đúng policy | P deadline/expiry race và legacy; B2: −1/0/+1 ms; L policy1 | B2 dùng clock proxy trong transaction test, không sửa clock hệ thống. |
| S3-ORD-01 | Chín cạnh trạng thái, chặn cạnh sai và terminal | V: 49 cặp; P retry/CLI; H6; C5 | Ba cạnh vận hành bằng CLI nội bộ có flag; khách không được gửi status. |
| S3-ORD-02 | Release/refund/return/reverse đúng một lần và atomic | P cancel/payment/PREPARING/rollback; B7 cancel/expiry; C2/C5; R7 | Failpoint test trong proxy; không hook public. |
| S3-ORD-03 | Current Order không bị historical PENDING/version cũ đè | P replay sau PAID/CANCELLED; W order-version/settlement; R8 | Đảo thứ tự response có unit; browser current-read cũng được kiểm riêng. |
| S3-ORD-04 | History đúng chủ, rỗng, createdAt/id DESC | B1: 3 đơn A/1 đơn B/C rỗng, hai timestamp bằng nhau; H3 query lạ; R8 | B1 service/PG, H3 kiểm HTTP; không gán B1 thành HTTP. |
| S3-STK-01 | Tranh Product cuối hoặc mua 2+1 khi tồn 2 không vượt kho | P barrier hai connection; E concurrency log; B6: 10 vòng và loser replay | Cả hai thấy tồn 1 trong từng vòng B6; một 201/một 409; reserved=stock=1. |
| S3-STK-02 | Aggregate Product, rollback giữ dở, retry tối đa 3 | P nhiều size/second-Product payment failure; B4 second-Product create failure/topping; V retry budget | Topping chỉ giá/liên kết/snapshot; không có kho riêng. |
| S3-STK-03 | Trước commit rollback; sau commit replay không thêm | P bốn payment write failpoint/refund/create-ledger rollback; V PR28 mismatches; R4–6 | Mất response sau commit được chặn tại browser route sau upstream commit. |
| S3-PRO-01 | Backend tính/kiểm promotion, giá và official total | P 50.001→5.000→45.001; B5 min/cap/start/end/inactive; V reason; C2; R2 | B5 promotion lookup là fixture, Product đọc PG thật; không sửa DEMO10 chung. |
| S3-PRO-02 | Đơn cũ giữ snapshot/total, đơn mới xét lại mã | P expire promotion/FAILED/retry/create replay | Promotion fixture riêng; total/deadline/snapshot đơn cũ được so sánh. |
| S3-LOY-01 | Cộng 0/9/28 sau PAID, reverse entry gốc một lần | P loyalty/rollback/repeat; C2; H4/H8 | Giữ entry kể cả 0 điểm; failpoint không để tác động dở. |
| S3-CART-01 | Giữ cấu hình/binding tới khi PAID được xác nhận | W FAILED/binding; R2–6; H1/C3 | PENDING không clear, FAILED không clear; chỉ current PAID đúng tuple. |
| S3-CART-02 | Không auto POST; A/B và logout/login giữ recovery đúng chủ | S1 A→B→A; S2 shared cookie; S4 revoked-session/login; W bridge | Key/body cũ được so sánh trước/sau; B không thấy/gửi recovery A. |
| S3-CART-03 | Chỉ clear paid-current đúng tuple, giữ giỏ mới | W revision/snapshot/owner/cancellation; S6 delayed read/new cart; R6–7 | S6 dùng hai tab thật và Web Locks; late read không ghi đè cart mới. |
| S3-CART-04 | UNRESOLVED giữ key/body; key mới chỉ sau FAILED xác nhận | W payment/client/runtime; S1 lost-before-forward + replay; R4–6 lost-after-commit | Hai tình huống mất phản hồi được phân biệt, không tự gửi lại sau login/F5. |
| S3-CART-05 | Expired/reorder chủ động, kiểm kho/tổng, giữ giỏ mới | S5 expiry→preview/back→new order/key; S6 old read/new cart; B/P stock; R2; M08–M10 | S5 đặt deadline fixture về quá khứ; M08 chờ hạn thật, M10 xác nhận mã/hạn mới. Lượt thủ công không chụp key/body hoặc SQL. |
| S3-SEC-01 | Owner/session/Origin guards, response cũ và cookie mới | H3/H7/C1; S2 expected-owner 403/late A GET; S3 late logout/B cookie+cart; S4 real 401; W no-store/token | S2 old response thực sự delivered rồi bị bỏ; S3 204 không Set-Cookie. Safari/Firefox chưa kiểm. |
| S3-MIG-01 | Giữ legacy DB/key/hash/response, storage v1 pending, old writer guard | L exact S1/S2→S3 SQL + digest + replay/remap/policy1; S7 v1/unsupported/retry; W envelope migration/v1 writer | L ở schema UUID riêng: 2 Order/2 ledger; old writer/quota/lock failures có unit, không nhận là browser tab ứng dụng v1. |
| S3-DEL-01 | Compose ba service, README/deploy/seed/demo/persistence | C1–8 trên máy A; E seed ACTIVE/migration; S/L/R trên frontend mới | A khác môi trường E; backend/DB private. Production HTTPS thuộc nghiệm thu A2 riêng. |
| S3-DEL-02 | Hồ sơ phát hành, review PR, Review/Retro/backlog và packaging | QA đã push; B approve `f3f0ef7`, #53 đã merge; M ghi demo riêng của A | CÒN MỞ: chốt review/merge hồ sơ cuối, Review/Retro/feedback nếu lớp yêu cầu, giờ LMS và gói bàn giao từ SHA cuối. |

## Ba tiêu chí chấm Task 10

1. **Chặn chuyển sai trạng thái:** 49 cặp kiểm chín cạnh; PG/HTTP/CLI xác nhận retry, terminal và side effects phù hợp.
2. **Cùng key chỉ một đơn/giao dịch:** create và payment có ca cạnh tranh riêng; kiểm COUNT/IDs/ledger/stock/points; replay sau restart và refund không thêm tác động.
3. **Đặt đồng thời không vượt kho:** hai connection với barrier cùng đọc tồn, tình huống tồn 2/mua 2+1, Product cuối tồn 1 và 10 vòng loser replay. Không dùng unit mock thay bằng chứng PostgreSQL.

## Điều kiện đóng A1 còn lại

- PR #53 đã được Khai-Dang approve tại `f3f0ef7` và merge `6f38fcb`; approval cũ `ff9bb73` không thay bản mới. Còn chốt các thay đổi tài liệu sau đó, gồm #54, #55 và bản ghi demo này; approval PR không tự thay reviewer từng ticket hoặc bản phát hành cuối.
- [Review/Retro/backlog](B_REVIEW_RETRO_SPRINT3.md) giữ sự việc thực tế. Demo thủ công 13/11 là lượt riêng của A; chưa xác nhận buổi nhóm hoặc feedback giảng viên. Ghi thêm người tham gia, hình thức, góp ý và xử lý khi thực sự diễn ra.
- QA gốc tại `a08152c` và candidate 422 file ở mốc đó được giữ theo lịch sử. Candidate mới tại `f3f0ef7` có 423 file tracked, đã tạo/kiểm ZIP trên máy A; vẫn chưa thay gói phát hành từ SHA cuối. Sau khi chốt tài liệu, cập nhật source/manifest và ghi SHA thực tế; đối chiếu [board](B_BOARD_SPRINT3.md), hướng dẫn nộp và giờ LMS chính thức.
- B đã đồng ý tách CI sang PR sau trong approval `f3f0ef7`; A2 Task 4.4 theo dõi CI riêng. Đợt cập nhật hồ sơ này không thêm CI vào A1 hoặc ghi pipeline đã chạy.
- Không mở thêm tính năng ngoài phạm vi để đóng các mục hồ sơ này. Phần đã code/test và phần cần review/nghiệm thu được theo dõi riêng, không xóa lịch sử FAIL hoặc lập burndown giả.
