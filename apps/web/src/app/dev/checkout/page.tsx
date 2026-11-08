import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { CheckoutPreview } from "@/features/cart/preview/checkout-preview";

export const metadata: Metadata = { title: "Xem thử checkout · BrewLite", robots: { index: false, follow: false } };

export default function CheckoutPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.CHECKOUT_PREVIEW_ENABLED !== "1") notFound();
  return <PageContainer spacing="compact">
    <h1 className="text-3xl font-bold">Xem thử checkout Sprint 3</h1>
    <CheckoutPreview />
  </PageContainer>;
}
