import { cookies } from "next/headers";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSupabaseUserFromAccessToken,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";
import { getDoctorProfile } from "@/lib/doctors/profiles";
import type { DoctorStatus } from "@/lib/doctors/types";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<DoctorStatus, { body: string; title: string }> = {
  approved: {
    body: "Your account is active. Head to your review queue to get started.",
    title: "You're verified"
  },
  details_submitted: {
    body: "Thanks for applying. Our team is verifying your registration details and will email you once your account is approved. This usually takes 1-2 working days.",
    title: "Verification in progress"
  },
  invited: {
    body: "Your invite has not been completed yet. Use the link from your invite email to submit your details.",
    title: "Application incomplete"
  },
  rejected: {
    body: "We were unable to verify your registration details. If you believe this is an error, reply to your invite email and our team will take another look.",
    title: "Application not approved"
  },
  suspended: {
    body: "Your reviewing access is currently paused. Please contact the Lyf9 team for details.",
    title: "Account paused"
  },
  under_review: {
    body: "Our team is reviewing your credentials and will email you once a decision is made.",
    title: "Verification in progress"
  }
};

export default async function DoctorPendingPage() {
  let status: DoctorStatus = "details_submitted";
  let rejectionReason: string | null = null;

  if (shouldUseSupabaseAuth()) {
    const cookieStore = await cookies();
    const user = await getSupabaseUserFromAccessToken(
      cookieStore.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
    );

    if (user) {
      const profile = await getDoctorProfile(user.id);

      if (profile) {
        status = profile.status;
        rejectionReason = profile.rejectionReason;
      }
    }
  }

  const copy = STATUS_COPY[status];

  return (
    <div className="mx-auto max-w-shell px-5 py-16 sm:px-8">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted">{copy.body}</p>

          {status === "rejected" && rejectionReason ? (
            <p className="rounded-ui border border-white/10 bg-white/[0.04] p-4 text-sm text-muted">
              <span className="text-ivory">Reason: </span>
              {rejectionReason}
            </p>
          ) : null}

          {status === "approved" ? (
            <Link className="text-orange underline" href="/doctor/reviews">
              Go to your review queue
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
