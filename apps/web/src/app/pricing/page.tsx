import type { Metadata } from "next";
import Link from "next/link";

import { PricingCards } from "@/components/payments/pricing-cards";

export const metadata: Metadata = {
  title: "Pricing | Lyf9 AI"
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-sand font-hanken text-forest">
      <nav className="border-b border-sand-border bg-sand/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-shell items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="text-[22px] font-bold tracking-tight text-forest-deep">
            Lyf9{" "}
            <span className="font-newsreader font-medium italic text-terracotta">AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-sage hover:text-forest transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-semibold text-sand transition-colors hover:bg-forest-leaf"
            >
              Join beta
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-shell px-5 py-16 sm:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-terracotta">
            Private beta
          </p>
          <h1 className="mt-3 text-[40px] font-bold leading-tight text-forest-deep sm:text-[56px]">
            Simple, honest{" "}
            <span className="font-newsreader font-medium italic text-forest-mid">pricing.</span>
          </h1>
          <p className="mt-4 text-lg leading-8 text-sage">
            Lyf9 AI is validating willingness to pay during a controlled private beta.
            Public paid launch is not enabled by default.
          </p>
        </div>

        <div className="mb-10 rounded-ui border border-trust-green-border bg-trust-green px-4 py-3 text-sm leading-6 text-forest">
          Doctor-reviewed output is reviewed by a doctor. AI-only output is an AI-assisted explanation.
          Neither is a diagnosis or prescription. Legal review is required before public paid launch.
        </div>

        <PricingCards theme="light" />

        <p className="mt-12 text-xs leading-6 text-fog">
          All prices are placeholders for beta validation only. Razorpay integration is not live.
          Lyf9 AI provides explanations — not medical diagnosis or prescription.
        </p>
      </main>
    </div>
  );
}
