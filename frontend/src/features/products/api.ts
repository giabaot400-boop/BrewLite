import { productFixtures } from "./fixtures";
import type { ProductDetail, ProductSummary, SizeOption, ToppingOption } from "./types";

export class ProductApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ProductApiError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSummary(value: unknown): value is ProductSummary {
  return isObject(value) && isText(value.id) && isText(value.name)
    && isMoney(value.price) && isText(value.imageUrl);
}

function isSize(value: unknown): value is SizeOption {
  return isObject(value) && ["S", "M", "L"].includes(String(value.code)) && isMoney(value.extraPrice);
}

function isTopping(value: unknown): value is ToppingOption {
  return isObject(value) && isText(value.id) && isText(value.name) && isMoney(value.price);
}

function isDetail(value: unknown): value is ProductDetail {
  if (!isObject(value)) return false;
  const { description, sizes, toppings } = value;
  return isSummary(value) && typeof description === "string"
    && Array.isArray(sizes) && sizes.length === 3 && sizes.every(isSize)
    && new Set(sizes.map((size) => size.code)).size === 3
    && Array.isArray(toppings) && toppings.every(isTopping)
    && new Set(toppings.map((topping) => topping.id)).size === toppings.length;
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new ProductApiError("Thiếu NEXT_PUBLIC_API_URL.");
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, { signal, cache: "no-store" });
  if (!response.ok) throw new ProductApiError("Không tải được dữ liệu sản phẩm.", response.status);
  return response.json();
}

export async function getProducts(signal?: AbortSignal): Promise<ProductSummary[]> {
  if (process.env.NEXT_PUBLIC_PRODUCTS_SOURCE === "fixture") {
    return productFixtures.map(({ id, name, price, imageUrl }) => ({ id, name, price, imageUrl }));
  }
  const data = await request("/products", signal);
  if (!Array.isArray(data) || !data.every(isSummary)
    || new Set(data.map((product) => product.id)).size !== data.length) {
    throw new ProductApiError("Dữ liệu menu không đúng API contract.");
  }
  return data;
}

export async function getProduct(id: string): Promise<ProductDetail> {
  if (process.env.NEXT_PUBLIC_PRODUCTS_SOURCE === "fixture") {
    const product = productFixtures.find((item) => item.id === id);
    if (!product) throw new ProductApiError("Không tìm thấy sản phẩm.", 404);
    return structuredClone(product);
  }
  const data = await request(`/products/${encodeURIComponent(id)}`);
  if (!isDetail(data)) throw new ProductApiError("Dữ liệu chi tiết không đúng API contract.");
  return data;
}
