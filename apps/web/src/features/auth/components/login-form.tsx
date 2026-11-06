"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "../auth-provider";
import { AuthApiError, messageForAuthError } from "../auth-error";
import { withReturnTo, type LoginNotice } from "../return-to";
import type { FieldErrors } from "../types";
import { hasErrors, validateLogin } from "../validation";

const NOTICE_TEXT: Record<LoginNotice, string> = {
  expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại; giỏ hàng của bạn vẫn được giữ.",
  required: "Vui lòng đăng nhập để tiếp tục; giỏ hàng của bạn vẫn được giữ.",
};

type Props = { returnTo: string; notice: LoginNotice | null; registered?: boolean };

export function LoginForm({ returnTo, notice, registered = false }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Chặn gửi đúp trước khi React kịp render lại trạng thái disabled.
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    setFormError(null);
    if (hasErrors(errors)) {
      document.getElementById(errors.email ? "login-email" : "login-password")?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      toast.show("Đăng nhập thành công.", "success");
      router.replace(returnTo);
    } catch (error) {
      const apiError = error instanceof AuthApiError ? error : new AuthApiError("UNKNOWN", "");
      if (apiError.code === "VALIDATION_ERROR" && hasErrors(apiError.fieldErrors)) {
        setFieldErrors(apiError.fieldErrors);
      }
      // 401 ở form đăng nhập là sai thông tin, không phải hết hạn phiên; giữ nguyên email, xóa mật khẩu.
      if (apiError.code === "INVALID_CREDENTIALS") setPassword("");
      setFormError(messageForAuthError(apiError, "login"));
      emailRef.current?.focus();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="space-y-5">
      {registered && <Alert tone="success">Đăng ký thành công. Hãy đăng nhập để tiếp tục.</Alert>}
      {notice && <Alert tone="info">{NOTICE_TEXT[notice]}</Alert>}
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormField
        ref={emailRef}
        id="login-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email?.[0]}
        disabled={submitting}
      />
      <FormField
        id="login-password"
        label="Mật khẩu"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password?.[0]}
        disabled={submitting}
      />
      <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
        {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
      <p className="text-sm text-stone-600">
        Chưa có tài khoản?{" "}
        <Link href={withReturnTo("/register", returnTo)} className="font-semibold text-coffee underline">
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
