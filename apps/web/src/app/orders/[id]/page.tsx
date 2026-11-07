import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { OrderDetailPage } from "@/features/orders/components/order-detail-page";

export const metadata: Metadata = { title: "Chi tiết đơn hàng – BrewLite" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** ID là opaque; chỉ giải mã phần trăm khi hợp lệ, nếu không giữ nguyên để backend trả 404. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  // `placed=1` do luồng đặt hàng gắn vào sau khi tạo đơn thành công; chỉ bật thông báo, không đổi dữ liệu.
  const placed = (Array.isArray(query.placed) ? query.placed[0] : query.placed) === "1";
  return (
    <PageContainer spacing="compact">
      <OrderDetailPage id={safeDecode(id)} placed={placed} />
    </PageContainer>
  );
}
