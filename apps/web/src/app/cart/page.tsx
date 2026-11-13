import { PageContainer } from "@/components/layout/page-container";
import { CartPanel } from "@/features/cart/components/cart-panel";
import { CartCheckoutPanelV2 } from "@/features/cart/components/cart-checkout-panel-v2";
import { checkoutV2IntegrationEnabled } from "@/lib/server/checkout-integration";

export default function CartPage() {
  const ActiveCartPanel = checkoutV2IntegrationEnabled() ? CartCheckoutPanelV2 : CartPanel;
  return (
    <PageContainer spacing="compact">
      <h1 className="text-3xl font-bold">Giỏ hàng</h1>
      <ActiveCartPanel />
    </PageContainer>
  );
}
