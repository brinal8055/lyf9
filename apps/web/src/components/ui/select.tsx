import * as React from "react";

import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-ui border border-white/10 bg-white/[0.04] px-4 text-base text-ivory outline-none transition focus:border-orange/70 focus:ring-2 focus:ring-orange/20",
        className
      )}
      {...props}
    />
  );
}
