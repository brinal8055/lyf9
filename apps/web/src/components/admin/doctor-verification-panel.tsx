"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MailPlus, ShieldCheck, UserCheck, UsersRound } from "lucide-react";

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
  const [linkCopied, setLinkCopied] = useState(false);

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

  async function copyInviteLink() {
    if (!inviteUrl) return;

    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="grid gap-7">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Doctor access summary">
        <SummaryStat
          icon={<UsersRound className="size-4" aria-hidden />}
          label="Doctors"
          value={doctors.length}
        />
        <SummaryStat
          icon={<ShieldCheck className="size-4" aria-hidden />}
          label="Awaiting review"
          tone="yellow"
          value={pending.length}
        />
        <SummaryStat
          icon={<UserCheck className="size-4" aria-hidden />}
          label="Approved"
          tone="green"
          value={doctors.filter((doctor) => doctor.status === "approved").length}
        />
      </section>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Invite a doctor</CardTitle>
              <p className="mt-1 text-sm text-muted">Generate a private application link.</p>
            </div>
            <Badge>{openInvites.length} open</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:p-6">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={sendInvite}>
            <Input
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="doctor@example.com"
              required
              type="email"
              value={inviteEmail}
            />
            <Button isLoading={inviting} type="submit">
              <MailPlus className="mr-2 size-4" aria-hidden />
              Create invite
            </Button>
          </form>

          {inviteUrl ? (
            <div className="grid gap-3 rounded-ui border border-green/25 bg-green/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ivory">Invitation ready</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Share this link manually. It cannot be retrieved after leaving this page.
                  </p>
                </div>
                <Button className="h-9 px-3 text-sm" onClick={copyInviteLink} variant="secondary">
                  {linkCopied ? (
                    <Check className="mr-2 size-4 text-green" aria-hidden />
                  ) : (
                    <Copy className="mr-2 size-4" aria-hidden />
                  )}
                  {linkCopied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <code className="break-all rounded-ui bg-black/25 p-3 text-xs leading-5 text-green">
                {inviteUrl}
              </code>
            </div>
          ) : null}

          {openInvites.length > 0 ? (
            <div className="grid gap-2 border-t border-white/10 pt-5">
              <p className="text-xs font-medium uppercase text-dim">Open invitations</p>
              <ul className="divide-y divide-white/10 text-sm">
                {openInvites.map((invite) => (
                  <li
                    className="flex flex-col gap-1 py-3 first:pt-1 sm:flex-row sm:items-center sm:justify-between"
                    key={invite.id}
                  >
                    <span className="font-medium text-ivory">{invite.email}</span>
                    <span className="text-xs text-muted">
                      Expires {new Date(invite.expiresAt).toLocaleDateString("en-IN")}
                    </span>
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ivory">Awaiting verification</h2>
            <p className="mt-1 text-sm text-muted">Applications that need an access decision.</p>
          </div>
          <Badge className="border-yellow/30 bg-yellow/10 text-yellow">{pending.length}</Badge>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-ui border border-dashed border-white/15 px-5 py-8 text-center text-sm text-muted">
            No applications waiting for review.
          </div>
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ivory">Doctor directory</h2>
            <p className="mt-1 text-sm text-muted">Approved, rejected, and suspended accounts.</p>
          </div>
          <Badge>{decided.length}</Badge>
        </div>

        {decided.length === 0 ? (
          <div className="rounded-ui border border-dashed border-white/15 px-5 py-8 text-center text-sm text-muted">
            No verified doctors yet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {decided.map((doctor) => (
              <DoctorCard
                busy={busyDoctorId === doctor.userId}
                doctor={doctor}
                key={doctor.userId}
                onDecide={decide}
                showActions={doctor.status === "approved"}
              />
            ))}
          </div>
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
    <Card className="overflow-hidden p-0 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5 sm:p-6">
        <div>
          <p className="text-lg font-semibold text-ivory">{doctor.fullName}</p>
          <p className="mt-1 text-sm text-muted">
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

      <CardContent className="grid gap-5 p-5 sm:p-6">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
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

        {doctor.bio ? <p className="text-sm leading-6 text-muted">{doctor.bio}</p> : null}

        {doctor.rejectionReason ? (
          <p className="rounded-ui border border-white/10 bg-white/[0.04] p-3 text-sm text-muted">
            <span className="text-ivory">Reason: </span>
            {doctor.rejectionReason}
          </p>
        ) : null}

        {showActions ? (
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-5">
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

function SummaryStat({
  icon,
  label,
  tone = "muted",
  value
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "green" | "muted" | "yellow";
  value: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-ui border border-white/10 bg-white/[0.035] px-4 py-4">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-ui border",
          tone === "green" && "border-green/20 bg-green/10 text-green",
          tone === "yellow" && "border-yellow/20 bg-yellow/10 text-yellow",
          tone === "muted" && "border-white/10 bg-white/5 text-muted"
        )}
      >
        {icon}
      </span>
      <div>
        <p className="text-xl font-semibold leading-none text-ivory">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="mt-1 break-words text-ivory">{value}</dd>
    </div>
  );
}
