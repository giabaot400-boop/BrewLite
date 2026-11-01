import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { parseLoginNotice, sanitizeReturnTo } from "@/features/auth/return-to";

export const metadata: Metadata = { title: "Đăng nhập – BrewLite" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <PageContainer spacing="compact">
      <AuthCard title="Đăng nhập">
        <LoginForm
          returnTo={sanitizeReturnTo(first(params.next))}
          notice={parseLoginNotice(first(params.reason))}
          registered={first(params.registered) === "1"}
        />
      </AuthCard>
    </PageContainer>
  );
}
