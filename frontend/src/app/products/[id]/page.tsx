import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { getProduct, ProductApiError } from "@/features/products/api";
import { ProductImage } from "@/features/products/components/product-image";
import { ProductOptions } from "@/features/products/components/product-options";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id).catch((error: unknown) => {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    throw error;
  });

  return (
    <PageContainer spacing="compact">
      <ButtonLink href="/" variant="text">‹ Quay lại menu</ButtonLink>
      <div className="mt-6 grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-14">
        <ProductImage key={product.id} src={product.imageUrl} name={product.name} />
        <div className="py-3">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <p className="mt-5 leading-7 text-stone-600">{product.description}</p>
          <ProductOptions key={product.id} basePrice={product.price} sizes={product.sizes} toppings={product.toppings}/>
        </div>
      </div>
    </PageContainer>
  );
}
