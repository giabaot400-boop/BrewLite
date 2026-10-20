import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-bold">Không tìm thấy trang hoặc sản phẩm</h1>
      <p className="mt-4 text-stone-600">Bạn có thể quay lại thực đơn để chọn món khác.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-coffee px-5 py-3 font-semibold text-white">Về menu</Link>
    </main>
  );
}
