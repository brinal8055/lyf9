"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentProductType } from "@/lib/reports/types";

const products: Array<{
  amount: string;
  description: string;
  productType: PaymentProductType;
  title: string;
}> = [
  {
    amount: "₹49",
    description: "Schema-checked, source-linked AI-assisted explanation for supported lab reports.",
    productType: "ai_report_explanation",
    title: "AI report explanation"
  },
  {
    amount: "₹299",
    description: "A doctor reviews the AI draft and can approve, edit, reject, or request more information.",
    productType: "doctor_reviewed_report",
    title: "Doctor-reviewed report"
  }
];

const tokens = {
  light: {
    card: "rounded-card border border-sand-border bg-sand-card p-6 shadow-sm",
    title: "text-[22px] font-semibold leading-tight text-forest-deep",
    amount: "text-2xl font-bold text-forest-deep",
    amountMeta: "text-sm text-bark",
    description: "text-sm leading-6 text-sage",
    disclaimer: "text-xs leading-5 text-moss",
    link: "text-sm font-medium text-terracotta hover:underline",
    status: "text-sm text-fog lg:col-span-2",
  },
  dark: {
    card: "rounded-card border border-white/10 bg-card p-6 text-ivory shadow-[0_24px_80px_rgba(0,0,0,0.28)]",
    title: "text-[22px] font-semibold leading-tight text-ivory",
    amount: "text-2xl font-semibold text-ivory",
    amountMeta: "text-sm text-muted",
    description: "text-sm leading-6 text-muted",
    disclaimer: "text-xs leading-5 text-dim",
    link: "text-sm font-medium text-orange hover:underline",
    status: "text-sm text-muted lg:col-span-2",
  },
} as const;

export function PricingCards({
  mode = "public",
  theme = "dark",
}: {
  mode?: "public" | "compact";
  theme?: "light" | "dark";
}) {
  const [status, setStatus] = useState("");
  const isCompact = mode === "compact";
  const t = tokens[theme];

  async function startSandboxPayment(productType: PaymentProductType) {
    const startResponse = await fetch("/api/payments/start", {
      body: JSON.stringify({ productType, reportFileId: null }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!startResponse.ok) {
      setStatus("Sign in before starting a sandbox payment.");
      return;
    }

    const started = (await startResponse.json()) as { payment: { id: string } };
    const completeResponse = await fetch("/api/payments/complete", {
      body: JSON.stringify({ paymentId: started.payment.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    setStatus(
      completeResponse.ok
        ? "Sandbox payment placeholder completed. Legal review is still required before public paid launch."
        : "Sandbox payment could not be completed."
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      {products.map((product) => (
        <div key={product.productType} className={t.card}>
          <div className="mb-4 space-y-1">
            <h3 className={t.title}>{product.title}</h3>
            <div>
              <span className={cn(t.amount)}>{product.amount}</span>{" "}
              <span className={t.amountMeta}>private beta placeholder</span>
            </div>
          </div>
          <div className="space-y-4">
            <p className={t.description}>{product.description}</p>
            <p className={t.disclaimer}>
              Doctor-reviewed output is different from AI-only output. Lyf9 AI provides explanations, not diagnosis or prescription.
            </p>
            {isCompact ? (
              <Button onClick={() => startSandboxPayment(product.productType)} variant="secondary">
                <CreditCard className="mr-2 size-4" aria-hidden />
                Start sandbox payment
              </Button>
            ) : (
              <Link className={t.link} href="/signup">
                Join private beta
              </Link>
            )}
          </div>
        </div>
      ))}
      {status ? <p className={t.status}>{status}</p> : null}
    </section>
  );
}
