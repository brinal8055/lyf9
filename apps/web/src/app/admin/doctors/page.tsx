import { DoctorVerificationPanel } from "@/components/admin/doctor-verification-panel";
import { listDoctorInvites } from "@/lib/doctors/invites";
import { listDoctorProfiles } from "@/lib/doctors/profiles";

export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage() {
  const [doctors, invites] = await Promise.all([listDoctorProfiles(), listDoctorInvites()]);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-3xl text-ivory">Doctors</h1>
        <p className="text-muted">
          Invite doctors, verify their registration details, and manage reviewing access. Approving
          a doctor grants them the reviewer role and adds them to the assignment pool.
        </p>
      </header>

      <DoctorVerificationPanel doctors={doctors} invites={invites} />
    </div>
  );
}
