"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useAuth } from "../auth-provider";
import { AuthApiError, messageForAuthError } from "../auth-error";
import { withReturnTo } from "../return-to";
import type { FieldErrors } from "../types";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CODE_POINTS,
  hasErrors,
  normalizeEmail,
  validateRegister,
} from "../validation";

const FIELD_ORDER = ["email", "password", "confirmPassword"] as const;
const FIELD_IDS: Record<(typeof FIELD_ORDER)[number], string> = {
  email: "register-email",
  password: "register-password",
  confirmPassword: "register-confirm",
};

export function RegisterForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  function focusFirstError(errors: FieldErrors) {
    const first = FIELD_ORDER.find((name) => errors[name]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const errors = validateRegister({ email, password, confirmPassword });
    setFieldErrors(errors);
    setFormError(null);
    if (hasErrors(errors)) {
      focusFirstError(errors);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      // Mật khẩu gửi nguyên văn (không trim); chỉ email được chuẩn hóa. confirmPassword không gửi.
      await register({ email: normalizeEmail(email), password });
      const next = withReturnTo("/login", returnTo);
      router.replace(next + (next.includes("?") ? "&" : "?") + "registered=1");
    } catch (error) {
      const apiError = error instanceof AuthApiError ? error : new AuthApiError("UNKNOWN", "");
      if (apiError.code === "EMAIL_ALREADY_EXISTS") {
        const errs = { email: ["Email này đã được sử dụng."] };
        setFieldErrors(errs);
        focusFirstError(errs);
      } else if (apiError.code === "VALIDATION_ERROR" && hasErrors(apiError.fieldErrors)) {
        setFieldErrors(apiError.fieldErrors);
        focusFirstError(apiError.fieldErrors);
      }
      setFormError(messageForAuthError(apiError, "register"));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormField
        id={FIELD_IDS.email}
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
        id={FIELD_IDS.password}
        label="Mật khẩu"
        type="password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`Ít nhất ${PASSWORD_MIN_CODE_POINTS} ký tự, tối đa ${PASSWORD_MAX_BYTES} byte (UTF-8). Khoảng trắng được giữ nguyên.`}
        error={fieldErrors.password?.[0]}
        disabled={submitting}
      />
      <FormField
        id={FIELD_IDS.confirmPassword}
        label="Nhập lại mật khẩu"
        type="password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={fieldErrors.confirmPassword?.[0]}
        disabled={submitting}
      />
      <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
        {submitting ? "Đang đăng ký…" : "Đăng ký"}
      </Button>
      <p className="text-sm text-stone-600">
        Đã có tài khoản?{" "}
        <Link href={withReturnTo("/login", returnTo)} className="font-semibold text-coffee underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
