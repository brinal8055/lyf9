import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
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
    text: "Phase 2 will add private PDF, JPG, and PNG upload for supported lab reports."
  },
  {
    icon: Activity,
    title: "See what changed",
    text: "Lyf9 AI is designed around source-linked biomarkers and trends over time."
  },
  {
    icon: MessageCircleQuestion,
    title: "Prepare better questions",
    text: "The product helps organize what to discuss with a qualified doctor."
  },
  {
    icon: TimerReset,
    title: "Plan retests",
    text: "Retest reminders will keep follow-up timing visible without overclaiming."
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
  }
];

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-ivory">
      <div className="border-b border-white/10 bg-orange py-2 text-center text-sm font-medium text-ink">
        Private beta foundation now open for early onboarding.
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-shell items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex flex-col">
            <span className="text-base font-semibold">{PRODUCT_NAME}</span>
            <span className="text-xs text-muted">{PRODUCT_DOMAIN}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a className="hover:text-ivory" href="#how-it-works">
              How it works
            </a>
            <a className="hover:text-ivory" href="#reports">
              Reports
            </a>
            <a className="hover:text-ivory" href="#safety">
              Safety
            </a>
            <a className="hover:text-ivory" href="#faq">
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

      <SectionContainer className="grid min-h-[calc(100vh-108px)] items-center gap-12 pb-20 pt-16 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-8">
          <Badge>Source-linked report explanations</Badge>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-[44px] font-semibold leading-[1.04] sm:text-[68px] lg:text-[82px]">
              Your body has data.{" "}
              <span className="text-orange">We turn it into direction.</span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              Upload your blood report. Lyf9 AI explains what changed, what
              needs attention, what questions to ask your doctor, and when to
              retest.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className={buttonClassName("primary")} href="/signup">
              Start onboarding <ArrowRight className="ml-2 size-4" aria-hidden />
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

      <SectionContainer className="border-t border-white/10 py-10">
        <div className="grid gap-4 text-sm text-muted sm:grid-cols-3">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Built for Indian
            preventive-health users
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Supported panels
            only
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green" aria-hidden /> Medical decisions
            need doctors
          </p>
        </div>
      </SectionContainer>

      <SectionContainer id="how-it-works">
        <SectionHeading
          eyebrow="How it works"
          title="A safer path from report data to useful doctor conversations."
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <Card key={step.title}>
              <step.icon className="mb-5 size-6 text-orange" aria-hidden />
              <CardTitle>{step.title}</CardTitle>
              <CardContent className="mt-3">{step.text}</CardContent>
            </Card>
          ))}
        </div>
      </SectionContainer>

      <SectionContainer id="reports" className="bg-cream text-ink">
        <SectionHeading
          className="text-ink"
          eyebrow="Supported report types"
          title="The beta starts with common structured lab reports."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_REPORT_TYPES.map((type) => (
            <div
              className="rounded-ui border border-black/10 bg-lightCard px-4 py-3 text-sm font-medium"
              key={type}
            >
              {type}
            </div>
          ))}
        </div>
      </SectionContainer>

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
                Phase 1 captures profile, questionnaire, and consent so report
                upload can start safely in Phase 2.
              </CardContent>
            </CardHeader>
            <div className="space-y-4">
              {["Consent complete", "Profile ready", "Questionnaire ready"].map(
                (item) => (
                  <div className="flex items-center gap-3" key={item}>
                    <span className="size-3 rounded-full bg-green" />
                    <span className="text-sm text-muted">{item}</span>
                  </div>
                )
              )}
            </div>
          </Card>
          <Card className="rounded-panel bg-charcoal">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Vitamin D", "Low", "Ask about retest"],
                ["HbA1c", "Monitor", "Track trend"],
                ["LDL", "Attention", "Discuss risk"]
              ].map(([name, status, note]) => (
                <div className="rounded-card border border-white/10 bg-white/[0.04] p-5" key={name}>
                  <p className="text-sm text-muted">{name}</p>
                  <p className="mt-4 text-2xl font-semibold text-ivory">{status}</p>
                  <p className="mt-3 text-sm text-muted">{note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </SectionContainer>

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
              Lyf9 AI is designed to explain supported report data in plain
              language, show source values, and help users prepare better
              questions. It does not replace qualified medical care.
            </p>
            <Alert className="border-black/10 bg-lightCard text-ink">
              {ENTRY_FLOW_DISCLAIMER}
            </Alert>
          </div>
        </div>
      </SectionContainer>

      <SectionContainer id="faq">
        <SectionHeading eyebrow="FAQ" title="Built carefully before it grows." />
        <div className="grid gap-4">
          {faqs.map((faq) => (
            <Card key={faq.question}>
              <CardTitle>{faq.question}</CardTitle>
              <CardContent className="mt-3">{faq.answer}</CardContent>
            </Card>
          ))}
        </div>
      </SectionContainer>

      <SectionContainer className="pb-12">
        <div className="rounded-panel border border-white/10 bg-charcoal p-8 text-center sm:p-12">
          <h2 className="text-[34px] font-semibold leading-tight sm:text-[52px]">
            Start with profile, questionnaire, and consent.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-muted">
            Phase 1 prepares the safe entry flow before uploads, AI extraction,
            and doctor review are added.
          </p>
          <Link className={buttonClassName("primary", "mt-7")} href="/signup">
            Join Lyf9 AI private beta
          </Link>
        </div>
      </SectionContainer>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-muted sm:px-8">
        <div className="mx-auto flex max-w-shell flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {PRODUCT_NAME} · {PRODUCT_DOMAIN}
          </p>
          <p>Private beta. Medical decisions require qualified doctors.</p>
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
      <h2 className="mt-5 text-[34px] font-semibold leading-tight sm:text-[52px]">
        {title}
      </h2>
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
          ["Blood reports", "top-8 left-6"],
          ["Thyroid", "right-5 top-20"],
          ["Vitamin D", "bottom-24 left-3"],
          ["HbA1c", "bottom-10 right-16"],
          ["Doctor review", "left-1/2 top-4 -translate-x-1/2"]
        ].map(([label, position]) => (
          <div
            className={`absolute ${position} rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm text-ivory backdrop-blur`}
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
