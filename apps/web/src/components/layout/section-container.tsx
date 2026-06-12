import * as React from "react";

import { cn } from "@/lib/utils";

export function SectionContainer({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("mx-auto w-full max-w-shell px-5 py-16 sm:px-8 lg:py-24", className)}
      {...props}
    />
  );
}
