import Link from "next/link";
import { CartBadge } from "@/features/cart/components/cart-badge";
import { PAGE_WIDTH } from "./page-container";

export function Header() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <nav
        aria-label="Điều hướng chính"
        className={`${PAGE_WIDTH} flex items-center justify-between py-3`}
      >
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-md text-2xl font-bold tracking-tight text-coffee"
        >
          BrewLite
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Link
            href="/"
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee"
          >
            Menu
          </Link>
          <CartBadge />
        </div>
      </nav>
    </header>
  );
}
