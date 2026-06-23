import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, ShieldCheck, User } from "lucide-react";

import { ENTRY_FLOW_DISCLAIMER } from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFeedback } from "@/components/feedback/dashboard-feedback";
import { PricingCards } from "@/components/payments/pricing-cards";

const checklist = [
  {
    icon: User,
    title: "Profile",
    text: "Add basic health context for accurate reference ranges.",
    href: "/app/profile"
  },
  {
    icon: ClipboardList,
    title: "Questionnaire",
    text: "Capture symptoms, history, lifestyle, and goals.",
    href: "/app/questionnaire"
  },
  {
    icon: ShieldCheck,
    title: "Consent",
    text: "Review and grant required processing consent.",
    href: "/app/consent"
  }
];

export default function AppHomePage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-orange">Welcome to the private beta</p>
          <h1 className="mt-2 text-[32px] font-semibold leading-tight sm:text-[44px]">
            Prepare your health profile.
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
            Complete your profile, health questionnaire, and data consent to unlock AI-assisted report extraction.
          </p>
        </div>
        
        {/* Overall progress indicator */}
        <div className="rounded-card border border-white/10 bg-card p-5 md:min-w-[280px]">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ivory">Onboarding progress</span>
            <span className="text-orange">0%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[5%] rounded-full bg-orange transition-all duration-500" />
          </div>
          <p className="mt-3 text-xs text-dim">3 tasks remaining</p>
        </div>
      </div>

      <Alert variant="info" className="border-blue/20 bg-blue/10">
        {ENTRY_FLOW_DISCLAIMER}
      </Alert>

      <div className="grid gap-5 lg:grid-cols-3">
        {checklist.map((item) => (
          <Card key={item.title} className="flex flex-col transition-all hover:border-white/20 hover:bg-white/[0.04]">
            <CardHeader className="flex-1 pb-4">
              <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-orange/10 text-orange">
                <item.icon className="size-5" aria-hidden />
              </div>
              <CardTitle>{item.title}</CardTitle>
              <CardContent className="mt-2 p-0 text-sm leading-6 text-muted">
                {item.text}
              </CardContent>
            </CardHeader>
            <div className="mt-auto border-t border-white/10 p-5 pt-4">
              <Link className={buttonClassName("secondary", "w-full justify-between")} href={item.href}>
                Start task <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-ivory">Beta pricing</h2>
        <PricingCards mode="compact" />
      </div>

      <DashboardFeedback />
    </div>
  );
}
