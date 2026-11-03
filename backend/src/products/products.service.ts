
import { Injectable, NotFoundException } from '@nestjs/common';

const products = [
  {
    id: 'coffee-milk',
    name: 'Cà phê sữa',
    description: 'Cà phê đậm vị kết hợp sữa.',
    price: 35000,
    imageUrl: '/images/coffee-milk.svg',
    sizes: [
      { code: 'S', extraPrice: 0 },
      { code: 'M', extraPrice: 5000 },
      { code: 'L', extraPrice: 10000 },
    ],
    toppings: [],
  },
  {
    id: 'americano',
    name: 'Americano',
    description: 'Espresso kết hợp nước nóng, giữ hương cà phê nguyên bản.',
    price: 40000,
    imageUrl: '/images/americano.svg',
    sizes: [
      { code: 'S', extraPrice: 0 },
      { code: 'M', extraPrice: 5000 },
      { code: 'L', extraPrice: 10000 },
    ],
    toppings: [],
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    description: 'Espresso, sữa nóng và lớp bọt sữa mềm.',
    price: 45000,
    imageUrl: '/images/cappuccino.svg',
    sizes: [
      { code: 'S', extraPrice: 0 },
      { code: 'M', extraPrice: 5000 },
      { code: 'L', extraPrice: 10000 },
    ],
    toppings: [],
  },
  {
    id: 'peach-tea',
    name: 'Trà đào',
    description: 'Trà thơm kết hợp vị đào thanh mát.',
    price: 39000,
    imageUrl: '/images/peach-tea.svg',
    sizes: [
      { code: 'S', extraPrice: 0 },
      { code: 'M', extraPrice: 5000 },
      { code: 'L', extraPrice: 10000 },
    ],
    toppings: [],
  },
];

@Injectable()
export class ProductsService {
  getProducts() {
    return products.map(({ id, name, price, imageUrl }) => ({
      id,
      name,
      price,
      imageUrl,
    }));
  }

  getProductById(id: string) {
    const product = products.find((item) => item.id === id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
