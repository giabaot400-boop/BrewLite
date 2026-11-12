# Bằng chứng Compose và hiệu năng — 12/11/2026

Source kiểm tra: `88f5f35f3bb921bd68be2d0f8c70bd6736ab101e`. Xem [báo cáo tổng hợp](../../A1_COMPOSE_PERFORMANCE_QA.md).

## Nội dung

- `compose-result.json`: helper v2, 8/8 nhóm, cleanup và snapshot kho demo.
- `browser-result.json`: Chromium 158.0.8127.18, 9/9 bước, pageErrors rỗng; khớp trường browser trong Compose JSON.
- `performance-result.json`: 55 mẫu warmup và 330 mẫu đo, thống kê theo nhóm, dataset và môi trường.
- `scripts/`: bản nguyên nội dung các helper đã chạy; SHA-256 ở bảng dưới.
- `compose-run.txt`, `performance-run.txt`, `checkout-paid.png`: file gốc trên máy A cần được sao chép bằng script kèm gói QA trước khi commit; không dựng lại log/ảnh từ phần tổng hợp.

Các helper đã lưu chốt source `88f5f35` và yêu cầu working tree sạch; chúng không tự đổi scope sang commit mới. Để tái hiện, dùng checkout riêng sạch của SHA trên, cài dependency/browser, dựng cùng cấu hình Compose theo hướng dẫn rồi truyền đường dẫn checkout đó cho helper. Ghi môi trường/image ID và kết quả của lượt mới riêng; không thay kết quả lịch sử. Helper không đọc `.env.sprint3-test`, không kết nối PostgreSQL Windows, không seed/reset.

## Checksum SHA-256

| File | SHA-256 |
|---|---|
| `compose-result.json` | `3c2e85f0c350b4c3e1ecec77954ef24c4491be54c988ffc2234aa4b7e892098a` |
| `browser-result.json` | `f75e8cc84d545a8aa53f2883b536f6d381a66f4b028535b2ffc13f5db9c29b78` |
| `performance-result.json` | `9c3b8daf73127f34122e34233f5e74edabe2aa3b0978a8e66995bbe4086edf56` |
| `scripts/BrewLite_A1_Compose_Check.cjs` | `472c3cb8acd57b684954a28be0e6e1915d43d3efd629e11c69bd4f380b39d53e` |
| `scripts/BrewLite_A1_Compose_Performance_Check.cjs` | `1e5987e6c21ad7da0d54c874760c30cec3a8dc03339076daa5c23ed394be562f` |

JSON được giữ nguyên byte từ các file người kiểm thử cung cấp. Không lưu `.env.compose`, JWT, cookie hoặc mật khẩu fixture trong hồ sơ. Các file run/ảnh được kiểm kê sau khi sao chép từ máy A.

## Nguồn trên máy A

- Workflow: `E:\download\BrewLite_A1_Compose_2026-11-12T11-31-06-170Z`.
- Hiệu năng: `E:\download\BrewLite_A1_Compose_Performance_2026-11-12T11-47-57-227Z`.
- Lượt workflow v1 chưa đạt: `E:\download\BrewLite_A1_Compose_2026-11-12T11-21-22-295Z`; console ghi 2/8, fetch failed, phục hồi cấu hình và cleanup thành công. Báo cáo gốc lượt v1 được người kiểm thử giữ riêng, không được thay bằng JSON v2.
