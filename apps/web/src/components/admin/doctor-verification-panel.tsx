"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { specialtyLabel } from "@/lib/doctors/specialties";
import type { DoctorInviteRecord, DoctorProfileRecord, DoctorStatus } from "@/lib/doctors/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<DoctorStatus, string> = {
  approved: "border-green/30 bg-green/10 text-green",
  details_submitted: "border-yellow/30 bg-yellow/10 text-yellow",
  invited: "",
  rejected: "border-danger/30 bg-danger/10 text-danger",
  suspended: "border-danger/30 bg-danger/10 text-danger",
  under_review: "border-yellow/30 bg-yellow/10 text-yellow"
};

type DecisionAction = "approve" | "reject" | "suspend";

export function DoctorVerificationPanel({
  doctors,
  invites
}: {
  doctors: DoctorProfileRecord[];
  invites: DoctorInviteRecord[];
}) {
  const router = useRouter();
  const [busyDoctorId, setBusyDoctorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const pending = doctors.filter(
    (doctor) => doctor.status === "details_submitted" || doctor.status === "under_review"
  );
  const decided = doctors.filter(
    (doctor) => doctor.status !== "details_submitted" && doctor.status !== "under_review"
  );
  const openInvites = invites.filter((invite) => !invite.consumedAt && !invite.revokedAt);

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    setInviting(true);

    try {
      const response = await fetch("/api/admin/doctors", {
        body: JSON.stringify({ email: inviteEmail }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as { error?: string; inviteUrl?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not create the invite.");
        return;
      }

      setInviteUrl(body.inviteUrl ?? null);
      setInviteEmail("");
      router.refresh();
    } catch {
      setError("Could not create the invite.");
    } finally {
      setInviting(false);
    }
  }

  async function decide(doctorUserId: string, action: DecisionAction) {
    const reason =
      action === "approve" ? "" : window.prompt(`Reason for ${action}ing this doctor?`) ?? "";

    if (action !== "approve" && reason.trim().length < 3) {
      return;
    }

    setBusyDoctorId(doctorUserId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/doctors/${doctorUserId}`, {
        body: JSON.stringify({ action, reason }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not update the doctor.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not update the doctor.");
    } finally {
      setBusyDoctorId(null);
    }
  }

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Invite a doctor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={sendInvite}>
            <Input
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="doctor@example.com"
              required
              type="email"
              value={inviteEmail}
            />
            <Button isLoading={inviting} type="submit">
              Create invite
            </Button>
          </form>

          {inviteUrl ? (
            <div className="grid gap-1.5 rounded-ui border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm text-ivory">
                Send this link to the doctor. It is shown once and cannot be retrieved later.
              </p>
              <code className="break-all text-xs text-orange">{inviteUrl}</code>
            </div>
          ) : null}

          {openInvites.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted">Open invites</p>
              <ul className="grid gap-1 text-sm text-dim">
                {openInvites.map((invite) => (
                  <li key={invite.id}>
                    {invite.email} — expires{" "}
                    {new Date(invite.expiresAt).toLocaleDateString("en-IN")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4">
        <h2 className="text-xl text-ivory">Awaiting verification ({pending.length})</h2>

        {pending.length === 0 ? (
          <p className="text-muted">No applications waiting for review.</p>
        ) : (
          pending.map((doctor) => (
            <DoctorCard
              busy={busyDoctorId === doctor.userId}
              doctor={doctor}
              key={doctor.userId}
              onDecide={decide}
              showActions
            />
          ))
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl text-ivory">All doctors ({decided.length})</h2>

        {decided.length === 0 ? (
          <p className="text-muted">No verified doctors yet.</p>
        ) : (
          decided.map((doctor) => (
            <DoctorCard
              busy={busyDoctorId === doctor.userId}
              doctor={doctor}
              key={doctor.userId}
              onDecide={decide}
              showActions={doctor.status === "approved"}
            />
          ))
        )}
      </section>
    </div>
  );
}

function DoctorCard({
  busy,
  doctor,
  onDecide,
  showActions
}: {
  busy: boolean;
  doctor: DoctorProfileRecord;
  onDecide: (doctorUserId: string, action: DecisionAction) => void;
  showActions: boolean;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg text-ivory">{doctor.fullName}</p>
            <p className="text-sm text-muted">
              {doctor.primaryDegree}
              {doctor.additionalQualifications.length > 0
                ? `, ${doctor.additionalQualifications.join(", ")}`
                : ""}
            </p>
          </div>
          <Badge className={cn(STATUS_STYLE[doctor.status])}>
            {doctor.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Registration number" value={doctor.registrationNumber} />
          <Detail label="Council" value={doctor.registrationCouncil} />
          <Detail
            label="Registered"
            value={doctor.registrationYear ? String(doctor.registrationYear) : "Not provided"}
          />
          <Detail
            label="Experience"
            value={
              doctor.yearsExperience !== null ? `${doctor.yearsExperience} years` : "Not provided"
            }
          />
          <Detail
            label="Specialties"
            value={doctor.specialties.map(specialtyLabel).join(", ") || "None"}
          />
          <Detail label="Languages" value={doctor.languages.join(", ")} />
        </dl>

        {doctor.bio ? <p className="text-sm text-muted">{doctor.bio}</p> : null}

        {doctor.rejectionReason ? (
          <p className="rounded-ui border border-white/10 bg-white/[0.04] p-3 text-sm text-muted">
            <span className="text-ivory">Reason: </span>
            {doctor.rejectionReason}
          </p>
        ) : null}

        {showActions ? (
          <div className="flex flex-wrap gap-2">
            {doctor.status === "approved" ? (
              <Button
                disabled={busy}
                onClick={() => onDecide(doctor.userId, "suspend")}
                variant="secondary"
              >
                Suspend
              </Button>
            ) : (
              <>
                <Button isLoading={busy} onClick={() => onDecide(doctor.userId, "approve")}>
                  Approve
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => onDecide(doctor.userId, "reject")}
                  variant="secondary"
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className="text-ivory">{value}</dd>
    </div>
  );
}
