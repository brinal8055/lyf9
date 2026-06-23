"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { PRODUCT_NAME } from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{isSignup ? "Join the private beta" : "Welcome back"}</CardTitle>
        <CardContent>
          {isSignup
            ? `Get early access to AI-assisted blood report explanations from ${PRODUCT_NAME}.`
            : `Log in to continue your ${PRODUCT_NAME} health dashboard.`}
        </CardContent>
      </CardHeader>
      <form className="grid gap-4" onSubmit={onSubmit}>
        {isSignup ? (
          <label className="grid gap-2 text-sm text-muted">
            Name
            <Input name="name" placeholder="Your name" required />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm text-muted">
          Email
          <Input name="email" placeholder="you@example.com" required type="email" />
        </label>
        {isSignup ? (
          <label className="grid gap-2 text-sm text-muted">
            Beta invite code
            <Input name="inviteCode" placeholder="LYF9-..." />
            <span className="text-xs text-dim">Optional during early access.</span>
          </label>
        ) : null}
        <label className="grid gap-2 text-sm text-muted">
          Password
          <div className="relative">
            <Input
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type={showPassword ? "text" : "password"}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-muted transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </label>
        {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
        <Button isLoading={isSubmitting} type="submit">
          {isSignup ? "Create account" : "Log in"}
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {isSignup ? "Already have an account?" : `New to ${PRODUCT_NAME}?`}{" "}
        <Link className="text-orange hover:underline" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Log in" : "Join beta"}
        </Link>
      </p>
      {!isSignup && (
        <p className="mt-3 text-sm text-muted">
          <button type="button" className="text-muted hover:text-ivory underline transition-colors">
            Forgot password?
          </button>
        </p>
      )}
    </Card>
  );
}
