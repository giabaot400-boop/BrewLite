export const MAIN_CONTENT_ID = "main-content";

/** Liên kết đầu trang cho người dùng bàn phím; chỉ hiện khi được focus. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only rounded-md bg-coffee px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
    >
      Bỏ qua điều hướng, tới nội dung chính
    </a>
  );
}
