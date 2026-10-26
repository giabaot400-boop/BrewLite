# Làm việc với Git

> Repository chung đã được thiết lập tại
> https://github.com/giabaot400-boop/BrewLite.
> Mục “Đưa bộ khung lên repo chung” ghi lại hướng dẫn khởi tạo ban đầu,
> chỉ áp dụng khi tạo repository mới. Các quy tắc nhánh và review bên dưới
> tiếp tục được áp dụng.

## Đưa bộ khung lên repo chung

Repository chung: https://github.com/giabaot400-boop/BrewLite.
Nhánh mặc định là main. Các bước bên dưới lưu hướng dẫn khởi tạo ban đầu,
chỉ áp dụng khi tạo repository mới.

Người phụ trách tạo một GitHub repository trống, chưa thêm README hay gitignore.
Sau đó mở terminal trong thư mục `brewlite`:

```sh
git remote add origin <URL_REPO_CHUNG>
git push -u origin main
git push -u origin feature/menu
```

Thay cả `<URL_REPO_CHUNG>` bằng URL thật, không giữ dấu ngoặc nhọn.
Trên GitHub, đặt default branch là `main`. Có thể bật yêu cầu một người review
trước khi merge nếu gói tài khoản/repo hỗ trợ.

## Thành viên A tiếp tục phần Menu

```sh
git switch feature/menu
```

Mỗi thành viên cấu hình thông tin tác giả trên máy trước khi tạo commit mới:

```sh
git config user.name "Ho ten thanh vien"
git config user.email "Email GitHub cua thanh vien"
```

Chỉ chỉnh cấu hình tại repo này, không cần `--global`.

## B C D E bắt đầu phần việc

Mỗi người clone repo chung, tách nhánh từ `main` đã cập nhật:

```sh
git switch main
git pull --ff-only
git switch -c feature/products-api
```

Tên nhánh theo task, ví dụ `feature/shared-ui`, `feature/products-api`,
`test/products-api`, `chore/database`. Không phải ai cũng dùng cùng một tên nhánh.

## Gộp code

Push nhánh, mở PR với base `main`, ghi việc đã làm và cách kiểm tra. Người khác
review, chạy phần liên quan rồi mới merge. `feature/menu` ban đầu chỉ là tiến độ
đầu tiên của A, chưa phải toàn bộ Sprint 1 đã Done.

Khi `main` có thay đổi cần dùng, commit hoặc stash phần đang làm trước, rồi:

```sh
git fetch origin
git merge origin/main
```

Chạy lệnh merge trên nhánh phần việc của mình. Nếu có conflict, đối chiếu với
người sửa cùng file; không chọn ghi đè toàn bộ file chỉ để hết báo lỗi.

A và B chốt trước props và file cùng dùng. A phụ trách `features/products`,
B tiếp tục `components/layout` và UI chung. C/E phụ trách `backend`; thay đổi
contract cần báo A và D.
