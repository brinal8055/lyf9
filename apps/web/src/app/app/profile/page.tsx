import type { Metadata } from "next";

import { ProfileForm } from "@/components/onboarding/profile-form";

export const metadata: Metadata = {
  title: "Health profile | Lyf9 AI"
};

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Step 1</p>
        <h1 className="mt-2 text-[36px] font-semibold">Health profile</h1>
      </div>
      <ProfileForm />
    </div>
  );
}
