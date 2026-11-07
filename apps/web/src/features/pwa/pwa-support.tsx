"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const isOffline = () => !navigator.onLine;
const serverSnapshot = () => false;

export function PwaSupport() {
  const offline = useSyncExternalStore(subscribe, isOffline, serverSnapshot);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    // Progressive enhancement: registration failure must not stop the online app.
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => console.warn("BrewLite chưa đăng ký được chế độ PWA."));
  }, []);

  if (!offline) return null;
  return (
    <div role="status" aria-live="polite" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
      Đang ngoại tuyến. Không thể xác nhận yêu cầu với máy chủ lúc này.
    </div>
  );
}
