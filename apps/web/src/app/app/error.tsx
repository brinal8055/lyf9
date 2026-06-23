"use client";

import { buttonClassName } from "@/components/ui/button";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 text-center">
      <div className="size-16 rounded-full bg-danger/10 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-ivory">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted max-w-sm">
          {error.message || "An unexpected error occurred loading this page."}
        </p>
      </div>
      <button onClick={reset} className={buttonClassName("secondary")}>
        Try again
      </button>
    </div>
  );
}
