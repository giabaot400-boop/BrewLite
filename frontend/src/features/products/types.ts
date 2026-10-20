export type SizeCode = "S" | "M" | "L";

export type ProductSummary = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
};

export type SizeOption = { code: SizeCode; extraPrice: number };
export type ToppingOption = { id: string; name: string; price: number };

export type ProductDetail = ProductSummary & {
  description: string;
  sizes: SizeOption[];
  toppings: ToppingOption[];
};
