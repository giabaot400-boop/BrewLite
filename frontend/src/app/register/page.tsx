import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { AuthCard } from "@/features/auth/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { sanitizeReturnTo } from "@/features/auth/return-to";

export const metadata: Metadata = { title: "Đăng ký – BrewLite" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  return (
    <PageContainer spacing="compact">
      <AuthCard title="Đăng ký">
        <RegisterForm returnTo={sanitizeReturnTo(next)} />
      </AuthCard>
    </PageContainer>
  );
}
