import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DoctorApplicationForm } from "@/components/doctor/doctor-application-form";
import { findUsableInvite } from "@/lib/doctors/invites";

const INVITE_FAILURE_MESSAGES: Record<string, string> = {
  invite_already_used: "This invite has already been used.",
  invite_expired: "This invite has expired. Ask the Lyf9 team for a new one.",
  invite_not_found: "This invite link is not valid.",
  invite_revoked: "This invite has been revoked."
};

/**
 * Public, invite-token-gated. Lives outside /doctor because the applicant has
 * no account yet -- the /doctor tree requires an authenticated doctor role.
 */
export default async function DoctorApplyPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <InviteProblem message="This page needs an invite link from the Lyf9 team." />;
  }

  let email: string;

  try {
    const lookup = await findUsableInvite(token);

    if (!lookup.ok) {
      return (
        <InviteProblem
          message={INVITE_FAILURE_MESSAGES[lookup.reason] ?? "This invite is not usable."}
        />
      );
    }

    email = lookup.invite.email;
  } catch {
    return <InviteProblem message="We could not verify this invite. Please try again shortly." />;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl text-ivory">Join Lyf9 as a reviewing doctor</h1>
        <p className="text-muted">
          Submit your registration details for verification. Our team reviews every application
          manually before granting access to the review panel.
        </p>
      </div>

      <DoctorApplicationForm email={email} token={token} />
    </div>
  );
}

function InviteProblem({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 sm:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Invite not available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
