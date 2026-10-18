"use client";

import { useEffect, useState } from "react";
import { getProducts } from "../api";
import type { ProductSummary } from "../types";
import { ProductCard } from "./product-card";

type MenuState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; products: ProductSummary[] };

export function Menu() {
  const [state, setState] = useState<MenuState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProducts(controller.signal)
      .then((products) => {
        if (!controller.signal.aborted) setState({ status: "ready", products });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chọn món bạn thích</h1>
      <p className="mt-3 text-stone-600">Giá hiển thị là giá size S.</p>

      <section aria-label="Danh sách đồ uống" aria-live="polite" aria-busy={state.status === "loading"} className="mt-10">
        {state.status === "loading" && (
          <div>
            <p role="status" className="mb-4 text-stone-600">Đang tải thực đơn…</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
              {[1, 2, 3, 4].map((number) => (
                <div key={number} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="aspect-4/3 rounded-xl bg-stone-100" />
                  <div className="mt-5 h-5 w-2/3 rounded bg-stone-100" />
                  <div className="mt-3 h-5 w-1/3 rounded bg-stone-100" />
                </div>
              ))}
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-xl border border-stone-200 bg-white px-6 py-10">
            <p role="alert">Không tải được thực đơn. Anh/chị vui lòng thử lại.</p>
            <button type="button" onClick={retry} className="mt-5 min-h-11 rounded-lg bg-coffee px-5 py-3 font-semibold text-white">Thử lại</button>
          </div>
        )}

        {state.status === "ready" && state.products.length === 0 && (
          <p className="rounded-xl border border-stone-200 bg-white px-6 py-10 text-stone-600">Hiện chưa có sản phẩm.</p>
        )}

        {state.status === "ready" && state.products.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {state.products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </section>
    </main>
  );
}
