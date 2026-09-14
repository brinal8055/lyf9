import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  ShieldCheck,
  User,
  type LucideIcon
} from "lucide-react";

import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OnboardingTask = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const onboardingTasks = [
  {
    icon: User,
    title: "Profile",
    description: "Add basic health context for accurate reference ranges.",
    href: "/app/profile"
  },
  {
    icon: ClipboardList,
    title: "Questionnaire",
    description: "Capture symptoms, history, lifestyle, and goals.",
    href: "/app/questionnaire"
  },
  {
    icon: ShieldCheck,
    title: "Consent",
    description: "Review and grant required processing consent.",
    href: "/app/consent"
  }
] satisfies OnboardingTask[];

export const ONBOARDING_TASK_COUNT = onboardingTasks.length;

function OnboardingTaskCard({ task }: { task: OnboardingTask }) {
  const Icon = task.icon;

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0 transition-all hover:border-white/20 hover:bg-white/[0.04]">
      <CardHeader className="mb-0 flex-1 p-6 pb-5">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-orange/10 text-orange">
          <Icon className="size-5" aria-hidden />
        </div>
        <CardTitle>{task.title}</CardTitle>
        <CardContent className="mt-2 p-0 text-sm leading-6 text-muted">
          {task.description}
        </CardContent>
      </CardHeader>
      <div className="mt-auto border-t border-white/10 p-5">
        <Link
          className={buttonClassName("secondary", "w-full justify-between")}
          href={task.href}
          aria-label={`Start ${task.title.toLowerCase()} task`}
        >
          Start task <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export function OnboardingTaskList() {
  return (
    <section aria-label="Onboarding tasks">
      <ul className="grid gap-5 lg:grid-cols-3">
        {onboardingTasks.map((task) => (
          <li key={task.href}>
            <OnboardingTaskCard task={task} />
          </li>
        ))}
      </ul>
    </section>
  );
}
