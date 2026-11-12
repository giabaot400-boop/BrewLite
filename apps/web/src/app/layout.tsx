import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/header";
import { SkipLink } from "@/components/layout/skip-link";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/features/auth/auth-provider";
import { CartProvider } from "@/features/cart/cart-provider";
import { CartProviderV2 } from "@/features/cart/cart-provider-v2";
import { checkoutV2IntegrationEnabled } from "@/lib/server/checkout-integration";
import { PwaSupport } from "@/features/pwa/pwa-support";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrewLite",
  applicationName: "BrewLite",
  description: "Chọn đồ uống, kích cỡ và topping yêu thích.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#704b35",
};

// Select the provider from the server runtime flag, including container deployments.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ActiveCartProvider = checkoutV2IntegrationEnabled() ? CartProviderV2 : CartProvider;
  return (
    <html lang="vi">
      <body>
        <SkipLink />
        <PwaSupport />
        <ToastProvider>
          <AuthProvider>
            <ActiveCartProvider>
              <Header />
              {children}
            </ActiveCartProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
