"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function PricingCards({ mode = "public" }: { mode?: "public" | "compact" }) {
  const [status, setStatus] = useState("");
  const isCompact = mode === "compact";

  async function startSandboxPayment(productType: PaymentProductType) {
    const startResponse = await fetch("/api/payments/start", {
      body: JSON.stringify({ productType, reportFileId: null }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!startResponse.ok) {
      setStatus("Sign in before starting a sandbox payment.");
      return;
    }

    const started = (await startResponse.json()) as { payment: { id: string } };
    const completeResponse = await fetch("/api/payments/complete", {
      body: JSON.stringify({ paymentId: started.payment.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
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
        <Card key={product.productType}>
          <CardHeader>
            <CardTitle>{product.title}</CardTitle>
            <CardContent>
              <span className="text-2xl font-semibold text-ivory">{product.amount}</span>{" "}
              <span className="text-sm text-muted">private beta placeholder</span>
            </CardContent>
          </CardHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">{product.description}</p>
            <p className="text-xs leading-5 text-dim">
              Doctor-reviewed output is different from AI-only output. Lyf9 AI provides explanations, not diagnosis or prescription.
            </p>
            {isCompact ? (
              <Button onClick={() => startSandboxPayment(product.productType)} variant="secondary">
                <CreditCard className="mr-2 size-4" aria-hidden />
                Start sandbox payment
              </Button>
            ) : (
              <Link className="text-sm font-medium text-orange hover:underline" href="/signup">
                Join private beta
              </Link>
            )}
          </div>
        </Card>
      ))}
      {status ? <p className="text-sm text-muted lg:col-span-2">{status}</p> : null}
    </section>
  );
}
