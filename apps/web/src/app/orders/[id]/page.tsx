import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { OrderDetailPage } from "@/features/orders/components/order-detail-page";

export const metadata: Metadata = { title: "Chi tiết đơn hàng – BrewLite" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  // Next.js đã giải mã route param đúng một lần; ID là opaque nên KHÔNG giải mã thêm (a%252Fb -> "a%2Fb").
  const { id } = await params;
  const query = await searchParams;
  // `placed=1` do luồng đặt hàng gắn vào sau khi tạo đơn thành công; chỉ bật thông báo, không đổi dữ liệu.
  const placed = (Array.isArray(query.placed) ? query.placed[0] : query.placed) === "1";
  return (
    <PageContainer spacing="compact">
      <OrderDetailPage id={id} placed={placed} />
    </PageContainer>
  );
}
