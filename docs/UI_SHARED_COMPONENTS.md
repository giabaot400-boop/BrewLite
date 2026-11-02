# UI dùng chung (phần B)

Tài liệu để A và B chốt props trước khi review chéo (hồ sơ v1.1, mục 6.5).
Code nằm trong `frontend/src/components/`. A giữ `features/products`.

## Component

| File | Export | Dùng để | Props chính |
|---|---|---|---|
| `layout/header.tsx` | `Header` | Header và điều hướng chính, dùng trong `app/layout.tsx` | không có |
| `layout/skip-link.tsx` | `SkipLink`, `MAIN_CONTENT_ID` | Liên kết "Bỏ qua điều hướng" cho bàn phím | không có |
| `layout/page-container.tsx` | `PageContainer`, `PAGE_WIDTH` | Thẻ `<main>` của trang, chiều rộng và padding chung | `spacing`: `"default"` (menu) hoặc `"compact"` (chi tiết, lỗi, 404) |
| `layout/responsive-grid.tsx` | `ResponsiveGrid` | Lưới 1, 2, 4 cột | `hidden`: true khi chỉ là khung giữ chỗ |
| `ui/card.tsx` | `Card`, `cardClassName` | Khung card | `className` |
| `ui/button.tsx` | `Button`, `ButtonLink` | Nút và liên kết dạng nút, cao tối thiểu 44 px | `variant`: `"primary"` hoặc `"text"` |
| `ui/state-message.tsx` | `LoadingState`, `EmptyState`, `ErrorState`, `ProductCardSkeleton` | Trạng thái loading, empty, error | `message`; `ErrorState` thêm `title`, `onRetry` |

Quy ước: mỗi trang dùng đúng một `PageContainer`; trạng thái lỗi dùng `role="alert"`,
loading dùng `role="status"`.

## Breakpoint (mục 6.4)

| Kích thước | Menu |
|---|---|
| Dưới 640 px | 1 cột |
| Từ 640 px (`sm`) | 2 cột |
| Từ 1024 px (`lg`) | 4 cột |

Trang chi tiết đổi sang hai cột từ 768 px (`md`), do A giữ trong `app/products/[id]/page.tsx`.
Hồ sơ ghi mốc desktop là 1024 px; nếu nhóm muốn khớp chính xác, đổi `md:` thành `lg:` ở file đó.

## Checklist accessibility (mục 6.4)

| Mục | Kết quả | Cách kiểm tra |
|---|---|---|
| Tương phản đủ đọc trên nền kem | Đạt | Tính tỷ lệ WCAG: chữ chính 13,9:1; `stone-600` 7,2:1; `coffee` 7,2:1; trắng trên `coffee` 7,7:1. Đều trên 4,5:1 |
| Dùng được bằng bàn phím, có focus visible | Đạt phần đã kiểm tra | Tab đầu tiên vào skip-link, Enter chuyển focus tới `main`; outline 3 px cho link, button, input. Cần B hoặc người khác Tab thử qua trang chi tiết bằng tay |
| Label rõ nghĩa, vùng bấm tối thiểu khoảng 44 px | Đạt | Logo, Menu, nút, link quay lại cao 44 px; label size và topping cao tối thiểu 44 px |
| Không chỉ dùng màu để phân biệt selected | Đạt | Radio và checkbox gốc hiển thị trạng thái chọn, kèm đổi màu nền |

## Chưa làm hoặc cần người khác xác nhận

- Chưa thử bằng trình đọc màn hình thật (NVDA, VoiceOver).
- Chưa kiểm tra Safari và Firefox; đã chạy thử trên Chromium ở 390, 768 và 1280 px.
- Chưa tick mục "B rà layout..." trong `docs/SPRINT1_CHECKLIST.md`; tick sau khi có người review.
