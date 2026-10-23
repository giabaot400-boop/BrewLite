"use client";

import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/ui/state-message";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PageContainer spacing="compact">
      <ErrorState title="Không tải được sản phẩm" message="Vui lòng thử lại sau ít phút." onRetry={reset} />
    </PageContainer>
  );
}
