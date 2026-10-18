import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrewLite",
  description: "Chọn đồ uống, kích cỡ và topping yêu thích.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
