import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { OrderHistoryPage } from "@/features/orders/components/order-history-page";

export const metadata: Metadata = { title: "Đơn hàng của tôi – BrewLite" };

export default function OrdersPage() {
  return (
    <PageContainer spacing="compact">
      <h1 className="mb-6 text-3xl font-bold">Đơn hàng của tôi</h1>
      <OrderHistoryPage />
    </PageContainer>
  );
}
