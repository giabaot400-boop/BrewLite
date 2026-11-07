"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { ResponsiveGrid } from "@/components/layout/responsive-grid";
import { EmptyState, ErrorState, LoadingState, ProductCardSkeleton } from "@/components/ui/state-message";
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
    <PageContainer>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chọn món bạn thích</h1>
      <p className="mt-3 text-stone-600">Giá hiển thị là giá size S.</p>

      <section aria-label="Danh sách đồ uống" aria-live="polite" aria-busy={state.status === "loading"} className="mt-10">
        {state.status === "loading" && (
          <div>
            <div className="mb-4">
              <LoadingState message="Đang tải thực đơn…" />
            </div>
            <ResponsiveGrid hidden>
              {[1, 2, 3, 4].map((number) => <ProductCardSkeleton key={number} />)}
            </ResponsiveGrid>
          </div>
        )}

        {state.status === "error" && (
          <ErrorState message="Không tải được thực đơn. Anh/chị vui lòng thử lại." onRetry={retry} />
        )}

        {state.status === "ready" && state.products.length === 0 && (
          <EmptyState message="Hiện chưa có sản phẩm." />
        )}

        {state.status === "ready" && state.products.length > 0 && (
          <ResponsiveGrid>
            {state.products.map((product) => <ProductCard key={product.id} product={product} />)}
          </ResponsiveGrid>
        )}
      </section>
    </PageContainer>
  );
}
