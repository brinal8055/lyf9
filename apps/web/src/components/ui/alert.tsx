import * as React from "react";

import { cn } from "@/lib/utils";

type AlertVariant = "warning" | "info" | "success" | "error";

const alertVariants: Record<AlertVariant, string> = {
  warning: "border-orange/25 bg-orange/10 text-ivory",
  info: "border-blue/25 bg-blue/10 text-ivory",
  success: "border-green/25 bg-green/10 text-ivory",
  error: "border-danger/25 bg-danger/10 text-ivory"
};

export function Alert({
  className,
  variant = "warning",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  return (
    <div
      className={cn(
        "rounded-ui border px-4 py-3 text-sm leading-6",
        alertVariants[variant],
        className
      )}
      role="status"
      {...props}
    />
  );
}
