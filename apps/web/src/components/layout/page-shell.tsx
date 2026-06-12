import * as React from "react";

import { PRODUCT_DOMAIN, PRODUCT_NAME } from "@lyf9/shared";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-ivory">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-[72px] max-w-shell items-center justify-between px-5 sm:px-8">
          <div>
            <p className="text-base font-semibold">{PRODUCT_NAME}</p>
            <p className="text-sm text-muted">{PRODUCT_DOMAIN}</p>
          </div>
          <p className="text-sm text-muted">Private beta foundation</p>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
