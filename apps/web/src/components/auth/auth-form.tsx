"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
      setError("Check your details and try again.");
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
            ? "Create your Phase 1 onboarding session for Lyf9 AI."
            : "Log in to continue your Lyf9 AI onboarding."}
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
            Private beta invite code
            <Input name="inviteCode" placeholder="LYF9-..." />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm text-muted">
          Password
          <Input
            minLength={8}
            name="password"
            placeholder="At least 8 characters"
            required
            type="password"
          />
        </label>
        {error ? <Alert>{error}</Alert> : null}
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait" : isSignup ? "Create account" : "Log in"}
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {isSignup ? "Already have an account?" : "New to Lyf9 AI?"}{" "}
        <Link className="text-orange hover:underline" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Log in" : "Join beta"}
        </Link>
      </p>
      <p className="mt-4 text-xs leading-5 text-dim">
        Phase 1 uses a signed local auth skeleton for {PRODUCT_NAME}. Replace it
        with Clerk, Supabase Auth, or Auth.js before real beta users.
      </p>
    </Card>
  );
}
