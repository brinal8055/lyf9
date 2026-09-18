import { DoctorVerificationPanel } from "@/components/admin/doctor-verification-panel";
import { listDoctorInvites } from "@/lib/doctors/invites";
import { listDoctorProfiles } from "@/lib/doctors/profiles";

export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage() {
  const [doctors, invites] = await Promise.all([listDoctorProfiles(), listDoctorInvites()]);

  return (
    <div className="grid gap-7 sm:gap-8">
      <header className="border-b border-white/10 pb-6">
        <p className="text-sm font-medium text-orange">Admin workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-ivory sm:text-4xl">Doctor access</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
          Invite doctors, verify their registration details, and manage reviewing access. Approving
          a doctor grants them the reviewer role and adds them to the assignment pool.
        </p>
      </header>

      <DoctorVerificationPanel doctors={doctors} invites={invites} />
    </div>
  );
}
