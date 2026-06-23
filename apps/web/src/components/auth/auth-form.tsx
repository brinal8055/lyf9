"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { PRODUCT_NAME } from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthMode = "login" | "signup";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (mode !== "signup") {
      return;
    }
    void fetch("/api/analytics", {
      body: JSON.stringify({
        eventName: "signup_started",
        metadata: { surface: "signup_page" }
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  }, [mode]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      body: JSON.stringify({
        email: formData.get("email"),
        name: formData.get("name"),
        inviteCode: formData.get("inviteCode"),
        password: formData.get("password")
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? "Please check your details and try again.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  const isSignup = mode === "signup";

  return (
    <div className="w-full max-w-md rounded-[24px] border border-sand-border bg-white p-8 shadow-[0_24px_44px_-24px_rgba(12,51,44,.15)]">
      <div className="mb-8 text-center">
        <h3 className="text-[26px] font-extrabold text-forest mb-2">{isSignup ? "Join the private beta" : "Welcome back"}</h3>
        <p className="text-[14.5px] font-medium text-sage leading-[1.5]">
          {isSignup
            ? `Get early access to AI-assisted blood report explanations from ${PRODUCT_NAME}.`
            : `Log in to continue your ${PRODUCT_NAME} health dashboard.`}
        </p>
      </div>
      <form className="grid gap-5" onSubmit={onSubmit}>
        {isSignup ? (
          <label className="grid gap-2 text-[13.5px] font-bold text-forest">
            Name
            <Input name="name" placeholder="Your name" required className="h-12 bg-sand-card border-sand-border text-forest placeholder:text-fog focus-visible:ring-forest-glow rounded-xl font-medium" />
          </label>
        ) : null}
        <label className="grid gap-2 text-[13.5px] font-bold text-forest">
          Email
          <Input name="email" placeholder="you@example.com" required type="email" className="h-12 bg-sand-card border-sand-border text-forest placeholder:text-fog focus-visible:ring-forest-glow rounded-xl font-medium" />
        </label>
        {isSignup ? (
          <label className="grid gap-2 text-[13.5px] font-bold text-forest">
            <div className="flex items-center justify-between">
              <span>Beta invite code</span>
              <span className="text-xs font-semibold text-fog">Optional</span>
            </div>
            <Input name="inviteCode" placeholder="LYF9-..." className="h-12 bg-sand-card border-sand-border text-forest placeholder:text-fog focus-visible:ring-forest-glow rounded-xl font-medium uppercase" />
          </label>
        ) : null}
        <label className="grid gap-2 text-[13.5px] font-bold text-forest">
          Password
          <div className="relative">
            <Input
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type={showPassword ? "text" : "password"}
              className="h-12 bg-sand-card border-sand-border text-forest placeholder:text-fog focus-visible:ring-forest-glow rounded-xl font-medium pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-fog hover:text-forest transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" aria-hidden />
              ) : (
                <Eye className="size-[18px]" aria-hidden />
              )}
            </button>
          </div>
        </label>
        {error ? <Alert variant="error" className="border-danger/20 bg-[#FFF5F5] text-danger" role="alert">{error}</Alert> : null}
        <Button isLoading={isSubmitting} type="submit" className="mt-2 h-[52px] w-full rounded-full bg-terracotta text-[15.5px] font-bold text-[#0C332C] hover:bg-[#E0A93F] transition-all shadow-[0_14px_28px_-12px_rgba(232,145,91,.6)] hover:-translate-y-0.5">
          {isSignup ? "Create account" : "Log in"}
        </Button>
      </form>
      <div className="mt-7 text-center">
        <p className="text-[14px] font-medium text-sage">
          {isSignup ? "Already have an account?" : `New to ${PRODUCT_NAME}?`}{" "}
          <Link className="font-bold text-terracotta hover:text-[#E0A93F] transition-colors" href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Log in" : "Join beta"}
          </Link>
        </p>
        {!isSignup && (
          <p className="mt-2.5">
            <button type="button" className="text-[13px] font-semibold text-fog hover:text-terracotta underline transition-colors">
              Forgot password?
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
