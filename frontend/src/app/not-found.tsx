import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <PageContainer spacing="compact">
      <h1 className="text-2xl font-bold">Không tìm thấy trang hoặc sản phẩm</h1>
      <p className="mt-4 text-stone-600">Bạn có thể quay lại thực đơn để chọn món khác.</p>
      <div className="mt-6">
        <ButtonLink href="/">Về menu</ButtonLink>
      </div>
    </PageContainer>
  );
}
