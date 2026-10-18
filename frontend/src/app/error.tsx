"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-bold">Không tải được sản phẩm</h1>
      <p className="mt-4 text-stone-600">Vui lòng thử lại sau ít phút.</p>
      <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-lg bg-coffee px-5 py-3 font-semibold text-white">Thử lại</button>
    </main>
  );
}
