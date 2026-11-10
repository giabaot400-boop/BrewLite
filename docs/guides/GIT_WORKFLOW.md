# Làm việc với Git — Assignment 1

Repository A1: https://github.com/giabaot400-boop/BrewLite.
Assignment 2 có [repo riêng](https://github.com/giabaot400-boop/BrewLite-Assignment2);
kiểm tra origin và thư mục trước khi làm việc. Mẫu thư mục A1 là `D:\cnpm\brewlite`.

## Bắt đầu phần việc

```powershell
git remote -v
git status --short --branch
git switch main
git pull --ff-only origin main
git switch -c feature/ten-cong-viec
```

Giữ working tree sạch trước khi đổi nhánh. Tên nhánh theo task thực tế; mỗi
thành viên có cấu hình tên/email tác giả trên máy. Không cần đặt lại cấu hình
global hoặc tạo lại repository khi đã có clone.

## Review và tích hợp

Commit phần việc, chạy kiểm tra phù hợp, push nhánh và mở PR. Mô tả thay đổi,
validation và giới hạn; một thành viên khác review trước merge theo quy ước nhóm.
Với chuỗi PR phụ thuộc, kiểm tra đúng base đã thống nhất, không tự đổi toàn bộ
sang main. A/B chốt props và file UI dùng chung; C/D/E chốt contract/schema,
A phối hợp BFF và tích hợp theo phân công.

Khi main thay đổi, lưu phần đang làm trước rồi cập nhật trên nhánh phần việc:

```powershell
git -c gc.auto=0 fetch origin
git merge origin/main
```

Nếu conflict, đối chiếu người sửa và contract; không ghi đè toàn bộ file chỉ để
hết báo lỗi. Không force-push main hoặc sửa lịch sử để thay bằng chứng review.
Không commit file .env thật, secret, node_modules hoặc cache/build output.

## Lịch sử và hai repo

Quy ước khởi tạo cũ được giữ ở [bản nguồn trước khi gom tài liệu](https://github.com/giabaot400-boop/BrewLite/blob/69b801165fc0b199ac70fdc3afa75932a82601c9/docs/GIT_WORKFLOW.md).
Các ngoại lệ Sprint 1–2 vẫn nằm trong hồ sơ tương ứng; hướng dẫn hiện hành
không biến các ngoại lệ đó thành quy trình đã đạt. Thay đổi A1 cần đưa sang A2
phải có commit nguồn, rà phụ thuộc và PR/kiểm thử ở repo A2; không tự đồng bộ.
