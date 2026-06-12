import * as React from "react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      className={cn(
        "size-4 rounded border-white/20 bg-white/[0.04] accent-orange focus:ring-2 focus:ring-orange/30",
        className
      )}
      type="checkbox"
      {...props}
    />
  );
}
