import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Khung chung cho trang đăng nhập và đăng ký: một cột, tối đa 28rem. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mx-auto max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-6">{children}</div>
    </Card>
  );
}
