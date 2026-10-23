import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/ui/state-message";

export default function ProductLoading() {
  return (
    <PageContainer spacing="compact">
      <LoadingState message="Đang tải chi tiết sản phẩm…" />
    </PageContainer>
  );
}
