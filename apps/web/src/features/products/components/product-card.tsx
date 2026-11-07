import Link from "next/link";
import { cardClassName } from "@/components/ui/card";
import type { ProductSummary } from "../types";
import { formatPrice } from "../format-price";
import { ProductImage } from "./product-image";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article>
      <Link
        href={`/products/${encodeURIComponent(product.id)}`}
        className={`${cardClassName} block p-4 transition-colors hover:border-coffee motion-reduce:transition-none`}
      >
        <ProductImage key={product.imageUrl} src={product.imageUrl} name={product.name} />
        <h2 className="mt-5 text-lg font-semibold">{product.name}</h2>
        <div className="mt-3 flex items-center justify-between text-coffee">
          <p className="font-bold">{formatPrice(product.price)}</p>
          <span aria-hidden="true" className="text-2xl">›</span>
        </div>
      </Link>
    </article>
  );
}
