export type AppHomeProgress = {
  completedTasks: number;
  totalTasks: number;
};

type AppHomeOverviewProps = {
  progress: AppHomeProgress;
};

function getProgressPercent({ completedTasks, totalTasks }: AppHomeProgress) {
  if (totalTasks <= 0) {
    return 0;
  }

  const progress = Math.round((completedTasks / totalTasks) * 100);
  return Math.min(Math.max(progress, 0), 100);
}

function getRemainingTaskLabel({ completedTasks, totalTasks }: AppHomeProgress) {
  const remainingTasks = Math.max(totalTasks - completedTasks, 0);
  return remainingTasks === 1 ? "1 task remaining" : `${remainingTasks} tasks remaining`;
}

export function AppHomeOverview({ progress }: AppHomeOverviewProps) {
  const progressPercent = getProgressPercent(progress);

  return (
    <section
      className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
      aria-labelledby="app-home-title"
    >
      <div>
        <p className="text-sm font-medium text-orange">Welcome to the private beta</p>
        <h1
          id="app-home-title"
          className="mt-2 text-[32px] font-semibold leading-tight sm:text-[44px]"
        >
          Prepare your health profile.
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          Complete your profile, health questionnaire, and data consent to unlock AI-assisted
          report extraction.
        </p>
      </div>

      <div className="rounded-card border border-white/10 bg-card p-5 md:min-w-[280px]">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-ivory">Onboarding progress</span>
          <span className="text-orange">{progressPercent}%</span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div
            className="h-full rounded-full bg-orange transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-dim">{getRemainingTaskLabel(progress)}</p>
      </div>
    </section>
  );
}
