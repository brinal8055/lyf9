import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-ui border border-white/10 bg-white/[0.04] px-4 text-base text-ivory outline-none transition placeholder:text-dim focus:border-orange/70 focus:ring-2 focus:ring-orange/20",
        className
      )}
      type={type}
      {...props}
    />
  );
}
