import * as React from "react";

import { cn } from "@/lib/utils";

export function Alert({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-ui border border-orange/25 bg-orange/10 px-4 py-3 text-sm leading-6 text-ivory",
        className
      )}
      role="status"
      {...props}
    />
  );
}
