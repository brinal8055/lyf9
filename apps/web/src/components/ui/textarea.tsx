import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-ui border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-ivory outline-none transition placeholder:text-dim focus:border-orange/70 focus:ring-2 focus:ring-orange/20",
        className
      )}
      {...props}
    />
  );
}
