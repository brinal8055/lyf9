import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Lock,
  MessageCircleQuestion,
  ShieldCheck,
  Stethoscope,
  TimerReset
} from "lucide-react";

import {
  ENTRY_FLOW_DISCLAIMER,
  PRODUCT_DOMAIN,
  PRODUCT_NAME,
  SUPPORTED_REPORT_TYPES
} from "@lyf9/shared";

import { SectionContainer } from "@/components/layout/section-container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    icon: FileText,
    title: "Upload your blood report",
    text: "Private PDF, JPG, and PNG upload for supported lab reports. Your files never become public."
  },
  {
    icon: Activity,
    title: "See what changed",
    text: "Source-linked biomarkers and trend tracking across repeated tests over time."
  },
  {
    icon: MessageCircleQuestion,
    title: "Prepare better questions",
    text: "Lyf9 AI helps organise what to discuss with a qualified doctor — not replace them."
  },
  {
    icon: TimerReset,
    title: "Plan retests",
    text: "Retest reminders keep follow-up timing visible without overclaiming outcomes."
  }
];

const faqs = [
  {
    question: "Is Lyf9 AI a doctor?",
    answer:
      "No. Lyf9 AI provides AI-assisted report explanations, not diagnosis or prescription. Doctor review is required for medical decisions."
  },
  {
    question: "Which reports are supported first?",
    answer:
      "The private beta starts with common blood reports such as CBC, lipid, thyroid, liver, kidney, glucose, HbA1c, Vitamin D, B12, and ferritin."
  },
  {
    question: "Can unsupported reports be interpreted?",
    answer:
      "No. Unsupported report types are blocked from automated interpretation and should be reviewed by a qualified doctor."
  },
  {
    question: "How is my data kept private?",
    answer:
      "Reports are stored in a private bucket and never exposed via public URLs. Signed short-lived download links are audited. No report data is used for model training."
  }
];

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-ivory">
      {/* Announcement bar */}
      <div className="border-b border-white/10 bg-orange py-2 text-center text-sm font-medium text-ink">
        Private beta is now open —{" "}
        <Link href="/signup" className="underline underline-offset-2">
          join the waitlist →
        </Link>
      </div>

      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-shell items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex flex-col">
            <span className="text-base font-semibold">{PRODUCT_NAME}</span>
            <span className="text-xs text-muted">{PRODUCT_DOMAIN}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a className="transition-colors hover:text-ivory" href="#how-it-works">
              How it works
            </a>
            <a className="transition-colors hover:text-ivory" href="#reports">
              Reports
            </a>
            <a className="transition-colors hover:text-ivory" href="#safety">
              Safety
            </a>
            <a className="transition-colors hover:text-ivory" href="#faq">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link className={buttonClassName("ghost", "hidden sm:inline-flex")} href="/login">
              Log in
            </Link>
            <Link className={buttonClassName("primary")} href="/signup">
              Join beta
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <SectionContainer className="grid min-h-[calc(100vh-108px)] items-center gap-12 pb-20 pt-16 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-8 animate-fade-in">
          <Badge>Source-linked report explanations</Badge>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-[44px] font-semibold leading-[1.04] sm:text-[68px] lg:text-[82px]">
              Your body has data.{" "}
              <span className="bg-gradient-to-r from-orange via-amber-400 to-orange bg-clip-text text-transparent">
                We turn it into direction.
              </span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              Upload your blood report. Lyf9 AI explains what changed, what needs
              attention, what questions to ask your doctor, and when to retest.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className={buttonClassName("primary")} href="/signup">
              Get early access <ArrowRight className="ml-2 size-4" aria-hidden />
            </Link>
            <Link className={buttonClassName("secondary")} href="#safety">
              Read safety promise
            </Link>
          </div>
          <div className="grid gap-3 text-sm text-muted sm:grid-cols-3">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-green" aria-hidden /> Privacy-first
            </span>
            <span className="flex items-center gap-2">
              <Lock className="size-4 text-blue" aria-hidden /> Consent-led
            </span>
            <span className="flex items-center gap-2">
              <Stethoscope className="size-4 text-orange" aria-hidden /> Doctor review
            </span>
          </div>
        </div>

        <HealthGraphVisual />
      </SectionContainer>

      {/* Trust bar */}
      <SectionContainer className="border-t border-white/10 py-10">
        <div className="grid gap-4 text-sm text-muted sm:grid-cols-3">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Built for Indian
            preventive-health users
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Supported panels only
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Medical decisions need
            doctors
          </p>
        </div>
      </SectionContainer>

      {/* How it works */}
      <SectionContainer id="how-it-works">
        <SectionHeading
          eyebrow="How it works"
          title="A safer path from report data to useful doctor conversations."
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <Card
              key={step.title}
              className="group transition-all duration-300 hover:-translate-y-1 hover:border-orange/30 hover:shadow-[0_32px_80px_rgba(0,0,0,0.4)]"
            >
              <div className="mb-5 flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-orange/15 text-sm font-bold text-orange">
                  {index + 1}
                </span>
                <step.icon
                  className="size-5 text-orange transition-transform duration-300 group-hover:scale-110"
                  aria-hidden
                />
              </div>
              <CardTitle>{step.title}</CardTitle>
              <CardContent className="mt-3">{step.text}</CardContent>
            </Card>
          ))}
        </div>
      </SectionContainer>

      {/* Supported reports */}
      <SectionContainer id="reports" className="bg-cream text-ink">
        <SectionHeading
          className="text-ink"
          eyebrow="Supported report types"
          title="The beta starts with common structured lab reports."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_REPORT_TYPES.map((type) => (
            <div
              className="flex items-center gap-3 rounded-ui border border-black/10 bg-lightCard px-4 py-3 text-sm font-medium transition-all hover:border-orange/30 hover:bg-orange/5"
              key={type}
            >
              <CheckCircle2 className="size-4 flex-shrink-0 text-green" aria-hidden />
              {type}
            </div>
          ))}
        </div>
      </SectionContainer>

      {/* Product preview */}
      <SectionContainer>
        <SectionHeading
          eyebrow="Product preview"
          title="Designed around source values, status, and timeline context."
        />
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-panel">
            <CardHeader>
              <CardTitle>Health timeline</CardTitle>
              <CardContent>
                Profile, questionnaire, and consent unlock report upload so your results stay safe.
              </CardContent>
            </CardHeader>
            <div className="space-y-4">
              {["Consent complete", "Profile ready", "Questionnaire ready"].map((item) => (
                <div className="flex items-center gap-3" key={item}>
                  <span className="size-3 rounded-full bg-green" />
                  <span className="text-sm text-muted">{item}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="rounded-panel bg-charcoal">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Vitamin D", "Low", "Ask about retest"],
                ["HbA1c", "Monitor", "Track trend"],
                ["LDL", "Attention", "Discuss risk"]
              ].map(([name, status, note]) => (
                <div
                  className="rounded-card border border-white/10 bg-white/[0.04] p-5 transition-all hover:border-orange/20 hover:bg-white/[0.07]"
                  key={name}
                >
                  <p className="text-sm text-muted">{name}</p>
                  <p className="mt-4 text-2xl font-semibold text-ivory">{status}</p>
                  <p className="mt-3 text-sm text-muted">{note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </SectionContainer>

      {/* Safety */}
      <SectionContainer id="safety" className="bg-cream text-ink">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Badge className="border-black/10 bg-black/5 text-dim">Doctor-reviewed trust</Badge>
            <h2 className="mt-5 text-[36px] font-semibold leading-tight sm:text-[52px]">
              AI can organize. Doctors make medical decisions.
            </h2>
          </div>
          <div className="space-y-5">
            <p className="text-lg leading-8 text-dim">
              Lyf9 AI is designed to explain supported report data in plain language, show source
              values, and help users prepare better questions. It does not replace qualified medical
              care.
            </p>
            <Alert variant="info" className="border-blue/20 bg-blue/10 text-ink">
              {ENTRY_FLOW_DISCLAIMER}
            </Alert>
          </div>
        </div>
      </SectionContainer>

      {/* FAQ */}
      <SectionContainer id="faq">
        <SectionHeading eyebrow="FAQ" title="Built carefully before it grows." />
        <div className="grid gap-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-card border border-white/10 bg-card transition-all hover:border-white/20"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between p-6 text-left">
                <span className="text-base font-semibold text-ivory">{faq.question}</span>
                <ChevronDown
                  className="size-4 flex-shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="px-6 pb-6 text-base leading-7 text-muted">{faq.answer}</div>
            </details>
          ))}
        </div>
      </SectionContainer>

      {/* CTA */}
      <SectionContainer className="pb-12">
        <div className="rounded-panel border border-white/10 bg-charcoal p-8 text-center sm:p-12">
          <h2 className="text-[34px] font-semibold leading-tight sm:text-[52px]">
            Start with profile, questionnaire, and consent.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-muted">
            Complete your health profile and consent before reports, AI extraction, and doctor
            review are enabled.
          </p>
          <Link className={buttonClassName("primary", "mt-7")} href="/signup">
            Join {PRODUCT_NAME} private beta
          </Link>
        </div>
      </SectionContainer>

      {/* Footer */}
      <footer className="border-t border-white/10 px-5 py-12 text-sm text-muted sm:px-8">
        <div className="mx-auto grid max-w-shell gap-8 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-ivory">{PRODUCT_NAME}</p>
            <p className="mt-2 text-dim">{PRODUCT_DOMAIN}</p>
            <p className="mt-3 text-xs text-dim">
              Private beta · Medical decisions require qualified doctors.
            </p>
          </div>
          <div>
            <p className="font-medium text-ivory">Legal</p>
            <nav className="mt-3 grid gap-2">
              <Link href="/privacy" className="transition-colors hover:text-ivory">
                Privacy Policy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-ivory">
                Terms of Service
              </Link>
            </nav>
          </div>
          <div>
            <p className="font-medium text-ivory">Product</p>
            <nav className="mt-3 grid gap-2">
              <a href="#how-it-works" className="transition-colors hover:text-ivory">
                How it works
              </a>
              <a href="#safety" className="transition-colors hover:text-ivory">
                Safety promise
              </a>
              <Link href="/signup" className="transition-colors hover:text-ivory">
                Join beta
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionHeading({
  className,
  eyebrow,
  title
}: {
  className?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className={`mb-10 max-w-3xl ${className ?? ""}`}>
      <Badge>{eyebrow}</Badge>
      <h2 className="mt-5 text-[34px] font-semibold leading-tight sm:text-[52px]">{title}</h2>
    </div>
  );
}

function HealthGraphVisual() {
  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-panel border border-white/10 bg-charcoal p-6 shadow-[0_32px_120px_rgba(0,0,0,0.35)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,106,61,0.22),transparent_56%)]" />
      <div className="relative flex h-full min-h-[468px] items-center justify-center">
        <div className="absolute size-64 rounded-full border border-orange/30" />
        <div className="absolute size-96 rounded-full border border-white/10" />
        <div className="grid size-44 place-items-center rounded-full border border-white/10 bg-white/[0.06] backdrop-blur">
          <Activity className="size-16 text-orange" aria-hidden />
        </div>
        {[
          ["Blood reports", "top-8 left-6", "animate-float"],
          ["Thyroid", "right-5 top-20", "animate-float-delayed"],
          ["Vitamin D", "bottom-24 left-3", "animate-float-delayed-2"],
          ["HbA1c", "bottom-10 right-16", "animate-float"],
          ["Doctor review", "left-1/2 top-4 -translate-x-1/2", "animate-float-delayed"]
        ].map(([label, position, animation]) => (
          <div
            className={`absolute ${position} ${animation} rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm text-ivory backdrop-blur`}
            key={label}
          >
            {label}
          </div>
        ))}
        <div className="absolute bottom-8 left-6 right-6 rounded-card border border-white/10 bg-white/[0.08] p-5 backdrop-blur">
          <p className="text-sm text-muted">Preview signal</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold">Vitamin D: Low</p>
              <p className="mt-1 text-sm text-muted">Source value visible in report view</p>
            </div>
            <Badge className="text-orange">Retest in 8 weeks</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
