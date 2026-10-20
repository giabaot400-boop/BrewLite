import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, ProductApiError } from "@/features/products/api";
import { ProductImage } from "@/features/products/components/product-image";
import { ProductOptions } from "@/features/products/components/product-options";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id).catch((error: unknown) => {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    throw error;
  });

  // Khung chi tiết đầu tiên; A tiếp tục thêm chọn size/topping và tính giá.
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-semibold text-coffee">‹ Quay lại menu</Link>
      <div className="mt-6 grid items-start gap-8 md:grid-cols-2 md:gap-14">
        <ProductImage key={product.id} src={product.imageUrl} name={product.name} />
        <div className="py-3">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <p className="mt-5 leading-7 text-stone-600">{product.description}</p>
          <ProductOptions key={product.id} basePrice={product.price} sizes={product.sizes} toppings={product.toppings}/>
        </div>
      </div>
    </main>
  );
}
