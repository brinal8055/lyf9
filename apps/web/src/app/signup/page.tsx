import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Join beta | Lyf9 AI"
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
