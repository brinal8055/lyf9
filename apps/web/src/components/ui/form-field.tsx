import * as React from "react";

import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({
  label,
  error,
  required,
  className,
  children,
  hint
}: FormFieldProps) {
  return (
    <label className={cn("grid gap-2 text-sm text-muted", className)}>
      <span className="flex items-center gap-1">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error ? (
        <span className="text-xs text-dim">{hint}</span>
      ) : null}
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <div className="border-t border-white/10" />;
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 border-t border-white/10" />
      <span className="text-xs text-dim">{label}</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}
