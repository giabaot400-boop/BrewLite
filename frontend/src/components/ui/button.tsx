import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type Variant = "primary" | "text";

const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-semibold";
const variants: Record<Variant, string> = {
  primary: "bg-coffee px-5 py-3 text-white",
  text: "rounded-md text-coffee",
};

function classes(variant: Variant) {
  return `${base} ${variants[variant]}`;
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: Variant;
};

export function Button({ variant = "primary", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={classes(variant)} {...props} />;
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
};

export function ButtonLink({ variant = "primary", ...props }: ButtonLinkProps) {
  return <Link className={classes(variant)} {...props} />;
}
