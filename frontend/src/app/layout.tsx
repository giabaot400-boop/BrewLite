import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/header";
import { SkipLink } from "@/components/layout/skip-link";
import { CartProvider } from "@/features/cart/cart-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrewLite",
  description: "Chọn đồ uống, kích cỡ và topping yêu thích.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#704b35",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <SkipLink />
        <CartProvider>
          <Header />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
