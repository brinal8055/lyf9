import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8"
};

export function Spinner({
  size = "md",
  className
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <Loader2
      className={cn("animate-spin text-orange", sizes[size], className)}
      aria-label="Loading"
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
