import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrewLite",
  description: "Chọn đồ uống, kích cỡ và topping yêu thích.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <nav aria-label="Điều hướng chính" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
            <Link href="/" className="text-2xl font-bold tracking-tight text-coffee">BrewLite</Link>
            <Link href="/" className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee">Menu</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
