import { PageContainer } from "@/components/layout/page-container";
import { CartPanel } from "@/features/cart/components/cart-panel";

export default function CartPage() {
  return (
    <PageContainer spacing="compact">
      <h1 className="text-3xl font-bold">Giỏ hàng</h1>
      <CartPanel />
    </PageContainer>
  );
}
