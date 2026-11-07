import type { ProductDetail } from "./types";

// Dữ liệu mẫu tách khỏi JSX. Chuyển PRODUCTS_SOURCE sang api khi C có endpoint.
const sizes: ProductDetail["sizes"] = [
  { code: "S", extraPrice: 0 },
  { code: "M", extraPrice: 5000 },
  { code: "L", extraPrice: 10000 },
];

export const productFixtures: ProductDetail[] = [
  {
    id: "coffee-milk",
    name: "Cà phê sữa",
    description: "Cà phê đậm vị kết hợp sữa.",
    price: 35000,
    imageUrl: "/images/coffee-milk.svg",
    sizes,
    toppings: [
      { id: "cream", name: "Kem", price: 7000 },
      { id: "pearl", name: "Trân châu", price: 5000 },
    ],
  },
  {
    id: "americano",
    name: "Americano",
    description: "Espresso kết hợp nước nóng, giữ hương cà phê nguyên bản.",
    price: 40000,
    imageUrl: "/images/americano.svg",
    sizes,
    toppings: [],
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    description: "Espresso, sữa nóng và lớp bọt sữa mềm.",
    price: 45000,
    imageUrl: "/images/cappuccino.svg",
    sizes,
    toppings: [],
  },
  {
    id: "peach-tea",
    name: "Trà đào",
    description: "Trà thơm kết hợp vị đào thanh mát.",
    price: 39000,
    imageUrl: "/images/peach-tea.svg",
    sizes,
    toppings: [],
  },
];
