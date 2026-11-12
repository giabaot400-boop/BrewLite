# Bằng chứng bổ sung và kiểm tra rollout trên Windows

Ngày thực hiện: 12/11/2026, A. Giữ nguyên byte hai JSON gốc do người kiểm thử cung cấp. Báo cáo tổng hợp: [A1_ACCEPTANCE_REVIEW.md](../../A1_ACCEPTANCE_REVIEW.md).

| File | Phiên bản và phạm vi |
|---|---|
| [ac-boundaries-result.json](ac-boundaries-result.json) | d42deb5, backend/DB/frontend image cũ; 7 nhóm service/PG, gồm 10 vòng tranh Product cuối |
| [session-legacy-result.json](session-legacy-result.json) | 3959f40, frontend image mới; legacy 1 nhóm + session/browser 7 nhóm + hồi quy 1 nhóm có 9 bước |
| windows-boundaries-run.txt | Console gốc được sao chép từ thư mục báo cáo boundary trên máy A |
| windows-session-legacy-run.txt | Console gốc được sao chép từ thư mục session/legacy trên máy A |
| windows-session-browser-result.json | JSON browser gốc của 7 nhóm session/expiry/storage |
| windows-baseline-browser-result.json | JSON browser gốc của 9 bước hồi quy |

Script được lưu nguyên bản trong `scripts`. Boundary runner chốt đúng d42deb5 và image cũ; bản sao này phục vụ truy vết, không mặc định chạy trên HEAD mới. Session/legacy runner kiểm ancestry d42deb5, đúng ba Git blob của bản sửa rollout, clean HEAD và image thực; có thể kiểm bản source chỉ thêm tài liệu sau 3959f40. Baseline browser runner là `apps/web/scripts/check-workflow-browser.mjs`, Git blob `f9a248160eab2b3ced5647d1c4110ef5e906c32f`.

Các log/JSON browser gốc cần được sao chép bằng helper trong gói QA trước khi commit. Không suy nội dung console hoặc dựng lại raw JSON browser từ object lồng trong báo cáo tổng hợp.

## SHA256 của file đã nhận và script đã dùng

| File | SHA256 |
|---|---|
| `ac-boundaries-result.json` | `f9746dd306e4cb3c84a7160ab258956049420c70a6876e2fb221b44ec4c27ece` |
| `scripts/BrewLite_A1_AC_Boundaries_Check.cjs` | `b178ce5a48ced4a6feb69b1358108d65334e8663c03e67068bf63c8862d83912` |
| `scripts/BrewLite_A1_Session_Legacy_Check.cjs` | `15ed14bc1c72ef6af67404e071861e6f5ab3d91ae9e6c004db0fa31795fca776` |
| `scripts/legacy-preservation.mjs` | `138946194066e0f6db576231772fcef7e1a85dee7b24ea976cf11fbdc6cb4b59` |
| `scripts/session-browser.mjs` | `3d64cfee85c89d85a4be2904c8114ae021e8431e0470afb2d42b4c62a6d3e872` |
| `scripts/session-db.mjs` | `c0da0afbaa32b3f037716251f91a040e384178228004250dc99437e2e240460f` |
| `session-legacy-result.json` | `f9a25c0d58c9c84ebc3f81766b3c6dd1ec3b365e54e102e33d4c8c14c09e6939` |

Lượt boundary dùng service đã build và PostgreSQL thật, không phải HTTP/browser. Lượt legacy dùng đúng SQL migration trong schema UUID riêng, kiểm original-column digest và compiled replay; schema thử được dọn. Các ca browser dùng cookie/auth/BFF/Nest thật, context và fixture riêng; clock/expiry/revoke có điều khiển trong fixture đúng như runner. Không có giao dịch tiền thật.
