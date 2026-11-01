import type { InputHTMLAttributes, Ref } from "react";

type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** React 19: ref là prop thường. */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Ô nhập có nhãn, gợi ý và lỗi. Lỗi gắn aria-invalid và aria-describedby;
 * nhãn luôn hiển thị (không chỉ placeholder).
 */
export function FormField({ id, label, error, hint, ref, ...input }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1 block min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-base ${
          error ? "border-red-600" : "border-stone-300"
        }`}
        {...input}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
