import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 py-12 text-ivory">
      <Suspense>
        <AuthForm mode={mode} />
      </Suspense>
    </main>
  );
}
